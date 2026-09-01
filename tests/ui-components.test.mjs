import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

function ensureFileReader() {
  globalThis.FileReader ??= class {
    result = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }, (error) => this.onerror?.(error)); }
    readAsDataURL(blob) { blob.arrayBuffer().then((result) => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`; this.onloadend?.(); }, (error) => this.onerror?.(error)); }
  };
}

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("keeps candidate img2threejs assets out of the furniture catalog", async () => {
  const registry = await vite.ssrLoadModule("/lib/bedroom/assets/registry/index.ts");
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");

  const crownChest = registry.findFurniturePackage("crown-chest");
  assert.equal(crownChest.effectiveStatus, "draft");
  assert.equal(catalog.ASSET_CATALOG.some((asset) => asset.id === "crown-chest"), false);
});

test("adapts a real img2threejs factory to Y-up ground-centered review space", async () => {
  const THREE = await import("three");
  const registry = await vite.ssrLoadModule("/lib/bedroom/assets/registry/index.ts");
  const loaders = await vite.ssrLoadModule("/lib/bedroom/assets/registry/model-loaders.generated.ts");
  const adapter = await vite.ssrLoadModule("/lib/bedroom/assets/model-adapter.ts");
  const disposal = await vite.ssrLoadModule("/lib/bedroom/three-disposal.ts");
  const crownChest = registry.findFurniturePackage("crown-chest");

  const { createSourceModel } = await loaders.FURNITURE_SOURCE_MODEL_LOADERS["crown-chest"]();
  const preview = adapter.createAdaptedGeneratedModel(createSourceModel, null);
  const bounds = new THREE.Box3().setFromObject(preview.group);
  const center = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(bounds.min.y) < 0.001);
  assert.ok(Math.abs(center.x) < 0.001);
  assert.ok(Math.abs(center.z) < 0.001);
  assert.equal(preview.report.aspectCompatible, true);
  disposal.disposeObjectTree(preview.group);
});

test("rejects dimensions whose proportions differ by more than five percent", async () => {
  const registry = await vite.ssrLoadModule("/lib/bedroom/assets/registry/index.ts");
  const loaders = await vite.ssrLoadModule("/lib/bedroom/assets/registry/model-loaders.generated.ts");
  const adapter = await vite.ssrLoadModule("/lib/bedroom/assets/model-adapter.ts");
  const crownChest = registry.findFurniturePackage("crown-chest");
  const { createSourceModel } = await loaders.FURNITURE_SOURCE_MODEL_LOADERS["crown-chest"]();

  assert.throws(
    () => adapter.createAdaptedGeneratedModel(
      createSourceModel,
      { width: 1000, depth: 1000, height: 1000 },
      { strict: true },
    ),
    /超过 5%/,
  );
});

test("wraps a real img2threejs action as ordered furniture states", async () => {
  const THREE = await import("three");
  const registry = await vite.ssrLoadModule("/lib/bedroom/assets/registry/index.ts");
  const loaders = await vite.ssrLoadModule("/lib/bedroom/assets/runtime-cache.ts");
  const disposal = await vite.ssrLoadModule("/lib/bedroom/three-disposal.ts");
  const crownChest = registry.findFurniturePackage("crown-chest");
  const configuration = { dimensions: { width: 1000, depth: 820, height: 920 }, parameters: {}, stateId: "closed" };
  const factory = await loaders.loadFurnitureRuntime("crown-chest");
  const closed = factory(configuration, { purpose: "review" });
  const open = factory({ ...configuration, stateId: "open" }, { purpose: "review" });
  const closedHinge = closed.getObjectByName("lid-hinge");
  const openHinge = open.getObjectByName("lid-hinge");
  const closedLid = closed.getObjectByName("lid");
  const openLid = open.getObjectByName("lid");
  const openLidBrackets = open.getObjectByName("lid-corner-brackets");
  const openBox = new THREE.Box3().setFromObject(open);
  const closedLidPosition = closedLid.getWorldPosition(new THREE.Vector3());
  const openLidPosition = openLid.getWorldPosition(new THREE.Vector3());

  assert.ok(Math.abs(closedHinge.rotation.x) < 1e-9);
  assert.ok(openHinge.rotation.x < -1);
  assert.equal(openLidBrackets.parent, openHinge);
  assert.ok(openLidPosition.distanceTo(closedLidPosition) > 100);
  assert.ok(Math.abs(openBox.min.y) < 0.001);
  disposal.disposeObjectTree(closed);
  disposal.disposeObjectTree(open);
});

test("keeps the user layouts valid except for the documented 37 mm small-room overlap", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");
  const { collides } = await vite.ssrLoadModule("/lib/bedroom/geometry.ts");

  for (const room of INITIAL_ROOMS) {
    const actual = room.items.filter((item) => collides(item, room)).map((item) => item.id);
    const expected = room.id === "small-secondary" ? ["small-bed", "small-wardrobe"] : [];
    assert.deepEqual(
      actual,
      expected,
      `${room.name} has an unexpected hard-collision result`,
    );
  }
});

test("uses a normal 1200 mm bed in the small bedroom", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");
  const { collides } = await vite.ssrLoadModule("/lib/bedroom/geometry.ts");
  const room = INITIAL_ROOMS.find((entry) => entry.id === "small-secondary");
  const bed = room.items.find((item) => item.id === "small-bed");

  assert.equal(bed.assetId, "single-bed");
  assert.equal(bed.size.width, 1200);
  assert.equal(bed.size.depth, 1900);
  assert.equal(bed.stateId, null);
  assert.deepEqual(bed.parameterValues, {});
  assert.equal(room.items.some((item) => item.assetId === "bay-cabinet"), false);
  assert.deepEqual(room.items.filter((item) => collides(item, room)).map((item) => item.id), ["small-bed", "small-wardrobe"]);
});

test("detects rotated furniture crossing a wall that the old axis check missed", async () => {
  const { collides } = await vite.ssrLoadModule("/lib/bedroom/geometry.ts");
  const room = {
    id: "wall-check",
    name: "墙体检测",
    dimensions: { width: 1000, depth: 1000, height: 2800 },
    clearArea: 1,
    outline: [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 1000 }],
    keepOutZones: [],
    doors: [],
    items: [],
  };
  const item = {
    id: "rotated",
    assetId: "desk",
    name: "旋转家具",
    position: { x: 900, z: 500 },
    rotation: 45,
    size: { width: 100, depth: 500, height: 750 },
    color: "#999999",
  };
  room.items.push(item);

  assert.equal(collides(item, room), true);
});

test("builds detailed chairs, adjustable desks, and an interactive entry cabinet", async () => {
  const THREE = await import("three");
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");
  const runtime = await vite.ssrLoadModule("/lib/bedroom/assets/runtime-cache.ts");
  const room = { dimensions: { width: 3000, depth: 4000, height: 2800 } };
  const chair = await runtime.createFurnitureModel({ ...catalog.catalogItemToFurniture("desk-chair", room), id: "chair" });
  const desk = catalog.catalogItemToFurniture("desk", room);
  const cabinet = catalog.catalogItemToFurniture("entry-cabinet", room);
  const closedCabinet = await runtime.createFurnitureModel({ ...cabinet, id: "cabinet-closed" });
  const openCabinet = await runtime.createFurnitureModel({ ...cabinet, id: "cabinet-open", stateId: "open" });
  const closedDepth = new THREE.Box3().setFromObject(closedCabinet).getSize(new THREE.Vector3()).z;
  const openDepth = new THREE.Box3().setFromObject(openCabinet).getSize(new THREE.Vector3()).z;

  assert.ok(chair.children.length >= 10);
  assert.equal(desk.stateId, "closed");
  assert.equal(desk.parameterValues.loweredHeight, 750);
  assert.equal(desk.parameterValues.raisedHeight, 1100);
  assert.equal(cabinet.stateId, "closed");
  assert.equal(cabinet.clearanceDepth, 400);
  assert.ok(openDepth > closedDepth);
});

test("cycles declared furniture states without asset-specific page logic", async () => {
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");
  const room = { dimensions: { width: 3000, depth: 4000, height: 2800 } };
  const cabinet = catalog.catalogItemToFurniture("wardrobe", room);

  assert.equal(catalog.nextFurnitureState(cabinet), "open");
  assert.equal(catalog.nextFurnitureState({ ...cabinet, stateId: "open" }), "closed");
  assert.equal(catalog.nextFurnitureState(catalog.catalogItemToFurniture("double-bed", room)), null);
});

test("migrates version 1 layouts to parameter values and state IDs", async () => {
  const { parseLayoutSnapshot } = await vite.ssrLoadModule("/lib/bedroom/layout-schema.ts");
  const snapshot = parseLayoutSnapshot({
    schemaVersion: 1,
    id: "legacy",
    name: "旧方案",
    savedAt: "2026-01-01T00:00:00.000Z",
    rooms: [{
      id: "room", name: "房间", dimensions: { width: 3000, depth: 3000, height: 2800 }, clearArea: 9,
      outline: [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }], keepOutZones: [], doors: [],
      items: [{ id: "desk", assetId: "desk", name: "桌", position: { x: 1000, z: 1000 }, rotation: 0, size: { width: 1200, depth: 600, height: 750 }, color: "#aaaaaa", interactionState: "open", loweredHeight: 750, raisedHeight: 1100 }],
    }],
  });

  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.rooms[0].items[0].stateId, "open");
  assert.deepEqual(snapshot.rooms[0].items[0].parameterValues, { loweredHeight: 750, raisedHeight: 1100 });
  assert.equal("interactionState" in snapshot.rooms[0].items[0], false);
});

test("exports a built-in furniture configuration as a non-empty GLB", async () => {
  ensureFileReader();
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");
  const exporter = await vite.ssrLoadModule("/lib/bedroom/glb-export.ts");
  const item = catalog.catalogItemToFurniture("wardrobe", { dimensions: { width: 3000, depth: 4000, height: 2800 } });
  item.stateId = "open";
  const result = await exporter.createFurnitureGlb(item);

  assert.ok(result.data.byteLength > 1000);
  assert.match(result.fileName, /open\.glb$/);
});

test("reloads a generated review GLB with portable vertex-color enamel", async () => {
  ensureFileReader();
  const registry = await vite.ssrLoadModule("/lib/bedroom/assets/registry/index.ts");
  const loaders = await vite.ssrLoadModule("/lib/bedroom/assets/runtime-cache.ts");
  const review = await vite.ssrLoadModule("/lib/bedroom/glb-review.ts");
  const crownChest = registry.findFurniturePackage("crown-chest");
  const factory = await loaders.loadFurnitureRuntime("crown-chest");
  const result = await review.reviewRuntimeFactoryGlb(factory, {
    dimensions: { width: 900, depth: 520, height: 780 },
    parameters: {},
    stateId: "open",
  });

  assert.ok(result.byteLength > 1000);
  assert.equal(result.dimensionsMatch, true);
  assert.equal(result.grounded, true);
  assert.ok(result.namedNodeCount > 0);
  assert.equal(result.materialsPortable, true);
});

test("exposes every built-in through manifest v3 and reloads every validation configuration as GLB", async () => {
  ensureFileReader();
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");
  const reviewRegistry = await vite.ssrLoadModule("/lib/bedroom/furniture-review-registry.ts");
  const review = await vite.ssrLoadModule("/lib/bedroom/glb-review.ts");
  const loaders = await vite.ssrLoadModule("/lib/bedroom/assets/runtime-cache.ts");
  const packageRegistry = await vite.ssrLoadModule("/lib/bedroom/assets/registry/index.ts");
  const builtins = reviewRegistry.FURNITURE_REVIEW_ASSETS.filter((asset) => asset.manifest.assetScope === "builtin");

  assert.equal(builtins.length, packageRegistry.BUILTIN_ASSETS.length);
  for (const asset of builtins) {
    assert.equal(asset.manifest.schemaVersion, 3);
    assert.equal(asset.manifest.assetScope, "builtin");
    assert.equal(asset.manifest.lifecyclePolicy, "repository-trusted");
    assert.equal(asset.effectiveStatus, "approved");
    assert.equal(asset.repositoryWritable, false);
    assert.ok(asset.manifest.dimensionSource?.note);
    assert.ok(asset.manifest.qualityEvidence.length);
    for (const configuration of asset.manifest.validationConfigurations) {
      const factory = await loaders.loadFurnitureRuntime(asset.manifest.id);
      const result = await review.reviewRuntimeFactoryGlb(factory, configuration);
      assert.equal(result.dimensionsMatch, true, `${asset.manifest.id}/${configuration.id} dimensions`);
      assert.equal(result.grounded, true, `${asset.manifest.id}/${configuration.id} grounding`);
      assert.equal(result.materialsPortable, true, `${asset.manifest.id}/${configuration.id} materials`);
      assert.ok(result.namedNodeCount > 0, `${asset.manifest.id}/${configuration.id} named nodes`);
    }
  }
});

test("keeps furniture state and parameter schemas read-only in the review UI", async () => {
  const source = await readFile(path.join(root, "app", "asset-review", "page.tsx"), "utf8");

  assert.match(source, /定义只读，点击切换预览/);
  assert.match(source, /特殊参数 <small>仅调整当前值/);
  assert.match(source, /ParameterValueControl/);
  assert.doesNotMatch(source, /setStates|setParameterDefinitions|ParameterDefinitionEditor|<Plus|<Trash2/);
});

test("stores an exact local furniture preset and detects stale revisions", async () => {
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");
  const storage = await vite.ssrLoadModule("/lib/bedroom/furniture-presets.ts");
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    const item = catalog.catalogItemToFurniture("desk", { dimensions: { width: 3000, depth: 4000, height: 2800 } });
    item.stateId = "open";
    item.parameterValues.raisedHeight = 1180;
    const presets = storage.saveFurniturePreset(item, "站立办公");

    assert.equal(presets.length, 1);
    assert.equal(presets[0].configuration.stateId, "open");
    assert.equal(presets[0].configuration.parameters.raisedHeight, 1180);
    assert.equal(storage.presetIsStale(presets[0]), false);
    assert.equal(storage.presetIsStale({ ...presets[0], assetRevision: "old" }), true);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("exposes collision and wall-outline editing controls", async () => {
  const page = await vite.ssrLoadModule("/app/page.tsx");
  const html = renderToStaticMarkup(React.createElement(page.default));

  assert.match(html, /碰撞开启/);
  assert.match(html, /轮廓/);
  assert.match(html, /移动\/旋转碰撞约束/);
});

test("rejects self-intersecting room outlines", async () => {
  const { isSimplePolygon } = await vite.ssrLoadModule("/lib/bedroom/geometry.ts");

  assert.equal(isSimplePolygon([{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 1000 }]), true);
  assert.equal(isSimplePolygon([{ x: 0, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 1000 }, { x: 1000, z: 0 }]), false);
});

test("keeps a continuous primary entry path in every default bedroom", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");
  const { itemRect, rectsOverlap } = await vite.ssrLoadModule("/lib/bedroom/geometry.ts");
  const routes = {
    master: { x: 650, z: 1800, width: 551, depth: 1255 },
    "large-secondary": { x: 0, z: 900, width: 700, depth: 500 },
    "small-secondary": { x: 1200, z: 1210, width: 616, depth: 403 },
  };

  for (const room of INITIAL_ROOMS) {
    const blockers = room.items
      .filter((item) => item.supportSurface !== "bay-window" && rectsOverlap(itemRect(item), routes[room.id]))
      .map((item) => item.id);
    assert.deepEqual(blockers, [], `${room.name} blocks its primary entry path`);
  }
});

test("uses the bay sill as support instead of floating cabinets", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");
  const room = INITIAL_ROOMS.find((entry) => entry.id === "large-secondary");
  const cabinet = room.items.find((item) => item.assetId === "bay-cabinet");

  assert.equal(cabinet.supportSurface, "bay-window");
  assert.equal(cabinet.baseHeight, room.bayWindow.sillHeight);
  assert.equal(cabinet.wallMounted, undefined);
});

test("does not offer an unsupported floating cabinet and anchors new bay cabinets", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");
  const room = INITIAL_ROOMS.find((entry) => entry.id === "small-secondary");
  const cabinet = catalog.catalogItemToFurniture("bay-cabinet", room);

  assert.equal(catalog.ASSET_CATALOG.some((asset) => asset.id === "wall-cabinet"), false);
  assert.equal(cabinet.supportSurface, "bay-window");
  assert.equal(cabinet.baseHeight, room.bayWindow.sillHeight);
  assert.equal(cabinet.rotation, 90);
  assert.equal(cabinet.position.x, room.dimensions.width + cabinet.size.depth / 2);
});
