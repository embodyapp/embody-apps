import { z } from 'zod';
export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done', 'canceled']);
export const moveTaskInputSchema = z.object({
  id: z.uuid(), status: taskStatusSchema, expectedStatus: taskStatusSchema,
  cancellationReason: z.string().trim().max(2000).default(''),
}).strict();

export const boardInputSchema = z.object({
  projectId: z.uuid().optional(),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(50).default(20),
});
export const boardSchema = z.object({
  title: z.string(), projectId: z.uuid().nullable(),
  offset: z.number().int().nonnegative(), limit: z.number().int().positive(),
  nextOffset: z.number().int().nonnegative().nullable(),
  tasks: z.array(z.object({
    id: z.uuid(), projectId: z.uuid(), parentTaskId: z.uuid().nullable(),
    title: z.string(), description: z.string(), definitionOfDone: z.string(),
    status: taskStatusSchema,
    blockerIds: z.array(z.uuid()), cancellationReason: z.string().nullable(),
  })),
});
