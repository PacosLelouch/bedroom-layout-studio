import type { RoomLayout } from "../types";
import type { RoomCameraState, RoomScene } from "./scene-types";

export interface CachedRoomScene { roomId: string; roomReference: RoomLayout; scene: RoomScene; cameraState: RoomCameraState; lastUsedAt: number }
export const ROOM_SCENE_CACHE_LIMIT = 3;
export class RoomSceneCache {
  private entries = new Map<string, CachedRoomScene>();
  constructor(private readonly disposeScene: (scene: RoomScene) => void, private readonly limit = ROOM_SCENE_CACHE_LIMIT) {}
  get(roomId: string) { const entry = this.entries.get(roomId); if (entry) entry.lastUsedAt = performance.now(); return entry; }
  set(entry: CachedRoomScene) { this.entries.set(entry.roomId, entry); this.evict(); }
  values() { return [...this.entries.values()]; }
  private evict() { while (this.entries.size > this.limit) { const oldest = [...this.entries.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0]; this.entries.delete(oldest.roomId); this.disposeScene(oldest.scene); } }
  clear() { this.entries.forEach((entry) => this.disposeScene(entry.scene)); this.entries.clear(); }
}
