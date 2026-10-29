import { parseGenUiDocument, type GenUiDocument } from '@embody/genui/document';
import { boardSchema } from './board-schema.js';
import { boundedText, taskStatuses } from './presentation/model.js';
import { createStatusColumn } from './presentation/components/status-column.js';
import { createBoardPagination } from './presentation/components/board-pagination.js';

export { statusLabels } from './presentation/model.js';
export { boardBindings } from './presentation/bindings.js';

/** Validate board props once, then compose the reusable GenUI nodes. */
export function createBoardDocument(props: unknown): GenUiDocument {
  const board = boardSchema.parse(props);
  return parseGenUiDocument({ version: 1, root: {
    version: 1, type: 'section', title: boundedText(board.title), children: [
      { version: 1, type: 'text', text: `Tasks ${board.tasks.length ? board.offset + 1 : 0}–${board.offset + board.tasks.length} · One page of the board` },
      { version: 1, type: 'columns', children: taskStatuses.map(status => createStatusColumn(status, board.tasks)) },
      createBoardPagination(board),
    ],
  } });
}
