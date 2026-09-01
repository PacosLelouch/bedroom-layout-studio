import type * as THREE from "three";
import type { FurnitureConfiguration } from "../types";
import type { DimensionSourceType, FurnitureAssetManifestV3, FurnitureAssetStatus } from "./manifest-types";

export interface FurnitureSourceModelOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  qualityPriority?: "reference-fidelity" | "balanced";
  [key: string]: unknown;
}

export type FurnitureSourceModelFactory = (options?: FurnitureSourceModelOptions) => THREE.Group;
export type FurniturePackageRuntimeFactory = (configuration: FurnitureConfiguration, context?: { purpose: "scene" | "review" | "export" }) => THREE.Group;
export interface FurnitureAssetCatalogEntry { manifest: FurnitureAssetManifestV3; contractHash: string }
export interface FurnitureAssetRegistryEntry extends FurnitureAssetCatalogEntry { effectiveStatus: FurnitureAssetStatus; requiresReapproval: boolean; readinessIssues: string[] }
export type FurnitureSourceModelLoader = () => Promise<{ createSourceModel: FurnitureSourceModelFactory }>;

export interface ModelFitReport {
  nativeDimensions: import("../types").Dimensions3D;
  renderedDimensions: import("../types").Dimensions3D;
  axisScale: import("../types").Dimensions3D;
  aspectDeviation: number;
  aspectCompatible: boolean;
  grounded: boolean;
}

export const DIMENSION_SOURCE_LABELS: Record<DimensionSourceType, string> = {
  "user-provided": "用户明确输入",
  "product-spec": "商品规格",
  "room-measurement": "房间测量",
  "other-context": "其他可靠上下文",
};
