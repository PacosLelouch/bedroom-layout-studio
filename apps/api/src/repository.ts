import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { AgentRunDto, AgentRunIntent, AgentRunStatus, PublicAgentEvent, PublicAgentEventType } from "@bedroom/contracts";
import type { RequestIdentity } from "./auth.js";

export interface LayoutRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutVersionRecord {
  id: string;
  layoutId: string;
  parentVersionId: string | null;
  objectKey: string;
  sha256: string;
  source: string;
  createdAt: string;
}

export interface AssetRecord {
  id: string;
  assetKey: string;
  tenantId: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  category: string;
  assetScope: "builtin" | "user-generated";
  lifecyclePolicy: "repository-trusted" | "user-reviewed";
  executionPolicy: "repository-bundled" | "platform-built-esm" | "quarantined-source";
  currentRevisionId: string | null;
  publishedRevisionId: string | null;
  createdAt: string;
}

export interface AssetRevisionRecord {
  id: string;
  assetId: string;
  parentRevisionId: string | null;
  contractHash: string;
  artifactSetHash: string;
  packageRootKey: string;
  packageIndexKey: string;
  packageIndexHash: string;
  manifestSchemaVersion: 3;
  runtimeAbiVersion: 1;
  rawStatus: "draft" | "candidate" | "approved" | "archived";
  effectiveStatus: "draft" | "candidate" | "approved" | "archived";
  createdAt: string;
}

export interface AssetPackageObjectRecord { logicalPath: string; objectKey: string; sha256: string; sizeBytes: number; mediaType: string; }
export interface PublishedAssetRecord { asset: AssetRecord; revision: AssetRevisionRecord; objects: AssetPackageObjectRecord[]; }
export type CreateAssetRevisionInput = Omit<AssetRevisionRecord, "assetId" | "effectiveStatus" | "createdAt"> & { objects: AssetPackageObjectRecord[]; idempotencyKey: string };

interface AgentRunRecord extends AgentRunDto {
  tenantId: string;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
  initialMessage: string;
}

export interface ControlPlaneRepository {
  claimIdempotency(identity: RequestIdentity, scope: string, key: string, request: unknown): Promise<boolean>;
  listLayouts(identity: RequestIdentity): Promise<LayoutRecord[]>;
  createLayout(identity: RequestIdentity, input: { layoutId?: string; versionId?: string; name: string; objectKey: string; sha256: string; idempotencyKey: string }): Promise<{ layout: LayoutRecord; version: LayoutVersionRecord; reused: boolean }>;
  createLayoutVersion(identity: RequestIdentity, layoutId: string, input: { versionId?: string; parentVersionId: string; objectKey: string; sha256: string; idempotencyKey: string }): Promise<{ layout: LayoutRecord; version: LayoutVersionRecord; reused: boolean }>;
  copyLayout(identity: RequestIdentity, layoutId: string, input: { sourceVersionId: string; name: string; idempotencyKey: string }): Promise<{ layout: LayoutRecord; version: LayoutVersionRecord; reused: boolean }>;
  listAssets(identity: RequestIdentity): Promise<AssetRecord[]>;
  createAsset(identity: RequestIdentity, input: Omit<AssetRecord, "id" | "tenantId" | "workspaceId" | "ownerUserId" | "currentRevisionId" | "publishedRevisionId" | "createdAt"> & { idempotencyKey: string }): Promise<{ asset: AssetRecord; reused: boolean }>;
  listAssetRevisions(identity: RequestIdentity, assetId: string): Promise<AssetRevisionRecord[]>;
  createAssetRevision(identity: RequestIdentity, assetId: string, input: CreateAssetRevisionInput): Promise<{ revision: AssetRevisionRecord; reused: boolean }>;
  getPublishedAssets(identity: RequestIdentity): Promise<PublishedAssetRecord[]>;
  setAssetExecutionPolicy(identity: RequestIdentity, assetId: string, policy: AssetRecord["executionPolicy"]): Promise<AssetRecord>;
  approveAsset(identity: RequestIdentity, assetId: string, revisionId: string, contractHash: string, approved: boolean, idempotencyKey: string): Promise<AssetRevisionRecord>;
  createAgentRun(identity: RequestIdentity, input: { intent: AgentRunIntent; message: string; conversationId?: string; baseRevisionId?: string; idempotencyKey: string }): Promise<{ run: AgentRunDto; reused: boolean }>;
  getAgentRun(identity: RequestIdentity, runId: string): Promise<AgentRunDto | null>;
  updateAgentRun(identity: RequestIdentity, runId: string, patch: { status?: AgentRunStatus; resultRevisionId?: string | null; failureSummary?: string | null; heartbeatAt?: string | null }): Promise<AgentRunDto>;
  appendAgentEvent(identity: RequestIdentity, runId: string, type: PublicAgentEventType, payload: PublicAgentEvent["payload"]): Promise<PublicAgentEvent>;
  listAgentEvents(identity: RequestIdentity, runId: string, afterSequence: number): Promise<PublicAgentEvent[]>;
  subscribe(runId: string, listener: (event: PublicAgentEvent) => void): () => void;
}

