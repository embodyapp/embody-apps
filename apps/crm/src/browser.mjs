import { startGenUiApp } from '@embody/genui/app-runtime';
import { createWorkbenchDocument, workbenchBindings } from './presentation.js';
void startGenUiApp({
  container: document.querySelector('main'), status: document.querySelector('#connection'),
  readTarget: 'workspace.getWorkbench', readTargets: ['workspace.getWorkbench'],
  tools: { 'workspace.getWorkbench': 'crm__workspace_get_workbench', 'sales.moveStage': 'crm__sales_move_stage' },
  present: (_target, props) => createWorkbenchDocument(props), bindings: workbenchBindings,
});
