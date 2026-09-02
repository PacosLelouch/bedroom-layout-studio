import assert from "node:assert/strict";
import test from "node:test";
import { createAgentRunRequestSchema, furniturePackageIndexSchema, parseLayoutSnapshot } from "../src/index.js";

test("requires idempotency for Agent creation", () => {
  assert.throws(() => createAgentRunRequestSchema.parse({ intent: "general-message", message: "hello" }));
});

test("validates a closed furniture package index", () => {
  const hash = "a".repeat(64);
  const revisionId = "00000000-0000-4000-8000-000000000001";
  const prefix = `tenants/t/assets/a/revisions/${revisionId}`;
  const value = furniturePackageIndexSchema.parse({ schemaVersion: 1, assetKey: "nightstand", revisionId, contractHash: "a".repeat(64), artifactSetHash: "b".repeat(64), runtimeAbiVersion: 1, entrypoints: { manifest: "contract/asset.json", runtime: "runtime/runtime.mjs" }, objects: [
    { logicalPath: "contract/asset.json", objectKey: `${prefix}/contract/asset.json`, sha256: hash, sizeBytes: 10, mediaType: "application/json" },
    { logicalPath: "runtime/runtime.mjs", objectKey: `${prefix}/runtime/runtime.mjs`, sha256: hash, sizeBytes: 20, mediaType: "text/javascript" },
  ] });
  assert.equal(value.objects.length, 2);
});

test("migrates a valid version-one layout snapshot", () => {
  const value = parseLayoutSnapshot({ schemaVersion: 1, id: "layout", name: "Layout", savedAt: "2026-09-01T00:00:00.000Z", rooms: [{ id: "room", name: "Room", dimensions: { width: 1, depth: 1, height: 1 }, clearArea: 1, outline: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }], keepOutZones: [], doors: [], items: [] }] });
  assert.equal(value.schemaVersion, 2);
});
