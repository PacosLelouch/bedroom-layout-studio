import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { configurationIssues, findFurnitureAsset, itemConfiguration } from "./asset-registry";
import { createFurnitureModel } from "./assets/runtime-cache";
import { disposeObjectTree } from "./three-disposal";
import type { FurnitureItem } from "./types";

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9\u3400-\u9fff_-]+/g, "-").replace(/^-+|-+$/g, "") || "furniture";
}

function prepareTreeForExport(root: THREE.Group) {
  const remove: THREE.Object3D[] = [];
  root.traverse((object) => {
    const decorative = object.userData.decorative === true;
    object.userData = {};
    if (object instanceof THREE.Light || decorative) remove.push(object);
  });
  for (const object of remove) object.removeFromParent();
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
}

export async function createFurnitureGlb(item: FurnitureItem): Promise<{ data: ArrayBuffer; fileName: string }> {
  const asset = findFurnitureAsset(item.assetId);
  if (!asset) throw new Error("找不到这件家具的基础资产。");
  if (!asset.exportReady) throw new Error("该资产尚未通过 GLB 外观兼容检视。");
  const issues = configurationIssues(asset, itemConfiguration(item));
  if (issues.length) throw new Error(issues.join("；"));
  const group = await createFurnitureModel(item, "export");
  try {
    prepareTreeForExport(group);
    const exporter = new GLTFExporter();
    const output = await exporter.parseAsync(group, { binary: true, onlyVisible: true });
    if (!(output instanceof ArrayBuffer) || output.byteLength === 0) throw new Error("GLB 导出结果为空。");
    return {
      data: output,
      fileName: `${safeFilePart(item.name)}-${safeFilePart(item.stateId ?? "default")}.glb`,
    };
  } finally {
    disposeObjectTree(group);
  }
}

export async function downloadFurnitureGlb(item: FurnitureItem) {
  const { data, fileName } = await createFurnitureGlb(item);
  const url = URL.createObjectURL(new Blob([data], { type: "model/gltf-binary" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
