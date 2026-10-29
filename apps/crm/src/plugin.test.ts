import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestHarness, type TestHarness } from '@embody/testing';
import { plugins } from './plugins.js';
import { opportunitySchema, engagementSchema, workbenchSchema } from './schemas.js';
import { definePlugin, z } from '@embody/core';
import { sales } from './sales.js';

const batchInput = z.object({ updates: z.array(z.object({ id: z.uuid(), data: opportunitySchema.partial() })) });
const testOperations = definePlugin({ id: 'testops', version: '0.1.0', dependsOn: ['sales'], actions: {
  batch: { input: batchInput,
    handler: (input: z.output<typeof batchInput>, ctx) => sales(ctx).opportunity.updateMany(input.updates) },
  replayWon: { input: z.object({ opportunityId: z.uuid() }),
    handler: (input: { opportunityId: string }, ctx) => ctx.events.publish('sales.opportunity.won', input) },
} });

let h: TestHarness;
let accountId: string;
const due = '2026-11-01T10:00:00Z';
const create = async (target: string, data: Record<string, unknown>) => await h.call(target, { data }) as { id: string };
const opportunity = (data: Record<string, unknown> = {}) => create('sales.opportunity.create', {
  accountId, title: 'Host operations app', useCase: 'Run an agent-native support workflow', ownerId: 'founder',
  currency: 'USD', nextAction: 'Schedule discovery', nextActionAt: due, ...data,
});
const update = (id: string, data: Record<string, unknown>) => h.call('sales.opportunity.update', { id, data });
async function prepare(id: string) {
  const contact = await create('relationships.contact.create', { accountId, name: 'Buyer', email: 'buyer@example.com', role: 'buyer' });
  await update(id, { decisionContactId: contact.id, evaluationGoal: 'Complete one real support workflow',
    evaluationEvidence: 'Customer confirmed successful agent action in evaluation', hostingScope: 'One production app with managed operations',
    region: 'Customer agreed region', proposedMonthlyMinor: 12500 });
}
async function win(id: string) {
  await prepare(id);
  await h.call('sales.moveStage', { id, expectedStage: 'discovery', stage: 'won', acceptedTermsReference: 'agreement:example-001' });
}
beforeEach(async () => {
  h = await createTestHarness({ plugins: [...plugins, testOperations] });
  accountId = (await create('relationships.account.create', { name: 'Example customer' })).id;
});
afterEach(async () => { await h.close(); });

it('requires owned, actionable opportunities and preserves evidence on partial updates', async () => {
  await expect(opportunity({ nextAction: '' })).rejects.toThrow('next action and date');
  await expect(opportunity({ stage: 'won' })).rejects.toThrow('start in discovery');
  const opp = await opportunity();
  await prepare(opp.id);
  await update(opp.id, { stage: 'proposal' });
  await update(opp.id, { title: 'Updated title' });
  const saved = await h.call('sales.opportunity.get', { id: opp.id }) as { data: unknown };
  expect(opportunitySchema.parse(saved.data)).toMatchObject({ stage: 'proposal', proposedMonthlyMinor: 12500, nextAction: 'Schedule discovery', region: 'Customer agreed region' });
  await expect(update(opp.id, { hostingScope: '' })).rejects.toThrow('Proposal requires');
  await expect(update(opp.id, { accountId: (await create('relationships.account.create', { name: 'Other' })).id })).rejects.toThrow('immutable');
});

it('enforces stage evidence through generated CRUD as well as stage actions', async () => {
  const opp = await opportunity();
  await expect(update(opp.id, { stage: 'evaluation' })).rejects.toThrow('success criterion');
  await expect(update(opp.id, { stage: 'lost' })).rejects.toThrow('requires a reason');
  await expect(update(opp.id, { acceptedTermsReference: 'premature' })).rejects.toThrow('together with the won');
  await prepare(opp.id);
  await expect(update(opp.id, { stage: 'won' })).rejects.toThrow('accepted-terms reference');
  expect(await h.events('sales.opportunity.won')).toHaveLength(0);
  await update(opp.id, { stage: 'won', acceptedTermsReference: 'accepted agreement reference' });
  expect(await h.events('sales.opportunity.won')).toHaveLength(1);
  await expect(update(opp.id, { stage: 'discovery' })).rejects.toThrow('Closed opportunities');
});

it('rejects stale moves and retains the persisted stage on rejection', async () => {
  const opp = await opportunity({ evaluationGoal: 'One successful agent action' });
  const agent = h.asAgent('seller-agent');
  await agent.call('sales.moveStage', { id: opp.id, expectedStage: 'discovery', stage: 'evaluation' });
  await expect(agent.call('sales.moveStage', { id: opp.id, expectedStage: 'discovery', stage: 'lost', lossReason: 'Budget' })).rejects.toThrow('Stage changed');
  expect(await h.call('sales.opportunity.get', { id: opp.id })).toMatchObject({ data: { stage: 'evaluation' } });
  await agent.call('sales.moveStage', { id: opp.id, expectedStage: 'evaluation', stage: 'lost', lossReason: 'Customer chose self-hosting' });
  expect(await h.call('sales.opportunity.get', { id: opp.id })).toMatchObject({ data: { stage: 'lost', lossReason: 'Customer chose self-hosting' } });
});

