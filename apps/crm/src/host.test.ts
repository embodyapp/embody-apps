import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDevServer } from '@embody/cli';
import { compileGenUiManifest, genUiResourceIntegrity } from '@embody/genui';
import config from '../embody.config.js';

it('boots on loopback and publishes an integrity-checked CRM view and domain actions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'crm-host-'));
  const server = await startDevServer({ ...config, port: 0, sqlitePath: join(dir, 'crm.sqlite') });
  try {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(await (await fetch(`${server.url}/health`)).json()).toMatchObject({ appId: 'crm', ready: true });
    expect(server.targets).toContain('sales.moveStage');
    expect(server.targets).toContain('workspace.getWorkbench');
    const manifest = compileGenUiManifest(config);
    expect(manifest.actions['workspace.getWorkbench'].presentation).toEqual({ view: 'workbench' });
    expect(manifest.views?.workbench).toMatchObject({ resourceUri: 'ui://crm/workbench@0.2.0',
      integrity: genUiResourceIntegrity(config.genui.views.workbench.resource), callableTargets: ['sales.moveStage', 'workspace.getWorkbench'] });
    expect(config.genui.views.workbench.resource.text).toContain("connect-src 'none'");
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
