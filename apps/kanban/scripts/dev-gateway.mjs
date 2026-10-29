// Shared local gateway. Keep this entry point for existing Codex MCP configurations.
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import kanban from '../dist/embody.config.js';
import crm from '../../crm/dist/embody.config.js';
import { startLocalGateway } from './local-gateway.mjs';

let cluster;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await cluster?.stop();
}
try {
  cluster = await startLocalGateway({ apps: [
    { config: kanban, port: 3031, database: fileURLToPath(new URL('../.embody/kanban.sqlite', import.meta.url)) },
    { config: crm, port: 3033, database: fileURLToPath(new URL('../../crm/.embody/crm.sqlite', import.meta.url)) },
  ] });
  const stateDir = new URL('../.embody/', import.meta.url);
  await mkdir(stateDir, { recursive: true });
  const credentials = new URL('dev-cli.env', stateDir);
  await writeFile(credentials, `export EMBODY_GATEWAY_URL='${cluster.gatewayUrl}'\nexport EMBODY_TOKEN='${cluster.token}'\n`, { mode: 0o600 });
  await chmod(credentials, 0o600);
  console.log(`Gateway: ${cluster.gatewayUrl}\nMCP: ${cluster.gatewayUrl}/mcp\nKanban: http://127.0.0.1:3031\nCRM: http://127.0.0.1:3033\nCLI credentials: ${fileURLToPath(credentials)} (private, ignored; rotated on restart)`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    void stop().catch(error => { console.error(error); process.exitCode = 1; });
  });
} catch (error) {
  await stop();
  throw error;
}
