// Transport-only adapter: preserve MCP initialization, UI metadata and resources.
// Read rotating local credentials at launch; never put credentials in Codex config.
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const stateDir = new URL('../.embody/', import.meta.url);
async function ready() {
  try {
    const response = await fetch('http://127.0.0.1:3031/health', { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    const crm = await fetch('http://127.0.0.1:3033/health', { signal: AbortSignal.timeout(1000) });
    const crmHealth = await crm.json();
    const credentials = await readFile(new URL('dev-cli.env', stateDir), 'utf8');
    const token = /^export EMBODY_TOKEN='([a-f0-9]+)'$/m.exec(credentials)?.[1];
    if (!token) return false;
    const gateway = await fetch('http://127.0.0.1:3032/api/catalog', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1000) });
    if (!gateway.ok) return false;
    const catalog = await gateway.json();
    return health.appId === 'kanban' && health.ready === true && crmHealth.appId === 'crm' && crmHealth.ready === true &&
      Array.isArray(catalog) && ['kanban', 'crm'].every(appId => catalog.some(app => app.appId === appId));
  } catch { return false; }
}
if (!await ready()) {
  await mkdir(stateDir, { recursive: true });
  const log = await open(new URL('dev-gateway.log', stateDir), 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./dev-gateway.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), detached: true,
    stdio: ['ignore', log.fd, log.fd],
  });
  child.unref();
  await log.close();
  const deadline = Date.now() + 10_000;
  while (!await ready()) {
    if (Date.now() >= deadline) throw new Error('Shared gateway failed to start; inspect apps/kanban/.embody/dev-gateway.log. Stop old standalone hosts first.');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
const credentials = await readFile(new URL('dev-cli.env', stateDir), 'utf8');
const token = /^export EMBODY_TOKEN='([a-f0-9]+)'$/m.exec(credentials)?.[1];
if (!token) throw new Error('Start the shared dev:gateway before connecting Codex.');
const remote = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3032/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const local = new StdioServerTransport();
const observation = { startedAt: new Date().toISOString(), initialization: null, methods: [] };
const save = () => writeFile(new URL('codex-mcp-observation.json', stateDir), JSON.stringify(observation, null, 2) + '\n', { mode: 0o600 });
let queue = Promise.resolve();
local.onmessage = message => {
  // Record only protocol capabilities/methods, never arguments, credentials or results.
  if (message.method === 'initialize') observation.initialization = {
    clientInfo: message.params?.clientInfo, capabilities: message.params?.capabilities,
    protocolVersion: message.params?.protocolVersion,
  };
  if (message.method && observation.methods.length < 100) observation.methods.push(message.method);
  queue = queue.then(async () => {
    await save();
    await remote.send(message);
  }).catch(async error => {
    console.error('Kanban MCP transport failed:', error.message);
    if ('id' in message) await local.send({ jsonrpc: '2.0', id: message.id,
      error: { code: -32603, message: 'Local Kanban gateway connection failed.' } });
    await close();
    process.stdin.pause();
    process.exitCode = 1;
  });
};
remote.onmessage = message => {
  if (message.result?.protocolVersion) remote.setProtocolVersion(message.result.protocolVersion);
  void local.send(message).catch(error => console.error('Kanban MCP output failed:', error.message));
};
remote.onerror = error => { if (!closing) console.error('Kanban MCP connection failed:', error.message); };
local.onerror = error => console.error('Kanban MCP input failed:', error.message);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await remote.close(); await local.close();
}
local.onclose = () => void close();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void close());
await remote.start();
await local.start();
