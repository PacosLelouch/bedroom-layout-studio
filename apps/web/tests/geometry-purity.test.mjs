import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("uses pure descriptor footprints for collision geometry", async () => { const source = await readFile("lib/bedroom/geometry.ts", "utf8"); assert.doesNotMatch(source, /three|measureFurnitureFootprint|createFurnitureModel/); assert.match(source, /resolveFurnitureFootprint/); });
