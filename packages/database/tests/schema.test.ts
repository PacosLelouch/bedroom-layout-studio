import assert from "node:assert/strict";
import test from "node:test";
import { databaseSchema } from "../src/index.js";

test("exports raw/effective asset status and durable Agent event tables", () => {
  assert.equal(databaseSchema.assetRevisions.rawStatus.name, "raw_status");
  assert.equal(databaseSchema.assetRevisions.effectiveStatus.name, "effective_status");
  assert.equal(databaseSchema.assetRevisions.packageIndexKey.name, "package_index_key");
  assert.equal(databaseSchema.assets.publishedRevisionId.name, "published_revision_id");
  assert.equal(databaseSchema.assetArtifacts.logicalPath.name, "logical_path");
  assert.equal(databaseSchema.agentEvents.sequence.name, "sequence");
  assert.equal(databaseSchema.idempotencyKeys.key.name, "key");
});
