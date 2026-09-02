import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { computeFurnitureAssetContractHash, readFurniturePackageContractSources, validateFurnitureAssetManifest } from "../../../../apps/web/scripts/furniture-asset-contract.mjs";

const projectRoot = process.cwd();
const webRoot = path.resolve(projectRoot, "apps", "web");
const assetId = process.argv[2];
const outIndex = process.argv.indexOf("--out");
const outPath = outIndex >= 0 ? path.resolve(projectRoot, process.argv[outIndex + 1]) : null;
if (!assetId) throw new Error("Usage: node smoke_export_glb.mjs <asset-id> [--scope builtin|user-generated] [--out report.json]");
const scopeIndex = process.argv.indexOf("--scope");
const assetScope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : "user-generated";
if (!["builtin", "user-generated"].includes(assetScope)) throw new Error("--scope 必须是 builtin 或 user-generated");
const assetDir = path.resolve(webRoot, "lib", "bedroom", "assets", assetScope, assetId);
const manifest = JSON.parse(await readFile(path.join(assetDir, "asset.json"), "utf8"));
const issues = validateFurnitureAssetManifest(manifest);
if (manifest.assetScope !== assetScope) issues.push(`assetScope 必须是 ${assetScope}`);
if (issues.length) throw new Error(issues.join("; "));
const { modelSource, runtimeSource } = await readFurniturePackageContractSources(assetDir);
const contractHash = computeFurnitureAssetContractHash(modelSource, runtimeSource, manifest);
const configurations = manifest.validationConfigurations.length ? manifest.validationConfigurations : manifest.defaultConfiguration ? [{ id: "default", ...manifest.defaultConfiguration }] : [];
if (!configurations.length) throw new Error("GLB smoke 需要至少一个验证配置");

