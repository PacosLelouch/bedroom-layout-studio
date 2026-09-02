import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AgentRunDto, AgentRunIntent, AgentRunStatus, PublicAgentEvent, PublicAgentEventType } from "@bedroom/contracts";
import type { BedroomDatabase } from "@bedroom/database";
import { databaseSchema as s } from "@bedroom/database";
import type { RequestIdentity } from "./auth.js";
import type { AssetRecord, AssetRevisionRecord, ControlPlaneRepository, LayoutRecord, LayoutVersionRecord } from "./repository.js";
import { requestHash } from "./repository.js";
import { developmentIdentity } from "./auth.js";

export async function ensureDevelopmentIdentity(db: BedroomDatabase) {
  await db.transaction(async (tx) => {
    await tx.insert(s.users).values({ id: developmentIdentity.userId, displayName: "Development User" }).onConflictDoNothing();
    await tx.insert(s.tenants).values({ id: developmentIdentity.tenantId, name: "Development Tenant" }).onConflictDoNothing();
    await tx.insert(s.workspaces).values({ id: developmentIdentity.workspaceId, tenantId: developmentIdentity.tenantId, name: "Development Workspace" }).onConflictDoNothing();
    await tx.insert(s.workspaceMembers).values({ workspaceId: developmentIdentity.workspaceId, userId: developmentIdentity.userId, role: "owner" }).onConflictDoNothing();
  });
}

export function createPostgresIdentityMapper(db: BedroomDatabase) {
  return async (input: { issuer: string; subject: string; tenantId: string; workspaceId: string; displayName?: string }) => db.transaction(async (tx) => {
    const [workspace] = await tx.select().from(s.workspaces).where(and(eq(s.workspaces.id, input.workspaceId), eq(s.workspaces.tenantId, input.tenantId))).limit(1);
    if (!workspace) throw Object.assign(new Error("The requested tenant workspace is not provisioned."), { statusCode: 403, code: "workspace_forbidden" });
    const [existing] = await tx.select({ userId: s.identities.userId }).from(s.identities).where(and(eq(s.identities.issuer, input.issuer), eq(s.identities.subject, input.subject))).limit(1);
    const userId = existing?.userId;
    if (!userId) throw Object.assign(new Error("The external identity has not been provisioned."), { statusCode: 403, code: "identity_not_provisioned" });
    const [membership] = await tx.select().from(s.workspaceMembers).where(and(eq(s.workspaceMembers.workspaceId, input.workspaceId), eq(s.workspaceMembers.userId, userId))).limit(1);
    if (!membership) throw Object.assign(new Error("The user is not a member of this workspace."), { statusCode: 403, code: "workspace_forbidden" });
    return userId;
  });
}

export class PostgresControlPlaneRepository implements ControlPlaneRepository {
  readonly #events = new EventEmitter();
  constructor(private readonly db: BedroomDatabase) {}

