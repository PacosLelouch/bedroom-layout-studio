import * as THREE from "three";
import type { RoomLayout } from "../types";
import type { RoomScene } from "./scene-types";

export function createEmptyRoomScene(room: RoomLayout): RoomScene {
  const root = new THREE.Group(); root.name = `room:${room.id}`;
  const groups = ["floor", "walls", "bay-window", "doors", "furniture", "clearance", "selection", "outline-editor"].map((name) => { const group = new THREE.Group(); group.name = name; root.add(group); return group; });
  return { roomId: room.id, roomReference: room, root, floorGroup: groups[0], wallGroup: groups[1], bayWindowGroup: groups[2], doorGroup: groups[3], furnitureGroup: groups[4], clearanceGroup: groups[5], selectionGroup: groups[6], outlineEditorGroup: groups[7], furnitureById: new Map(), doorsById: new Map() };
}
