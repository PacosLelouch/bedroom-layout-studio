import { createHash, randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  approveAssetRequestSchema,
  createAgentRunRequestSchema,
  createAssetRequestSchema,
  createAssetRevisionRequestSchema,
  createLayoutCopyRequestSchema,
  createLayoutRequestSchema,
  createLayoutVersionRequestSchema,
  postAgentMessageRequestSchema,
  resolveAgentRequestSchema,
  terminalAgentRunStatuses,
  furniturePackageIndexSchema,
} from "@bedroom/contracts";
import type { ObjectStorage } from "@bedroom/storage";
import { furnitureCandidateReadinessIssues, validateFurnitureAssetManifest } from "@bedroom/furniture-assets";
import { computeFurnitureArtifactSetHash, validateFurniturePackageKeyBoundary } from "@bedroom/furniture-assets/package-core";
import { publicAgentEventSchema, publicAgentEventTypeSchema, agentRunStatusSchema } from "@bedroom/contracts";
import { z } from "zod";
import { createIdentityResolver } from "./auth.js";
import type { ExternalIdentityMapper } from "./auth.js";
import type { ApiConfig } from "./config.js";
import type { AgentJobPublisher } from "./queue.js";
import type { ControlPlaneRepository } from "./repository.js";

export interface ApiDependencies {
  config: ApiConfig;
  repository: ControlPlaneRepository;
  storage: ObjectStorage;
  publisher: AgentJobPublisher;
  identityMapper?: ExternalIdentityMapper;
}

