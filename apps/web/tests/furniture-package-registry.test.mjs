import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("generates fixed manifest, runtime, and optional source-model registries for both scopes", async () => {
  const catalog = await readFile("lib/bedroom/assets/registry/catalog.generated.ts", "utf8");
  const runtime = await readFile("lib/bedroom/assets/registry/runtime-loaders.generated.ts", "utf8");
  const models = await readFile("lib/bedroom/assets/registry/model-loaders.generated.ts", "utf8");
  assert.match(catalog, /user-generated\/crown-chest\/asset\.json/);
  assert.match(runtime, /user-generated\/crown-chest\/runtime/);
  assert.doesNotMatch(runtime, /createSourceModel/);
  assert.match(models, /user-generated\/crown-chest\/model/);
});