it('checks same-account and organization references and normal action authorization', async () => {
  const other = await create('relationships.account.create', { name: 'Other' });
  const contact = await create('relationships.contact.create', { accountId: other.id, name: 'Other buyer', email: 'other@example.com' });
  const opp = await opportunity();
  await expect(update(opp.id, { decisionContactId: contact.id })).rejects.toThrow('belong to the opportunity account');
  await expect(h.call('relationships.contact.update', { id: contact.id, data: { accountId } })).rejects.toThrow('immutable');
  const foreign = h.as({ ...h.principal, orgId: 'other-organization' });
  await expect(foreign.call('relationships.contact.create', { data: { accountId, name: 'Hidden', email: 'x@example.com' } })).rejects.toThrow('exist in this organization');
  await expect(foreign.call('workspace.getWorkbench', { accountId })).rejects.toThrow('not found');
  expect(workbenchSchema.parse(await foreign.call('workspace.getWorkbench', {})).opportunities).toEqual([]);
  await expect(h.as({ ...h.principal, scopes: [] }).call('sales.moveStage', { id: opp.id, expectedStage: 'discovery', stage: 'lost', lossReason: 'x' })).rejects.toThrow();
  expect(await h.call('sales.opportunity.get', { id: opp.id })).toMatchObject({ data: { stage: 'discovery' } });
});

it('attributes activity to the caller and preserves CRM history', async () => {
  const activity = await h.asAgent('sales-assistant').call('relationships.activity.create', { data: {
    accountId, kind: 'call', body: 'Customer needs managed operations', authorId: 'forged', authorType: 'human',
  } }) as { id: string };
  expect(await h.call('relationships.activity.get', { id: activity.id })).toMatchObject({ data: { authorId: 'sales-assistant', authorType: 'agent' } });
  await expect(h.call('relationships.activity.update', { id: activity.id, data: { body: 'rewrite' } })).rejects.toThrow('append-only');
  await expect(h.call('relationships.account.delete', { id: accountId })).rejects.toThrow('cannot be deleted');
  await h.call('relationships.account.update', { id: accountId, data: { status: 'archived' } });
  await expect(opportunity()).rejects.toThrow('Activate the account');
});

it('creates one eventual onboarding handoff and enforces reported-live evidence', async () => {
  const opp = await opportunity();
  const base = { opportunityId: opp.id, accountId, ownerId: 'founder', nextAction: 'Deploy', nextActionAt: due };
  await expect(create('success.engagement.create', base)).rejects.toThrow('won opportunity');
  await win(opp.id);
  expect(await h.call('success.engagement.list', {})).toEqual([]);
  await h.tickOutbox();
  await h.call('testops.replayWon', { opportunityId: opp.id });
  await h.tickOutbox();
  const engagements = await h.call('success.engagement.list', {}) as { id: string; data: unknown }[];
  expect(engagements).toHaveLength(1);
  expect(engagementSchema.parse(engagements[0].data)).toMatchObject({ opportunityId: opp.id, accountId, ownerId: 'founder', status: 'pending' });
  await expect(create('success.engagement.create', base)).rejects.toThrow('already exists');
  const id = engagements[0].id;
  await expect(h.call('success.engagement.update', { id, data: { status: 'live' } })).rejects.toThrow('first-value evidence');
  await expect(h.call('success.engagement.update', { id, data: { status: 'blocked' } })).rejects.toThrow('blocker description');
  await h.call('success.engagement.update', { id, data: { status: 'live', hostedAppUrl: 'https://app.example.com', firstValueEvidence: 'Customer confirmed first successful production action' } });
  await expect(h.call('success.engagement.update', { id, data: { firstValueEvidence: '' } })).rejects.toThrow('first-value evidence');
  const context = workbenchSchema.parse(await h.call('workspace.getWorkbench', { accountId }));
  expect(context.engagements[0].status).toBe('live');
});

it('rolls back multi-record updates and publishes no won event when a later invariant fails', async () => {
  const first = await opportunity(); const second = await opportunity();
  await prepare(first.id);
  await expect(h.call('testops.batch', { updates: [
    { id: first.id, data: { stage: 'won', acceptedTermsReference: 'signed agreement' } },
    { id: second.id, data: { stage: 'lost' } },
  ] })).rejects.toThrow('Lost requires');
  expect(await h.call('sales.opportunity.get', { id: first.id })).toMatchObject({ data: { stage: 'discovery' } });
  expect(await h.events('sales.opportunity.won')).toHaveLength(0);
});

it('returns bounded pages without mixing customer context', async () => {
  await opportunity(); await opportunity();
  const first = workbenchSchema.parse(await h.call('workspace.getWorkbench', { accountId, limit: 1 }));
  expect(first.opportunities).toHaveLength(1); expect(first.nextOffset).toBe(1);
  const second = workbenchSchema.parse(await h.call('workspace.getWorkbench', { accountId, limit: 1, offset: 1 }));
  expect(second.opportunities[0].id).not.toBe(first.opportunities[0].id); expect(second.nextOffset).toBeNull();
  await expect(h.call('workspace.getWorkbench', { limit: 21 })).rejects.toThrow();
});
