import type * as THREE from "three";
import type { Dimensions3D } from "../types";

export type GeneratedAssetStatus = "candidate" | "approved" | "archived";
export type GeneratedAssetCategory = "bed" | "storage" | "desk" | "seat";
export type DimensionSourceType =
  | "user-provided"
  | "product-spec"
  | "room-measurement"
  | "other-context";

export type ReviewViewId = "reference" | "front" | "right" | "rear" | "left" | "top" | "perspective";

export interface DimensionSource {
  type: DimensionSourceType;
  note: string;
}

export interface QualityEvidence {
  kind: "reference" | "comparison" | "review" | "source";
  label: string;
  path: string;
}

export interface GeneratedAssetManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  category: GeneratedAssetCategory;
  status: GeneratedAssetStatus;
  color: string;
  factoryFile: string;
  factoryExport: string;
  referenceImage: string;
  sourceUrl?: string;
  sourceRevision?: string;
  dimensions: Dimensions3D | null;
  dimensionSource: DimensionSource | null;
  qualityEvidence: QualityEvidence[];
  reviewViews: ReviewViewId[];
  approvedFactoryHash: string | null;
  reviewedAt: string | null;
}

export interface GeneratedModelOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  qualityPriority?: "reference-fidelity" | "balanced";
  [key: string]: unknown;
}

export type GeneratedModelFactory = (options?: GeneratedModelOptions) => THREE.Group;

export interface GeneratedAssetModule {
  manifest: GeneratedAssetManifest;
  factory: GeneratedModelFactory;
  factoryHash: string;
}

export interface GeneratedAssetDescriptor extends GeneratedAssetModule {
  effectiveStatus: GeneratedAssetStatus;
  requiresReapproval: boolean;
}

export interface ModelFitReport {
  nativeDimensions: Dimensions3D;
  renderedDimensions: Dimensions3D;
  axisScale: Dimensions3D;
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