  async claimIdempotency(identity: RequestIdentity, scope: string, key: string, request: unknown) {
    const qualifiedScope = `${identity.workspaceId}:action:${scope}`;
    const hash = requestHash(request);
    return this.db.transaction(async (tx) => {
      await tx.delete(s.idempotencyKeys).where(and(
        eq(s.idempotencyKeys.tenantId, identity.tenantId),
        eq(s.idempotencyKeys.scope, qualifiedScope),
        eq(s.idempotencyKeys.key, key),
        sql`${s.idempotencyKeys.expiresAt} <= now()`,
      ));
      const created = await tx.insert(s.idempotencyKeys).values({
        tenantId: identity.tenantId,
        scope: qualifiedScope,
        key,
        requestHash: hash,
        statusCode: 202,
        response: { accepted: true },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).onConflictDoNothing().returning({ id: s.idempotencyKeys.id });
      if (created.length) return true;
      const [previous] = await tx.select({ requestHash: s.idempotencyKeys.requestHash }).from(s.idempotencyKeys).where(and(
        eq(s.idempotencyKeys.tenantId, identity.tenantId),
        eq(s.idempotencyKeys.scope, qualifiedScope),
        eq(s.idempotencyKeys.key, key),
      )).limit(1);
      if (!previous || previous.requestHash !== hash) throw conflict("idempotency_key_reused", "The idempotency key was already used with a different request.");
      return false;
    });
  }

  async listLayouts(identity: RequestIdentity): Promise<LayoutRecord[]> {
    const rows = await this.db.select().from(s.layouts).where(and(eq(s.layouts.tenantId, identity.tenantId), eq(s.layouts.workspaceId, identity.workspaceId))).orderBy(desc(s.layouts.updatedAt));
    return rows.filter((row) => row.currentVersionId).map(layoutRecord);
  }

  async createLayout(identity: RequestIdentity, input: { layoutId?: string; versionId?: string; name: string; objectKey: string; sha256: string; idempotencyKey: string }) {
    return this.db.transaction(async (tx) => {
      const scope = "layout:create"; const previous = await readIdempotency(tx, identity, scope, input.idempotencyKey);
      if (previous) return { ...(await loadLayoutResult(tx, identity, previous.layoutId as string, previous.versionId as string)), reused: true };
      const now = new Date(); const layoutId = input.layoutId ?? randomUUID(); const versionId = input.versionId ?? randomUUID();
      await tx.insert(s.layouts).values({ id: layoutId, tenantId: identity.tenantId, workspaceId: identity.workspaceId, ownerUserId: identity.userId, name: input.name, currentVersionId: null, createdAt: now, updatedAt: now });
      await tx.insert(s.layoutVersions).values({ id: versionId, tenantId: identity.tenantId, layoutId, parentVersionId: null, objectKey: input.objectKey, sha256: input.sha256, source: "user", createdBy: identity.userId, createdAt: now });
      await tx.update(s.layouts).set({ currentVersionId: versionId, updatedAt: now }).where(eq(s.layouts.id, layoutId));
      await writeIdempotency(tx, identity, scope, input.idempotencyKey, input, { layoutId, versionId }, 201);
      return { ...(await loadLayoutResult(tx, identity, layoutId, versionId)), reused: false };
    });
  }

  async createLayoutVersion(identity: RequestIdentity, layoutId: string, input: { versionId?: string; parentVersionId: string; objectKey: string; sha256: string; idempotencyKey: string }) {
    return this.db.transaction(async (tx) => {
      const scope = `layout:${layoutId}:version`; const previous = await readIdempotency(tx, identity, scope, input.idempotencyKey);
      if (previous) return { ...(await loadLayoutResult(tx, identity, layoutId, previous.versionId as string)), reused: true };
      const [layout] = await tx.select().from(s.layouts).where(layoutScope(identity, layoutId)).limit(1);
      if (!layout) throw notFound("layout_not_found", "Layout was not found.");
      if (layout.currentVersionId !== input.parentVersionId) throw conflict("base_revision_changed", "The layout changed since this edit started.");
      const versionId = input.versionId ?? randomUUID(); const now = new Date();
      await tx.insert(s.layoutVersions).values({ id: versionId, tenantId: identity.tenantId, layoutId, parentVersionId: input.parentVersionId, objectKey: input.objectKey, sha256: input.sha256, source: "user", createdBy: identity.userId, createdAt: now });
      await tx.update(s.layouts).set({ currentVersionId: versionId, updatedAt: now }).where(layoutScope(identity, layoutId));
      await writeIdempotency(tx, identity, scope, input.idempotencyKey, input, { versionId }, 201);
      return { ...(await loadLayoutResult(tx, identity, layoutId, versionId)), reused: false };
    });
  }

  async copyLayout(identity: RequestIdentity, layoutId: string, input: { sourceVersionId: string; name: string; idempotencyKey: string }) {
    const [source] = await this.db.select().from(s.layoutVersions).innerJoin(s.layouts, eq(s.layoutVersions.layoutId, s.layouts.id)).where(and(layoutScope(identity, layoutId), eq(s.layoutVersions.id, input.sourceVersionId))).limit(1);
    if (!source) throw notFound("layout_version_not_found", "Layout version was not found.");
    return this.createLayout(identity, { name: input.name, objectKey: source.layout_versions.objectKey, sha256: source.layout_versions.sha256, idempotencyKey: input.idempotencyKey });
  }

  async listAssets(identity: RequestIdentity): Promise<AssetRecord[]> {
    const rows = await this.db.select().from(s.assets).where(and(eq(s.assets.tenantId, identity.tenantId), eq(s.assets.workspaceId, identity.workspaceId))).orderBy(desc(s.assets.updatedAt));
    return rows.map(assetRecord);
  }

  async createAsset(identity: RequestIdentity, input: Omit<AssetRecord, "id" | "tenantId" | "workspaceId" | "ownerUserId" | "currentRevisionId" | "createdAt"> & { idempotencyKey: string }) {
    return this.db.transaction(async (tx) => {
      const scope = "asset:create"; const previous = await readIdempotency(tx, identity, scope, input.idempotencyKey);
      if (previous) { const [asset] = await tx.select().from(s.assets).where(assetScope(identity, previous.assetId as string)).limit(1); if (!asset) throw notFound("asset_not_found", "Asset was not found."); return { asset: assetRecord(asset), reused: true }; }
      const id = randomUUID(); const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset"}-${id.slice(0, 8)}`;
      const [created] = await tx.insert(s.assets).values({ id, tenantId: identity.tenantId, workspaceId: identity.workspaceId, ownerUserId: identity.userId, slug, name: input.name, category: input.category, scope: input.assetScope, lifecyclePolicy: input.lifecyclePolicy }).returning();
      await writeIdempotency(tx, identity, scope, input.idempotencyKey, input, { assetId: id }, 201);
      return { asset: assetRecord(created), reused: false };
    });
  }

  async listAssetRevisions(identity: RequestIdentity, assetId: string): Promise<AssetRevisionRecord[]> {
    await requireAsset(this.db, identity, assetId);
    const rows = await this.db.select().from(s.assetRevisions).where(eq(s.assetRevisions.assetId, assetId)).orderBy(asc(s.assetRevisions.createdAt));
    return rows.map(assetRevisionRecord);
  }

  async createAssetRevision(identity: RequestIdentity, assetId: string, input: Omit<AssetRevisionRecord, "id" | "assetId" | "effectiveStatus" | "createdAt"> & { idempotencyKey: string }) {
    return this.db.transaction(async (tx) => {
      const scope = `asset:${assetId}:revision`; const previous = await readIdempotency(tx, identity, scope, input.idempotencyKey);
      if (previous) { const [revision] = await tx.select().from(s.assetRevisions).where(and(eq(s.assetRevisions.assetId, assetId), eq(s.assetRevisions.id, previous.revisionId as string))).limit(1); if (!revision) throw notFound("asset_revision_not_found", "Asset revision was not found."); return { revision: assetRevisionRecord(revision), reused: true }; }
      const asset = await requireAsset(tx, identity, assetId);
      if (asset.currentRevisionId !== input.parentRevisionId) throw conflict("base_revision_changed", "The asset changed since this revision started.");
      const effectiveStatus = input.rawStatus === "approved" ? "draft" : input.rawStatus; const id = randomUUID(); const now = new Date();
      const [created] = await tx.insert(s.assetRevisions).values({ id, tenantId: identity.tenantId, assetId, parentRevisionId: input.parentRevisionId, manifestSchemaVersion: 3, rawStatus: input.rawStatus, effectiveStatus, contractHash: input.contractHash, manifest: input.manifest, manifestObjectKey: input.objectKeys.manifest, runtimeObjectKey: input.objectKeys.runtime, modelObjectKey: input.objectKeys.model, createdBy: identity.userId, createdAt: now }).returning();
      await tx.update(s.assets).set({ currentRevisionId: id, updatedAt: now }).where(assetScope(identity, assetId));
      await writeIdempotency(tx, identity, scope, input.idempotencyKey, input, { revisionId: id }, 201);
      return { revision: assetRevisionRecord(created), reused: false };
    });
  }

  async approveAsset(identity: RequestIdentity, assetId: string, revisionId: string, contractHash: string, approved: boolean, idempotencyKey: string) {
    return this.db.transaction(async (tx) => {
      const scope = `asset:${assetId}:approve`; const previous = await readIdempotency(tx, identity, scope, idempotencyKey);
      if (previous) { const [revision] = await tx.select().from(s.assetRevisions).where(eq(s.assetRevisions.id, previous.revisionId as string)).limit(1); if (!revision) throw notFound("asset_revision_not_found", "Asset revision was not found."); return assetRevisionRecord(revision); }
      const asset = await requireAsset(tx, identity, assetId); const [revision] = await tx.select().from(s.assetRevisions).where(and(eq(s.assetRevisions.assetId, assetId), eq(s.assetRevisions.id, revisionId))).limit(1);
      if (!revision) throw notFound("asset_revision_not_found", "Asset revision was not found.");
      if (asset.currentRevisionId !== revisionId || revision.contractHash !== contractHash) throw conflict("base_revision_changed", "Approval does not match the current asset contract.");
      if (approved && revision.effectiveStatus !== "candidate") throw conflict("asset_not_candidate", "Only a technically ready candidate can be approved.");
      const rawStatus = approved ? "approved" : "draft"; const effectiveStatus = rawStatus;
      const [updated] = await tx.update(s.assetRevisions).set({ rawStatus, effectiveStatus }).where(eq(s.assetRevisions.id, revisionId)).returning();
      await tx.insert(s.assetReviews).values({ tenantId: identity.tenantId, assetId, revisionId, reviewerUserId: identity.userId, decision: approved ? "approved" : "rejected", contractHash });
      await writeIdempotency(tx, identity, scope, idempotencyKey, { revisionId, contractHash, approved }, { revisionId }, 200);
      return assetRevisionRecord(updated);
    });
  }

  async createAgentRun(identity: RequestIdentity, input: { intent: AgentRunIntent; message: string; conversationId?: string; baseRevisionId?: string; idempotencyKey: string }) {
    return this.db.transaction(async (tx) => {
      const [previous] = await tx.select().from(s.agentRuns).where(and(eq(s.agentRuns.tenantId, identity.tenantId), eq(s.agentRuns.idempotencyKey, input.idempotencyKey))).limit(1);
      if (previous) return { run: agentRunDto(previous), reused: true };
      const threadId = input.conversationId ?? randomUUID();
      if (input.conversationId) { const [thread] = await tx.select().from(s.agentThreads).where(and(eq(s.agentThreads.id, threadId), eq(s.agentThreads.tenantId, identity.tenantId), eq(s.agentThreads.workspaceId, identity.workspaceId))).limit(1); if (!thread) throw notFound("agent_thread_not_found", "Agent conversation was not found."); }
      else await tx.insert(s.agentThreads).values({ id: threadId, tenantId: identity.tenantId, workspaceId: identity.workspaceId, ownerUserId: identity.userId });
      const [created] = await tx.insert(s.agentRuns).values({ tenantId: identity.tenantId, workspaceId: identity.workspaceId, userId: identity.userId, threadId, intent: input.intent, baseRevisionId: input.baseRevisionId, idempotencyKey: input.idempotencyKey }).returning();
      return { run: agentRunDto(created), reused: false };
    });
  }

  async getAgentRun(identity: RequestIdentity, runId: string) { const [run] = await this.db.select().from(s.agentRuns).where(runScope(identity, runId)).limit(1); return run ? agentRunDto(run) : null; }
  async updateAgentRun(identity: RequestIdentity, runId: string, patch: { status?: AgentRunStatus; resultRevisionId?: string | null; failureSummary?: string | null; heartbeatAt?: string | null }) {
    const [updated] = await this.db.update(s.agentRuns).set({ ...patch, heartbeatAt: patch.heartbeatAt === undefined ? undefined : patch.heartbeatAt ? new Date(patch.heartbeatAt) : null, updatedAt: new Date() }).where(runScope(identity, runId)).returning();
    if (!updated) throw notFound("agent_run_not_found", "Agent run was not found."); return agentRunDto(updated);
  }

  async appendAgentEvent(identity: RequestIdentity, runId: string, type: PublicAgentEventType, payload: PublicAgentEvent["payload"]) {
    const event = await this.db.transaction(async (tx) => {
      const [sequenceRow] = await tx.update(s.agentRuns).set({ nextEventSequence: sql`${s.agentRuns.nextEventSequence} + 1`, updatedAt: new Date() }).where(runScope(identity, runId)).returning({ sequence: sql<number>`${s.agentRuns.nextEventSequence} - 1` });
      if (!sequenceRow) throw notFound("agent_run_not_found", "Agent run was not found.");
      const [created] = await tx.insert(s.agentEvents).values({ tenantId: identity.tenantId, runId, sequence: sequenceRow.sequence, type, payload }).returning();
      return { id: created.id, runId: created.runId, sequence: created.sequence, createdAt: created.createdAt.toISOString(), type: created.type, payload: created.payload } as PublicAgentEvent;
    });
    this.#events.emit(runId, event); return event;
  }

  async listAgentEvents(identity: RequestIdentity, runId: string, afterSequence: number) {
    const run = await this.getAgentRun(identity, runId); if (!run) throw notFound("agent_run_not_found", "Agent run was not found.");
    const rows = await this.db.select().from(s.agentEvents).where(and(eq(s.agentEvents.runId, runId), sql`${s.agentEvents.sequence} > ${afterSequence}`)).orderBy(asc(s.agentEvents.sequence));
    return rows.map((row) => ({ id: row.id, runId: row.runId, sequence: row.sequence, createdAt: row.createdAt.toISOString(), type: row.type, payload: row.payload }) as PublicAgentEvent);
  }

  subscribe(runId: string, listener: (event: PublicAgentEvent) => void) { this.#events.on(runId, listener); return () => this.#events.off(runId, listener); }
}

function layoutScope(identity: RequestIdentity, id: string) { return and(eq(s.layouts.id, id), eq(s.layouts.tenantId, identity.tenantId), eq(s.layouts.workspaceId, identity.workspaceId)); }
function assetScope(identity: RequestIdentity, id: string) { return and(eq(s.assets.id, id), eq(s.assets.tenantId, identity.tenantId), eq(s.assets.workspaceId, identity.workspaceId)); }
function runScope(identity: RequestIdentity, id: string) { return and(eq(s.agentRuns.id, id), eq(s.agentRuns.tenantId, identity.tenantId), eq(s.agentRuns.workspaceId, identity.workspaceId), eq(s.agentRuns.userId, identity.userId)); }

async function requireAsset(db: any, identity: RequestIdentity, id: string) { const [asset] = await db.select().from(s.assets).where(assetScope(identity, id)).limit(1); if (!asset) throw notFound("asset_not_found", "Asset was not found."); return asset as typeof s.assets.$inferSelect; }
async function loadLayoutResult(db: any, identity: RequestIdentity, layoutId: string, versionId: string) { const [layout] = await db.select().from(s.layouts).where(layoutScope(identity, layoutId)).limit(1); const [version] = await db.select().from(s.layoutVersions).where(and(eq(s.layoutVersions.layoutId, layoutId), eq(s.layoutVersions.id, versionId))).limit(1); if (!layout || !version) throw notFound("layout_not_found", "Layout or version was not found."); return { layout: layoutRecord(layout), version: layoutVersionRecord(version) }; }
async function readIdempotency(db: any, identity: RequestIdentity, scope: string, key: string) { const [record] = await db.select().from(s.idempotencyKeys).where(and(eq(s.idempotencyKeys.tenantId, identity.tenantId), eq(s.idempotencyKeys.scope, `${identity.workspaceId}:${scope}`), eq(s.idempotencyKeys.key, key), sql`${s.idempotencyKeys.expiresAt} > now()`)).limit(1); return record?.response as Record<string, unknown> | undefined; }
async function writeIdempotency(db: any, identity: RequestIdentity, scope: string, key: string, request: unknown, response: Record<string, unknown>, statusCode: number) { await db.insert(s.idempotencyKeys).values({ tenantId: identity.tenantId, scope: `${identity.workspaceId}:${scope}`, key, requestHash: requestHash(request), statusCode, response, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }); }

function layoutRecord(row: typeof s.layouts.$inferSelect): LayoutRecord { return { id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId, ownerUserId: row.ownerUserId, name: row.name, currentVersionId: row.currentVersionId!, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
function layoutVersionRecord(row: typeof s.layoutVersions.$inferSelect): LayoutVersionRecord { return { id: row.id, layoutId: row.layoutId, parentVersionId: row.parentVersionId, objectKey: row.objectKey, sha256: row.sha256, source: row.source, createdAt: row.createdAt.toISOString() }; }
function assetRecord(row: typeof s.assets.$inferSelect): AssetRecord { return { id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId, ownerUserId: row.ownerUserId, name: row.name, category: row.category, assetScope: row.scope, lifecyclePolicy: row.lifecyclePolicy, currentRevisionId: row.currentRevisionId, createdAt: row.createdAt.toISOString() }; }
function assetRevisionRecord(row: typeof s.assetRevisions.$inferSelect): AssetRevisionRecord { return { id: row.id, assetId: row.assetId, parentRevisionId: row.parentRevisionId, manifest: row.manifest as Record<string, unknown>, contractHash: row.contractHash, rawStatus: row.rawStatus, effectiveStatus: row.effectiveStatus, objectKeys: { manifest: row.manifestObjectKey, runtime: row.runtimeObjectKey, model: row.modelObjectKey }, createdAt: row.createdAt.toISOString() }; }
function agentRunDto(row: typeof s.agentRuns.$inferSelect): AgentRunDto { return { id: row.id, conversationId: row.threadId, intent: row.intent as AgentRunIntent, status: row.status, baseRevisionId: row.baseRevisionId, resultRevisionId: row.resultRevisionId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), heartbeatAt: row.heartbeatAt?.toISOString() ?? null, failureSummary: row.failureSummary }; }
function conflict(code: string, message: string) { return Object.assign(new Error(message), { statusCode: 409, code }); }
function notFound(code: string, message: string) { return Object.assign(new Error(message), { statusCode: 404, code }); }
