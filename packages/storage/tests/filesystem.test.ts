import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FilesystemObjectStorage, assertObjectKey } from "../src/index.js";

test("stores immutable objects with verified metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bedroom-storage-"));
  try {
    const storage = new FilesystemObjectStorage(root);
    const contents = new TextEncoder().encode("layout");
    const created = await storage.putImmutable("tenants/t/layouts/l/v.json", contents, "application/json");
    assert.equal((await storage.head(created.key))?.sha256, created.sha256);
    assert.equal(new TextDecoder().decode(await storage.get(created.key)), "layout");
    await assert.rejects(() => storage.putImmutable(created.key, new TextEncoder().encode("other"), "application/json"), /Immutable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects traversal and empty key segments", () => {
  assert.throws(() => assertObjectKey("../secret"));
  assert.throws(() => assertObjectKey("tenant//object"));
});
