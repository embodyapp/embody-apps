import type { GenUiNode } from '@embody/genui/document';
import type { Board } from '../model.js';

export function createBoardPagination(board: Pick<Board, 'projectId' | 'offset' | 'limit' | 'nextOffset'>): Extract<GenUiNode, { type: 'actions' }> {
  const pages = [{ offset: board.offset, label: 'Refresh' }];
  if (board.offset > 0) pages.push({ offset: Math.max(0, board.offset - board.limit), label: 'Previous page' });
  if (board.nextOffset !== null) pages.push({ offset: board.nextOffset, label: 'Next page' });
  return {
    version: 1, type: 'actions', actions: pages.map((page, index) => ({
      id: `board-page-${index}`, label: page.label, effect: 'Read a page of tasks',
      event: { intent: 'invoke', target: 'tracker.getBoard', schema: {
        type: 'object', additionalProperties: false,
        required: [...(board.projectId ? ['projectId'] : []), 'offset', 'limit'],
        properties: {
          ...(board.projectId ? { projectId: { type: 'string', maxLength: 36, enum: [board.projectId] } as const } : {}),
          offset: { type: 'integer', minimum: page.offset, maximum: page.offset },
          limit: { type: 'integer', minimum: board.limit, maximum: board.limit },
        },
      } },
    })),
  };
}
