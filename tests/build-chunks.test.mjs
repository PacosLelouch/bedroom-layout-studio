import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("keeps editor and exporter as separate main-page dynamic entries", async () => { const manifest = JSON.parse(await readFile("dist/client/.vite/manifest.json", "utf8")); const main = manifest["app/page.tsx"]; assert.ok(main.dynamicImports.includes("components/bedroom-viewport.tsx")); assert.ok(main.dynamicImports.includes("lib/bedroom/export/glb-export.ts")); assert.ok(!main.imports.some((entry) => entry.includes("three") || entry.includes("GLTF"))); });
