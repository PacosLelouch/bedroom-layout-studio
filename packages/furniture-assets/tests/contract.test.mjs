import assert from "node:assert/strict";
import test from "node:test";
import { validateFurnitureAssetManifest } from "../src/contract-core.mjs";

test("keeps manifest v3 as the only accepted furniture contract", () => {
  const issues = validateFurnitureAssetManifest({ schemaVersion: 2 });
  assert.ok(issues.some((issue) => issue.includes("schemaVersion 3")));
});
