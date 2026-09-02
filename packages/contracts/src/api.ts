import { z } from "zod";
import { layoutSnapshotV2Schema } from "./layout.js";

export const uuidSchema = z.string().uuid();
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const createLayoutRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  snapshot: layoutSnapshotV2Schema,
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const createLayoutVersionRequestSchema = z.object({
  parentVersionId: uuidSchema,
  snapshot: layoutSnapshotV2Schema,
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const createLayoutCopyRequestSchema = z.object({
  sourceVersionId: uuidSchema,
  name: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const assetScopeSchema = z.enum(["builtin", "user-generated"]);
export const assetLifecyclePolicySchema = z.enum(["repository-trusted", "user-reviewed"]);
export const furnitureAssetStatusSchema = z.enum(["draft", "candidate", "approved", "archived"]);

export const createAssetRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(["bed", "storage", "desk", "seat"]),
  assetScope: assetScopeSchema,
  lifecyclePolicy: assetLifecyclePolicySchema,
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const createAssetRevisionRequestSchema = z.object({
  parentRevisionId: uuidSchema.nullable(),
  manifest: z.record(z.unknown()),
  contractHash: sha256Schema,
  rawStatus: furnitureAssetStatusSchema,
  objectKeys: z.object({
    manifest: z.string().min(1),
    runtime: z.string().min(1),
    model: z.string().min(1).nullable(),
  }).strict(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const approveAssetRequestSchema = z.object({
  revisionId: uuidSchema,
  contractHash: sha256Schema,
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(10_000).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
