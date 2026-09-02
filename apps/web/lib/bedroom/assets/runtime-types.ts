import type * as THREE from "three";
import type { FurnitureConfiguration } from "../types";

export type FurnitureRuntimePurpose = "scene" | "review" | "export";
export type FurnitureRuntimeFactory = (
  configuration: FurnitureConfiguration,
  context?: { purpose: FurnitureRuntimePurpose; runtimeAbiVersion?: 1; three?: typeof THREE; resolveResource?: (path: string) => string },
) => THREE.Group;
export type FurnitureRuntimeLoader = () => Promise<{ createFurnitureModel: FurnitureRuntimeFactory }>;
