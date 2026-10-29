import { z } from 'zod';

export const text = z.string().trim().min(1).max(4000);
export const date = z.iso.datetime({ offset: true });
// Preprocessing supplies create defaults without Zod partial() resetting omitted update fields.
export const defaulted = <S extends z.ZodType>(schema: S, value: z.output<S>) =>
  z.preprocess(input => input === undefined ? value : input, schema);

export const accountSchema = z.object({
  name: text, website: defaulted(z.url().nullable(), null), source: defaulted(text, 'direct'),
  status: defaulted(z.enum(['active', 'archived']), 'active'), notes: defaulted(z.string().max(4000), ''),
});
export const contactSchema = z.object({ accountId: z.uuid(), name: text, email: z.email(),
  role: defaulted(z.enum(['champion', 'buyer', 'technical', 'other']), 'other'),
});
export const activitySchema = z.object({ accountId: z.uuid(),
  kind: z.enum(['note', 'call', 'meeting', 'email']), body: text,
  authorId: defaulted(z.string(), ''), authorType: defaulted(z.enum(['human', 'agent', 'system']), 'system'),
});

export const stageSchema = z.enum(['discovery', 'evaluation', 'proposal', 'won', 'lost']);
export const opportunitySchema = z.object({
  accountId: z.uuid(), title: text, useCase: text, ownerId: text,
  stage: defaulted(stageSchema, 'discovery'),
  nextAction: defaulted(z.string().trim().max(4000), ''), nextActionAt: defaulted(date.nullable(), null),
  decisionContactId: defaulted(z.uuid().nullable(), null),
  evaluationGoal: defaulted(z.string().trim().max(4000), ''), evaluationEvidence: defaulted(z.string().trim().max(4000), ''),
  hostingScope: defaulted(z.string().trim().max(4000), ''), region: defaulted(z.string().trim().max(200), ''),
  proposedMonthlyMinor: defaulted(z.number().int().nonnegative().max(1_000_000_000), 0), currency: z.string().regex(/^[A-Z]{3}$/),
  acceptedTermsReference: defaulted(z.string().trim().max(4000), ''), lossReason: defaulted(z.string().trim().max(4000), ''),
});

export const engagementSchema = z.object({ opportunityId: z.uuid(), accountId: z.uuid(), ownerId: text,
  status: defaulted(z.enum(['pending', 'onboarding', 'blocked', 'live']), 'pending'),
  nextAction: text, nextActionAt: date,
  blocker: defaulted(z.string().trim().max(4000), ''),
  hostedAppUrl: defaulted(z.url().nullable(), null), firstValueEvidence: defaulted(z.string().trim().max(4000), ''),
});

export const pageInput = z.object({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(20).default(5) });
export const stageFilterSchema = z.enum(['all', ...stageSchema.options]);
export const panelSchema = z.enum(['opportunities', 'contacts', 'activity', 'onboarding']);
export const workbenchInput = pageInput.extend({ accountId: z.uuid().optional(), opportunityId: z.uuid().optional(),
  stage: stageFilterSchema.default('all'), panel: panelSchema.default('opportunities'),
});
export const opportunityViewSchema = opportunitySchema.extend({ id: z.uuid(), accountName: z.string() });
export const workbenchSchema = z.object({
  account: accountSchema.extend({ id: z.uuid() }).nullable(), offset: z.number().int(), limit: z.number().int(), nextOffset: z.number().int().nullable(),
  stage: stageFilterSchema, panel: panelSchema, selectedOpportunity: opportunityViewSchema.nullable(),
  opportunities: z.array(opportunityViewSchema),
  contacts: z.array(contactSchema.extend({ id: z.uuid() })),
  activities: z.array(activitySchema.extend({ id: z.uuid(), createdAt: z.string() })),
  engagements: z.array(engagementSchema.extend({ id: z.uuid() })), asOf: z.string(),
});
