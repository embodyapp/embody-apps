import { definePlugin, z, type KernelContext } from '@embody/core';
import { deny, entity, noDelete, reference } from './shared.js';
import { sales } from './sales.js';

import { engagementSchema } from './schemas.js';
export { engagementSchema } from './schemas.js';
export const success = (ctx: KernelContext) => ({ engagement: entity(ctx, 'engagement', engagementSchema) });
async function validate(data: z.output<typeof engagementSchema>, ctx: KernelContext) {
  const opportunity = await reference(sales(ctx).opportunity.get(data.opportunityId), 'Opportunity');
  if (opportunity.data.stage !== 'won') deny('Onboarding requires a won opportunity.');
  if (opportunity.data.accountId !== data.accountId) deny('Onboarding account must match the opportunity.');
  if (data.status === 'blocked' && !data.blocker) deny('Blocked onboarding requires a blocker description.');
  if (data.status === 'live' && (!data.hostedAppUrl || !data.firstValueEvidence)) deny('Reported live requires a hosted app URL and first-value evidence.');
}
const record = z.object({ id: z.uuid(), data: engagementSchema });

export default definePlugin({
  id: 'success', version: '0.1.0', dependsOn: ['sales'],
  entities: { engagement: { schema: engagementSchema, description: 'Customer onboarding handoff. Live is a reported outcome with evidence, not verified hosting telemetry.', indexes: ['accountId', 'opportunityId', 'status'] } },
  events: {
    'sales.opportunity.won': async (event, ctx) => {
      const { opportunityId } = z.object({ opportunityId: z.uuid() }).parse(event.payload);
      if ((await success(ctx).engagement.list({ filter: { opportunityId }, limit: 1 })).length) return;
      const opportunity = await sales(ctx).opportunity.get(opportunityId);
      await success(ctx).engagement.create({ opportunityId, accountId: opportunity.data.accountId, ownerId: opportunity.data.ownerId,
        status: 'pending', nextAction: 'Confirm technical access and schedule hosting onboarding',
        nextActionAt: opportunity.updatedAt, blocker: '', hostedAppUrl: null, firstValueEvidence: '' });
    },
  },
  hooks: {
    'success.engagement.beforeCreate': async (payload, ctx) => {
      const { data } = z.object({ data: engagementSchema }).parse(payload);
      if (data.status !== 'pending') deny('New onboarding must start pending.');
      await validate(data, ctx);
      if ((await success(ctx).engagement.list({ filter: { opportunityId: data.opportunityId }, limit: 1 })).length)
        deny('An onboarding engagement already exists for this opportunity.');
    },
    'success.engagement.beforeUpdate': async (payload, ctx) => {
      const { current, patch } = z.object({ current: record, patch: engagementSchema.partial() }).parse(payload);
      const data = engagementSchema.parse({ ...current.data, ...patch });
      if (data.opportunityId !== current.data.opportunityId || data.accountId !== current.data.accountId) deny('Onboarding references are immutable.');
      await validate(data, ctx);
    },
    'success.engagement.beforeDelete': noDelete,
  },
});
