import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("keeps transform-only fields outside furniture runtime keys", async () => { const source = await readFile("lib/bedroom/scene/room-scene-reconciler.ts", "utf8"); const keyBody = source.slice(source.indexOf("furnitureRuntimeKey"), source.indexOf("furnitureTransformChanged")); assert.doesNotMatch(keyBody, /position|rotation|selectedId|collision/); assert.match(keyBody, /assetRevision|parameterValues|stateId/); });
