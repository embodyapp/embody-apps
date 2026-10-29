import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createTestHarness } from '@embody/testing';
import { compileGenUiManifest } from '@embody/genui';
import config from '../../crm/dist/embody.config.js';

export async function startCrmFixture() {
  const h = await createTestHarness({ plugins: config.plugins });
  const actor = h.asAgent('mobile-crm-test');
  const account = await actor.call('relationships.account.create', { data: { name: 'Example · Acme' } });
  for (let i = 0; i < 7; i++) {
    const opportunity = await actor.call('sales.opportunity.create', { data: {
      accountId: account.id, title: i === 6 ? 'Verified evaluation app' : `Support agent hosting ${i + 1}`,
      useCase: 'An agent triages customer support requests in a managed Embody app.', ownerId: 'sales-owner', currency: 'USD',
      nextAction: 'Confirm the first support workflow and technical owner', nextActionAt: '2026-11-01T10:00:00Z',
      evaluationGoal: 'Complete one real support workflow', hostingScope: 'One managed production app',
    } });
    if (i === 6) await actor.call('sales.moveStage', { id: opportunity.id, expectedStage: 'discovery', stage: 'evaluation' });
  }
  const result = async (target, input) => {
    try {
      const value = await actor.call(target, input);
      return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
    } catch (error) {
      return { isError: true, _meta: { 'embody/errorCode': error.code ?? 'UNCERTAIN_OUTCOME' }, content: [{ type: 'text', text: error.message }] };
    }
  };
  const manifest = compileGenUiManifest(config);
  const names = { crm__workspace_get_workbench: 'workspace.getWorkbench', crm__sales_move_stage: 'sales.moveStage' };
  const tools = Object.entries(names).map(([name, target]) => ({ target, appId: 'crm', effect: target === 'workspace.getWorkbench' ? 'read' : 'mutation',
    tool: { name, inputSchema: manifest.actions[target].inputSchema, _meta: { ui: { resourceUri: 'ui://crm/workbench@0.2.0', visibility: ['model', 'app'] } } } }));
  const initial = await result('workspace.getWorkbench', {});
  const asset = await readFile(new URL(import.meta.resolve('@embody/genui/renderer-global.js')), 'utf8');
  const key = randomBytes(24).toString('hex');
  const outcomes = [];
  let origin;
  const bootstrap = `const frame=document.querySelector('iframe');const hosted=EmbodyGenUi.createGenUiAppBridge({appId:'crm',generation:'mobile-qa',currentGeneration:()=> 'mobile-qa',callableTargets:['workspace.getWorkbench','sales.moveStage'],tools:${JSON.stringify(tools)},callTool:async(name,input)=>{const r=await fetch('/call',{method:'POST',headers:{Authorization:'Bearer ${key}','Content-Type':'application/json'},body:JSON.stringify({name,input})});return r.json();},publishOutcome:async(outcome)=>{await fetch('/outcome',{method:'POST',headers:{Authorization:'Bearer ${key}','Content-Type':'application/json'},body:JSON.stringify(outcome)});}});hosted.bridge.oninitialized=()=>{hosted.bridge.setHostContext({theme:'light'});void hosted.bridge.sendToolResult(${JSON.stringify(initial).replace(/</g, '\\u003c')});};void hosted.bridge.connect(new EmbodyGenUi.PostMessageTransport(frame.contentWindow,frame.contentWindow));frame.src='/widget';`;
  const server = createServer((req, res) => { void (async () => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.url === '/renderer') { res.setHeader('Content-Type', 'text/javascript'); return res.end(asset); }
    if (req.method === 'GET' && req.url === '/script') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bootstrap); }
    if (req.method === 'GET' && req.url === '/widget') { res.setHeader('Content-Type', 'text/html'); return res.end(config.genui.views.workbench.resource.text); }
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM mobile QA</title><style>body{margin:0}iframe{display:block;border:0;width:100%;height:2400px}</style></head><body><iframe title="CRM" sandbox="allow-scripts"></iframe><script src="/renderer"></script><script src="/script"></script></body></html>');
    }
    if (req.method !== 'POST' || !['/call', '/outcome'].includes(req.url) || req.headers.origin !== origin || req.headers.authorization !== `Bearer ${key}`) { res.statusCode = 404; return res.end(); }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Request too large'); chunks.push(chunk); }
    const input = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/outcome') { outcomes.push(input); return res.end('{}'); }
    if (!Object.hasOwn(names, input.name)) { res.statusCode = 404; return res.end('{}'); }
    res.end(JSON.stringify(await result(names[input.name], input.input)));
  })().catch(() => { res.statusCode = 500; res.end('Unavailable'); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  return { url: origin, state: async () => ({ opportunities: await actor.call('sales.opportunity.list', {}), outcomes }),
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.close(); } };
}
