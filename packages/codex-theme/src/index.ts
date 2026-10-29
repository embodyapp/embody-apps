/** An app-owned presentation plugin for Embody's standard web renderer. */
const css = `
:root {
  color-scheme: light dark;
  --codex-background: light-dark(#ffffff, #212121);
  --codex-surface: light-dark(#ffffff, #262626);
  --codex-hover: light-dark(#f5f5f5, #303030);
  --codex-text: light-dark(#202020, #ececec);
  --codex-muted: light-dark(#646464, #b0b0b0);
  --codex-border: light-dark(#e5e5e5, #424242);
  --codex-focus: light-dark(#585858, #c7c7c7);
}
html { margin: 0; padding: 0; }
body {
  margin: 0;
  background: var(--codex-background);
  color: var(--codex-text);
  font: 400 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
html body .genui-view {
  color-scheme: inherit;
  font: inherit;
  color: var(--codex-text);
  background: var(--codex-background);
  padding: 16px;
  overflow-wrap: anywhere;
}
.genui-view :is(h1,h2,h3,h4,h5,h6) {
  color: var(--codex-text);
  font-family: inherit;
  line-height: 1.4;
  letter-spacing: -.015em;
  font-weight: 600;
}
.genui-view h1 { margin: 0 0 6px; font-size: 19px; }
.genui-view > section > p { color: var(--codex-muted); margin: 0 0 24px; font-size: 12px; }
html body .genui-view .genui-columns {
  display: grid;
  grid-template-columns: repeat(4, minmax(240px, 1fr));
  gap: 12px;
  align-items: stretch;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 6px 6px 12px;
  scrollbar-width: thin;
}
.genui-columns > section { min-height: 220px; padding-bottom: 48px; }
.genui-columns > section > h2 {
  font-size: 12px;
  font-weight: 500;
  color: var(--codex-muted);
  margin: 0 0 12px;
  letter-spacing: 0;
}
.genui-columns > section > section {
  background: var(--codex-surface);
  border: 1px solid var(--codex-border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}
.genui-columns > section > section > h3 { margin: 0 0 8px; font-size: 14px; font-weight: 500; }
.genui-view details { font-size: 12px; }
.genui-view summary { cursor: pointer; color: var(--codex-muted); padding: 4px 0; }
.genui-view summary:focus-visible, .genui-columns:focus-visible { outline: 2px solid var(--codex-focus); outline-offset: 2px; }
.genui-view dl { margin: 12px 0 0; font-size: 12px; }
.genui-view dt { color: var(--codex-muted); margin-bottom: 3px; font-size: 11px; }
.genui-view dd { margin: 0; color: var(--codex-text); overflow-wrap: anywhere; }
.genui-view section section p { color: var(--codex-muted); font-size: 12px; margin: 12px 0; }
.genui-view ul { margin: 0; padding-left: 18px; }
.genui-view li + li { margin-top: 12px; }
html body .genui-view .genui-stack,
html body .genui-view form { gap: 12px; }
html body .genui-view label { gap: 6px; color: var(--codex-muted); }
html body .genui-view :is(input,select,textarea) {
  font: inherit;
  color: var(--codex-text);
  background: var(--codex-surface);
  border: 1px solid var(--codex-border);
  border-radius: 8px;
  padding: 9px 12px;
  min-height: 36px;
}
html body button,
html body .genui-view button {
  font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--codex-text);
  background: var(--codex-surface);
  border: 1px solid var(--codex-border);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px 6px 4px 0;
  min-height: 34px;
  cursor: pointer;
}
html body button:hover:not(:disabled) { background: var(--codex-hover); }
html body button:disabled { opacity: .5; cursor: default; }
html body :is(button,input,select,textarea):focus-visible {
  outline: 2px solid var(--codex-focus);
  outline-offset: 3px;
}
html body .genui-view .genui-badge {
  display: inline-block;
  border: 1px solid var(--codex-border);
  border-radius: 6px;
  padding: 2px 7px;
  background: var(--codex-hover);
  color: var(--codex-muted);
  font-size: 11px;
}
.genui-view > section > .genui-columns + div { margin-top: 12px; }
body > button { margin-left: 24px; }
body > :is(p[role="status"],#connection) { margin: 12px 24px; color: var(--codex-muted); font-size: 12px; }
.genui-view [role="status"]:empty { display: none; }
.genui-view [hidden] { display: none !important; }
.genui-view form { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--codex-border); }
html body .genui-view form { grid-template-columns: minmax(0,1fr) auto; align-items: end; gap: 8px; }
.genui-view form > label:has(input) { grid-column: 1 / -1; grid-row: 2; }
html body .genui-view form > button { margin: 0; min-height: 36px; padding-inline: 8px; }
html body .genui-view form > label > select { padding-inline: 8px; }
.genui-view form[inert] { opacity: .55; }
.genui-view [data-board-card] { cursor: grab; }
.genui-view [data-board-card] :is(input,select,button) { cursor: auto; }
.genui-view .board-dragging { opacity: .45; cursor: grabbing; }
.genui-view .board-drop-target { outline: 2px solid var(--codex-focus); outline-offset: 5px; border-radius: 12px; }
#board-interaction-hint { margin: 16px 24px 0; color: var(--codex-muted); font-size: 12px; }
.genui-view #board-interaction-hint { margin: 0 0 16px; }
@media(max-width: 480px) {
  html body .genui-view { padding: 12px; }
  html body .genui-view .genui-columns { grid-template-columns: repeat(4, minmax(220px,1fr)); }
  body > button { margin-left: 16px; }
  body > :is(p[role="status"],#connection) { margin-inline: 16px; }
}
@media(pointer: coarse) { html body button { min-height: 44px; } }
@media(forced-colors: active) {
  .genui-columns > section > section { border-color: CanvasText; }
  html body :is(button,input,select,textarea):focus-visible { outline-color: Highlight; }
}
`;

const marker = '<style data-genui-theme="codexTheme">';

/** Styles immutable app HTML before GenUI computes resource integrity. No runtime hooks or permissions. */
function apply<T extends { readonly text: string }>(resource: T): T {
  if (resource.text.includes(marker)) return resource;
  if (!/<\/head\s*>/i.test(resource.text)) throw new Error('codexTheme requires a complete HTML resource with a head element.');
  return { ...resource, text: resource.text.replace(/<\/head\s*>/i, () => `${marker}${css}</style></head>`) };
}

/** Codex-inspired styling; independent of OpenAI product internals and external assets. */
export const codexTheme = Object.freeze({
  id: 'codexTheme', name: 'Codex', version: '0.1.0', css, apply,
});
export default codexTheme;
