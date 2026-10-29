import { expect, it } from 'vitest';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import kanban from '../embody.config.js';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback port');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

it('serves both apps, attributed writes and GenUI resources over one authenticated MCP connection', async () => {
  const { startLocalGateway } = await import(new URL('../scripts/local-gateway.mjs', import.meta.url).href);
  const { default: crm } = await import(new URL('../../crm/dist/embody.config.js', import.meta.url).href);
  const dir = await mkdtemp(join(tmpdir(), 'embody-shared-gateway-'));
  const cluster = await startLocalGateway({ gatewayPort: 0, apps: [
    { config: kanban, port: await freePort(), database: join(dir, 'kanban.sqlite') },
    { config: crm, port: await freePort(), database: join(dir, 'crm.sqlite') },
  ] });
  const client = new Client({ name: 'shared-gateway-test', version: '1.0.0' }, {
    capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
  });
  try {
    expect((await fetch(`${cluster.gatewayUrl}/api/catalog`)).status).toBe(401);
    const catalog = await (await fetch(`${cluster.gatewayUrl}/api/catalog`, { headers: { Authorization: `Bearer ${cluster.token}` } })).json() as { appId: string }[];
    expect(catalog.map(app => app.appId).sort()).toEqual(['crm', 'kanban']);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${cluster.gatewayUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${cluster.token}` } },
    }));
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['kanban__tracker_get_board', 'crm__workspace_get_workbench']));
    expect(tools.find(tool => tool.name === 'crm__workspace_get_workbench')?._meta).toMatchObject({ ui: { resourceUri: 'ui://crm/workbench@0.2.0' } });
    for (const name of ['kanban__tracker_get_board', 'crm__workspace_get_workbench']) {
      const result = await client.callTool({ name, arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toBeDefined();
    }
    for (const uri of ['ui://kanban/board@1.2.0', 'ui://crm/workbench@0.2.0']) {
      const resource = await client.readResource({ uri });
      expect(resource.contents[0]).toMatchObject({ uri, mimeType: 'text/html;profile=mcp-app' });
      const text = (resource.contents[0] as { text: string }).text;
      expect(text).toContain(uri.includes('crm') ? 'crm__sales_move_stage' : 'kanban__tracker_move_task');
    }
    const created = await client.callTool({ name: 'crm__relationships_account_create', arguments: { data: { name: 'Disposable gateway test' } } });
    const account = JSON.parse((created.content as { type: string; text: string }[])[0].text) as { id: string };
    const activity = await client.callTool({ name: 'crm__relationships_activity_create', arguments: { data: { accountId: account.id, kind: 'note', body: 'Attribution check', authorId: 'forged' } } });
    expect(JSON.parse((activity.content as { text: string }[])[0].text)).toMatchObject({ data: { authorType: 'agent', authorId: 'mcp:local-owner' } });
  } finally {
    await client.close(); await cluster.stop(); await rm(dir, { recursive: true, force: true });
  }
}, 20_000);
