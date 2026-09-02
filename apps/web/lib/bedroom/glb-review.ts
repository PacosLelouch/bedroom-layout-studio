import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FurniturePackageRuntimeFactory } from "./assets/package-types";
import { disposeObjectTree } from "./three-disposal";
import type { FurnitureConfiguration } from "./types";

export interface GlbReviewResult {
  byteLength: number;
  dimensionsMatch: boolean;
  grounded: boolean;
  namedNodeCount: number;
  materialCount: number;
  materialsPortable: boolean;
}

function dimensionsOf(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { box, size: box.getSize(new THREE.Vector3()) };
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(left) * 0.001);
}

export async function reviewRuntimeFactoryGlb(factory: FurniturePackageRuntimeFactory, configuration: FurnitureConfiguration): Promise<GlbReviewResult> {
  const source = factory(configuration, { purpose: "export" });
  let loaded: THREE.Group | null = null;
  try {
    const removable: THREE.Object3D[] = [];
    let hasRuntimeShader = false;
    source.traverse((object) => {
      const decorative = object.userData.decorative === true;
      object.userData = {};
      if (object instanceof THREE.Light || decorative) removable.push(object);
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        hasRuntimeShader ||= materials.some((material) => material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile);
      }
    });
    removable.forEach((object) => object.removeFromParent());
    source.position.set(0, 0, 0);
    source.rotation.set(0, 0, 0);
    const sourceBounds = dimensionsOf(source);
    const output = await new GLTFExporter().parseAsync(source, { binary: true, onlyVisible: true });
    if (!(output instanceof ArrayBuffer) || output.byteLength === 0) throw new Error("GLB 导出结果为空。");
    const parsed = await new GLTFLoader().parseAsync(output, "");
    loaded = parsed.scene;
    const loadedBounds = dimensionsOf(loaded);
    const names = new Set<string>();
    const materials = new Set<string>();
    loaded.traverse((object) => {
      if (object.name.trim()) names.add(object.name);
      if (object instanceof THREE.Mesh) {
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => materials.add(material.uuid));
      }
    });
    return {
      byteLength: output.byteLength,
      dimensionsMatch: closeEnough(sourceBounds.size.x, loadedBounds.size.x) && closeEnough(sourceBounds.size.y, loadedBounds.size.y) && closeEnough(sourceBounds.size.z, loadedBounds.size.z),
      grounded: Math.abs(loadedBounds.box.min.y) <= 0.01,
      namedNodeCount: names.size,
      materialCount: materials.size,
      materialsPortable: !hasRuntimeShader && materials.size > 0,
    };
  } finally {
    disposeObjectTree(source);
    if (loaded) disposeObjectTree(loaded);
  }
}
