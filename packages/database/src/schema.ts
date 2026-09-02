import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const assetStatus = pgEnum("asset_status", ["draft", "candidate", "approved", "archived"]);
export const assetScope = pgEnum("asset_scope", ["builtin", "user-generated"]);
export const lifecyclePolicy = pgEnum("lifecycle_policy", ["repository-trusted", "user-reviewed"]);
export const assetExecutionPolicy = pgEnum("asset_execution_policy", ["repository-bundled", "platform-built-esm", "quarantined-source"]);
export const agentRunStatus = pgEnum("agent_run_status", ["queued", "preparing", "running", "awaiting_user", "awaiting_approval", "validating", "succeeded", "failed", "cancelled", "timed_out"]);
export const agentRequestKind = pgEnum("agent_request_kind", ["user_input", "approval"]);
export const agentRequestStatus = pgEnum("agent_request_status", ["pending", "resolved", "expired", "cancelled"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const identities = pgTable("identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  issuer: text("issuer").notNull(),
  subject: text("subject").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("identities_issuer_subject_uq").on(table.issuer, table.subject)]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ...timestamps,
}, (table) => [index("workspaces_tenant_idx").on(table.tenantId)]);

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })]);

export const storageObjects = pgTable("storage_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  mediaType: text("media_type").notNull(),
  retentionPolicy: text("retention_policy").notNull().default("standard"),
  immutable: boolean("immutable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("storage_objects_tenant_key_uq").on(table.tenantId, table.objectKey),
  uniqueIndex("storage_objects_tenant_hash_uq").on(table.tenantId, table.sha256, table.objectKey),
]);

export const layouts = pgTable("layouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  currentVersionId: uuid("current_version_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("layouts_workspace_idx").on(table.tenantId, table.workspaceId)]);

export const layoutVersions = pgTable("layout_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  layoutId: uuid("layout_id").notNull().references(() => layouts.id, { onDelete: "cascade" }),
  parentVersionId: uuid("parent_version_id"),
  objectId: uuid("object_id").references(() => storageObjects.id, { onDelete: "restrict" }),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  source: text("source").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("layout_versions_layout_idx").on(table.layoutId, table.createdAt)]);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assetKey: text("asset_key").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  scope: assetScope("scope").notNull(),
  lifecyclePolicy: lifecyclePolicy("lifecycle_policy").notNull(),
  executionPolicy: assetExecutionPolicy("execution_policy").notNull(),
  currentRevisionId: uuid("current_revision_id"),
  publishedRevisionId: uuid("published_revision_id"),
  ...timestamps,
}, (table) => [uniqueIndex("assets_workspace_key_uq").on(table.workspaceId, table.assetKey)]);

export const assetRevisions = pgTable("asset_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  parentRevisionId: uuid("parent_revision_id"),
  manifestSchemaVersion: integer("manifest_schema_version").notNull().default(3),
  runtimeAbiVersion: integer("runtime_abi_version").notNull().default(1),
  rawStatus: assetStatus("raw_status").notNull(),
  effectiveStatus: assetStatus("effective_status").notNull(),
  contractHash: text("contract_hash").notNull(),
  artifactSetHash: text("artifact_set_hash").notNull(),
  packageRootKey: text("package_root_key").notNull(),
  packageIndexKey: text("package_index_key").notNull(),
  packageIndexHash: text("package_index_hash").notNull(),
  sourceAgentRunId: uuid("source_agent_run_id"),
  immutable: boolean("immutable").notNull().default(true),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("asset_revisions_asset_idx").on(table.assetId, table.createdAt)]);

export const assetArtifacts = pgTable("asset_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").notNull().references(() => assetRevisions.id, { onDelete: "cascade" }),
  objectId: uuid("object_id").references(() => storageObjects.id, { onDelete: "restrict" }),
  logicalPath: text("logical_path").notNull(),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  mediaType: text("media_type").notNull(),
  kind: text("kind").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("asset_artifacts_revision_idx").on(table.revisionId, table.kind), uniqueIndex("asset_artifacts_revision_path_uq").on(table.revisionId, table.logicalPath)]);

export const assetReviews = pgTable("asset_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").notNull().references(() => assetRevisions.id, { onDelete: "cascade" }),
  reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  contractHash: text("contract_hash").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentThreads = pgTable("agent_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  codexThreadId: text("codex_thread_id"),
  ...timestamps,
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  threadId: uuid("thread_id").notNull().references(() => agentThreads.id, { onDelete: "cascade" }),
  intent: text("intent").notNull(),
  status: agentRunStatus("status").notNull().default("queued"),
  baseRevisionId: uuid("base_revision_id"),
  resultRevisionId: uuid("result_revision_id"),
  runnerId: text("runner_id"),
  skillVersion: text("skill_version"),
  codexVersion: text("codex_version"),
  runtimeVersions: jsonb("runtime_versions").notNull().default(sql`'{}'::jsonb`),
  idempotencyKey: text("idempotency_key").notNull(),
  nextEventSequence: integer("next_event_sequence").notNull().default(1),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  failureSummary: text("failure_summary"),
  ...timestamps,
}, (table) => [
  uniqueIndex("agent_runs_tenant_idempotency_uq").on(table.tenantId, table.idempotencyKey),
  index("agent_runs_status_idx").on(table.status, table.createdAt),
]);

export const agentEvents = pgTable("agent_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("agent_events_run_sequence_uq").on(table.runId, table.sequence)]);

export const agentRequests = pgTable("agent_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  kind: agentRequestKind("kind").notNull(),
  status: agentRequestStatus("status").notNull().default("pending"),
  prompt: text("prompt").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  response: jsonb("response"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("agent_requests_pending_idx").on(table.runId, table.status)]);

export const agentUsage = pgTable("agent_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code").notNull(),
  response: jsonb("response").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("idempotency_tenant_scope_key_uq").on(table.tenantId, table.scope, table.key)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id"),
  requestId: text("request_id"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_events_tenant_created_idx").on(table.tenantId, table.createdAt)]);

export const layoutRelations = relations(layouts, ({ many }) => ({ versions: many(layoutVersions) }));
export const assetRelations = relations(assets, ({ many }) => ({ revisions: many(assetRevisions), reviews: many(assetReviews) }));
export const agentRunRelations = relations(agentRuns, ({ many }) => ({ events: many(agentEvents), requests: many(agentRequests), usage: many(agentUsage) }));
