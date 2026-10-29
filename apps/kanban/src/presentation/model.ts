import type { z } from 'zod';
import type { boardSchema } from '../board-schema.js';

export type Board = z.infer<typeof boardSchema>;
export type BoardTask = Board['tasks'][number];
export type TaskStatus = BoardTask['status'];

// Insertion order also defines the rendered columns and drag destinations.
export const statusLabels = {
  todo: 'To do', in_progress: 'In progress', done: 'Done', canceled: 'Canceled',
} satisfies Record<TaskStatus, string>;
export const taskStatuses = Object.keys(statusLabels) as TaskStatus[];

export const boundedText = (value: string): string =>
  value.length > 4000 ? value.slice(0, 3990) + '… [truncated]' : value;
