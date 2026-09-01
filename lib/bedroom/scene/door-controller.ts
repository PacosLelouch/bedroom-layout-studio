import * as THREE from "three";
import type { DoorOpening } from "../types";
export function applyDoorState(pivot: THREE.Group, door: DoorOpening) { pivot.rotation.y = THREE.MathUtils.degToRad(door.isOpen === false ? door.closedAngle : door.openAngle); }
