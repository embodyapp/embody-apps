import type { GenUiNode } from '@embody/genui/document';
import { boundedText, type BoardTask } from '../model.js';
import { createTaskDetails } from './task-details.js';
import { createTaskStatusForm } from './task-status-form.js';

export function createTaskCard(task: BoardTask): Extract<GenUiNode, { type: 'section' }> {
  return {
    version: 1, type: 'section', title: boundedText(task.title),
    children: [...createTaskDetails(task), createTaskStatusForm(task)],
  };
}
