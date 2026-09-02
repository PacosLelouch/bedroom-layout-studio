import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("renders on invalidation instead of a permanent animation loop", async () => { const source = await readFile("components/bedroom-viewport.tsx", "utf8"); assert.match(source, /frameScheduled/); assert.doesNotMatch(source, /requestAnimationFrame\(animate\)/); });

test("defers WebGL canvas resizing outside ResizeObserver delivery", async () => {
  for (const file of ["components/bedroom-viewport.tsx", "components/asset-review-viewport.tsx"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /const applyResize = \(\) =>/);
    assert.match(source, /requestAnimationFrame\(applyResize\)/);
    assert.match(source, /new ResizeObserver\(\(entries\) => \{[\s\S]*?scheduleResize\(/);
  }
});

test("keeps the review camera stable while furniture configuration changes", async () => {
  const source = await readFile("components/asset-review-viewport.tsx", "utf8");
  assert.match(source, /cameraStateRef/);
  assert.match(source, /savedCamera\?\.assetId === asset\.manifest\.id && savedCamera\.view === view/);
  assert.match(source, /camera\.position\.fromArray\(restoreCamera\.position\)/);
  assert.match(source, /controls\.target\.fromArray\(restoreCamera\.target\)/);
  assert.match(source, /Math\.min\(longest \* 1\.25, restoredDistance\)/);
  assert.match(source, /Math\.max\(longest \* 5, restoredDistance\)/);
});

test("uses a state-independent millimetre grid in furniture review", async () => {
  const source = await readFile("components/asset-review-viewport.tsx", "utf8");
  assert.match(source, /REVIEW_GRID_UNIT_MM = 100/);
  assert.match(source, /REVIEW_GRID_MAJOR_UNIT_MM = 1000/);
  assert.match(source, /asset\.manifest\.defaultConfiguration\?\.dimensions/);
  assert.match(source, /asset\.manifest\.validationConfigurations\.map/);
  assert.doesNotMatch(source, /floorSize = Math\.max\([^\n]*longest/);
});
