import { BUILTIN_FURNITURE_COUNT, FURNITURE_ASSET_REGISTRY } from "../assets/registry";
import type { FurnitureAssetManifestV3, FurnitureAssetStatus } from "../assets/manifest-types";

export type FurnitureReviewManifest = FurnitureAssetManifestV3;
export interface FurnitureReviewAsset { manifest: FurnitureReviewManifest; effectiveStatus: FurnitureAssetStatus; requiresReapproval: boolean; readinessIssues: string[]; factoryHash: string; repositoryWritable: boolean }

export const FURNITURE_REVIEW_ASSETS: FurnitureReviewAsset[] = FURNITURE_ASSET_REGISTRY.map((entry) => ({
  manifest: entry.manifest,
  effectiveStatus: entry.effectiveStatus,
  requiresReapproval: entry.requiresReapproval,
  readinessIssues: entry.readinessIssues,
  factoryHash: entry.contractHash,
  repositoryWritable: entry.manifest.lifecyclePolicy === "user-reviewed",
}));
export { BUILTIN_FURNITURE_COUNT };
export function findFurnitureReviewAsset(assetId: string) { return FURNITURE_REVIEW_ASSETS.find((asset) => asset.manifest.id === assetId); }
