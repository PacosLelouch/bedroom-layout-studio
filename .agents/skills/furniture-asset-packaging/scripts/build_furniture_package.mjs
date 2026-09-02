import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { build } from "esbuild";
import { computeFurnitureAssetContractHash, readFurniturePackageContractSources } from "../../../../apps/web/scripts/furniture-asset-contract.mjs";
import { computeFurnitureArtifactSetHash } from "../../../../packages/furniture-assets/src/package-core.mjs";

const projectRoot = process.cwd();
const assetKey = process.argv[2];
const option = (name, fallback) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; };
const scope = option("--scope", "user-generated");
if (!assetKey || !["builtin", "user-generated"].includes(scope)) throw new Error("Usage: node build_furniture_package.mjs <asset-key> [--scope builtin|user-generated] [--out dir] [--tenant-id uuid] [--asset-id uuid] [--revision-id uuid]");
const assetDir = path.resolve(projectRoot, "apps/web/lib/bedroom/assets", scope, assetKey);
const manifest = JSON.parse(await readFile(path.join(assetDir, "asset.json"), "utf8"));
const { modelSource, runtimeSource } = await readFurniturePackageContractSources(assetDir);
const contractHash = computeFurnitureAssetContractHash(modelSource, runtimeSource, manifest);
const stableUuid = (seed) => { const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128; const hex = bytes.toString("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; };
const tenantId = option("--tenant-id", stableUuid("local-tenant"));
const assetId = option("--asset-id", stableUuid(`asset:${assetKey}`));
const revisionId = option("--revision-id", stableUuid(`revision:${assetKey}:${contractHash}`));
const outputRoot = path.resolve(projectRoot, option("--out", path.join("artifacts", "furniture-packages", assetKey, revisionId)));
const packagePrefix = `tenants/${tenantId}/assets/${assetId}/revisions/${revisionId}`;

await mkdir(path.join(outputRoot, "contract"), { recursive: true });
await mkdir(path.join(outputRoot, "source"), { recursive: true });
await mkdir(path.join(outputRoot, "runtime", "resources"), { recursive: true });
await cp(path.join(assetDir, "asset.json"), path.join(outputRoot, "contract", "asset.json"));
await cp(path.join(assetDir, "runtime.ts"), path.join(outputRoot, "source", "runtime.ts"));
try { await cp(path.join(assetDir, "model.ts"), path.join(outputRoot, "source", "model.ts")); } catch (error) { if (error.code !== "ENOENT") throw error; }
for (const directory of ["resources", "evidence"]) {
  try {
    await cp(path.join(assetDir, directory), path.join(outputRoot, directory === "resources" ? "source/resources" : directory), { recursive: true });
    if (directory === "resources") await cp(path.join(assetDir, directory), path.join(outputRoot, "runtime/resources"), { recursive: true });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

const threeExports = Object.keys(THREE).filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
const threeBridge = `const runtime = globalThis.__BEDROOM_FURNITURE_RUNTIME_V1__;\nif (!runtime?.three) throw new Error("Furniture runtime ABI v1 host is missing Three.js");\n${threeExports.map((name) => `export const ${name} = runtime.three.${name};`).join("\n")}\nexport default runtime.three;`;
await build({
  entryPoints: [path.join(assetDir, "runtime.ts")], outfile: path.join(outputRoot, "runtime", "runtime.mjs"), bundle: true,
  format: "esm", platform: "browser", target: "es2022", minify: true, sourcemap: false,
  tsconfig: path.join(projectRoot, "apps/web/tsconfig.json"), footer: { js: "export const runtimeAbiVersion=1;" },
  plugins: [{ name: "bedroom-three-runtime-bridge", setup(buildApi) { buildApi.onResolve({ filter: /^three$/ }, () => ({ path: "three", namespace: "bedroom-runtime" })); buildApi.onLoad({ filter: /.*/, namespace: "bedroom-runtime" }, () => ({ contents: threeBridge, loader: "js" })); } }],
});

const mediaType = (name) => name.endsWith(".json") ? "application/json" : name.endsWith(".mjs") || name.endsWith(".ts") ? "text/javascript; charset=utf-8" : name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg" : "application/octet-stream";
async function files(directory, prefix = "") { return (await readdir(directory, { withFileTypes: true })).flatMap((entry) => entry.isDirectory() ? [] : [path.posix.join(prefix, entry.name)]).concat(...await Promise.all((await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => files(path.join(directory, entry.name), path.posix.join(prefix, entry.name))))); }
const logicalPaths = (await files(outputRoot)).filter((name) => name !== "package-index.json").sort();
const objects = await Promise.all(logicalPaths.map(async (logicalPath) => { const contents = await readFile(path.join(outputRoot, ...logicalPath.split("/"))); return { logicalPath, objectKey: `${packagePrefix}/${logicalPath}`, sha256: createHash("sha256").update(contents).digest("hex"), sizeBytes: contents.byteLength, mediaType: mediaType(logicalPath) }; }));
const artifactSetHash = computeFurnitureArtifactSetHash(objects);
const index = { schemaVersion: 1, assetKey, revisionId, contractHash, artifactSetHash, runtimeAbiVersion: 1, entrypoints: { manifest: "contract/asset.json", runtime: "runtime/runtime.mjs" }, objects };
await writeFile(path.join(outputRoot, "package-index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ outputRoot, packagePrefix, contractHash, artifactSetHash, revisionId }, null, 2));
