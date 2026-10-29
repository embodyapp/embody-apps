import type { GenUiNode } from '@embody/genui/document';
import { statusLabels, taskStatuses, type BoardTask } from '../model.js';

export function createTaskStatusForm(task: Pick<BoardTask, 'id' | 'status' | 'cancellationReason'>): Extract<GenUiNode, { type: 'form' }> {
  return {
    version: 1, type: 'form', id: `move-${task.id}`, label: 'Save status',
    effect: 'Save this task status. Canceling records a reason; reopening preserves decision history.',
    children: [
      {
        version: 1, type: 'select', id: `status-${task.id}`, label: 'Move to', value: task.status,
        options: taskStatuses.map(value => ({ value, label: statusLabels[value] })),
        event: { intent: 'change', schema: {
          type: 'object', additionalProperties: false, required: ['value'],
          properties: { value: { type: 'string', maxLength: 16, enum: taskStatuses } },
        } },
      },
      {
        version: 1, type: 'field', id: `reason-${task.id}`, label: 'Cancellation reason (required to cancel)',
        value: task.cancellationReason ?? '',
        event: { intent: 'change', schema: {
          type: 'object', additionalProperties: false, required: ['value'],
          properties: { value: { type: 'string', maxLength: 2000 } },
        } },
      },
    ],
    event: { intent: 'submit', target: 'tracker.moveTask', schema: {
      type: 'object', additionalProperties: false, required: ['id', 'status', 'expectedStatus', 'cancellationReason'],
      properties: {
        id: { type: 'string', maxLength: 36, enum: [task.id] },
        expectedStatus: { type: 'string', maxLength: 16, enum: [task.status] },
        status: { type: 'string', maxLength: 16, enum: taskStatuses },
        cancellationReason: { type: 'string', maxLength: 2000 },
      },
    } },
  };
}
