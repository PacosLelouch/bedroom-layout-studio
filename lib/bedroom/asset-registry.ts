/**
 * Backward-compatible pure-data facade. Runtime factories intentionally live
 * behind lib/bedroom/assets/runtime-cache.ts dynamic imports.
 */
export {
  ASSET_CATALOG,
  listFurnitureAssets,
  findFurnitureAsset,
  catalogItemToFurniture,
  configurationIssues,
  itemConfiguration,
  nextFurnitureState,
} from "./assets";
export type { FurnitureAssetDescriptor as FurnitureAssetDefinition } from "./assets";
