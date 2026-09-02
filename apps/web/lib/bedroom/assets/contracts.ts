import type { FurnitureConfiguration } from "../types";
import type { FurnitureAssetManifestV3 } from "./manifest-types";

export type { FurnitureAssetOrigin, FurnitureAssetScope, FurnitureClearancePolicy, FurnitureFootprintPolicy, FurnitureLifecyclePolicy } from "./manifest-types";

export interface FurnitureAssetDescriptor extends FurnitureAssetManifestV3 {
  assetRevision: string;
  dimensions: FurnitureConfiguration["dimensions"];
  defaultConfiguration: FurnitureConfiguration;
}
