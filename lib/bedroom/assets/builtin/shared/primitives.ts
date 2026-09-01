import * as THREE from "three";
import type { FurnitureRuntimeFactory } from "../../runtime-types";

export function box(size: [number, number, number], color: string, position: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export const createSimpleFurniture: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth, height } = configuration.dimensions;
  const group = new THREE.Group();
  group.name = "body";
  group.add(box([width, height, depth], String(configuration.parameters.color ?? "#c7b69d"), [0, height / 2, 0]));
  return group;
};
