import assert from "node:assert/strict";
import test from "node:test";
import { databaseSchema } from "../src/index.js";

test("exports raw/effective asset status and durable Agent event tables", () => {
  assert.equal(databaseSchema.assetRevisions.rawStatus.name, "raw_status");
  assert.equal(databaseSchema.assetRevisions.effectiveStatus.name, "effective_status");
  assert.equal(databaseSchema.agentEvents.sequence.name, "sequence");
  assert.equal(databaseSchema.idempotencyKeys.key.name, "key");
});
