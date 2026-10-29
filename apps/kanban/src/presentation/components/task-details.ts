import type { GenUiNode } from '@embody/genui/document';
import { boundedText, type BoardTask } from '../model.js';

/** Detail nodes stay directly in the card so the browser can fold them together. */
export function createTaskDetails(task: BoardTask): GenUiNode[] {
  const details: GenUiNode[] = [
    { version: 1, type: 'keyValue', label: 'Task ID', value: task.id },
    { version: 1, type: 'keyValue', label: 'Project ID', value: task.projectId },
  ];
  if (task.parentTaskId)
    details.push({ version: 1, type: 'keyValue', label: 'Parent task ID', value: task.parentTaskId });
  if (task.description)
    details.push({ version: 1, type: 'text', text: boundedText(task.description) });
  details.push({ version: 1, type: 'keyValue', label: 'Definition of done', value: boundedText(task.definitionOfDone) });
  if (task.blockerIds.length)
    details.push({ version: 1, type: 'keyValue', label: 'Dependency IDs (may be resolved)', value: task.blockerIds.join(', ') });
  if (task.cancellationReason)
    details.push({ version: 1, type: 'keyValue', label: 'Cancellation reason', value: boundedText(task.cancellationReason) });
  return details;
}
