import type { FurnitureItem, PlanPoint, RoomLayout } from "./types";
import { findFurnitureAsset } from "./assets/catalog";
import { furnitureItemConfiguration, resolveFurnitureFootprint } from "./assets/footprint";

export interface PlanRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export function footprint(item: FurnitureItem) {
  const angle = item.rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  return {
    width: item.size.width * cosine + item.size.depth * sine,
    depth: item.size.width * sine + item.size.depth * cosine,
  };
}

export function itemCorners(item: FurnitureItem): PlanPoint[] {
  const angle = item.rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const local = resolveFurnitureFootprint(findFurnitureAsset(item.assetId), furnitureItemConfiguration(item));
  return [
    { x: local.minX, z: local.minZ },
    { x: local.maxX, z: local.minZ },
    { x: local.maxX, z: local.maxZ },
    { x: local.minX, z: local.maxZ },
  ].map((point) => ({
    x: item.position.x + point.x * cosine + point.z * sine,
    z: item.position.z - point.x * sine + point.z * cosine,
  }));
}

export function itemRect(item: FurnitureItem): PlanRect {
  const corners = itemCorners(item);
  const xs = corners.map((point) => point.x);
  const zs = corners.map((point) => point.z);
  const x = Math.min(...xs);
  const z = Math.min(...zs);
  return { x, z, width: Math.max(...xs) - x, depth: Math.max(...zs) - z };
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

function pointOnSegment(point: PlanPoint, a: PlanPoint, b: PlanPoint) {
  const cross = (point.z - a.z) * (b.x - a.x) - (point.x - a.x) * (b.z - a.z);
  if (Math.abs(cross) > 0.01) return false;
  return point.x >= Math.min(a.x, b.x) - 0.01 && point.x <= Math.max(a.x, b.x) + 0.01 &&
    point.z >= Math.min(a.z, b.z) - 0.01 && point.z <= Math.max(a.z, b.z) + 0.01;
}

export function pointInPolygon(point: PlanPoint, polygon: PlanPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = (a.z > point.z) !== (b.z > point.z) &&
      point.x <= ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonInsideOutline(polygon: PlanPoint[], outline: PlanPoint[]) {
  return polygon.every((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return [0, 0.25, 0.5, 0.75, 1].every((amount) => pointInPolygon({
      x: point.x + (next.x - point.x) * amount,
      z: point.z + (next.z - point.z) * amount,
    }, outline));
  });
}

function rectPolygon(rect: PlanRect): PlanPoint[] {
  return [
    { x: rect.x, z: rect.z },
    { x: rect.x + rect.width, z: rect.z },
    { x: rect.x + rect.width, z: rect.z + rect.depth },
    { x: rect.x, z: rect.z + rect.depth },
  ];
}

export function polygonsOverlap(a: PlanPoint[], b: PlanPoint[]) {
  const polygons = [a, b];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const next = polygon[(index + 1) % polygon.length];
      const axis = { x: -(next.z - polygon[index].z), z: next.x - polygon[index].x };
      const project = (points: PlanPoint[]) => points.map((point) => point.x * axis.x + point.z * axis.z);
      const aProjection = project(a);
      const bProjection = project(b);
      if (Math.max(...aProjection) <= Math.min(...bProjection) + 0.01 || Math.max(...bProjection) <= Math.min(...aProjection) + 0.01) return false;
    }
  }
  return true;
}

function orientation(a: PlanPoint, b: PlanPoint, c: PlanPoint) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsCross(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

export function isSimplePolygon(points: PlanPoint[]) {
  if (points.length < 3) return false;
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    if (Math.hypot(points[firstNext].x - points[first].x, points[firstNext].z - points[first].z) < 1) return false;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent = first === second || firstNext === second || secondNext === first;
      if (!adjacent && segmentsCross(points[first], points[firstNext], points[second], points[secondNext])) return false;
    }
  }
  return true;
}

function canNestSeatUnderWorktop(a: FurnitureItem, b: FurnitureItem) {
  const worktopIds = new Set(["desk", "vanity"]);
  const seatIds = new Set(["desk-chair", "stool"]);
  const worktop = worktopIds.has(a.assetId) ? a : worktopIds.has(b.assetId) ? b : null;
  const seat = seatIds.has(a.assetId) ? a : seatIds.has(b.assetId) ? b : null;
  if (!worktop || !seat) return false;
  const worktopRect = itemRect(worktop);
  const seatRect = itemRect(seat);
  const overlapWidth = Math.max(0, Math.min(worktopRect.x + worktopRect.width, seatRect.x + seatRect.width) - Math.max(worktopRect.x, seatRect.x));
  const overlapDepth = Math.max(0, Math.min(worktopRect.z + worktopRect.depth, seatRect.z + seatRect.depth) - Math.max(worktopRect.z, seatRect.z));
  const overlapArea = overlapWidth * overlapDepth;
  return overlapArea > 0 && overlapArea <= seatRect.width * seatRect.depth * 0.45;
}

export function bayWindowRect(room: RoomLayout): PlanRect | null {
  const bay = room.bayWindow;
  if (!bay) return null;
  return bay.side === "bottom"
    ? { x: bay.start, z: room.dimensions.depth, width: bay.length, depth: bay.depth }
    : { x: room.dimensions.width, z: bay.start, width: bay.depth, depth: bay.length };
}

export function collides(item: FurnitureItem, room: RoomLayout) {
  if (item.wallMounted) return false;
  const rect = itemRect(item);
  const polygon = itemCorners(item);
  const supportedByBay = item.supportSurface === "bay-window";
  const bayRect = bayWindowRect(room);
  if (supportedByBay ? !bayRect || !polygonInsideOutline(polygon, rectPolygon(bayRect)) : !polygonInsideOutline(polygon, room.outline)) return true;
  if (room.keepOutZones.some((zone) => polygonsOverlap(polygon, rectPolygon(zone)))) return true;
  return room.items.some((other) => {
    if (other.id === item.id || other.wallMounted) return false;
    const otherRect = itemRect(other);
    return (polygonsOverlap(polygon, itemCorners(other)) && !canNestSeatUnderWorktop(item, other)) ||
      (clearanceRect(other) ? rectsOverlap(rect, clearanceRect(other)!) : false) ||
      (clearanceRect(item) ? rectsOverlap(clearanceRect(item)!, otherRect) : false);
  });
}
