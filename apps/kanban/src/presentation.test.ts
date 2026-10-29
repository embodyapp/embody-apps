import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '@embody/testing';
import { compileGenUiManifest, genUiResourceIntegrity } from '@embody/genui';
import { renderGenUiText, renderGenUiMarkdown } from '@embody/genui/text';
import { parseGenUiEvent } from '@embody/genui/document';
import { resolveGenUiPayload } from '@embody/genui/payload';
import config from '../embody.config.js';
import { boardSchema } from './board-schema.js';
import { createBoardDocument, boardBindings } from './presentation.js';
let h: TestHarness;
beforeEach(async () => { h = await createTestHarness({ plugins: config.plugins }); });
afterEach(async () => { await h.close(); });
const project = (name: string) => h.call('tracker.project.create', { data: { name } }) as Promise<{ id: string }>;
const task = (projectId: string, title: string) => h.call('tracker.task.create', { data: { projectId, title, definitionOfDone: 'Verified' } });

it('returns bounded ordinary board data, supports next-page reads and isolates projects and organizations', async () => {
  const a = await project('A'); const b = await project('B');
  await task(a.id, 'First'); await task(a.id, 'Second'); await task(b.id, 'Other project');
  const first = boardSchema.parse(await h.call('tracker.getBoard', { projectId: a.id, limit: 1 }));
  expect(first).toMatchObject({ title: 'A', offset: 0, nextOffset: 1 });
  expect(first.tasks).toHaveLength(1);
  const document = createBoardDocument(first);
  const payload = resolveGenUiPayload(boardBindings(document)['board-page-1'], {});
  expect(parseGenUiEvent(document, 'board-page-1', payload, { callableTargets: ['tracker.getBoard'] })).toEqual({ projectId: a.id, offset: 1, limit: 1 });
  const second = boardSchema.parse(await h.call('tracker.getBoard', payload));
  expect(second.nextOffset).toBeNull();
  expect(second.tasks[0].id).not.toBe(first.tasks[0].id);
  expect(second.tasks.every(t => t.projectId === a.id)).toBe(true);
  const foreign = h.as({ ...h.principal, orgId: 'other' });
  expect(boardSchema.parse(await foreign.call('tracker.getBoard', {})).tasks).toEqual([]);
  await expect(foreign.call('tracker.getBoard', { projectId: a.id })).rejects.toThrow('not found');
  await expect(h.call('tracker.getBoard', { limit: 51 })).rejects.toThrow();
  await expect(h.call('tracker.getBoard', { offset: -1 })).rejects.toThrow();
});

it('publishes a static integrity-checked view bound to the exact board output schema', async () => {
  const manifest = compileGenUiManifest(config);
  expect(manifest.actions['tracker.getBoard'].presentation).toEqual({ view: 'board' });
  expect(manifest.views?.board).toMatchObject({ resourceUri: 'ui://kanban/board@1.2.0', fallback: 'text', callableTargets: ['tracker.getBoard', 'tracker.moveTask'], integrity: genUiResourceIntegrity(config.genui.views.board.resource) });
  expect(config.genui.views.board.props).toBe(boardSchema);
  const p = await project('Private project title'); await task(p.id, '<script>alert(1)</script>');
  const props = await h.call('tracker.getBoard', {});
  const document = createBoardDocument(props);
  expect(renderGenUiText(document)).toContain('<script>alert(1)</script>');
  expect(renderGenUiMarkdown(document)).not.toContain('<script>');
  expect(config.genui.views.board.resource.text).not.toContain('Private project title');
  expect(config.genui.views.board.resource.text).toContain("connect-src 'none'");
  expect(config.genui.views.board.resource.text).toContain('sha256-');
});

it('moves a task through the declared GenUI form and persists the status without changing other fields', async () => {
  const p = await project('Moves'); await task(p.id, 'Move me');
  const board = boardSchema.parse(await h.call('tracker.getBoard', { projectId: p.id }));
  const t = board.tasks[0];
  const document = createBoardDocument(board);
  const payload = resolveGenUiPayload(boardBindings(document)[`move-${t.id}`], {
    [`status-${t.id}`]: 'in_progress', [`reason-${t.id}`]: '',
  });
  expect(() => parseGenUiEvent(document, `move-${t.id}`, payload, { callableTargets: ['tracker.getBoard'] })).toThrow();
  const validated = parseGenUiEvent(document, `move-${t.id}`, payload, { callableTargets: ['tracker.getBoard', 'tracker.moveTask'] });
  const agent = h.asAgent('board-agent');
  expect(await agent.call('tracker.moveTask', validated)).toEqual({ id: t.id, status: 'in_progress' });
  expect(await h.call('tracker.task.get', { id: t.id })).toMatchObject({ data: {
    title: 'Move me', projectId: p.id, definitionOfDone: 'Verified', status: 'in_progress', cancellationReason: null,
  } });
});

it('requires cancellation reasons and preserves caller-attributed cancellation and reopening history', async () => {
  const p = await project('Decisions'); const t = await task(p.id, 'Decide') as { id: string };
  const actor = h.asAgent('drag-agent');
  await expect(actor.call('tracker.moveTask', { id: t.id, status: 'canceled', expectedStatus: 'todo', cancellationReason: '  ' })).rejects.toThrow('Cancellation requires');
  expect(await h.call('tracker.task.get', { id: t.id })).toMatchObject({ data: { status: 'todo' } });
  expect(await h.call('tracker.comment.list', { filter: { taskId: t.id } })).toEqual([]);
  await actor.call('tracker.moveTask', { id: t.id, status: 'canceled', expectedStatus: 'todo', cancellationReason: 'No longer needed' });
  await actor.call('tracker.moveTask', { id: t.id, status: 'todo', expectedStatus: 'canceled' });
  expect(await h.call('tracker.task.get', { id: t.id })).toMatchObject({ data: { status: 'todo', cancellationReason: null } });
  expect(await h.call('tracker.comment.list', { filter: { taskId: t.id } })).toMatchObject([
    { data: { body: 'Canceled: No longer needed', authorId: 'drag-agent', authorType: 'agent' } },
    { data: { body: 'Reopened from canceled. Previous reason: No longer needed', authorId: 'drag-agent', authorType: 'agent' } },
  ]);
});

it('rejects stale moves, foreign-organization tasks, and unauthorized callers without changing state', async () => {
  const p = await project('Isolation'); const t = await task(p.id, 'Isolated') as { id: string };
  await h.call('tracker.moveTask', { id: t.id, status: 'in_progress', expectedStatus: 'todo' });
  await expect(h.call('tracker.moveTask', { id: t.id, status: 'done', expectedStatus: 'todo' })).rejects.toThrow('Task status changed');
  await expect(h.as({ ...h.principal, orgId: 'other' }).call('tracker.moveTask', { id: t.id, status: 'done', expectedStatus: 'in_progress' })).rejects.toThrow('not found');
  await expect(h.as({ ...h.principal, scopes: [] }).call('tracker.moveTask', { id: t.id, status: 'done', expectedStatus: 'in_progress' })).rejects.toThrow();
  expect(await h.call('tracker.task.get', { id: t.id })).toMatchObject({ data: { status: 'in_progress' } });
});
