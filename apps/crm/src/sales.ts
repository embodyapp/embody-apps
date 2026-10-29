import { definePlugin, z, type KernelContext } from '@embody/core';
import { deny, entity, noDelete, reference } from './shared.js';
import { relationships } from './relationships.js';

import { stageSchema, opportunitySchema } from './schemas.js';
export { stageSchema, opportunitySchema } from './schemas.js';
export const sales = (ctx: KernelContext) => ({ opportunity: entity(ctx, 'opportunity', opportunitySchema) });
type Opportunity = z.output<typeof opportunitySchema>;
const record = z.object({ id: z.uuid(), data: opportunitySchema });
const terminal = (stage: Opportunity['stage']) => stage === 'won' || stage === 'lost';
async function validate(data: Opportunity, ctx: KernelContext) {
  const account = await reference(relationships(ctx).account.get(data.accountId), 'Account');
  if (!terminal(data.stage) && account.data.status === 'archived') deny('Archive is not a sales destination. Activate the account before opening an opportunity.');
  if (data.decisionContactId) {
    const contact = await reference(relationships(ctx).contact.get(data.decisionContactId), 'Decision contact');
    if (contact.data.accountId !== data.accountId) deny('Decision contact must belong to the opportunity account.');
  }
  if (!terminal(data.stage) && (!data.nextAction || !data.nextActionAt)) deny('Open opportunities require a next action and date.');
  if (['evaluation', 'proposal', 'won'].includes(data.stage) && !data.evaluationGoal) deny('Evaluation requires a measurable success criterion.');
  if (['proposal', 'won'].includes(data.stage) && (!data.hostingScope || !data.region || data.proposedMonthlyMinor <= 0))
    deny('Proposal requires hosting scope, region and a positive proposed monthly amount.');
  if (data.stage === 'won' && (!data.decisionContactId || !data.evaluationEvidence || !data.acceptedTermsReference))
    deny('Won requires a decision contact, evaluation evidence and an accepted-terms reference.');
  if (data.stage === 'lost' && !data.lossReason) deny('Lost requires a reason.');
  if (data.stage !== 'lost' && data.lossReason) deny('Only lost opportunities can carry a loss reason.');
  if (data.stage !== 'won' && data.acceptedTermsReference) deny('Record accepted terms together with the won transition.');
}
export const moveStageInput = z.object({ id: z.uuid(), expectedStage: stageSchema, stage: stageSchema,
  acceptedTermsReference: z.string().trim().max(4000).default(''), lossReason: z.string().trim().max(4000).default(''),
}).strict();

export default definePlugin({
  id: 'sales', version: '0.1.0', dependsOn: ['relationships'],
  entities: { opportunity: { schema: opportunitySchema, description: 'One hosting buying decision. Proposed monthly amount is not collected MRR. Create in discovery with owner, currency and dated next action.', indexes: ['accountId', 'stage', 'nextActionAt'] } },
  actions: {
    moveStage: {
      description: 'Change a prepared opportunity stage with a stale-stage check. Evaluation needs goal; proposal needs hosting scope, region and proposed amount; won also needs buyer, evidence and accepted terms. Use entity.update to prepare evidence. No billing or provisioning occurs.',
      input: moveStageInput, output: z.object({ id: z.uuid(), stage: stageSchema }), effect: 'write',
      handler: async (input: z.output<typeof moveStageInput>, ctx) => {
        const current = await sales(ctx).opportunity.get(input.id);
        if (current.data.stage !== input.expectedStage) deny('Stage changed. Refresh before moving this opportunity.');
        const updated = await sales(ctx).opportunity.update(input.id, {
          stage: input.stage, acceptedTermsReference: input.acceptedTermsReference, lossReason: input.lossReason,
        });
        return { id: updated.id, stage: updated.data.stage };
      },
    },
  },
  hooks: {
    'sales.opportunity.beforeCreate': async (payload, ctx) => {
      const { data } = z.object({ data: opportunitySchema }).parse(payload);
      if (data.stage !== 'discovery') deny('New opportunities must start in discovery.');
      await validate(data, ctx);
    },
    'sales.opportunity.beforeUpdate': async (payload, ctx) => {
      const { current, patch } = z.object({ current: record, patch: opportunitySchema.partial() }).parse(payload);
      if (terminal(current.data.stage)) deny('Closed opportunities are immutable. Create a new opportunity for a new buying decision.');
      const next = opportunitySchema.parse({ ...current.data, ...patch });
      if (next.accountId !== current.data.accountId) deny('Opportunity accountId is immutable.');
      await validate(next, ctx);
    },
    'sales.opportunity.afterUpdate': async (payload, ctx) => {
      const { current, updated } = z.object({ current: record, updated: record }).parse(payload);
      if (current.data.stage !== 'won' && updated.data.stage === 'won')
        await ctx.events.publish('sales.opportunity.won', { opportunityId: updated.id });
    },
    'sales.opportunity.beforeDelete': noDelete,
  },
});
