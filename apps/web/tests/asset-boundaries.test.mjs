import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps the furniture catalog and compatibility facade free of Three.js runtimes", async () => {
  for (const file of ["lib/bedroom/asset-registry.ts", "lib/bedroom/assets/catalog.ts", "lib/bedroom/assets/contracts.ts"]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /from ["']three/);
    assert.doesNotMatch(source, /GLTFExporter|createFurnitureModel\(/);
  }
});
