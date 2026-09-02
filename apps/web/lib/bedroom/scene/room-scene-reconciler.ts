import type { FurnitureItem } from "../types";
export function stableSerialize(value: unknown) { return JSON.stringify(value, Object.keys(value as object).sort()); }
export function furnitureRuntimeKey(item: FurnitureItem, assetRevision: string) { return stableSerialize({ assetId: item.assetId, assetRevision, size: item.size, parameterValues: item.parameterValues, stateId: item.stateId, color: item.color }); }
export function furnitureTransformChanged(left: FurnitureItem, right: FurnitureItem) { return left.position.x !== right.position.x || left.position.z !== right.position.z || left.rotation !== right.rotation || left.baseHeight !== right.baseHeight; }
