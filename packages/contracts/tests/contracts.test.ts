import assert from "node:assert/strict";
import test from "node:test";
import { createAgentRunRequestSchema, parseLayoutSnapshot } from "../src/index.js";

test("requires idempotency for Agent creation", () => {
  assert.throws(() => createAgentRunRequestSchema.parse({ intent: "general-message", message: "hello" }));
});

test("migrates a valid version-one layout snapshot", () => {
  const value = parseLayoutSnapshot({ schemaVersion: 1, id: "layout", name: "Layout", savedAt: "2026-09-01T00:00:00.000Z", rooms: [{ id: "room", name: "Room", dimensions: { width: 1, depth: 1, height: 1 }, clearArea: 1, outline: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }], keepOutZones: [], doors: [], items: [] }] });
  assert.equal(value.schemaVersion, 2);
});
