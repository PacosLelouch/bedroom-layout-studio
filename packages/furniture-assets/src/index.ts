export type * from "@bedroom/contracts/furniture";

export {
  canonicalizeFurnitureContract,
  furnitureCapabilityContract,
  furnitureCandidateReadinessIssues,
  validateFurnitureAssetManifest,
} from "./contract-core.mjs";

export const repositoryFurnitureAssetRoot = "apps/web/lib/bedroom/assets";
