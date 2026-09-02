import type { FurnitureAssetDescriptor } from "./contracts";
import { FURNITURE_ASSET_REGISTRY } from "./registry";
import type { PublishedFurnitureCatalogEntry } from "@bedroom/contracts";
import { registerRemoteFurnitureRuntime } from "./runtime-cache";

export const ASSET_CATALOG: FurnitureAssetDescriptor[] = FURNITURE_ASSET_REGISTRY.flatMap((entry) => {
  const manifest = entry.manifest;
  if (entry.effectiveStatus !== "approved" || !manifest.dimensions || !manifest.defaultConfiguration) return [];
  return [{ ...manifest, assetRevision: entry.contractHash, dimensions: manifest.dimensions, defaultConfiguration: manifest.defaultConfiguration }];
});
export function listFurnitureAssets() { return ASSET_CATALOG; }
export function findFurnitureAsset(assetId: string) { return ASSET_CATALOG.find((asset) => asset.id === assetId); }

export function installPublishedFurnitureCatalog(entries: PublishedFurnitureCatalogEntry[]) {
  for (const entry of entries) {
    if (!entry.manifest.dimensions || !entry.manifest.defaultConfiguration || entry.runtimeAbiVersion !== 1) continue;
    const descriptor: FurnitureAssetDescriptor = { ...entry.manifest, status: "approved", assetRevision: entry.artifactSetHash, dimensions: entry.manifest.dimensions, defaultConfiguration: entry.manifest.defaultConfiguration };
    const index = ASSET_CATALOG.findIndex((asset) => asset.id === descriptor.id);
    if (index >= 0) ASSET_CATALOG.splice(index, 1, descriptor); else ASSET_CATALOG.push(descriptor);
    registerRemoteFurnitureRuntime(descriptor.id, entry.revisionId, entry.runtimeUrl, entry.resources);
  }
  return [...ASSET_CATALOG];
}
