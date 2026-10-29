import { parseGenUiDocument, type GenUiDocument, type GenUiNode, type GenUiEventSchema } from '@embody/genui/document';
import type { GenUiPayloadBinding } from '@embody/genui/payload';
import { workbenchSchema, stageSchema, panelSchema, stageFilterSchema } from './schemas.js';
import type { z } from 'zod';

type Workbench = z.output<typeof workbenchSchema>;
type Opportunity = Workbench['opportunities'][number];
type Input = Record<string, string | number>;
const compact = (value: string, max = 600) => value.length > max ? value.slice(0, max - 14) + '… [truncated]' : value;
const n = (type: string, rest: Record<string, unknown>) => ({ version: 1, type, ...rest });
const text = (value: string, max = 600) => n('text', { text: compact(value, max) });
const kv = (label: string, value: string) => n('keyValue', { label, value: compact(value) });
const section = (title: string, children: unknown[]) => n('section', { title: compact(title, 160), children });
const labels: Record<string, string> = { all: 'All stages', discovery: 'Discovery', evaluation: 'Evaluation', proposal: 'Proposal', won: 'Won', lost: 'Lost',
  opportunities: 'Opportunities', contacts: 'Contacts', activity: 'Activity', onboarding: 'Onboarding' };
const string = (): GenUiEventSchema => ({ type: 'string', maxLength: 4000 });
const literal = (value: string | number): GenUiEventSchema => typeof value === 'string'
  ? { type: 'string', maxLength: Math.max(value.length, 1), enum: [value] }
  : { type: 'integer', minimum: value, maximum: value };
