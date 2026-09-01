import * as THREE from "three";
import type { RoomLayout } from "../types";
export function buildRoomFloor(room: RoomLayout) { const shape = new THREE.Shape(); room.outline.forEach((point, index) => index ? shape.lineTo(point.x, point.z) : shape.moveTo(point.x, point.z)); shape.closePath(); const geometry = new THREE.ExtrudeGeometry(shape, { depth: 70, bevelEnabled: false }); geometry.rotateX(Math.PI / 2); return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#f8f5ed", roughness: .86 })); }
