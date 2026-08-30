import { GENERATED_ASSET_MODULES } from "./registry.generated";
import type { GeneratedAssetDescriptor } from "./types";

export const GENERATED_ASSETS: GeneratedAssetDescriptor[] = GENERATED_ASSET_MODULES.map((asset) => {
  const requiresReapproval = asset.manifest.status === "approved" &&
    asset.manifest.approvedFactoryHash !== asset.factoryHash;
  return {
    ...asset,
    requiresReapproval,
    effectiveStatus: requiresReapproval ? "candidate" : asset.manifest.status,
  };
});

export const APPROVED_GENERATED_ASSETS = GENERATED_ASSETS.filter((asset) => asset.effectiveStatus === "approved");
export const PENDING_GENERATED_ASSET_COUNT = GENERATED_ASSETS.filter((asset) => asset.effectiveStatus === "candidate").length;

export function findGeneratedAsset(assetId: string) {
  return GENERATED_ASSETS.find((asset) => asset.manifest.id === assetId);
}
