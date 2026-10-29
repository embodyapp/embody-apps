import { defineApp } from "@embody/host";
import tracker from "./src/tracker.js";
import { readFileSync } from 'node:fs';
import { defineGenUi, defineView, withGenUi } from '@embody/genui';
import { boardSchema } from './src/board-schema.js';
import { codexTheme } from '@embody-apps/codex-theme';

export default withGenUi(defineApp({
  appId: "kanban", version: "0.1.0", plugins: [tracker],
  port: 3031, sqlitePath: ".embody/kanban.sqlite",
}), defineGenUi({
  views: { board: defineView({
    kind: 'standard', version: '1.2.0', props: boardSchema,
    description: 'Project task board with status columns, completion criteria, dependencies and cancellation reasons.',
    callableTargets: ['tracker.getBoard', 'tracker.moveTask'], fallback: 'text',
    resource: codexTheme.apply({ text: readFileSync(new URL(import.meta.url.endsWith('.ts') ? './dist/kanban-app.html' : './kanban-app.html', import.meta.url), 'utf8') }),
  }) },
  actions: { 'tracker.getBoard': 'board' },
}));
