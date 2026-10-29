import { expect, it } from "vitest";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppHost } from "@embody/host";
import { startDevServer } from "@embody/cli";
import config from "../embody.config.js";

it("starts a loopback inspector with health and tracker discovery and shuts down", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-inspector-"));
  const server = await startDevServer({ ...config, port: 0, sqlitePath: join(dir, "data.sqlite") });
  try {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    const health = await fetch(`${server.url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ appId: "kanban", ready: true });
    const manifest = await fetch(`${server.url}/__inspector/manifest`);
    expect(manifest.status).toBe(200);
    expect(JSON.stringify(await manifest.json())).toContain("tracker.getTaskContext");
    expect(server.targets).toContain("tracker.addComment");
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
it('publishes the GenUI board through the real app host manifest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kanban-genui-'));
  const runtime = await createAppHost(config, { env: { NODE_ENV: 'development', PORT: '0', DATABASE_FILE: join(dir, 'data.sqlite') } });
  try {
    expect(runtime.manifest.actions['tracker.getBoard'].presentation).toEqual({ view: 'board' });
    expect(runtime.manifest.views?.board.resourceUri).toBe('ui://kanban/board@1.2.0');
  } finally { await runtime.stop(); await rm(dir, { recursive: true, force: true }); }
});
it("preserves IDs, relationships and decision comments through restart and offline backup restore", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kanban-persistence-"));
  const filename = join(dir, "kanban.sqlite");
  const restored = join(dir, "restored.sqlite");
  const principal = { orgId: "local", actorId: "owner", actorType: "human" as const, roles: ["owner"], scopes: ["tracker:*"] };
  const open = (database: string) => createAppHost(config, { env: { NODE_ENV: "development", PORT: "3031", DATABASE_FILE: database }, developmentPrincipal: principal });
  let runtime = await open(filename);
  try {
    const call = (target: string, input: unknown) => runtime.kernel.execute(target, input, { principal });
    const project = await call("tracker.project.create", { data: { name: "Persistent" } }) as { id: string };
    const parent = await call("tracker.task.create", { data: { projectId: project.id, title: "Parent", definitionOfDone: "Restored" } }) as { id: string };
    const child = await call("tracker.task.create", { data: { projectId: project.id, parentTaskId: parent.id, blockerIds: [parent.id], title: "Child", definitionOfDone: "Linked", status: "canceled", cancellationReason: "Wait" } }) as { id: string };
    const before = await call("tracker.getTaskContext", { taskId: child.id });
    const comments = await call("tracker.comment.list", { filter: { taskId: child.id } });
    await runtime.stop();
    await copyFile(filename, restored); // Offline backup only, after clean shutdown.
    runtime = await open(filename);
    expect(await call("tracker.getTaskContext", { taskId: child.id })).toEqual(before);
    expect(await call("tracker.comment.list", { filter: { taskId: child.id } })).toEqual(comments);
    await runtime.stop();
    runtime = await open(restored);
    expect(await call("tracker.getTaskContext", { taskId: child.id })).toEqual(before);
    expect(await call("tracker.comment.list", { filter: { taskId: child.id } })).toEqual(comments);
  } finally { await runtime.stop(); await rm(dir, { recursive: true, force: true }); }
});
