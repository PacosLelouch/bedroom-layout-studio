import type { FurnitureAssetDescriptor } from "./contracts";
import { FURNITURE_ASSET_REGISTRY } from "./registry";

export const ASSET_CATALOG: FurnitureAssetDescriptor[] = FURNITURE_ASSET_REGISTRY.flatMap((entry) => {
  const manifest = entry.manifest;
  if (entry.effectiveStatus !== "approved" || !manifest.dimensions || !manifest.defaultConfiguration) return [];
  return [{ ...manifest, assetRevision: entry.contractHash, dimensions: manifest.dimensions, defaultConfiguration: manifest.defaultConfiguration }];
});
export function listFurnitureAssets() { return ASSET_CATALOG; }
export function findFurnitureAsset(assetId: string) { return ASSET_CATALOG.find((asset) => asset.id === assetId); }
