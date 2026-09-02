import type { FurnitureConfiguration, FurnitureItem, RoomLayout } from "../types";
import type { FurnitureAssetDescriptor } from "./contracts";
import { ASSET_CATALOG, findFurnitureAsset } from "./catalog";
import { furnitureItemConfiguration } from "./footprint";

export const itemConfiguration = furnitureItemConfiguration;

export function nextFurnitureState(item: FurnitureItem): string | null {
  const states = findFurnitureAsset(item.assetId)?.states ?? [];
  if (!states.length) return null;
  const current = states.findIndex((state) => state.id === item.stateId);
  return states[(current + 1 + states.length) % states.length].id;
}

export function configurationIssues(asset: FurnitureAssetDescriptor, configuration: FurnitureConfiguration): string[] {
  const issues: string[] = [];
  for (const axis of ["width", "depth", "height"] as const) {
    const value = configuration.dimensions[axis]; const constraint = asset.dimensionConstraints?.[axis];
    if (!Number.isFinite(value) || value <= 0) issues.push(`${axis} 必须是正数`);
    if (constraint?.min !== undefined && value < constraint.min) issues.push(`${axis} 小于 ${constraint.min} mm`);
    if (constraint?.max !== undefined && value > constraint.max) issues.push(`${axis} 大于 ${constraint.max} mm`);
  }
  if (asset.states.length && !asset.states.some((state) => state.id === configuration.stateId)) issues.push("交互状态无效");
  for (const definition of asset.parameterDefinitions) {
    const value = configuration.parameters[definition.id] ?? definition.defaultValue;
    if (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) issues.push(`${definition.label} 必须是数字`);
    else if (definition.type === "boolean" && typeof value !== "boolean") issues.push(`${definition.label} 必须是开关值`);
    else if (definition.type === "color" && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))) issues.push(`${definition.label} 颜色无效`);
    else if (definition.type === "enum" && !definition.options.some((option) => option.value === value)) issues.push(`${definition.label} 选项无效`);
  }
  return issues;
}

export function catalogItemToFurniture(assetId: string, room: RoomLayout): FurnitureItem {
  const asset = findFurnitureAsset(assetId) ?? ASSET_CATALOG[0]; const size = asset.defaultConfiguration.dimensions; const useBaySill = asset.id === "bay-cabinet" && room.bayWindow;
  const position = useBaySill ? room.bayWindow!.side === "bottom" ? { x: room.bayWindow!.start + room.bayWindow!.length / 2, z: room.dimensions.depth + size.depth / 2 } : { x: room.dimensions.width + size.depth / 2, z: room.bayWindow!.start + room.bayWindow!.length / 2 } : { x: room.dimensions.width / 2, z: room.dimensions.depth / 2 };
  const clearanceDepth = asset.clearancePolicy.type === "front" ? asset.clearancePolicy.depth === "half-width" ? size.width / 2 : asset.clearancePolicy.depth : undefined;
  return { id: `${asset.id}-${Date.now()}`, assetId: asset.id, name: asset.name, position, rotation: useBaySill && room.bayWindow!.side === "right" ? 90 : 0, size: { ...size }, color: asset.appearance.defaultColor, parameterValues: { ...asset.defaultConfiguration.parameters }, stateId: asset.defaultConfiguration.stateId, supportSurface: useBaySill ? "bay-window" : "floor", baseHeight: useBaySill ? room.bayWindow!.sillHeight : 0, clearanceDepth, clearanceLabel: clearanceDepth === undefined || asset.clearancePolicy.type !== "front" ? undefined : `${asset.clearancePolicy.label} ${clearanceDepth}` };
}