export class MemoryControlPlaneRepository implements ControlPlaneRepository {
  readonly #layouts = new Map<string, LayoutRecord>();
  readonly #versions = new Map<string, LayoutVersionRecord>();
  readonly #assets = new Map<string, AssetRecord>();
  readonly #revisions = new Map<string, AssetRevisionRecord>();
  readonly #artifacts = new Map<string, AssetPackageObjectRecord[]>();
  readonly #runs = new Map<string, AgentRunRecord>();
  readonly #events = new Map<string, PublicAgentEvent[]>();
  readonly #idempotency = new Map<string, unknown>();
  readonly #emitter = new EventEmitter();

  async claimIdempotency(identity: RequestIdentity, scope: string, key: string, request: unknown) {
    const storageKey = idem(identity, `action:${scope}`, key);
    const hash = requestHash(request);
    const previous = this.#idempotency.get(storageKey) as string | undefined;
    if (previous && previous !== hash) throw conflict("idempotency_key_reused", "The idempotency key was already used with a different request.");
    if (previous) return false;
    this.#idempotency.set(storageKey, hash);
    return true;
  }

  async listLayouts(identity: RequestIdentity) {
    return [...this.#layouts.values()].filter((layout) => owns(layout, identity));
  }

  async createLayout(identity: RequestIdentity, input: { layoutId?: string; versionId?: string; name: string; objectKey: string; sha256: string; idempotencyKey: string }) {
    const key = idem(identity, "layout:create", input.idempotencyKey);
    const previous = this.#idempotency.get(key) as { layout: LayoutRecord; version: LayoutVersionRecord } | undefined;
    if (previous) return { ...previous, reused: true };
    const now = new Date().toISOString();
    const layoutId = input.layoutId ?? randomUUID();
    const version: LayoutVersionRecord = { id: input.versionId ?? randomUUID(), layoutId, parentVersionId: null, objectKey: input.objectKey, sha256: input.sha256, source: "user", createdAt: now };
    const layout: LayoutRecord = { id: layoutId, tenantId: identity.tenantId, workspaceId: identity.workspaceId, ownerUserId: identity.userId, name: input.name, currentVersionId: version.id, createdAt: now, updatedAt: now };
    this.#layouts.set(layout.id, layout); this.#versions.set(version.id, version); this.#idempotency.set(key, { layout, version });
    return { layout, version, reused: false };
  }

  async createLayoutVersion(identity: RequestIdentity, layoutId: string, input: { versionId?: string; parentVersionId: string; objectKey: string; sha256: string; idempotencyKey: string }) {
    const key = idem(identity, `layout:${layoutId}:version`, input.idempotencyKey);
    const previous = this.#idempotency.get(key) as { layout: LayoutRecord; version: LayoutVersionRecord } | undefined;
    if (previous) return { ...previous, reused: true };
    const layout = this.#layout(identity, layoutId);
    if (layout.currentVersionId !== input.parentVersionId) throw conflict("base_revision_changed", "The layout changed since this edit started.");
    const version: LayoutVersionRecord = { id: input.versionId ?? randomUUID(), layoutId, parentVersionId: input.parentVersionId, objectKey: input.objectKey, sha256: input.sha256, source: "user", createdAt: new Date().toISOString() };
    const updated = { ...layout, currentVersionId: version.id, updatedAt: version.createdAt };
    this.#versions.set(version.id, version); this.#layouts.set(layoutId, updated); this.#idempotency.set(key, { layout: updated, version });
    return { layout: updated, version, reused: false };
  }

  async copyLayout(identity: RequestIdentity, layoutId: string, input: { sourceVersionId: string; name: string; idempotencyKey: string }) {
    this.#layout(identity, layoutId);
    const source = this.#versions.get(input.sourceVersionId);
    if (!source || source.layoutId !== layoutId) throw notFound("layout_version_not_found", "Layout version was not found.");
    return this.createLayout(identity, { name: input.name, objectKey: source.objectKey, sha256: source.sha256, idempotencyKey: input.idempotencyKey });
  }

  async listAssets(identity: RequestIdentity) { return [...this.#assets.values()].filter((asset) => owns(asset, identity)); }

  async createAsset(identity: RequestIdentity, input: Omit<AssetRecord, "id" | "tenantId" | "workspaceId" | "ownerUserId" | "currentRevisionId" | "publishedRevisionId" | "createdAt"> & { idempotencyKey: string }) {
    const key = idem(identity, "asset:create", input.idempotencyKey);
    const previous = this.#idempotency.get(key) as AssetRecord | undefined;
    if (previous) return { asset: previous, reused: true };
    const asset: AssetRecord = { id: randomUUID(), tenantId: identity.tenantId, workspaceId: identity.workspaceId, ownerUserId: identity.userId, assetKey: input.assetKey, name: input.name, category: input.category, assetScope: input.assetScope, lifecyclePolicy: input.lifecyclePolicy, executionPolicy: input.executionPolicy, currentRevisionId: null, publishedRevisionId: null, createdAt: new Date().toISOString() };
    this.#assets.set(asset.id, asset); this.#idempotency.set(key, asset);
    return { asset, reused: false };
  }

  async listAssetRevisions(identity: RequestIdentity, assetId: string) {
    this.#asset(identity, assetId);
    return [...this.#revisions.values()].filter((revision) => revision.assetId === assetId);
  }

  async createAssetRevision(identity: RequestIdentity, assetId: string, input: CreateAssetRevisionInput) {
    const asset = this.#asset(identity, assetId);
    const key = idem(identity, `asset:${assetId}:revision`, input.idempotencyKey);
    const previous = this.#idempotency.get(key) as AssetRevisionRecord | undefined;
    if (previous) return { revision: previous, reused: true };
    if (asset.currentRevisionId !== input.parentRevisionId) throw conflict("base_revision_changed", "The asset changed since this revision started.");
    const effectiveStatus = input.rawStatus === "approved" ? "draft" : input.rawStatus;
    const revision: AssetRevisionRecord = { id: input.id, assetId, parentRevisionId: input.parentRevisionId, contractHash: input.contractHash, artifactSetHash: input.artifactSetHash, packageRootKey: input.packageRootKey, packageIndexKey: input.packageIndexKey, packageIndexHash: input.packageIndexHash, manifestSchemaVersion: input.manifestSchemaVersion, runtimeAbiVersion: input.runtimeAbiVersion, rawStatus: input.rawStatus, effectiveStatus, createdAt: new Date().toISOString() };
    this.#revisions.set(revision.id, revision); this.#artifacts.set(revision.id, input.objects); this.#assets.set(assetId, { ...asset, currentRevisionId: revision.id }); this.#idempotency.set(key, revision);
    return { revision, reused: false };
  }

  async approveAsset(identity: RequestIdentity, assetId: string, revisionId: string, contractHash: string, approved: boolean, idempotencyKey: string) {
    const asset = this.#asset(identity, assetId);
    const key = idem(identity, `asset:${assetId}:approve`, idempotencyKey);
    const previous = this.#idempotency.get(key) as AssetRevisionRecord | undefined;
    if (previous) return previous;
    const revision = this.#revisions.get(revisionId);
    if (!revision || revision.assetId !== asset.id) throw notFound("asset_revision_not_found", "Asset revision was not found.");
    if (asset.currentRevisionId !== revisionId || revision.contractHash !== contractHash) throw conflict("base_revision_changed", "Approval does not match the current asset contract.");
    if (approved && revision.effectiveStatus !== "candidate") throw conflict("asset_not_candidate", "Only a technically ready candidate can be approved.");
    const updated: AssetRevisionRecord = { ...revision, effectiveStatus: approved ? "approved" : "draft" };
    this.#revisions.set(revisionId, updated); this.#assets.set(assetId, { ...asset, publishedRevisionId: approved ? revisionId : asset.publishedRevisionId }); this.#idempotency.set(key, updated); return updated;
  }

  async getPublishedAssets(identity: RequestIdentity) {
    return [...this.#assets.values()].filter((asset) => owns(asset, identity) && asset.publishedRevisionId).flatMap((asset) => {
      const revision = this.#revisions.get(asset.publishedRevisionId!);
      return revision ? [{ asset, revision: { ...revision, effectiveStatus: "approved" as const }, objects: this.#artifacts.get(revision.id) ?? [] }] : [];
    });
  }

  async setAssetExecutionPolicy(identity: RequestIdentity, assetId: string, policy: AssetRecord["executionPolicy"]) {
    const asset = this.#asset(identity, assetId); const updated = { ...asset, executionPolicy: policy }; this.#assets.set(assetId, updated); return updated;
  }

  async createAgentRun(identity: RequestIdentity, input: { intent: AgentRunIntent; message: string; conversationId?: string; baseRevisionId?: string; idempotencyKey: string }) {
    const key = idem(identity, "agent-run:create", input.idempotencyKey);
    const previous = this.#idempotency.get(key) as AgentRunRecord | undefined;
    if (previous) return { run: dto(previous), reused: true };
    const now = new Date().toISOString();
    const run: AgentRunRecord = { id: randomUUID(), conversationId: input.conversationId ?? randomUUID(), intent: input.intent, status: "queued", baseRevisionId: input.baseRevisionId ?? null, resultRevisionId: null, createdAt: now, updatedAt: now, heartbeatAt: null, failureSummary: null, tenantId: identity.tenantId, workspaceId: identity.workspaceId, userId: identity.userId, idempotencyKey: input.idempotencyKey, initialMessage: input.message };
    this.#runs.set(run.id, run); this.#events.set(run.id, []); this.#idempotency.set(key, run);
    return { run: dto(run), reused: false };
  }

  async getAgentRun(identity: RequestIdentity, runId: string) { const run = this.#runs.get(runId); return run && owns(run, identity) ? dto(run) : null; }

  async updateAgentRun(identity: RequestIdentity, runId: string, patch: { status?: AgentRunStatus; resultRevisionId?: string | null; failureSummary?: string | null; heartbeatAt?: string | null }) {
    const run = this.#run(identity, runId); const updated = { ...run, ...patch, updatedAt: new Date().toISOString() }; this.#runs.set(runId, updated); return dto(updated);
  }

  async appendAgentEvent(identity: RequestIdentity, runId: string, type: PublicAgentEventType, payload: PublicAgentEvent["payload"]) {
    this.#run(identity, runId); const events = this.#events.get(runId)!;
    const event = { id: randomUUID(), runId, sequence: events.length + 1, createdAt: new Date().toISOString(), type, payload } as PublicAgentEvent;
    events.push(event); this.#emitter.emit(runId, event); return event;
  }

  async listAgentEvents(identity: RequestIdentity, runId: string, afterSequence: number) { this.#run(identity, runId); return (this.#events.get(runId) ?? []).filter((event) => event.sequence > afterSequence); }
  subscribe(runId: string, listener: (event: PublicAgentEvent) => void) { this.#emitter.on(runId, listener); return () => this.#emitter.off(runId, listener); }

  #layout(identity: RequestIdentity, id: string) { const record = this.#layouts.get(id); if (!record || !owns(record, identity)) throw notFound("layout_not_found", "Layout was not found."); return record; }
  #asset(identity: RequestIdentity, id: string) { const record = this.#assets.get(id); if (!record || !owns(record, identity)) throw notFound("asset_not_found", "Asset was not found."); return record; }
  #run(identity: RequestIdentity, id: string) { const record = this.#runs.get(id); if (!record || !owns(record, identity)) throw notFound("agent_run_not_found", "Agent run was not found."); return record; }
}

function owns(value: { tenantId: string; workspaceId: string }, identity: RequestIdentity) { return value.tenantId === identity.tenantId && value.workspaceId === identity.workspaceId; }
function idem(identity: RequestIdentity, scope: string, key: string) { return `${identity.tenantId}:${identity.workspaceId}:${scope}:${key}`; }
function dto(run: AgentRunRecord): AgentRunDto { const { tenantId: _t, workspaceId: _w, userId: _u, idempotencyKey: _i, initialMessage: _m, ...value } = run; return value; }
function conflict(code: string, message: string) { return Object.assign(new Error(message), { statusCode: 409, code }); }
function notFound(code: string, message: string) { return Object.assign(new Error(message), { statusCode: 404, code }); }
export function requestHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
