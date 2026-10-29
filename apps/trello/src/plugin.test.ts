import { expect, it } from "vitest";
import { createTestHarness } from "@embody/testing";
import config from "../embody.config.js";

it("runs the starter action", async () => {
  const harness = await createTestHarness({ plugins: config.plugins });
  try { expect(await harness.call("app.ping", {})).toEqual({ ok: true }); } finally { await harness.close(); }
});
