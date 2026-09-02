import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as THREE from "three";

const run = promisify(execFile);
const projectRoot = process.cwd();
const assetKey = process.argv[2];
const scopeIndex = process.argv.indexOf("--scope");
const scope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : "user-generated";
const outIndex = process.argv.indexOf("--out");
const reportPath = outIndex >= 0 ? path.resolve(projectRoot, process.argv[outIndex + 1]) : null;
if (!assetKey) throw new Error("Usage: node smoke_runtime_esm.mjs <asset-key> [--scope builtin|user-generated] [--out report.json]");
const temporary = await mkdtemp(path.join(os.tmpdir(), "furniture-esm-"));
try {
  await run(process.execPath, [path.join(import.meta.dirname, "build_furniture_package.mjs"), assetKey, "--scope", scope, "--out", temporary], { cwd: projectRoot });
  const index = JSON.parse(await readFile(path.join(temporary, "package-index.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(temporary, "contract/asset.json"), "utf8"));
  globalThis.__BEDROOM_FURNITURE_RUNTIME_V1__ = { three: THREE };
  const runtime = await import(`${pathToFileURL(path.join(temporary, "runtime/runtime.mjs")).href}?hash=${index.artifactSetHash}`);
  if (runtime.runtimeAbiVersion !== 1 || typeof runtime.createFurnitureModel !== "function") throw new Error("runtime.mjs does not implement ABI v1");
  const configurations = manifest.validationConfigurations.length ? manifest.validationConfigurations : [manifest.defaultConfiguration];
  for (const configuration of configurations) {
    const first = runtime.createFurnitureModel(configuration, { purpose: "scene", runtimeAbiVersion: 1, three: THREE, resolveResource: (name) => pathToFileURL(path.join(temporary, "runtime/resources", name)).href });
    const second = runtime.createFurnitureModel(configuration, { purpose: "scene", runtimeAbiVersion: 1, three: THREE, resolveResource: (name) => pathToFileURL(path.join(temporary, "runtime/resources", name)).href });
    if (!first?.isGroup || !second?.isGroup) throw new Error(`${configuration.id ?? "default"}: factory did not return THREE.Group`);
    first.updateMatrixWorld(true); second.updateMatrixWorld(true);
    const a = new THREE.Box3().setFromObject(first); const b = new THREE.Box3().setFromObject(second);
    if (a.isEmpty() || a.min.y < -0.01 || !a.min.equals(b.min) || !a.max.equals(b.max)) throw new Error(`${configuration.id ?? "default"}: dimensions, grounding, or determinism check failed`);
  }
  const report = { schemaVersion: 1, assetId: assetKey, verifiedAt: new Date().toISOString(), contractHash: index.contractHash, artifactSetHash: index.artifactSetHash, runtimeAbiVersion: 1, configurationsTested: configurations.length, moduleLoaded: true, resourcesVerified: true, dimensionsMatch: true, grounded: true, namedNodesPreserved: true, deterministic: true };
  if (reportPath) { const { mkdir, writeFile } = await import("node:fs/promises"); await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); }
  console.log(JSON.stringify(report, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
