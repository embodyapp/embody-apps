import { z } from 'zod';
export const trelloId = z.string().regex(/^[a-f0-9]{24}$/);
export const boardSchema = z.object({ id: trelloId, name: z.string(), closed: z.boolean() });
export const listSchema = z.object({ id: trelloId, name: z.string(), closed: z.boolean(), pos: z.number() });
export const cardSchema = z.object({
  id: trelloId, idBoard: trelloId, idList: trelloId, name: z.string(), desc: z.string(),
  closed: z.boolean(), pos: z.number(), due: z.iso.datetime({ offset: true }).nullable(), dueComplete: z.boolean(),
  labels: z.array(z.object({ name: z.string(), color: z.string().nullable() })),
});
export const workspaceInput = z.object({
  boardId: trelloId.optional(), listId: trelloId.optional(), cardId: trelloId.optional(),
  offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(10).default(5),
}).strict().refine(i => i.boardId || (!i.listId && !i.cardId), 'Select a board before a list or card');
export const workspaceSchema = z.object({
  connected: z.boolean(), message: z.string(), board: boardSchema.nullable(),
  boards: z.array(boardSchema), lists: z.array(listSchema).max(100), cards: z.array(cardSchema).max(10),
  selectedCard: cardSchema.nullable(), listId: trelloId.nullable(),
  offset: z.number().int(), limit: z.number().int(), nextOffset: z.number().int().nullable(),
});
export type Board = z.output<typeof boardSchema>;
export type Card = z.output<typeof cardSchema>;
export type List = z.output<typeof listSchema>;
