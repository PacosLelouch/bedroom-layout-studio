import * as THREE from "three";
import type { FurnitureItem } from "../types";
export function applyFurnitureTransform(group: THREE.Group, item: FurnitureItem) { group.position.set(item.position.x, item.baseHeight ?? (item.wallMounted ? 1450 : 0), item.position.z); group.rotation.y = THREE.MathUtils.degToRad(item.rotation); }
