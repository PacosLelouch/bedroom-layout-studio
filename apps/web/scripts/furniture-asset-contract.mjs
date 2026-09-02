import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalizeFurnitureContract,
  furnitureCapabilityContract,
  furnitureCandidateReadinessIssues,
  validateFurnitureAssetManifest,
} from "../lib/bedroom/assets/contract-core.mjs";

export { canonicalizeFurnitureContract as canonicalize, furnitureCapabilityContract as capabilityContract };
export { validateFurnitureAssetManifest };
export { furnitureCandidateReadinessIssues as candidateReadinessIssues };

export function computeFurnitureAssetContractHash(modelSource, runtimeSource, manifest) {
  const normalize = (value) => Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  const payload = `${normalize(modelSource).replace(/\r\n/g, "\n")}\n${normalize(runtimeSource).replace(/\r\n/g, "\n")}\n${JSON.stringify(furnitureCapabilityContract(manifest))}`;
  return createHash("sha256").update(payload).digest("hex");
}

async function existingTypeScriptPath(basePath) {
  for (const candidate of [basePath, `${basePath}.ts`, path.join(basePath, "index.ts")]) {
    try { await access(candidate); return candidate; } catch {}
  }
  return null;
}

/** Read the fixed package entries plus their relative source dependencies inside lib/bedroom/assets. */
export async function readFurniturePackageContractSources(assetDirectory) {
  const assetsRoot = path.resolve(assetDirectory, "..", "..");
  const runtimePath = path.join(assetDirectory, "runtime.ts");
  const modelPath = path.join(assetDirectory, "model.ts");
  const visited = new Map();
  async function visit(filePath) {
    const resolved = path.resolve(filePath);
    if (visited.has(resolved) || !(resolved === assetsRoot || resolved.startsWith(`${assetsRoot}${path.sep}`))) return;
    let source;
    try { source = await readFile(resolved, "utf8"); } catch (error) { if (error?.code === "ENOENT") return; throw error; }
    visited.set(resolved, source);
    const imports = [...source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of imports) {
      const dependency = await existingTypeScriptPath(path.resolve(path.dirname(resolved), specifier));
      if (dependency) await visit(dependency);
    }
  }
  await visit(runtimePath);
  await visit(modelPath);
  const runtimeSource = visited.get(runtimePath);
  if (runtimeSource === undefined) throw new Error(`${assetDirectory} 缺少 runtime.ts`);
  const dependencySource = [...visited.entries()]
    .filter(([filePath]) => filePath !== runtimePath)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, source]) => `${path.relative(assetsRoot, filePath).replaceAll("\\", "/")}\n${source}`)
    .join("\n");
  return { modelSource: dependencySource, runtimeSource };
}
