import { BadRequestError, ForbiddenError, InternalError, NotFoundError, RateLimitedError, UnauthenticatedError } from '@embody/core';
import { z } from 'zod';
import { boardSchema, cardSchema, listSchema, type Board, type Card, type List } from './schemas.js';
export interface TrelloReader {
  readonly orgId: string;
  readonly configured: boolean;
  boards(signal?: AbortSignal): Promise<Board[]>;
  lists(boardId: string, signal?: AbortSignal): Promise<List[]>;
  cards(boardId: string, signal?: AbortSignal): Promise<Card[]>;
}
/** One server-owned account, explicitly bound to one Embody organization. No client credentials. */
export class TrelloClient implements TrelloReader {
  readonly orgId: string;
  readonly configured: boolean;
  private readonly key: string;
  private readonly token: string;
  constructor(env: NodeJS.ProcessEnv = process.env, private readonly request: typeof fetch = fetch) {
    this.key = env.TRELLO_API_KEY?.trim() ?? '';
    this.token = env.TRELLO_TOKEN?.trim() ?? '';
    this.orgId = env.TRELLO_ORG_ID?.trim() || 'local';
    this.configured = Boolean(this.key && this.token);
  }
  private async get(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    if (!this.configured) throw new UnauthenticatedError('Configure TRELLO_API_KEY and TRELLO_TOKEN on the server.');
    const url = new URL(`https://api.trello.com/1/${path}`);
    url.search = new URLSearchParams(params).toString();
    let response: Response;
    try {
      response = await this.request(url, { method: 'GET', redirect: 'error',
        headers: { Authorization: `OAuth oauth_consumer_key="${encodeURIComponent(this.key)}", oauth_token="${encodeURIComponent(this.token)}"`, Accept: 'application/json' },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
    } catch { throw new InternalError('Trello could not be reached. Refresh to try again.'); }
    // Never expose upstream bodies, URLs, headers or exception messages containing credentials.
    if (response.status === 401) throw new UnauthenticatedError('Trello authorization expired or was revoked. Update the server token.');
    if (response.status === 403) throw new ForbiddenError('Trello denied access to this resource.');
    if (response.status === 404) throw new NotFoundError('Trello resource not found or no longer accessible.');
    if (response.status === 429) throw new RateLimitedError('Trello rate limit reached. Wait before refreshing.');
    if (!response.ok) throw new InternalError('Trello returned an error. Refresh to try again.');
    try { return await response.json(); }
    catch { throw new InternalError('Trello returned an invalid response.'); }
  }
  private parse<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) throw new InternalError('Trello returned an unsupported response.');
    return result.data;
  }
  async boards(signal?: AbortSignal) {
    const data = await this.get('members/me/boards', { filter: 'open', fields: 'name,closed' }, signal);
    return this.parse(z.array(boardSchema).max(10000), data).filter(b => !b.closed);
  }
  async lists(boardId: string, signal?: AbortSignal) {
    const data = await this.get(`boards/${encodeURIComponent(boardId)}/lists`, { filter: 'open', fields: 'name,closed,pos' }, signal);
    const lists = this.parse(z.array(listSchema), data).filter(l => !l.closed);
    if (lists.length > 100) throw new BadRequestError('This view supports boards with up to 100 open lists.');
    return lists.sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
  }
  async cards(boardId: string, signal?: AbortSignal) {
    const data = await this.get(`boards/${encodeURIComponent(boardId)}/cards/open`, {
      fields: 'idBoard,idList,name,desc,closed,pos,due,dueComplete,labels', limit: '1000',
    }, signal);
    const cards = this.parse(z.array(cardSchema), data);
    // Trello may cap this endpoint at 1000. Fail explicitly instead of presenting incomplete totals/pages.
    if (cards.length >= 1000) throw new BadRequestError('This view supports fewer than 1000 open cards per board. Open this large board in Trello.');
    return cards.filter(c => !c.closed);
  }
}
