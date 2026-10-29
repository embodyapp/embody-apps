import { definePlugin, z, type KernelContext } from '@embody/core';
import { deny, entity, noDelete, reference } from './shared.js';

import { accountSchema, contactSchema, activitySchema } from './schemas.js';
export { accountSchema, contactSchema, activitySchema } from './schemas.js';
export const relationships = (ctx: KernelContext) => ({
  account: entity(ctx, 'account', accountSchema), contact: entity(ctx, 'contact', contactSchema),
  activity: entity(ctx, 'activity', activitySchema),
});
const record = z.object({ id: z.uuid(), data: contactSchema });

export default definePlugin({
  id: 'relationships', version: '0.1.0',
  entities: {
    account: { schema: accountSchema, description: 'Customer company. Not an Embody platform tenant.', indexes: ['status'] },
    contact: { schema: contactSchema, description: 'Person at a customer account; role describes their buying involvement.', indexes: ['accountId'] },
    activity: { schema: activitySchema, description: 'Append-only account interaction. Author is assigned by the server; logging email does not send it.', indexes: ['accountId'] },
  },
  hooks: {
    'relationships.contact.beforeCreate': async (payload, ctx) => {
      const { data } = z.object({ data: contactSchema }).parse(payload);
      await reference(relationships(ctx).account.get(data.accountId), 'Account');
    },
    'relationships.contact.beforeUpdate': async (payload) => {
      const { current, patch } = z.object({ current: record, patch: contactSchema.partial() }).parse(payload);
      if (patch.accountId && patch.accountId !== current.data.accountId) deny('Contact accountId is immutable. Create a new contact for another account.');
    },
    'relationships.activity.beforeCreate': async (payload, ctx) => {
      const { data } = z.object({ data: activitySchema }).parse(payload);
      await reference(relationships(ctx).account.get(data.accountId), 'Account');
      Object.assign((payload as { data: z.output<typeof activitySchema> }).data,
        { authorId: ctx.principal.actorId, authorType: ctx.principal.actorType });
    },
    'relationships.activity.beforeUpdate': () => deny('Activity is append-only. Add a correction as a new activity.'),
    'relationships.activity.beforeDelete': noDelete,
    'relationships.contact.beforeDelete': noDelete,
    'relationships.account.beforeDelete': noDelete,
  },
});
