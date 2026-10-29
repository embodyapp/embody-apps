import { startGenUiApp } from '@embody/genui/app-runtime';
import { createBoardDocument, boardBindings } from './presentation.js';
import { enableBoardDragging } from './board-drag.js';
const container = document.querySelector('main');
const stopDragging = enableBoardDragging(container);
window.addEventListener('pagehide', stopDragging, { once: true });
void startGenUiApp({
  container, status: document.querySelector('#connection'),
  readTarget: 'tracker.getBoard', readTargets: ['tracker.getBoard'],
  tools: { 'tracker.getBoard': 'kanban__tracker_get_board', 'tracker.moveTask': 'kanban__tracker_move_task' },
  present: (_target, props) => createBoardDocument(props), bindings: boardBindings,
});
