import * as THREE from "three";
import type { RoomCameraState } from "./scene-types";
export function defaultRoomCameraState(): RoomCameraState { return { perspective: { azimuth: .72, elevation: .76, distance: 9000 }, top: { zoom: 1 } }; }
export class CameraController { readonly perspective = new THREE.PerspectiveCamera(42, 1, 10, 50000); readonly top = new THREE.OrthographicCamera(-3000, 3000, 2200, -2200, 10, 30000); state = defaultRoomCameraState(); active: THREE.Camera = this.perspective; setMode(mode: "perspective" | "top") { this.active = mode === "top" ? this.top : this.perspective; } }
