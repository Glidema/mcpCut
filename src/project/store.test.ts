import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createProject, loadProject, saveProject } from "./store.js";

describe("store", () => {
  let tmp = "";
  let prev: string | undefined;

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "mcpcut-"));
    prev = process.env.MCPCUT_ROOT;
    process.env.MCPCUT_ROOT = tmp;
  });

  after(async () => {
    if (prev === undefined) delete process.env.MCPCUT_ROOT;
    else process.env.MCPCUT_ROOT = prev;
    await rm(tmp, { recursive: true, force: true });
  });

  it("creates, loads, and bumps revision", async () => {
    const created = await createProject("Test Cut", "16:9");
    assert.equal(created.spec.width, 1920);
    assert.equal(created.revision, 1);
    const loaded = await loadProject(created.id);
    assert.equal(loaded.name, "Test Cut");
    const saved = await saveProject(loaded);
    assert.equal(saved.revision, 2);
  });
});
