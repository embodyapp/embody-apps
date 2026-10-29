import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "@embody/testing";
import config from "../embody.config.js";
let h: TestHarness;
let projectId: string;
const create = async (data: Record<string, unknown> = {}) => await h.call("tracker.task.create", { data: { projectId, title: "Work", definitionOfDone: "Verified", ...data } }) as { id: string };
const update = (id: string, data: Record<string, unknown>) => h.call("tracker.task.update", { id, data });
beforeEach(async () => {
  h = await createTestHarness({ plugins: config.plugins });
  projectId = (await h.call("tracker.project.create", { data: { name: "Project" } }) as { id: string }).id;
});
afterEach(async () => { await h.close(); });

it("rejects invalid references, duplicate blockers, and project moves without changing records", async () => {
  const a = await create();
  const other = (await h.call("tracker.project.create", { data: { name: "Other" } }) as { id: string }).id;
  const foreign = await create({ projectId: other });
  for (const data of [{ parentTaskId: foreign.id }, { blockerIds: [foreign.id] }, { blockerIds: [a.id, a.id] }, { parentTaskId: a.id }, { blockerIds: [a.id] }, { projectId: other }]) {
    await expect(update(a.id, data)).rejects.toThrow();
  }
  await expect(create({ blockerIds: [foreign.id] })).rejects.toThrow("same project");
  await expect(create({ parentTaskId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow();
  const alien = h.as({ ...h.principal, orgId: "other-org" });
  await expect(alien.call("tracker.task.create", { data: { projectId, title: "Hidden", definitionOfDone: "Hidden" } })).rejects.toThrow();
  expect(await h.call("tracker.task.get", { id: a.id })).toMatchObject({ data: { projectId, parentTaskId: null, blockerIds: [] } });
});
it("rejects indirect dependency and hierarchy cycles", async () => {
  const a = await create(); const b = await create({ blockerIds: [a.id], parentTaskId: a.id });
  const c = await create({ blockerIds: [b.id], parentTaskId: b.id });
  await expect(update(a.id, { blockerIds: [c.id] })).rejects.toThrow("cycle");
  await expect(update(a.id, { parentTaskId: c.id })).rejects.toThrow("cycle");
});
it("checks graph edges beyond the first hundred records", async () => {
  const first = await create(); let last = first;
  for (let i = 0; i < 105; i++) last = await create({ blockerIds: [last.id], parentTaskId: last.id });
  await expect(update(first.id, { blockerIds: [last.id] })).rejects.toThrow("cycle");
  await expect(update(first.id, { parentTaskId: last.id })).rejects.toThrow("cycle");
});
it("prevents dangling records and requires an explicit owner role for deletion", async () => {
  const parent = await create(); const child = await create({ parentTaskId: parent.id });
  const owner = h.asHuman("owner", { roles: ["owner"] });
  await expect(owner.call("tracker.task.delete", { id: parent.id })).rejects.toThrow("references");
  await expect(owner.call("tracker.project.delete", { id: projectId })).rejects.toThrow("tasks");
  await expect(h.asAgent("worker").call("tracker.task.delete", { id: child.id })).rejects.toThrow("owner");
  await owner.call("tracker.task.delete", { id: child.id });
  const dependent = await create({ blockerIds: [parent.id] });
  await expect(owner.call("tracker.task.delete", { id: parent.id })).rejects.toThrow("references");
  await owner.call("tracker.task.delete", { id: dependent.id });
  await owner.call("tracker.task.delete", { id: parent.id });
  await owner.call("tracker.project.delete", { id: projectId });
});
it("conflicting concurrent dependency and hierarchy edits cannot commit cycles", async () => {
  for (const kind of ["blockerIds", "parentTaskId"] as const) {
    const a = await create(); const b = await create();
    const patch = (id: string) => kind === "blockerIds" ? { blockerIds: [id] } : { parentTaskId: id };
    const results = await Promise.allSettled([update(a.id, patch(b.id)), update(b.id, patch(a.id))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.message).toBe("Nested SQLite transactions are not supported");
    const records = await h.call("tracker.task.list", { filter: { projectId } }) as { id: string; data: { blockerIds: string[]; parentTaskId: string | null } }[];
    const pair = records.filter(r => r.id === a.id || r.id === b.id);
    expect(pair.filter(r => kind === "blockerIds" ? r.data.blockerIds.length > 0 : r.data.parentTaskId !== null)).toHaveLength(1);
  }
});
