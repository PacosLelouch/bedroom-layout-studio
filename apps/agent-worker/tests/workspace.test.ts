import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WorkspaceManager } from "../src/workspace.js";

test("creates the bounded runner workspace shape", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bedroom-worker-"));
  try {
    const manager = new WorkspaceManager(root);
    const workspace = await manager.create("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000004");
    await Promise.all([workspace.input, workspace.output, workspace.temp, workspace.logs].map(access));
    assert.ok(workspace.root.startsWith(root));
    await manager.remove(workspace);
    await assert.rejects(() => access(workspace.root));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("refuses broad workspace deletion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bedroom-worker-"));
  try {
    const manager = new WorkspaceManager(root);
    await assert.rejects(() => manager.remove({ root, repo: root, input: root, output: root, temp: root, logs: root }), /Refusing/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
