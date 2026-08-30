import type { FurnitureItem, PlanPoint, RoomLayout } from "./types";

export interface PlanRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export function footprint(item: FurnitureItem) {
  return Math.abs(item.rotation % 180) === 90
    ? { width: item.size.depth, depth: item.size.width }
    : { width: item.size.width, depth: item.size.depth };
}

export function itemRect(item: FurnitureItem): PlanRect {
  const size = footprint(item);
  return { x: item.position.x - size.width / 2, z: item.position.z - size.depth / 2, ...size };
}

export function clearanceRect(item: FurnitureItem): PlanRect | null {
  if (!item.clearanceDepth) return null;
  const size = footprint(item);
  const turn = ((item.rotation % 360) + 360) % 360;
  if (turn === 90) return { x: item.position.x + size.width / 2, z: item.position.z - size.depth / 2, width: item.clearanceDepth, depth: size.depth };
  if (turn === 180) return { x: item.position.x - size.width / 2, z: item.position.z - size.depth / 2 - item.clearanceDepth, width: size.width, depth: item.clearanceDepth };
  if (turn === 270) return { x: item.position.x - size.width / 2 - item.clearanceDepth, z: item.position.z - size.depth / 2, width: item.clearanceDepth, depth: size.depth };
  return { x: item.position.x - size.width / 2, z: item.position.z + size.depth / 2, width: size.width, depth: item.clearanceDepth };
}

export function rectsOverlap(a: PlanRect, b: PlanRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.z < b.z + b.depth && a.z + a.depth > b.z;
}

function pointInPolygon(point: PlanPoint, polygon: PlanPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.z > point.z) !== (b.z > point.z) &&
      point.x <= ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function rectInsideOutline(rect: PlanRect, outline: PlanPoint[]) {
  const inset = 0.01;
  return [
    { x: rect.x + inset, z: rect.z + inset },
    { x: rect.x + rect.width - inset, z: rect.z + inset },
    { x: rect.x + rect.width - inset, z: rect.z + rect.depth - inset },
    { x: rect.x + inset, z: rect.z + rect.depth - inset },
  ].every((point) => pointInPolygon(point, outline));
}

export function collides(item: FurnitureItem, room: RoomLayout) {
  if (item.wallMounted) return false;
  const rect = itemRect(item);
  if (!rectInsideOutline(rect, room.outline)) return true;
  if (room.keepOutZones.some((zone) => rectsOverlap(rect, zone))) return true;
  return room.items.some((other) => {
    if (other.id === item.id || other.wallMounted) return false;
    const otherRect = itemRect(other);
    return rectsOverlap(rect, otherRect) ||
      (clearanceRect(other) ? rectsOverlap(rect, clearanceRect(other)!) : false) ||
      (clearanceRect(item) ? rectsOverlap(clearanceRect(item)!, otherRect) : false);
  });
}
