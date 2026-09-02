import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const ids = ["double-bed", "queen-bed", "single-bed", "sofa-bed", "wardrobe", "sliding-wardrobe", "desk", "vanity", "bay-cabinet", "entry-cabinet", "nightstand", "desk-chair", "stool", "lounge-chair"];

test("gives every built-in the same asset.json and runtime.ts package", async () => {
  const loaders = await readFile("lib/bedroom/assets/registry/runtime-loaders.generated.ts", "utf8");
  for (const id of ids) {
    await stat(`lib/bedroom/assets/builtin/${id}/asset.json`);
    await stat(`lib/bedroom/assets/builtin/${id}/runtime.ts`);
    assert.match(loaders, new RegExp(`"${id}".*builtin/${id}/runtime`, "s"));
  }
});
