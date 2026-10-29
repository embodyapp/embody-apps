import { readFileSync } from 'node:fs';
import { defineApp } from '@embody/host';
import { defineGenUi, defineView, withGenUi } from '@embody/genui';
import { codexTheme } from '@embody-apps/codex-theme';
import trello from './src/plugin.js';
import { workspaceSchema } from './src/schemas.js';
const themed = codexTheme.apply({ text: readFileSync(new URL(import.meta.url.endsWith('.ts') ? './dist/trello-app.html' : './trello-app.html', import.meta.url), 'utf8') });
const css = readFileSync(new URL('./src/workspace.css', import.meta.url), 'utf8');
export default withGenUi(defineApp({
  appId: 'trello', version: '0.1.0', plugins: [trello], port: 3034, sqlitePath: '.embody/trello.sqlite',
}), defineGenUi({
  views: { workspace: defineView({
    kind: 'standard', version: '0.1.0', props: workspaceSchema,
    description: 'Live Trello board browser with list filtering, paginated cards and card details.',
    callableTargets: ['trello.getWorkspace'], fallback: 'text',
    resource: { ...themed, text: themed.text.replace('</head>', `<style>${css}</style></head>`) },
  }) }, actions: { 'trello.getWorkspace': 'workspace' },
}));
