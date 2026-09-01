import * as THREE from "three";
import type { FurnitureItem } from "../types";
export function createFurniturePlaceholder(item: FurnitureItem) { const group = new THREE.Group(); const mesh = new THREE.Mesh(new THREE.BoxGeometry(item.size.width, item.size.height, item.size.depth), new THREE.MeshBasicMaterial({ color: "#c8b69a", transparent: true, opacity: .22, wireframe: true })); mesh.position.y = item.size.height / 2; group.add(mesh); group.userData.furnitureId = item.id; return group; }
export function markPlaceholderFailed(group: THREE.Group) { group.traverse((object) => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) object.material.color.set("#d85e4b"); }); group.userData.loadFailed = true; }
