import { readFileSync } from 'node:fs';
import { defineApp } from '@embody/host';
import { defineGenUi, defineView, withGenUi } from '@embody/genui';
import { codexTheme } from '@embody-apps/codex-theme';
import { plugins } from './src/plugins.js';
import { workbenchSchema } from './src/workspace.js';

const themed = codexTheme.apply({ text: readFileSync(new URL(import.meta.url.endsWith('.ts') ? './dist/crm-app.html' : './crm-app.html', import.meta.url), 'utf8') });
const workbenchCss = readFileSync(new URL('./src/workbench.css', import.meta.url), 'utf8');
const resource = { ...themed, text: themed.text.replace('</head>', `<style data-crm-workbench>${workbenchCss}</style></head>`) };

export default withGenUi(defineApp({
  appId: 'crm', version: '0.1.0', plugins, port: 3033, sqlitePath: '.embody/crm.sqlite',
}), defineGenUi({
  views: { workbench: defineView({
    kind: 'standard', version: '0.2.0', props: workbenchSchema,
    description: 'Hosting sales workbench and account context, including next actions, stage evidence and customer onboarding.',
    callableTargets: ['workspace.getWorkbench', 'sales.moveStage'], fallback: 'text',
    resource,
  }) }, actions: { 'workspace.getWorkbench': 'workbench' },
}));
