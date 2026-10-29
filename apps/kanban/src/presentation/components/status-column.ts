import type { GenUiNode } from '@embody/genui/document';
import { statusLabels, type BoardTask, type TaskStatus } from '../model.js';
import { createTaskCard } from './task-card.js';

export function createStatusColumn(status: TaskStatus, tasks: readonly BoardTask[]): Extract<GenUiNode, { type: 'section' }> {
  const matchingTasks = tasks.filter(task => task.status === status);
  return {
    version: 1, type: 'section', title: `${statusLabels[status]} (${matchingTasks.length})`,
    children: matchingTasks.length
      ? matchingTasks.map(createTaskCard)
      : [{ version: 1, type: 'emptyState', text: 'No tasks on this page' }],
  };
}
