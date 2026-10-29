import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, cp } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/browser.mjs'], bundle: true, write: false,
  format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' });
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const digest = createHash('sha256').update(script).digest('base64');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${digest}'; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>Kanban</title></head><body><main aria-label="Kanban board"></main><p id="connection" role="status">Connecting…</p><script>${script}</script></body></html>`;
if (Buffer.byteLength(html) > 1_048_576) throw new Error('GenUI resource exceeds 1 MiB');
await mkdir('dist', { recursive: true });
await writeFile('dist/kanban-app.html', html);
const frameworkDist = new URL('.', import.meta.resolve('@embody/genui'));
for (const file of ['THIRD-PARTY-LICENSES.txt', 'THIRD-PARTY-LICENSES.json'])
  await cp(new URL(file, frameworkDist), `dist/${file}`);
