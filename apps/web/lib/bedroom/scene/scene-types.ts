import type * as THREE from "three";
import type { RoomLayout } from "../types";

export interface RoomCameraState { perspective: { azimuth: number; elevation: number; distance: number }; top: { zoom: number } }
export interface FurnitureSceneEntry { id: string; group: THREE.Group; runtimeKey: string; placeholder: boolean; selectionHelper?: THREE.BoxHelper; clearanceObject?: THREE.Object3D }
export interface DoorSceneEntry { id: string; pivot: THREE.Group }
export interface RoomScene {
  roomId: string; roomReference: RoomLayout; root: THREE.Group; floorGroup: THREE.Group; wallGroup: THREE.Group; bayWindowGroup: THREE.Group; doorGroup: THREE.Group; furnitureGroup: THREE.Group; clearanceGroup: THREE.Group; selectionGroup: THREE.Group; outlineEditorGroup: THREE.Group; furnitureById: Map<string, FurnitureSceneEntry>; doorsById: Map<string, DoorSceneEntry>;
}
