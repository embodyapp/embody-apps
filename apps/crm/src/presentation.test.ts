import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '@embody/testing';
import { parseGenUiEvent } from '@embody/genui/document';
import { resolveGenUiPayload } from '@embody/genui/payload';
import { createGenUiController } from '@embody/genui/controller';
import { renderGenUiText } from '@embody/genui/text';
import { createWorkbenchDocument, workbenchBindings } from './presentation.js';
import { workbenchSchema } from './schemas.js';
import { plugins } from './plugins.js';
let h: TestHarness;
beforeEach(async () => { h = await createTestHarness({ plugins }); });
afterEach(async () => { await h.close(); });

it('opens a compact card, edits only in detail, and keeps selection after a stage change', async () => {
  const account = await h.call('relationships.account.create', { data: { name: 'Test account' } }) as { id: string };
  const opp = await h.call('sales.opportunity.create', { data: { accountId: account.id, title: 'App hosting', useCase: 'Support workflow', ownerId: 'founder', currency: 'USD',
    nextAction: 'Book evaluation', nextActionAt: '2026-11-01T10:00:00Z', evaluationGoal: 'Run one support action' } }) as { id: string };
  const props = await h.call('workspace.getWorkbench', {});
  const controller = createGenUiController({
    document: createWorkbenchDocument(props), callableTargets: ['workspace.getWorkbench', 'sales.moveStage'], readTargets: ['workspace.getWorkbench'],
    refresh: { target: 'workspace.getWorkbench', input: {} }, present: (_target, data) => createWorkbenchDocument(data),
    resolveAction: (id, values) => resolveGenUiPayload(workbenchBindings(controller.document)[id], values),
    dispatch: (target, input) => h.call(target, input),
  });
  expect(workbenchBindings(controller.document)[`move-${opp.id}`]).toBeUndefined();
  const read = await controller.invoke(`open-${opp.id}`, {});
  expect(read.status).toBe('confirmed');
  expect(renderGenUiText(controller.document)).toContain('Test account');
  const payload = resolveGenUiPayload(workbenchBindings(controller.document)[`move-${opp.id}`], {
    [`stage-${opp.id}`]: 'evaluation', [`terms-${opp.id}`]: '', [`loss-${opp.id}`]: '',
  });
  expect(() => parseGenUiEvent(controller.document, `move-${opp.id}`, payload, { callableTargets: ['workspace.getWorkbench'] })).toThrow();
  const result = await controller.submit(`move-${opp.id}`, payload);
  expect(result).toMatchObject({ status: 'confirmed', reconciled: true });
  expect(renderGenUiText(controller.document)).toContain('Back to opportunities');
  expect(await h.call('sales.opportunity.get', { id: opp.id })).toMatchObject({ data: { stage: 'evaluation' } });
  await controller.invoke('back-to-list', {});
  expect(workbenchBindings(controller.document)[`move-${opp.id}`]).toBeUndefined();
  await controller.invoke(`open-${opp.id}`, {});
  await controller.invoke(`account-${opp.id}`, {});
  expect(renderGenUiText(controller.document)).toContain('Contacts');
  expect(renderGenUiText(controller.document)).not.toContain('Update stage');
  controller.dispose();
});

it('keeps the maximum page with long customer input within standard document limits', async () => {
  const account = await h.call('relationships.account.create', { data: { name: 'Account' } }) as { id: string };
  const long = '<script>customer input</script>' + 'x'.repeat(3900);
  for (let i = 0; i < 20; i++) {
    await h.call('sales.opportunity.create', { data: { accountId: account.id, title: long, useCase: long, ownerId: long, currency: 'USD',
      nextAction: long, nextActionAt: '2026-11-01T10:00:00Z', evaluationGoal: long, evaluationEvidence: long, hostingScope: long } });
    await h.call('relationships.activity.create', { data: { accountId: account.id, kind: 'note', body: long } });
  }
  const data = workbenchSchema.parse(await h.call('workspace.getWorkbench', { accountId: account.id, limit: 20 }));
  const document = createWorkbenchDocument(data);
  expect(renderGenUiText(document)).toContain('[truncated]');
  expect(workbenchBindings(document)['refresh-page']).toBeDefined();
});

it('filters the entire opportunity query, pages only that stage and rejects foreign selections', async () => {
  const a = await h.call('relationships.account.create', { data: { name: 'A' } }) as { id: string };
  const b = await h.call('relationships.account.create', { data: { name: 'B' } }) as { id: string };
  let selected = '';
  for (let i = 0; i < 8; i++) {
    const opp = await h.call('sales.opportunity.create', { data: { accountId: a.id, title: `Hosting ${i}`, useCase: 'Support workflow', ownerId: 'founder', currency: 'USD',
      nextAction: 'Book evaluation', nextActionAt: '2026-11-01T10:00:00Z', evaluationGoal: 'Run one support action' } }) as { id: string };
    if (i >= 6) {
      await h.call('sales.moveStage', { id: opp.id, stage: 'evaluation', expectedStage: 'discovery' });
      selected = opp.id;
    }
  }
  const props = workbenchSchema.parse(await h.call('workspace.getWorkbench', { stage: 'evaluation', limit: 1 }));
  expect(props.nextOffset).toBe(1);
  expect(props.opportunities).toHaveLength(1);
  expect(props.opportunities[0].stage).toBe('evaluation');
  const document = createWorkbenchDocument(props);
  const input = resolveGenUiPayload(workbenchBindings(document)['next-page'], {});
  expect(input).toMatchObject({ stage: 'evaluation', offset: 1, limit: 1 });
  const next = workbenchSchema.parse(await h.call('workspace.getWorkbench', input));
  expect(next.opportunities).toHaveLength(1);
  expect(next.nextOffset).toBeNull();
  const filter = resolveGenUiPayload(workbenchBindings(createWorkbenchDocument(next))['filter-stage'], { 'filter-stage-value': 'discovery' });
  expect(filter).toMatchObject({ stage: 'discovery', offset: 0 });
  expect(workbenchSchema.parse(await h.call('workspace.getWorkbench', {})).limit).toBe(5);
  await expect(h.call('workspace.getWorkbench', { accountId: b.id, opportunityId: selected })).rejects.toThrow('not found in this account');
  await expect(h.as({ ...h.principal, orgId: 'other' }).call('workspace.getWorkbench', { opportunityId: selected })).rejects.toThrow('not found');
});
