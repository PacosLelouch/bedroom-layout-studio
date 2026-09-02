import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { computeFurnitureAssetContractHash, readFurniturePackageContractSources, validateFurnitureAssetManifest } from "../../../../apps/web/scripts/furniture-asset-contract.mjs";

const projectRoot = process.cwd();
const webRoot = path.resolve(projectRoot, "apps", "web");
const assetId = process.argv[2];
const outIndex = process.argv.indexOf("--out");
const outPath = outIndex >= 0 ? path.resolve(projectRoot, process.argv[outIndex + 1]) : null;
const candidateMode = process.argv.includes("--candidate");
if (!assetId || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(assetId)) throw new Error("Usage: node validate_furniture_asset.mjs <asset-id> [--scope builtin|user-generated] [--candidate] [--out report.json]");

const scopeIndex = process.argv.indexOf("--scope");
const assetScope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : "user-generated";
if (!["builtin", "user-generated"].includes(assetScope)) throw new Error("--scope 必须是 builtin 或 user-generated");
const assetDir = path.resolve(webRoot, "lib", "bedroom", "assets", assetScope, assetId);
const manifest = JSON.parse(await readFile(path.join(assetDir, "asset.json"), "utf8"));
const staticIssues = validateFurnitureAssetManifest(manifest, { requireCandidateReady: candidateMode });
if (manifest.id !== assetId) staticIssues.push("manifest ID 必须与目录名一致");
if (manifest.assetScope !== assetScope) staticIssues.push(`assetScope 必须是 ${assetScope}`);
const runtimePath = path.resolve(assetDir, "runtime.ts");
await access(runtimePath).catch(() => staticIssues.push(`固定运行入口不存在: ${runtimePath}`));
if (staticIssues.length) throw new Error(staticIssues.join("; "));

const { modelSource, runtimeSource } = await readFurniturePackageContractSources(assetDir);
const contractHash = computeFurnitureAssetContractHash(modelSource, runtimeSource, manifest);
const configurations = manifest.validationConfigurations.length ? manifest.validationConfigurations : manifest.defaultConfiguration ? [{ id: "default", ...manifest.defaultConfiguration }] : [];
const report = { assetId, contractHash, purposesCovered: [], configurations: [], statesCovered: [], parametersCovered: [], structuralChecksPassed: false, behaviorChecksPassed: false, issues: [] };

function materialSignature(material) {
  return { type: material.type, name: material.name, color: material.color?.getHexString(), emissive: material.emissive?.getHexString(), roughness: material.roughness, metalness: material.metalness, opacity: material.opacity, vertexColors: material.vertexColors, map: material.map?.name || material.map?.source?.uuid || null };
}
function treeSignature(root) {
  const entries = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object instanceof THREE.Mesh;
    entries.push({ path: `${object.parent?.name ?? ""}/${object.name}`, type: object.type, visible: object.visible, matrix: object.matrix.toArray().map((value) => Number(value.toFixed(6))), geometry: mesh ? { positions: object.geometry.getAttribute("position")?.count ?? 0, indices: object.geometry.index?.count ?? 0, colors: object.geometry.getAttribute("color")?.count ?? 0 } : null, material: mesh ? (Array.isArray(object.material) ? object.material : [object.material]).map(materialSignature) : null });
  });
  return JSON.stringify(entries);
}
function componentEffectSignature(root, component, effect) {
  const nodes = [];
  root.traverse((object) => {
    if (!component.nodeNames.includes(object.name) && object.name !== component.pivotNode) return;
    object.updateMatrixWorld(true);
    const mesh = object instanceof THREE.Mesh;
    const box = new THREE.Box3().setFromObject(object);
    const size = box.isEmpty() ? null : box.getSize(new THREE.Vector3()).toArray().map((value) => Number(value.toFixed(6)));
    const signature = { name: object.name };
    if (["transform", "behavior"].includes(effect)) signature.transform = object.matrix.toArray().map((value) => Number(value.toFixed(6)));
    if (["visibility", "behavior"].includes(effect)) signature.visible = object.visible;
    if (["geometry", "behavior"].includes(effect)) signature.geometry = mesh ? { positions: object.geometry.getAttribute("position")?.count ?? 0, indices: object.geometry.index?.count ?? 0, colors: object.geometry.getAttribute("color")?.count ?? 0 } : null;
    if (["material", "behavior"].includes(effect)) signature.material = mesh ? (Array.isArray(object.material) ? object.material : [object.material]).map(materialSignature) : null;
    if (["dimensions", "behavior"].includes(effect)) signature.size = size;
    nodes.push(signature);
  });
  return JSON.stringify(nodes);
}
function differsOnlyByCapability(left, right, capabilityId) {
  if (!left || !right || JSON.stringify(left.dimensions) !== JSON.stringify(right.dimensions)) return false;
  if (capabilityId.startsWith("state:")) return left.stateId !== right.stateId && JSON.stringify(left.parameters) === JSON.stringify(right.parameters);
  const parameterId = capabilityId.slice("parameter:".length);
  if (left.stateId !== right.stateId || left.parameters[parameterId] === right.parameters[parameterId]) return false;
  const without = (parameters) => Object.fromEntries(Object.entries(parameters).filter(([id]) => id !== parameterId));
  return JSON.stringify(without(left.parameters)) === JSON.stringify(without(right.parameters));
}
function dispose(root) {
  root.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose()); } });
}