const object = (properties: Record<string, GenUiEventSchema>): GenUiEventSchema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const literals = (input: Input) => Object.fromEntries(Object.entries(input).map(([key, value]) => [key, literal(value)]));
function readAction(id: string, label: string, input: Input) {
  return { id, label, effect: 'Read CRM context', event: { intent: 'invoke', target: 'workspace.getWorkbench', schema: object(literals(input)) } };
}
const actions = (...items: ReturnType<typeof readAction>[]) => n('actions', { actions: items });
function field(id: string, label: string) {
  return n('field', { id, label, value: '', event: { intent: 'change', schema: object({ value: string() }) } });
}
function select(id: string, label: string, value: string, values: readonly string[]) {
  return n('select', { id, label, value, options: values.map(value => ({ value, label: labels[value] ?? value })),
    event: { intent: 'change', schema: object({ value: { type: 'string', maxLength: 32, enum: values } }) } });
}
function readFilter(key: 'stage' | 'panel', current: string, input: Input, values: readonly string[]) {
  const { [key]: _current, ...fixed } = input;
  return n('form', { id: `filter-${key}`, label: 'Show', effect: 'Read the selected view',
    children: [select(`filter-${key}-value`, key === 'stage' ? 'Sales stage' : 'Account view', current, values)],
    event: { intent: 'submit', target: 'workspace.getWorkbench', schema: object({ ...literals(fixed), [key]: { type: 'string', maxLength: 32, enum: values } }) },
  });
}
function due(value: string | null) {
  if (!value) return 'No date set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(value)) + ' · Israel time';
}
function price(opp: Opportunity) {
  if (!opp.proposedMonthlyMinor) return 'Not discussed';
  const formatter = new Intl.NumberFormat('en', { style: 'currency', currency: opp.currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return `${formatter.format(opp.proposedMonthlyMinor / 10 ** digits)} / month · proposed`;
}
function overdue(opp: Opportunity, board: Workbench) {
  return !['won', 'lost'].includes(opp.stage) && opp.nextActionAt && Date.parse(opp.nextActionAt) < Date.parse(board.asOf);
}
function summaryCard(opp: Opportunity, board: Workbench, input: Input) {
  const closed = ['won', 'lost'].includes(opp.stage);
  return section(opp.title, [
    text(opp.accountName, 100), n('badge', { text: labels[opp.stage] }),
    ...(overdue(opp, board) ? [n('callout', { tone: 'warning', text: 'Follow-up overdue' })] : []),
    ...(!closed ? [kv('Next step', compact(opp.nextAction, 180)), text(due(opp.nextActionAt))] : [text(opp.stage === 'lost' ? opp.lossReason : 'Agreement accepted · onboarding follows', 180)]),
    actions(readAction(`open-${opp.id}`, 'Open opportunity', { ...input, opportunityId: opp.id })),
  ]);
}
function stageForm(opp: Opportunity) {
  return n('form', { id: `move-${opp.id}`, label: 'Save stage',
    effect: 'Record this sales stage. Winning queues onboarding; payment and hosting are separate.',
    children: [select(`stage-${opp.id}`, 'Move to stage', opp.stage, stageSchema.options),
      field(`terms-${opp.id}`, 'Accepted terms (to win)'), field(`loss-${opp.id}`, 'Loss reason (to lose)')],
    event: { intent: 'submit', target: 'sales.moveStage', schema: object({ id: literal(opp.id), expectedStage: literal(opp.stage),
      stage: { type: 'string', maxLength: 16, enum: stageSchema.options }, acceptedTermsReference: string(), lossReason: string() }) },
  });
}
function opportunityDetail(board: Workbench, opp: Opportunity, input: Input) {
  const closed = ['won', 'lost'].includes(opp.stage);
  return [
    actions(readAction('back-to-list', 'Back to opportunities', input)),
    text(opp.accountName, 160), n('badge', { text: labels[opp.stage] }),
    ...(overdue(opp, board) ? [n('callout', { tone: 'warning', text: 'Follow-up overdue' })] : []),
    section('Next step', [kv('Owner', opp.ownerId), ...(!closed ? [text(opp.nextAction), kv('Due', due(opp.nextActionAt))] : [text('This buying decision is closed.')])]),
    section('App and hosting', [text(opp.useCase), ...(opp.hostingScope ? [kv('Scope', opp.hostingScope)] : []), ...(opp.region ? [kv('Region', opp.region)] : [])]),
    section('Evaluation', [kv('Success criterion', opp.evaluationGoal || 'Add a measurable success criterion before evaluation.'),
      ...(opp.evaluationEvidence ? [kv('Evidence', opp.evaluationEvidence)] : [])]),
    section('Commercial terms', [kv('Monthly proposal', price(opp)),
      ...(opp.acceptedTermsReference ? [kv('Accepted terms', opp.acceptedTermsReference)] : []), ...(opp.lossReason ? [kv('Loss reason', opp.lossReason)] : [])]),
    ...(!closed ? [section('Update stage', [stageForm(opp)])] : []),
    actions(readAction(`account-${opp.id}`, 'Open account', { accountId: opp.accountId, stage: 'all', panel: 'contacts', offset: 0, limit: board.limit })),
  ];
}
function accountPanel(board: Workbench): unknown[] {
  if (board.panel === 'contacts') return board.contacts.map(c => section(c.name, [kv('Email', c.email), kv('Buying role', c.role)]));
  if (board.panel === 'activity') return board.activities.map(a => section(a.kind, [text(a.body), text(`${due(a.createdAt)} · ${a.authorType}: ${a.authorId}`)]));
  if (board.panel === 'onboarding') return board.engagements.map(e => section(labels[e.status] ?? e.status, [kv('Owner', e.ownerId), kv('Next step', e.nextAction), text(due(e.nextActionAt)),
    ...(e.blocker ? [kv('Blocker', e.blocker)] : []), ...(e.hostedAppUrl ? [kv('Hosted app', e.hostedAppUrl)] : []), ...(e.firstValueEvidence ? [kv('First value', e.firstValueEvidence)] : [])]));
  return [];
}
export function createWorkbenchDocument(props: unknown): GenUiDocument {
  const board = workbenchSchema.parse(props);
  const input: Input = { ...(board.account ? { accountId: board.account.id } : {}), stage: board.stage, panel: board.panel, offset: board.offset, limit: board.limit };
  const selected = board.selectedOpportunity;
  if (selected) return parseGenUiDocument({ version: 1, root: section(selected.title, opportunityDetail(board, selected, input)) });
  const list = board.panel === 'opportunities';
  const cards = list ? board.opportunities.map(opp => summaryCard(opp, board, input)) : accountPanel(board);
  const nav = [readAction('refresh-page', 'Refresh', input)];
  if (board.offset) nav.push(readAction('previous-page', 'Previous', { ...input, offset: Math.max(0, board.offset - board.limit) }));
  if (board.nextOffset !== null) nav.push(readAction('next-page', 'Next', { ...input, offset: board.nextOffset }));
  return parseGenUiDocument({ version: 1, root: section(board.account?.name ?? 'Hosting sales', [
    ...(board.account ? [actions(readAction('all-sales', 'Back to sales', { stage: 'all', panel: 'opportunities', offset: 0, limit: board.limit })),
      readFilter('panel', board.panel, { ...input, offset: 0 }, panelSchema.options)] : []),
    ...(list ? [readFilter('stage', board.stage, { ...input, offset: 0 }, stageFilterSchema.options)] : []),
    section(list ? labels[board.stage]! : labels[board.panel]!, cards.length ? cards : [n('emptyState', { text: `No ${list ? 'opportunities' : labels[board.panel]!.toLowerCase()} on this page.` })]),
    text(`${cards.length ? board.offset + 1 : 0}–${board.offset + cards.length} on this page${board.nextOffset !== null ? ' · More available' : ''}`),
    n('actions', { actions: nav }),
  ]) });
}

export function workbenchBindings(document: GenUiDocument): Readonly<Record<string, GenUiPayloadBinding>> {
  const bindings: Record<string, GenUiPayloadBinding> = {};
  function readBinding(id: string, schema: GenUiEventSchema, dynamicKey?: string) {
    if (schema.type !== 'object') throw new Error('Invalid read binding');
    const fields: Record<string, GenUiPayloadBinding> = {};
    for (const [key, property] of Object.entries(schema.properties)) {
      if (key === dynamicKey) fields[key] = { kind: 'field', id: `filter-${key}-value` };
      else if (property.type === 'string' && property.enum?.length === 1) fields[key] = { kind: 'literal', value: property.enum[0]! };
      else if (property.type === 'integer' && property.minimum === property.maximum) fields[key] = { kind: 'literal', value: property.minimum };
      else throw new Error('Read arguments must be bound literals');
    }
    bindings[id] = { kind: 'object', fields };
  }
  function walk(node: GenUiNode) {
    if (node.type === 'form' && node.event.target === 'sales.moveStage') {
      const schema = node.event.schema;
      if (schema.type !== 'object') throw new Error('Invalid stage schema');
      const id = schema.properties.id, stage = schema.properties.expectedStage;
      if (id?.type !== 'string' || id.enum?.length !== 1 || stage?.type !== 'string' || stage.enum?.length !== 1) throw new Error('Invalid stage binding');
      const key = id.enum[0]!;
      bindings[node.id] = { kind: 'object', fields: {
        id: { kind: 'literal', value: key }, expectedStage: { kind: 'literal', value: stage.enum[0]! }, stage: { kind: 'field', id: `stage-${key}` },
        acceptedTermsReference: { kind: 'field', id: `terms-${key}` }, lossReason: { kind: 'field', id: `loss-${key}` },
      } };
    }
    if (node.type === 'form' && node.event.target === 'workspace.getWorkbench') {
      const key = node.id === 'filter-stage' ? 'stage' : node.id === 'filter-panel' ? 'panel' : undefined;
      if (!key) throw new Error('Unknown read filter');
      readBinding(node.id, node.event.schema, key);
    }
    if (node.type === 'actions') for (const action of node.actions) readBinding(action.id, action.event.schema);
    if ('children' in node) node.children.forEach(walk);
    if (node.type === 'list') node.items.forEach(walk);
  }
  walk(document.root);
  return bindings;
}