if (!globalThis.FileReader) globalThis.FileReader = class {
  result = null; onloadend = null; onerror = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }, (error) => this.onerror?.(error)); }
  readAsDataURL(blob) { blob.arrayBuffer().then((value) => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`; this.onloadend?.(); }, (error) => this.onerror?.(error)); }
};
const closeEnough = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(a) * 0.001);
const dispose = (root) => root?.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose()); } });
function portableMaterialSignature(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => ({
    type: material.type,
    color: material.color?.getHexString() ?? null,
    emissive: material.emissive?.getHexString() ?? null,
    roughness: material.roughness ?? null,
    metalness: material.metalness ?? null,
    opacity: material.opacity,
    transparent: material.transparent,
    vertexColors: material.vertexColors,
    hasMap: Boolean(material.map),
    hasNormalMap: Boolean(material.normalMap),
    hasRoughnessMap: Boolean(material.roughnessMap),
    hasMetalnessMap: Boolean(material.metalnessMap),
    colorAttributeCount: mesh.geometry.getAttribute("color")?.count ?? 0,
  }));
}
function materialInventory(root) {
  const inventory = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) inventory.push({ name: object.name, signature: portableMaterialSignature(object) });
  });
  return inventory;
}
function pbrPortable(root) {
  let portable = true;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) portable = false;
    }
  });
  return portable;
}
function materialSemanticsMatch(sourceInventory, loadedInventory) {
  if (sourceInventory.length !== loadedInventory.length) return false;
  const close = (left, right) => left === null && right === null || typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= 0.002 || left === right;
  return sourceInventory.every((sourceEntry, meshIndex) => {
    const loadedEntry = loadedInventory[meshIndex];
    if (!loadedEntry || sourceEntry.signature.length !== loadedEntry.signature.length) return false;
    return sourceEntry.signature.every((sourceMaterial, materialIndex) => {
      const loadedMaterial = loadedEntry.signature[materialIndex];
      return loadedMaterial && ["color", "emissive", "roughness", "metalness", "opacity", "transparent", "vertexColors", "hasMap", "hasNormalMap", "hasRoughnessMap", "hasMetalnessMap", "colorAttributeCount"].every((key) => close(sourceMaterial[key], loadedMaterial[key]));
    });
  });
}
const report = { assetId, contractHash, configurationsTested: 0, stateIds: [], dimensionsMatch: true, grounded: true, namedNodesPreserved: true, materialsPortable: true, materialsAccepted: false, sourceReloadAppearanceAccepted: false, configurations: [], issues: [] };

const { createServer } = await import("vite");
const server = await createServer({ appType: "custom", configFile: false, root: webRoot, resolve: { alias: { "@": webRoot } }, server: { middlewareMode: true } });
try {
  const runtimePath = path.join(assetDir, "runtime.ts");
  const runtimeModule = await server.ssrLoadModule(`/${path.relative(webRoot, runtimePath).replaceAll("\\", "/")}`);
  const factory = runtimeModule.createFurnitureModel;
  if (typeof factory !== "function") throw new Error("runtime.ts 必须导出 createFurnitureModel");
  for (const configuration of configurations) {
    const source = factory(configuration, { purpose: "export" });
    let loaded = null;
    try {
      const requiredNames = new Set(manifest.components.flatMap((component) => [...component.nodeNames, component.pivotNode].filter(Boolean)));
      let unsafe = false;
      source.traverse((object) => {
        if (object instanceof THREE.Light || object.userData.decorative === true || /helper|controls/i.test(object.type)) unsafe = true;
        if (object instanceof THREE.Mesh && (Array.isArray(object.material) ? object.material : [object.material]).some((material) => material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile)) unsafe = true;
        object.userData = {};
      });
      if (unsafe) report.issues.push(`${configuration.id} 含不可移植运行时对象或着色`);
      source.updateMatrixWorld(true);
      const sourceBox = new THREE.Box3().setFromObject(source);
      const sourceSize = sourceBox.getSize(new THREE.Vector3());
      const sourceMaterials = materialInventory(source);
      if (!pbrPortable(source)) unsafe = true;
      const binary = await new GLTFExporter().parseAsync(source, { binary: true, onlyVisible: true });
      if (!(binary instanceof ArrayBuffer) || !binary.byteLength) throw new Error(`${configuration.id} 导出为空`);
      loaded = (await new GLTFLoader().parseAsync(binary, "")).scene;
      loaded.updateMatrixWorld(true);
      const loadedBox = new THREE.Box3().setFromObject(loaded);
      const loadedSize = loadedBox.getSize(new THREE.Vector3());
      const loadedMaterials = materialInventory(loaded);
      const materialSemanticsPreserved = materialSemanticsMatch(sourceMaterials, loadedMaterials);
      const loadedNames = new Set();
      const materials = new Set();
      loaded.traverse((object) => { if (object.name) loadedNames.add(object.name); if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material.uuid)); });
      const dimensionsMatch = closeEnough(sourceSize.x, loadedSize.x) && closeEnough(sourceSize.y, loadedSize.y) && closeEnough(sourceSize.z, loadedSize.z);
      const grounded = Math.abs(loadedBox.min.y) <= 0.01;
      const namedNodesPreserved = [...requiredNames].every((name) => loadedNames.has(name));
      const materialsPortable = !unsafe && materials.size > 0 && pbrPortable(loaded) && materialSemanticsPreserved;
      report.dimensionsMatch &&= dimensionsMatch;
      report.grounded &&= grounded;
      report.namedNodesPreserved &&= namedNodesPreserved;
      report.materialsPortable &&= materialsPortable;
      if (!dimensionsMatch) report.issues.push(`${configuration.id} 重载尺寸不匹配`);
      if (!grounded) report.issues.push(`${configuration.id} 重载后未落地`);
      if (!namedNodesPreserved) report.issues.push(`${configuration.id} 重载后关键节点丢失`);
      if (!materialsPortable) report.issues.push(`${configuration.id} 材质不可移植`);
      report.configurations.push({ id: configuration.id, bytes: binary.byteLength, dimensionsMatch, grounded, namedNodesPreserved, materialsPortable, materialSemanticsPreserved, namedNodeCount: loadedNames.size, materialCount: materials.size, sourceMaterials, loadedMaterials });
      report.configurationsTested += 1;
      if (configuration.stateId && !report.stateIds.includes(configuration.stateId)) report.stateIds.push(configuration.stateId);
    } finally { dispose(source); dispose(loaded); }
  }
} finally { await server.close(); }
if (outPath) await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (report.issues.length) throw new Error(report.issues.join("; "));
console.log(JSON.stringify(report, null, 2));
