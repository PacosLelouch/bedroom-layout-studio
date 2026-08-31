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
  const registry = await vite.ssrLoadModule("/lib/bedroom/generated/registry.ts");
  const catalog = await vite.ssrLoadModule("/lib/bedroom/asset-registry.ts");

  const crownChest = registry.findGeneratedAsset("crown-chest");
  assert.equal(crownChest.effectiveStatus, "candidate");
  assert.equal(catalog.ASSET_CATALOG.some((asset) => asset.id === "crown-chest"), false);
});

test("adapts a real img2threejs factory to Y-up ground-centered review space", async () => {
  const THREE = await import("three");
  const registry = await vite.ssrLoadModule("/lib/bedroom/generated/registry.ts");
  const adapter = await vite.ssrLoadModule("/lib/bedroom/generated/model-adapter.ts");
  const disposal = await vite.ssrLoadModule("/lib/bedroom/three-disposal.ts");
  const crownChest = registry.findGeneratedAsset("crown-chest");

  const preview = adapter.createAdaptedGeneratedModel(crownChest.factory, null);
  const bounds = new THREE.Box3().setFromObject(preview.group);
  const center = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(bounds.min.y) < 0.001);
  assert.ok(Math.abs(center.x) < 0.001);
  assert.ok(Math.abs(center.z) < 0.001);
  assert.equal(preview.report.aspectCompatible, true);
  disposal.disposeObjectTree(preview.group);
});

test("rejects dimensions whose proportions differ by more than five percent", async () => {
  const registry = await vite.ssrLoadModule("/lib/bedroom/generated/registry.ts");
  const adapter = await vite.ssrLoadModule("/lib/bedroom/generated/model-adapter.ts");
  const crownChest = registry.findGeneratedAsset("crown-chest");

  assert.throws(
    () => adapter.createAdaptedGeneratedModel(
      crownChest.factory,
      { width: 1000, depth: 1000, height: 1000 },
      { strict: true },
    ),
    /超过 5%/,
  );
});

test("keeps all default bedroom layouts free of hard collisions", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");
  const { collides } = await vite.ssrLoadModule("/lib/bedroom/geometry.ts");

  for (const room of INITIAL_ROOMS) {
    assert.deepEqual(
      room.items.filter((item) => collides(item, room)).map((item) => item.id),
      [],
      `${room.name} contains a hard collision`,
    );
  }
});

test("keeps the small bedroom valid when the folding sofa bed is opened", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");
  const { collides } = await vite.ssrLoadModule("/lib/bedroom/geometry.ts");
  const source = INITIAL_ROOMS.find((room) => room.id === "small-secondary");
  const room = structuredClone(source);
  const bed = room.items.find((item) => item.id === "small-sofa-bed");

  bed.interactionState = "open";
  bed.position.x = bed.expandedPositionX;
  bed.position.z = bed.expandedPositionZ;
  bed.size.width = bed.expandedWidth;
  bed.size.depth = bed.expandedDepth;

  assert.equal(bed.size.width, 1200);
  assert.equal(bed.size.depth, 2000);
  assert.deepEqual(room.items.filter((item) => collides(item, room)).map((item) => item.id), []);
});

test("uses the bay sill as support instead of floating cabinets", async () => {
  const { INITIAL_ROOMS } = await vite.ssrLoadModule("/lib/bedroom/room-layouts.ts");

  for (const roomId of ["small-secondary", "large-secondary"]) {
    const room = INITIAL_ROOMS.find((entry) => entry.id === roomId);
    const cabinet = room.items.find((item) => item.assetId === "bay-cabinet");
    assert.equal(cabinet.supportSurface, "bay-window");
    assert.equal(cabinet.baseHeight, room.bayWindow.sillHeight);
    assert.equal(cabinet.wallMounted, undefined);
  }
});
