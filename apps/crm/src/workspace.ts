import { definePlugin, NotFoundError, z, type KernelContext } from '@embody/core';
import { relationships } from './relationships.js';
import { sales } from './sales.js';
import { success } from './success.js';

import { workbenchInput, workbenchSchema } from './schemas.js';
export { workbenchInput, workbenchSchema } from './schemas.js';
async function getWorkbench(input: z.output<typeof workbenchInput>, ctx: KernelContext): Promise<z.output<typeof workbenchSchema>> {
  const { accountId, opportunityId, stage, panel, offset, limit } = input;
  const account = accountId ? await relationships(ctx).account.get(accountId) : null;
  const query = { ...(accountId ? { filter: { accountId } } : {}), offset, limit: limit + 1 };
  const selected = opportunityId ? await sales(ctx).opportunity.get(opportunityId) : null;
  if (selected && accountId && selected.data.accountId !== accountId) throw new NotFoundError('Opportunity was not found in this account.');
  const opportunities = await sales(ctx).opportunity.list({ ...query,
    filter: { ...(accountId ? { accountId } : {}), ...(stage !== 'all' ? { stage } : {}) },
  });
  const contacts = accountId ? await relationships(ctx).contact.list(query) : [];
  const activities = accountId ? await relationships(ctx).activity.list(query) : [];
  const engagements = accountId ? await success(ctx).engagement.list(query) : [];
  const accountIds = [...new Set([...opportunities.slice(0, limit).map(r => r.data.accountId), ...(selected ? [selected.data.accountId] : [])])];
  const accounts = await relationships(ctx).account.getMany(accountIds);
  const names = new Map(accounts.map(r => [r.id, r.data.name]));
  const activeRows = !accountId || panel === 'opportunities' ? opportunities : panel === 'contacts' ? contacts : panel === 'activity' ? activities : engagements;
  const nextOffset = activeRows.length > limit ? offset + limit : null;
  return {
    account: account ? { id: account.id, ...account.data } : null, offset, limit, nextOffset,
    stage, panel: accountId ? panel : 'opportunities',
    selectedOpportunity: selected ? { id: selected.id, ...selected.data, accountName: names.get(selected.data.accountId)! } : null,
    opportunities: opportunities.slice(0, limit).map(r => ({ id: r.id, ...r.data, accountName: names.get(r.data.accountId)! })),
    contacts: contacts.slice(0, limit).map(r => ({ id: r.id, ...r.data })),
    activities: activities.slice(0, limit).map(r => ({ id: r.id, ...r.data, createdAt: r.createdAt })),
    engagements: engagements.slice(0, limit).map(r => ({ id: r.id, ...r.data })), asOf: new Date().toISOString(),
  };
}
export default definePlugin({
  id: 'workspace', version: '0.1.0', dependsOn: ['relationships', 'sales', 'success'],
  actions: { getWorkbench: {
    description: 'Read a mobile-first CRM workbench (5 cards by default). stage filters opportunities across all pages. opportunityId opens one opportunity; accountId opens account context, with panel selecting opportunities, contacts, activity or onboarding. nextOffset pages the active panel. Proposed amounts are not collected MRR.',
    input: workbenchInput, output: workbenchSchema, effect: 'read', idempotent: true, handler: getWorkbench,
  } },
});