export async function createApiServer(dependencies: ApiDependencies) {
  const app = Fastify({ logger: dependencies.config.environment !== "test", bodyLimit: dependencies.config.maxJsonBodyBytes, genReqId: () => randomUUID() });
  await app.register(cors, { origin: dependencies.config.corsOrigins, credentials: false, methods: ["GET", "POST", "OPTIONS"] });
  const resolveIdentity = createIdentityResolver(dependencies.config, dependencies.identityMapper);
  app.addHook("preHandler", async (request) => {
    if (request.url === "/healthz" || request.method === "OPTIONS") return;
    if (request.url.startsWith("/internal/")) {
      if (!dependencies.config.workerToken || request.headers.authorization !== `Bearer ${dependencies.config.workerToken}`) {
        throw Object.assign(new Error("Worker capability token is invalid."), { statusCode: 401, code: "unauthorized" });
      }
      return;
    }
    request.identity = await resolveIdentity(request);
  });

  app.setErrorHandler((error, request, reply) => {
    const failure = error as Error & { statusCode?: number; code?: string; issues?: unknown };
    const validation = failure.issues;
    const statusCode = validation ? 400 : typeof failure.statusCode === "number" ? failure.statusCode : 500;
    const code = typeof failure.code === "string" ? failure.code : validation ? "invalid_request" : "internal_error";
    if (statusCode >= 500) request.log.error(failure);
    return reply.status(statusCode).send({ error: { code, message: statusCode >= 500 ? "The server could not complete the request." : failure.message, requestId: request.id, ...(validation ? { details: validation } : {}) } });
  });

  app.get("/healthz", async () => ({ status: "ok" }));

  const workerUpdateSchema = z.object({
    identity: z.object({ userId: z.string().uuid(), tenantId: z.string().uuid(), workspaceId: z.string().uuid(), subject: z.string().min(1).default("agent-worker") }).strict(),
    status: agentRunStatusSchema.optional(),
    resultRevisionId: z.string().uuid().nullable().optional(),
    failureSummary: z.string().max(10_000).nullable().optional(),
    event: z.object({ type: publicAgentEventTypeSchema, payload: z.unknown() }).strict().optional(),
  }).strict();
  app.post<{ Params: { runId: string } }>("/internal/v1/agent-runs/:runId/updates", async (request) => {
    const input = workerUpdateSchema.parse(request.body);
    if (input.status || input.resultRevisionId !== undefined || input.failureSummary !== undefined) {
      await dependencies.repository.updateAgentRun(input.identity, request.params.runId, { status: input.status, resultRevisionId: input.resultRevisionId, failureSummary: input.failureSummary, heartbeatAt: new Date().toISOString() });
    }
    if (!input.event) return { accepted: true };
    publicAgentEventSchema.parse({ id: randomUUID(), runId: request.params.runId, sequence: 1, createdAt: new Date().toISOString(), type: input.event.type, payload: input.event.payload });
    const event = await dependencies.repository.appendAgentEvent(input.identity, request.params.runId, input.event.type, input.event.payload as never);
    return { accepted: true, sequence: event.sequence };
  });
  app.post<{ Params: { assetId: string } }>("/internal/v1/assets/:assetId/execution-policy", async (request) => {
    const input = z.object({ identity: z.object({ userId: z.string().uuid(), tenantId: z.string().uuid(), workspaceId: z.string().uuid(), subject: z.string().min(1) }).strict(), policy: z.enum(["repository-bundled", "platform-built-esm", "quarantined-source"]), validation: z.object({ revisionId: z.string().uuid(), artifactSetHash: z.string().regex(/^[a-f0-9]{64}$/), runtimeAbiVersion: z.literal(1) }).strict() }).strict().parse(request.body);
    const revision = (await dependencies.repository.listAssetRevisions(input.identity, request.params.assetId)).find((candidate) => candidate.id === input.validation.revisionId);
    if (!revision || revision.artifactSetHash !== input.validation.artifactSetHash || revision.runtimeAbiVersion !== input.validation.runtimeAbiVersion) throw Object.assign(new Error("Execution policy promotion must match a validated immutable revision."), { statusCode: 409, code: "runtime_validation_stale" });
    return dependencies.repository.setAssetExecutionPolicy(input.identity, request.params.assetId, input.policy);
  });

  app.get("/api/v1/layouts", async (request) => dependencies.repository.listLayouts(request.identity));
  app.post("/api/v1/layouts", async (request, reply) => {
    const input = createLayoutRequestSchema.parse(request.body);
    const layoutId = deterministicUuid(`${request.identity.tenantId}:layout:${input.idempotencyKey}`);
    const versionId = deterministicUuid(`${layoutId}:initial:${input.idempotencyKey}`);
    const objectKey = `tenants/${request.identity.tenantId}/layouts/${layoutId}/versions/${versionId}/layout.json`;
    const contents = new TextEncoder().encode(`${JSON.stringify(input.snapshot)}\n`);
    const stored = await dependencies.storage.putImmutable(objectKey, contents, "application/json");
    const result = await dependencies.repository.createLayout(request.identity, { layoutId, versionId, name: input.name, objectKey: stored.key, sha256: stored.sha256, idempotencyKey: input.idempotencyKey });
    return reply.status(result.reused ? 200 : 201).send({ id: result.layout.id, currentVersionId: result.version.id, reused: result.reused });
  });
  app.post<{ Params: { layoutId: string } }>("/api/v1/layouts/:layoutId/versions", async (request, reply) => {
    const input = createLayoutVersionRequestSchema.parse(request.body);
    const versionId = deterministicUuid(`${request.params.layoutId}:version:${input.idempotencyKey}`);
    const objectKey = `tenants/${request.identity.tenantId}/layouts/${request.params.layoutId}/versions/${versionId}/layout.json`;
    const contents = new TextEncoder().encode(`${JSON.stringify(input.snapshot)}\n`); const stored = await dependencies.storage.putImmutable(objectKey, contents, "application/json");
    const result = await dependencies.repository.createLayoutVersion(request.identity, request.params.layoutId, { versionId, parentVersionId: input.parentVersionId, objectKey: stored.key, sha256: stored.sha256, idempotencyKey: input.idempotencyKey });
    return reply.status(result.reused ? 200 : 201).send({ id: result.version.id, layoutId: result.layout.id, reused: result.reused });
  });
  app.post<{ Params: { layoutId: string } }>("/api/v1/layouts/:layoutId/copies", async (request, reply) => {
    const input = createLayoutCopyRequestSchema.parse(request.body); const result = await dependencies.repository.copyLayout(request.identity, request.params.layoutId, input);
    return reply.status(result.reused ? 200 : 201).send({ id: result.layout.id, currentVersionId: result.version.id, reused: result.reused });
  });

  app.get("/api/v1/assets", async (request) => dependencies.repository.listAssets(request.identity));
  app.get("/api/v1/furniture-catalog", async (request) => {
    const published = await dependencies.repository.getPublishedAssets(request.identity);
    return Promise.all(published.filter(({ asset }) => asset.executionPolicy !== "quarantined-source").map(async ({ asset, revision, objects }) => {
      const manifestObject = objects.find((object) => object.logicalPath === "contract/asset.json")!;
      const manifest = JSON.parse(new TextDecoder().decode(await dependencies.storage.get(manifestObject.objectKey)));
      const deliveryUrl = async (object: typeof objects[number]) => {
        const signed = await dependencies.storage.createSignedGetUrl(object.objectKey, 24 * 60 * 60);
        return signed.startsWith("file://") ? `${dependencies.config.publicBaseUrl}/api/v1/assets/${asset.id}/revisions/${revision.id}/objects/${object.logicalPath.split("/").map(encodeURIComponent).join("/")}?sha256=${object.sha256}` : signed;
      };
      const runtimeObject = objects.find((object) => object.logicalPath === "runtime/runtime.mjs")!;
      const resourceObjects = objects.filter((object) => object.logicalPath.startsWith("runtime/resources/"));
      return { assetId: asset.id, assetKey: asset.assetKey, revisionId: revision.id, contractHash: revision.contractHash, artifactSetHash: revision.artifactSetHash, runtimeAbiVersion: revision.runtimeAbiVersion, manifest, runtimeUrl: await deliveryUrl(runtimeObject), resources: Object.fromEntries(await Promise.all(resourceObjects.map(async (object) => [object.logicalPath.slice("runtime/resources/".length), await deliveryUrl(object)]))) };
    }));
  });
  app.get<{ Params: { assetId: string; revisionId: string; "*": string } }>("/api/v1/assets/:assetId/revisions/:revisionId/objects/*", async (request, reply) => {
    const published = (await dependencies.repository.getPublishedAssets(request.identity)).find(({ asset, revision }) => asset.id === request.params.assetId && revision.id === request.params.revisionId);
    const object = published?.objects.find((candidate) => candidate.logicalPath === request.params["*"]);
    if (!object) throw Object.assign(new Error("Published asset object was not found."), { statusCode: 404, code: "asset_object_not_found" });
    return reply.header("cache-control", "public, max-age=31536000, immutable").header("x-content-type-options", "nosniff").type(object.mediaType).send(Buffer.from(await dependencies.storage.get(object.objectKey)));
  });
  app.post("/api/v1/assets", async (request, reply) => {
    const input = createAssetRequestSchema.parse(request.body); const result = await dependencies.repository.createAsset(request.identity, { ...input, executionPolicy: "quarantined-source" });
    return reply.status(result.reused ? 200 : 201).send({ ...result.asset, reused: result.reused });
  });
  app.get<{ Params: { assetId: string } }>("/api/v1/assets/:assetId/revisions", async (request) => dependencies.repository.listAssetRevisions(request.identity, request.params.assetId));
  app.post<{ Params: { assetId: string } }>("/api/v1/assets/:assetId/revisions", async (request, reply) => {
    const input = createAssetRevisionRequestSchema.parse(request.body);
    if (input.rawStatus === "approved") throw Object.assign(new Error("A revision must pass candidate review before it can be approved."), { statusCode: 400, code: "approval_required" });
    const asset = (await dependencies.repository.listAssets(request.identity)).find((candidate) => candidate.id === request.params.assetId);
    if (!asset) throw Object.assign(new Error("Asset was not found."), { statusCode: 404, code: "asset_not_found" });
    if (input.rawStatus === "candidate" && asset.executionPolicy === "quarantined-source") throw Object.assign(new Error("Quarantined source must be built and validated by the platform before candidacy."), { statusCode: 400, code: "runtime_not_admissible" });
    const expectedRoot = `tenants/${request.identity.tenantId}/assets/${request.params.assetId}/revisions/${input.revisionId}`;
    if (input.packageRootKey !== expectedRoot || input.packageIndexKey !== `${expectedRoot}/package-index.json`) throw Object.assign(new Error("Package keys do not identify this exact tenant asset revision."), { statusCode: 400, code: "invalid_package_boundary" });
    const indexBytes = await dependencies.storage.get(input.packageIndexKey).catch(() => null);
    if (!indexBytes || sha256(indexBytes) !== input.packageIndexHash) throw Object.assign(new Error("Package index is missing or its hash does not match."), { statusCode: 400, code: "invalid_package_index" });
    const index = furniturePackageIndexSchema.parse(JSON.parse(new TextDecoder().decode(indexBytes)));
    const packageIssues = validateFurniturePackageKeyBoundary(index, expectedRoot);
    if (index.assetKey !== asset.assetKey || index.revisionId !== input.revisionId || index.contractHash !== input.contractHash || index.artifactSetHash !== input.artifactSetHash || computeFurnitureArtifactSetHash(index.objects) !== input.artifactSetHash) packageIssues.push("package-index identity or hashes do not match the revision request");
    for (const object of index.objects) {
      const stored = await dependencies.storage.head(object.objectKey);
      if (!stored || stored.sha256 !== object.sha256 || stored.size !== object.sizeBytes || stored.mediaType !== object.mediaType) packageIssues.push(`${object.logicalPath} is missing or does not match its immutable metadata`);
    }
    if (packageIssues.length) throw Object.assign(new Error("The furniture package is incomplete or crosses its revision boundary."), { statusCode: 400, code: "invalid_furniture_package", issues: packageIssues });
    const manifestObject = index.objects.find((object) => object.logicalPath === index.entrypoints.manifest)!;
    const manifest = JSON.parse(new TextDecoder().decode(await dependencies.storage.get(manifestObject.objectKey)));
    const issues = input.rawStatus === "candidate" ? furnitureCandidateReadinessIssues(manifest, input.contractHash) : validateFurnitureAssetManifest(manifest);
    if (manifest.id !== asset.assetKey || manifest.status !== input.rawStatus) issues.push("manifest id/status must match assetKey/rawStatus");
    if (issues.length) throw Object.assign(new Error("The furniture manifest does not satisfy the v3 contract."), { statusCode: 400, code: "invalid_furniture_manifest", issues });
    const { revisionId, ...revisionInput } = input;
    const result = await dependencies.repository.createAssetRevision(request.identity, request.params.assetId, { ...revisionInput, id: revisionId, objects: index.objects });
    return reply.status(result.reused ? 200 : 201).send({ ...result.revision, reused: result.reused });
  });
  app.post<{ Params: { assetId: string } }>("/api/v1/assets/:assetId/approve", async (request) => {
    const input = approveAssetRequestSchema.parse(request.body);
    return dependencies.repository.approveAsset(request.identity, request.params.assetId, input.revisionId, input.contractHash, input.decision === "approved", input.idempotencyKey);
  });

  app.post("/api/v1/agent-runs", async (request, reply) => {
    const input = createAgentRunRequestSchema.parse(request.body); const result = await dependencies.repository.createAgentRun(request.identity, input);
    if (!result.reused) await dependencies.publisher.publish({ kind: "start", runId: result.run.id, tenantId: request.identity.tenantId, workspaceId: request.identity.workspaceId, userId: request.identity.userId, message: input.message });
    return reply.status(202).send({ runId: result.run.id, conversationId: result.run.conversationId, eventsUrl: `${dependencies.config.publicBaseUrl}/api/v1/agent-runs/${result.run.id}/events`, reused: result.reused });
  });
  app.get<{ Params: { runId: string } }>("/api/v1/agent-runs/:runId", async (request) => {
    const run = await dependencies.repository.getAgentRun(request.identity, request.params.runId);
    if (!run) throw Object.assign(new Error("Agent run was not found."), { statusCode: 404, code: "agent_run_not_found" });
    return run;
  });
  app.get<{ Params: { runId: string } }>("/api/v1/agent-runs/:runId/events", async (request, reply) => {
    const lastEventId = Number(request.headers["last-event-id"] ?? 0);
    const run = await dependencies.repository.getAgentRun(request.identity, request.params.runId);
    if (!run) throw Object.assign(new Error("Agent run was not found."), { statusCode: 404, code: "agent_run_not_found" });
    reply.hijack(); reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
    const write = (event: Awaited<ReturnType<ControlPlaneRepository["appendAgentEvent"]>>) => reply.raw.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    for (const event of await dependencies.repository.listAgentEvents(request.identity, request.params.runId, Number.isFinite(lastEventId) ? lastEventId : 0)) write(event);
    const unsubscribe = dependencies.repository.subscribe(request.params.runId, write);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    request.raw.once("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });
  app.post<{ Params: { runId: string } }>("/api/v1/agent-runs/:runId/messages", async (request, reply) => {
    const input = postAgentMessageRequestSchema.parse(request.body); const run = await dependencies.repository.getAgentRun(request.identity, request.params.runId);
    if (!run) throw Object.assign(new Error("Agent run was not found."), { statusCode: 404, code: "agent_run_not_found" });
    if (terminalAgentRunStatuses.has(run.status)) throw Object.assign(new Error("Terminal runs cannot accept new messages."), { statusCode: 409, code: "run_terminal" });
    const accepted = await dependencies.repository.claimIdempotency(request.identity, `agent-run:${run.id}:message`, input.idempotencyKey, input);
    if (accepted) await dependencies.publisher.publish({ kind: "message", runId: run.id, tenantId: request.identity.tenantId, workspaceId: request.identity.workspaceId, userId: request.identity.userId, message: input.message });
    return reply.status(202).send({ runId: run.id, reused: !accepted });
  });
  app.post<{ Params: { runId: string; requestId: string } }>("/api/v1/agent-runs/:runId/approvals/:requestId", async (request, reply) => {
    const input = resolveAgentRequestSchema.parse(request.body); const run = await dependencies.repository.getAgentRun(request.identity, request.params.runId);
    if (!run) throw Object.assign(new Error("Agent run was not found."), { statusCode: 404, code: "agent_run_not_found" });
    const accepted = await dependencies.repository.claimIdempotency(request.identity, `agent-run:${run.id}:approval:${request.params.requestId}`, input.idempotencyKey, input);
    if (accepted) await dependencies.publisher.publish({ kind: "approval", runId: run.id, tenantId: request.identity.tenantId, workspaceId: request.identity.workspaceId, userId: request.identity.userId, requestId: request.params.requestId, decision: input.decision, message: input.message });
    return reply.status(202).send({ runId: run.id, requestId: request.params.requestId, reused: !accepted });
  });
  app.post<{ Params: { runId: string } }>("/api/v1/agent-runs/:runId/cancel", async (request, reply) => {
    const run = await dependencies.repository.getAgentRun(request.identity, request.params.runId); if (!run) throw Object.assign(new Error("Agent run was not found."), { statusCode: 404, code: "agent_run_not_found" });
    if (!terminalAgentRunStatuses.has(run.status)) { await dependencies.repository.updateAgentRun(request.identity, run.id, { status: "cancelled" }); await dependencies.repository.appendAgentEvent(request.identity, run.id, "run.progress", { status: "cancelled", message: "Run cancelled." }); await dependencies.publisher.publish({ kind: "cancel", runId: run.id, tenantId: request.identity.tenantId, workspaceId: request.identity.workspaceId, userId: request.identity.userId }); }
    return reply.status(202).send({ runId: run.id, status: "cancelled" });
  });

  app.addHook("onClose", async () => dependencies.publisher.close());
  return app;
}

export function sha256(value: Uint8Array) { return createHash("sha256").update(value).digest("hex"); }

function deterministicUuid(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
