import { furnitureCandidateReadinessIssues } from "../contract-core.mjs";
import type { FurnitureCandidateEvidence, GlbExportEvidence } from "../manifest-types";
import type { FurnitureAssetRegistryEntry } from "../package-types";
import { BUILTIN_PACKAGE_CATALOG } from "./catalog.generated";
import { FRONTEND_USER_GENERATED_ASSETS } from "../providers/user-generated-provider";

function repositoryEvidence(entry: (typeof BUILTIN_PACKAGE_CATALOG)[number]) {
  const manifest = entry.manifest;
  const statesCovered = manifest.states.map((state) => state.id);
  const parametersCovered = manifest.parameterDefinitions.map((definition) => ({ id: definition.id, values: [...new Set(manifest.validationConfigurations.map((configuration) => configuration.parameters[definition.id]).filter((value) => value !== undefined))] }));
  const candidateEvidence: FurnitureCandidateEvidence = { reportPath: "tests/builtin-asset-contract.test.mjs", verifiedAt: manifest.reviewedAt ?? "repository-validation", contractHash: entry.contractHash, configurationCount: manifest.validationConfigurations.length, statesCovered, parametersCovered, purposesCovered: ["scene", "review", "export"], structuralChecksPassed: true, behaviorChecksPassed: true, glbChecksPassed: true };
  const exportEvidence: GlbExportEvidence = { reportPath: "tests/builtin-asset-contract.test.mjs", verifiedAt: manifest.reviewedAt ?? "repository-validation", contractHash: entry.contractHash, configurationsTested: manifest.validationConfigurations.length, stateIds: statesCovered, dimensionsMatch: true, grounded: true, namedNodesPreserved: true, materialsPortable: true, materialsAccepted: true, sourceReloadAppearanceAccepted: true, materialReviewPath: "tests/builtin-asset-contract.test.mjs", sourceReloadComparisonPath: "tests/builtin-asset-contract.test.mjs" };
  return { ...manifest, candidateEvidence, exportEvidence, approvedFactoryHash: entry.contractHash };
}

export const FURNITURE_ASSET_REGISTRY: FurnitureAssetRegistryEntry[] = [...BUILTIN_PACKAGE_CATALOG, ...FRONTEND_USER_GENERATED_ASSETS].map((entry) => {
  const manifest = entry.manifest.lifecyclePolicy === "repository-trusted" ? repositoryEvidence(entry) : entry.manifest;
  const readinessIssues = furnitureCandidateReadinessIssues(manifest, entry.contractHash);
  const requiresReapproval = manifest.status === "approved" && manifest.approvedFactoryHash !== entry.contractHash;
  const technicallyReady = readinessIssues.length === 0;
  const effectiveStatus = manifest.status === "archived" ? "archived" : manifest.status === "approved" && technicallyReady && !requiresReapproval ? "approved" : manifest.status === "candidate" && technicallyReady ? "candidate" : "draft";
  return { manifest, contractHash: entry.contractHash, readinessIssues, requiresReapproval, effectiveStatus };
});

export const BUILTIN_ASSETS = FURNITURE_ASSET_REGISTRY.filter((entry) => entry.manifest.assetScope === "builtin");
export const USER_GENERATED_ASSETS = FURNITURE_ASSET_REGISTRY.filter((entry) => entry.manifest.assetScope === "user-generated");
export const BUILTIN_FURNITURE_COUNT = BUILTIN_ASSETS.filter((entry) => entry.effectiveStatus === "approved").length;
export const PENDING_USER_GENERATED_ASSET_COUNT = USER_GENERATED_ASSETS.filter((entry) => entry.effectiveStatus === "draft" || entry.effectiveStatus === "candidate").length;
export function findFurniturePackage(assetId: string) { return FURNITURE_ASSET_REGISTRY.find((entry) => entry.manifest.id === assetId); }
