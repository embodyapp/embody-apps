import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "@embody/testing";
import { definePlugin, HookVetoError } from "@embody/core";
import config from "../embody.config.js";
let h: TestHarness;
let projectId: string;
const task = async (data: Record<string, unknown> = {}) => await h.call("tracker.task.create", { data: { projectId, title: "Task", definitionOfDone: "Proof", ...data } }) as { id: string };
const update = (id: string, data: Record<string, unknown>) => h.call("tracker.task.update", { id, data });
const context = (id: string) => h.call("tracker.getTaskContext", { taskId: id });
beforeEach(async () => {
  h = await createTestHarness({ plugins: config.plugins });
  projectId = (await h.call("tracker.project.create", { data: { name: "Work" } }) as { id: string }).id;
});
afterEach(async () => { await h.close(); });

it("only done resolves blockers; cancellation and reopening preserve dependency links", async () => {
  const blocker = await task(); const parent = await task({ blockerIds: [blocker.id] });
  await task({ parentTaskId: parent.id });
  await update(parent.id, { status: "in_progress" });
  await update(parent.id, { status: "done" }); // No implicit blocker/child gate.
  await update(blocker.id, { status: "canceled", cancellationReason: "Superseded" });
  expect(await context(parent.id)).toMatchObject({ isBlocked: true, unresolvedBlockerIds: [blocker.id] });
  await update(blocker.id, { status: "done", cancellationReason: null });
  expect(await context(parent.id)).toMatchObject({ isBlocked: false, unresolvedBlockerIds: [], task: { data: { blockerIds: [blocker.id], status: "done" } } });
  await update(blocker.id, { status: "todo" });
  expect(await context(parent.id)).toMatchObject({ isBlocked: true });
  await update(parent.id, { blockerIds: [] });
  expect(await context(parent.id)).toMatchObject({ isBlocked: false });
});
it("requires cancellation reasons and keeps attributed decision history on reason edits and reopening", async () => {
  const t = await task();
  await expect(update(t.id, { status: "canceled" })).rejects.toThrow("reason");
  await update(t.id, { status: "canceled", cancellationReason: "Not needed" });
  await update(t.id, { cancellationReason: "Replaced" });
  await expect(update(t.id, { status: "todo" })).rejects.toThrow("clear");
  await update(t.id, { status: "todo", cancellationReason: null });
  expect(await h.call("tracker.task.get", { id: t.id })).toMatchObject({ data: { status: "todo", cancellationReason: null } });
  const comments = await h.call("tracker.comment.list", { filter: { taskId: t.id }, limit: 100 }) as { data: { body: string; authorId: string; authorType: string } }[];
  expect(comments.map(c => c.data.body)).toEqual(["Canceled: Not needed", "Canceled: Replaced", "Reopened from canceled. Previous reason: Replaced"]);
  expect(comments.every(c => c.data.authorId === h.principal.actorId && c.data.authorType === h.principal.actorType)).toBe(true);
  const canceled = await task({ status: "canceled", cancellationReason: "Created abandoned" });
  expect(await h.call("tracker.comment.list", { filter: { taskId: canceled.id } })).toMatchObject([{ data: { body: "Canceled: Created abandoned" } }]);
});
it("attributes human and agent comments, overwrites spoofing at generated create, and forbids mutation", async () => {
  const t = await task();
  const agent = h.asAgent("worker"); const human = h.asHuman("person");
  expect(await agent.call("tracker.addComment", { taskId: t.id, body: " Evidence " })).toMatchObject({ data: { body: "Evidence", authorId: "worker", authorType: "agent" } });
  expect(await human.call("tracker.addComment", { taskId: t.id, body: "Decision" })).toMatchObject({ data: { authorId: "person", authorType: "human" } });
  const c = await agent.call("tracker.comment.create", { data: { taskId: t.id, body: "Spoof", authorId: "person", authorType: "human" } }) as { id: string };
  expect(await h.call("tracker.comment.get", { id: c.id })).toMatchObject({ data: { authorId: "worker", authorType: "agent" } });
  await expect(h.call("tracker.comment.update", { id: c.id, data: { body: "Erased" } })).rejects.toThrow("append-only");
  await expect(h.call("tracker.comment.delete", { id: c.id })).rejects.toThrow("append-only");
  await expect(h.asHuman("owner", { roles: ["owner"] }).call("tracker.task.delete", { id: t.id })).rejects.toThrow("comments");
});
it("rolls back a canceled task and its history if comment creation fails", async () => {
  await h.close();
  const failure = definePlugin({ id: "failure", version: "1.0.0", hooks: { "tracker.comment.afterCreate": () => { throw new HookVetoError("Injected failure"); } } });
  h = await createTestHarness({ plugins: [...config.plugins, failure] });
  projectId = (await h.call("tracker.project.create", { data: { name: "Rollback" } }) as { id: string }).id;
  const t = await task();
  await expect(update(t.id, { status: "canceled", cancellationReason: "Fail" })).rejects.toThrow("Injected failure");
  expect(await h.call("tracker.task.get", { id: t.id })).toMatchObject({ data: { status: "todo", cancellationReason: null } });
  expect(await h.call("tracker.comment.list", { filter: { taskId: t.id } })).toEqual([]);
});
it("bounds context children and paginates chronological comments without duplicates", async () => {
  const t = await task();
  for (let i = 0; i < 27; i++) {
    await task({ parentTaskId: t.id });
    await h.call("tracker.addComment", { taskId: t.id, body: `Evidence ${i}` });
  }
  expect(await context(t.id)).toMatchObject({ childrenTruncated: true, nextChildrenOffset: 20 });
  const ctx = await context(t.id) as { children: unknown[] }; expect(ctx.children).toHaveLength(20);
  const pages = [];
  for (let offset = 0; offset < 27; offset += 10) pages.push(...await h.call("tracker.comment.list", { filter: { taskId: t.id }, limit: 10, offset }) as { id: string; data: { body: string } }[]);
  expect(new Set(pages.map(c => c.id)).size).toBe(27);
  expect(pages.map(c => c.data.body)).toEqual(Array.from({ length: 27 }, (_, i) => `Evidence ${i}`));
});
it("least-privilege agents can work but cannot invoke generated comment create or deletes", async () => {
  const t = await task();
  const agent = h.asAgent("limited", { scopes: ["tracker:task:get", "tracker:task:update", "tracker:addComment", "tracker:getTaskContext"] });
  await agent.call("tracker.task.update", { id: t.id, data: { status: "in_progress" } });
  await agent.call("tracker.addComment", { taskId: t.id, body: "Working" });
  await expect(agent.call("tracker.task.delete", { id: t.id })).rejects.toThrow("Permission denied");
  await expect(agent.call("tracker.comment.create", { data: { taskId: t.id, body: "Bypass" } })).rejects.toThrow("Permission denied");
  await expect(h.asAgent("no-access", { scopes: [] }).call("tracker.task.get", { id: t.id })).rejects.toThrow("Permission denied");
});
