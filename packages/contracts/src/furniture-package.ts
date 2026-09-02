import { z } from "zod";
import type { FurnitureAssetManifestV3 } from "./furniture.js";

export const FURNITURE_RUNTIME_ABI_VERSION = 1 as const;
export const furnitureExecutionPolicySchema = z.enum(["repository-bundled", "platform-built-esm", "quarantined-source"]);
export type FurnitureExecutionPolicy = z.infer<typeof furnitureExecutionPolicySchema>;

export const furniturePackageObjectSchema = z.object({
  logicalPath: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,511}$/),
  objectKey: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,1023}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  mediaType: z.string().min(1).max(200),
}).strict();

export const furniturePackageIndexSchema = z.object({
  schemaVersion: z.literal(1),
  assetKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  revisionId: z.string().uuid(),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  artifactSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  runtimeAbiVersion: z.literal(FURNITURE_RUNTIME_ABI_VERSION),
  entrypoints: z.object({
    manifest: z.literal("contract/asset.json"),
    runtime: z.literal("runtime/runtime.mjs"),
  }).strict(),
  objects: z.array(furniturePackageObjectSchema).min(2),
}).strict().superRefine((value, context) => {
  const paths = new Set<string>();
  const keys = new Set<string>();
  for (const [index, object] of value.objects.entries()) {
    if (paths.has(object.logicalPath)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["objects", index, "logicalPath"], message: "logicalPath must be unique" });
    if (keys.has(object.objectKey)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["objects", index, "objectKey"], message: "objectKey must be unique" });
    paths.add(object.logicalPath);
    keys.add(object.objectKey);
  }
  for (const entrypoint of Object.values(value.entrypoints)) {
    if (!paths.has(entrypoint)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["entrypoints"], message: `missing entrypoint object ${entrypoint}` });
  }
});

export type FurniturePackageObject = z.infer<typeof furniturePackageObjectSchema>;
export type FurniturePackageIndex = z.infer<typeof furniturePackageIndexSchema>;

export interface FurnitureRuntimeModule {
  runtimeAbiVersion?: 1;
  createFurnitureModel: (...args: unknown[]) => unknown;
  updateFurnitureModel?: (...args: unknown[]) => void;
  disposeFurnitureModel?: (...args: unknown[]) => void;
}

export interface PublishedFurnitureCatalogEntry {
  assetId: string;
  assetKey: string;
  revisionId: string;
  contractHash: string;
  artifactSetHash: string;
  runtimeAbiVersion: 1;
  manifest: FurnitureAssetManifestV3;
  runtimeUrl: string;
  resources: Record<string, string>;
}