if (configurations.length) {
  const { createServer } = await import("vite");
  const server = await createServer({ appType: "custom", configFile: false, root: webRoot, resolve: { alias: { "@": webRoot } }, server: { middlewareMode: true } });
  try {
    const runtimeModule = await server.ssrLoadModule(`/${path.relative(webRoot, runtimePath).replaceAll("\\", "/")}`);
    const factory = runtimeModule.createFurnitureModel;
    if (typeof factory !== "function") throw new Error("runtime.ts 必须导出 createFurnitureModel");
    const signatures = new Map();
    const componentSignatures = new Map();
    for (const configuration of configurations) {
      const result = { id: configuration.id, purposes: {}, nodes: [] };
      for (const purpose of ["scene", "review", "export"]) {
        const group = factory(configuration, { purpose });
        try {
          group.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(group);
          const size = box.getSize(new THREE.Vector3());
          if (![size.x, size.y, size.z, box.min.y].every(Number.isFinite) || Math.min(size.x, size.y, size.z) <= 0 || Math.abs(box.min.y) > 0.01) report.issues.push(`${configuration.id}/${purpose} 为空、非有限或未落地`);
          const names = new Set();
          let exportUnsafe = false;
          group.traverse((object) => {
            if (object.name) names.add(object.name);
            if (purpose === "export" && (object instanceof THREE.Light || object.userData.decorative === true || /helper|controls/i.test(object.type))) exportUnsafe = true;
            if (purpose === "export" && object instanceof THREE.Mesh && (Array.isArray(object.material) ? object.material : [object.material]).some((material) => material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile)) exportUnsafe = true;
          });
          for (const component of manifest.components) {
            for (const nodeName of component.nodeNames) if (!names.has(nodeName)) report.issues.push(`${configuration.id}/${purpose} 缺少组件节点 ${nodeName}`);
            if (component.movable && (!component.pivotNode || !names.has(component.pivotNode) || group.name === component.pivotNode)) report.issues.push(`${configuration.id}/${purpose} 的活动组件 ${component.id} 缺少有效 pivot`);
          }
          if (exportUnsafe) report.issues.push(`${configuration.id}/export 含灯光、辅助对象或运行时着色`);
          const signature = treeSignature(group);
          signatures.set(`${configuration.id}:${purpose}`, signature);
          for (const binding of manifest.capabilityBindings) {
            for (const componentId of binding.componentIds) {
              const component = manifest.components.find((entry) => entry.id === componentId);
              componentSignatures.set(`${configuration.id}:${purpose}:${binding.capabilityId}:${componentId}:${binding.effect}`, componentEffectSignature(group, component, binding.effect));
            }
          }
          result.purposes[purpose] = { size: { width: size.x, depth: size.z, height: size.y }, grounded: Math.abs(box.min.y) <= 0.01, signature };
          result.nodes = [...names].sort();
          if (!report.purposesCovered.includes(purpose)) report.purposesCovered.push(purpose);
        } finally { dispose(group); }
      }
      report.configurations.push(result);
      if (configuration.stateId && !report.statesCovered.includes(configuration.stateId)) report.statesCovered.push(configuration.stateId);
    }
    for (const definition of manifest.parameterDefinitions) {
      const values = new Map();
      for (const configuration of configurations) values.set(JSON.stringify(configuration.parameters[definition.id]), configuration);
      report.parametersCovered.push({ id: definition.id, values: [...values.keys()].map((value) => JSON.parse(value)) });
    }
    for (const binding of manifest.capabilityBindings) {
      const explicit = configurations.find((entry) => entry.testsCapability === binding.capabilityId && entry.compareAgainst);
      let left = explicit;
      let right = explicit ? configurations.find((entry) => entry.id === explicit.compareAgainst) : null;
      if (!left || !right || !differsOnlyByCapability(left, right, binding.capabilityId)) {
        outer: for (let index = 0; index < configurations.length; index += 1) {
          for (const candidate of configurations.slice(index + 1)) if (differsOnlyByCapability(configurations[index], candidate, binding.capabilityId)) { left = configurations[index]; right = candidate; break outer; }
        }
      }
      if (!left || !right) { report.issues.push(`能力 ${binding.capabilityId} 缺少可比较配置`); continue; }
      for (const componentId of binding.componentIds) {
        const key = (configuration) => `${configuration.id}:scene:${binding.capabilityId}:${componentId}:${binding.effect}`;
        if (componentSignatures.get(key(left)) === componentSignatures.get(key(right))) report.issues.push(`能力 ${binding.capabilityId} 未在组件 ${componentId} 产生声明的 ${binding.effect} 差异`);
      }
    }
  } finally { await server.close(); }
}

report.structuralChecksPassed = report.issues.length === 0;
report.behaviorChecksPassed = report.issues.length === 0;
if (outPath) await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (report.issues.length) throw new Error(report.issues.join("; "));
console.log(JSON.stringify(report, null, 2));
