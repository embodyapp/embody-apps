import { expect, it } from "vitest";
import { createTestHarness } from "@embody/testing";
import config from "../embody.config.js";

// The specification selects the production kernel boundary as the test seam.
it("persists project and task defaults through generated operations", async () => {
  const h = await createTestHarness({ plugins: config.plugins });
  try {
    const project = await h.call("tracker.project.create", { data: { name: " Work " } }) as { id: string };
    const task = await h.call("tracker.task.create", { data: { projectId: project.id, title: " Build ", definitionOfDone: " Tests pass " } }) as { id: string };
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await h.call("tracker.task.get", { id: task.id })).toMatchObject({ data: {
      projectId: project.id, title: "Build", definitionOfDone: "Tests pass", status: "todo",
      blockerIds: [], parentTaskId: null, description: "", cancellationReason: null,
    } });
  } finally { await h.close(); }
});
