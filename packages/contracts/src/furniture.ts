import type { Dimensions3D, FurnitureConfiguration, FurnitureDimensionConstraints, FurnitureParameterDefinition, FurnitureStateDefinition } from "./bedroom.js";

export type FurnitureAssetStatus = "draft" | "candidate" | "approved" | "archived";
export type FurnitureAssetCategory = "bed" | "storage" | "desk" | "seat";
export type DimensionSourceType = "user-provided" | "product-spec" | "room-measurement" | "other-context";
export type ReviewViewId = "reference" | "front" | "right" | "rear" | "left" | "top" | "perspective";
export type FurnitureLifecyclePolicy = "repository-trusted" | "user-reviewed";
export type FurnitureAssetScope = "builtin" | "user-generated";
export type FurnitureAssetOrigin = {
  method: "img2threejs" | "existing-procedural" | "manual-procedural" | "hybrid";
  sourceUrl?: string;
  sourceRevision?: string;
};
export type FurnitureFootprintPolicy = { type: "configuration-dimensions" } | { type: "state-overrides"; states: Record<string, { width: number; depth: number; offsetX?: number; offsetZ?: number }> };
export type FurnitureClearancePolicy = { type: "none" } | { type: "front"; depth: number | "half-width"; label: string; activeStateIds?: string[] };
export interface DimensionSource { type: DimensionSourceType; note: string }
export interface QualityEvidence { kind: "reference" | "comparison" | "review" | "source" | "instruction"; label: string; path: string }
export interface GlbExportEvidence { reportPath: string; verifiedAt: string; contractHash?: string; configurationsTested?: number; stateIds?: string[]; dimensionsMatch: boolean; grounded: boolean; namedNodesPreserved?: boolean; materialsPortable?: boolean; materialsAccepted: boolean; sourceReloadAppearanceAccepted?: boolean; materialReviewPath?: string; sourceReloadComparisonPath?: string }
export interface FurnitureComponentDefinition { id: string; label: string; nodeNames: string[]; movable: boolean; pivotNode?: string }
export interface FurnitureCapabilityBinding { capabilityId: string; componentIds: string[]; effect: "geometry" | "material" | "visibility" | "transform" | "behavior" | "dimensions"; activeStateIds?: string[] }
export interface FurnitureValidationConfiguration extends FurnitureConfiguration { id: string; compareAgainst?: string; testsCapability?: string; importantCombination?: boolean }
export interface FurnitureDesignOverride { componentId: string; property: string; instruction: string; source: "user"; targetValue?: string | number | boolean }
export interface FurnitureCandidateEvidence { reportPath: string; verifiedAt: string; contractHash: string; configurationCount: number; statesCovered: string[]; parametersCovered: Array<{ id: string; values: Array<string | number | boolean> }>; purposesCovered: Array<"scene" | "review" | "export">; structuralChecksPassed: boolean; behaviorChecksPassed: boolean; glbChecksPassed: boolean }

export interface FurnitureAssetManifestV3 {
  schemaVersion: 3;
  assetScope: FurnitureAssetScope;
  id: string;
  name: string;
  category: FurnitureAssetCategory;
  status: FurnitureAssetStatus;
  origin: FurnitureAssetOrigin;
  lifecyclePolicy: FurnitureLifecyclePolicy;
  appearance: { defaultColor: string };
  dimensions: Dimensions3D | null;
  defaultConfiguration: FurnitureConfiguration | null;
  dimensionConstraints?: FurnitureDimensionConstraints;
  parameterDefinitions: FurnitureParameterDefinition[];
  states: FurnitureStateDefinition[];
  components: FurnitureComponentDefinition[];
  capabilityBindings: FurnitureCapabilityBinding[];
  validationConfigurations: FurnitureValidationConfiguration[];
  designOverrides: FurnitureDesignOverride[];
  candidateEvidence: FurnitureCandidateEvidence | null;
  footprintPolicy: FurnitureFootprintPolicy;
  clearancePolicy: FurnitureClearancePolicy;
  exportCapabilities: { formats: Array<"glb">; materialPolicy: "portable-pbr"; preserveComponentNodes: boolean };
  exportReady: boolean;
  exportIssue?: string;
  exportEvidence: GlbExportEvidence | null;
  dimensionSource: DimensionSource | null;
  qualityEvidence: QualityEvidence[];
  reviewViews: ReviewViewId[];
  referenceImage: string | null;
  approvedFactoryHash: string | null;
  reviewedAt: string | null;
  reconstruction?: {
    profile: "img2threejs-generic" | "procedural-existing" | "manual-revision";
    specFile?: string;
    stateFile?: string;
    referenceFiles: string[];
  } | null;
}
