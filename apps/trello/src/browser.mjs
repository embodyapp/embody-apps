import { startGenUiApp } from '@embody/genui/app-runtime';
import { createWorkspaceDocument, workspaceBindings } from './presentation.js';
void startGenUiApp({
  container: document.querySelector('main'), status: document.querySelector('#connection'),
  readTarget: 'trello.getWorkspace', readTargets: ['trello.getWorkspace'],
  tools: { 'trello.getWorkspace': 'trello__trello_get_workspace' },
  present: (_target, props) => createWorkspaceDocument(props), bindings: workspaceBindings,
});
