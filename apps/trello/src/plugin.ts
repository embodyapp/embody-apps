import { definePlugin, ForbiddenError, NotFoundError } from '@embody/core';
import { TrelloClient, type TrelloReader } from './trello-client.js';
import { workspaceInput, workspaceSchema } from './schemas.js';
export const trello = definePlugin({
  id: 'trello', version: '0.1.0',
  services: () => ({ reader: new TrelloClient() }),
  actions: {
    getWorkspace: {
      description: 'Read live Trello boards, lists and cards as GenUI. No boardId lists boards; boardId opens a board; listId filters before pagination; cardId opens details. Read-only, single configured organization/account.',
      input: workspaceInput, output: workspaceSchema,
      handler: async (input, context) => {
        const reader = context.services.get<TrelloReader>('trello.reader');
        if (context.principal.orgId !== reader.orgId) throw new ForbiddenError('This organization has no Trello connection.');
        const base = { connected: reader.configured, message: '', board: null, boards: [], lists: [], cards: [], selectedCard: null,
          listId: input.listId ?? null, offset: input.offset, limit: input.limit, nextOffset: null };
        if (!reader.configured) return { ...base, message: 'Connect Trello: set TRELLO_API_KEY and TRELLO_TOKEN in the app’s server environment, then restart.' };
        const boards = (await reader.boards(context.signal)).sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        if (!input.boardId) return { ...base, boards: boards.slice(input.offset, input.offset + input.limit),
          nextOffset: input.offset + input.limit < boards.length ? input.offset + input.limit : null };
        const board = boards.find(b => b.id === input.boardId);
        if (!board) throw new NotFoundError('Board not found or no longer accessible.');
        const [lists, cards] = await Promise.all([reader.lists(board.id, context.signal), reader.cards(board.id, context.signal)]);
        if (input.listId && !lists.some(l => l.id === input.listId)) throw new NotFoundError('List not found on this board.');
        const order = new Map(lists.map((list, index) => [list.id, index]));
        const visible = cards.filter(c => c.idBoard === board.id && order.has(c.idList));
        const selectedCard = input.cardId ? visible.find(c => c.id === input.cardId) : null;
        if (input.cardId && !selectedCard) throw new NotFoundError('Card not found on this board or it was archived.');
        const filtered = visible.filter(c => !input.listId || c.idList === input.listId)
          .sort((a,b) => order.get(a.idList)! - order.get(b.idList)! || a.pos - b.pos || a.id.localeCompare(b.id));
        return { ...base, board, lists, selectedCard: selectedCard ?? null, cards: filtered.slice(input.offset, input.offset + input.limit),
          nextOffset: input.offset + input.limit < filtered.length ? input.offset + input.limit : null };
      },
    },
  },
});
export default trello;
