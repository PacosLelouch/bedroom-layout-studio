import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FilesystemObjectStorage } from "@bedroom/storage";
import { loadApiConfig } from "../src/config.js";
import { MemoryAgentJobPublisher } from "../src/queue.js";
import { MemoryControlPlaneRepository } from "../src/repository.js";
import { createApiServer } from "../src/server.js";
import { computeFurnitureArtifactSetHash } from "@bedroom/furniture-assets/package-core";

const snapshot = {
  schemaVersion: 2 as const,
  id: "test-layout",
  name: "Test",
  savedAt: "2026-09-01T00:00:00.000Z",
  rooms: [{
    id: "room",
    name: "Room",
    dimensions: { width: 3000, depth: 3000, height: 2600 },
    clearArea: 9,
    outline: [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }, { x: 0, z: 3000 }],
    keepOutZones: [],
    doors: [],
    items: [],
  }],
};

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bedroom-api-"));
  const config = loadApiConfig({ NODE_ENV: "test", STORAGE_ROOT: root });
  const repository = new MemoryControlPlaneRepository();
  const publisher = new MemoryAgentJobPublisher();
  const storage = new FilesystemObjectStorage(root);
  const app = await createApiServer({ config, repository, publisher, storage });
  return { app, publisher, root, storage };
}

test("creates immutable layout versions and reuses an idempotent request", async () => {
  const { app, root } = await fixture();
  try {
    const payload = { name: "Bedroom", snapshot, idempotencyKey: "layout-request-001" };
    const first = await app.inject({ method: "POST", url: "/api/v1/layouts", payload });
    const second = await app.inject({ method: "POST", url: "/api/v1/layouts", payload });
    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    assert.equal(first.json().id, second.json().id);

    const stale = await app.inject({ method: "POST", url: `/api/v1/layouts/${first.json().id}/versions`, payload: { parentVersionId: "00000000-0000-4000-8000-000000000099", snapshot, idempotencyKey: "version-request-001" } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, "base_revision_changed");
  } finally {
    await app.close(); await rm(root, { recursive: true, force: true });
  }
});

test("registers an asset revision from immutable package keys without storing manifest content", async () => {
  const { app, root, storage } = await fixture();
  try {
    const createdAsset = await app.inject({ method: "POST", url: "/api/v1/assets", payload: { assetKey: "test-chair", name: "Test Chair", category: "seat", assetScope: "user-generated", lifecyclePolicy: "user-reviewed", idempotencyKey: "asset-create-001" } });
    assert.equal(createdAsset.statusCode, 201);
    const assetId = createdAsset.json().id as string; const revisionId = randomUUID();
    const prefix = `tenants/00000000-0000-4000-8000-000000000002/assets/${assetId}/revisions/${revisionId}`;
    const manifest = { schemaVersion: 3, assetScope: "user-generated", id: "test-chair", name: "Test Chair", category: "seat", status: "draft", origin: { method: "manual-procedural" }, lifecyclePolicy: "user-reviewed", appearance: { defaultColor: "#887766" }, dimensions: null, defaultConfiguration: null, parameterDefinitions: [], states: [], components: [], capabilityBindings: [], validationConfigurations: [], designOverrides: [], candidateEvidence: null, runtimeEvidence: null, footprintPolicy: { type: "configuration-dimensions" }, clearancePolicy: { type: "none" }, exportCapabilities: { formats: ["glb"], materialPolicy: "portable-pbr", preserveComponentNodes: true }, exportReady: false, exportIssue: "draft", exportEvidence: null, dimensionSource: null, qualityEvidence: [], reviewViews: [], referenceImage: null, approvedFactoryHash: null, reviewedAt: null };
    const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest)}\n`); const runtimeBytes = new TextEncoder().encode("export const runtimeAbiVersion=1; export function createFurnitureModel(){}\n");
    const storedManifest = await storage.putImmutable(`${prefix}/contract/asset.json`, manifestBytes, "application/json"); const storedRuntime = await storage.putImmutable(`${prefix}/runtime/runtime.mjs`, runtimeBytes, "text/javascript; charset=utf-8");
    const objects = [{ logicalPath: "contract/asset.json", objectKey: storedManifest.key, sha256: storedManifest.sha256, sizeBytes: storedManifest.size, mediaType: storedManifest.mediaType }, { logicalPath: "runtime/runtime.mjs", objectKey: storedRuntime.key, sha256: storedRuntime.sha256, sizeBytes: storedRuntime.size, mediaType: storedRuntime.mediaType }];
    const contractHash = "a".repeat(64); const artifactSetHash = computeFurnitureArtifactSetHash(objects);
    const index = { schemaVersion: 1, assetKey: "test-chair", revisionId, contractHash, artifactSetHash, runtimeAbiVersion: 1, entrypoints: { manifest: "contract/asset.json", runtime: "runtime/runtime.mjs" }, objects };
    const indexBytes = new TextEncoder().encode(`${JSON.stringify(index)}\n`); const storedIndex = await storage.putImmutable(`${prefix}/package-index.json`, indexBytes, "application/json");
    const response = await app.inject({ method: "POST", url: `/api/v1/assets/${assetId}/revisions`, payload: { parentRevisionId: null, revisionId, packageRootKey: prefix, packageIndexKey: storedIndex.key, packageIndexHash: storedIndex.sha256, contractHash, artifactSetHash, manifestSchemaVersion: 3, runtimeAbiVersion: 1, rawStatus: "draft", idempotencyKey: "asset-revision-001" } });
    assert.equal(response.statusCode, 201, response.body); assert.equal(response.json().packageIndexKey, storedIndex.key); assert.equal("manifest" in response.json(), false);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test("queues one Agent run for repeated idempotent creation", async () => {
  const { app, publisher, root } = await fixture();
  try {
    const payload = { intent: "general-message", message: "Suggest a layout", idempotencyKey: "agent-request-001" };
    const first = await app.inject({ method: "POST", url: "/api/v1/agent-runs", payload });
    const second = await app.inject({ method: "POST", url: "/api/v1/agent-runs", payload });
    assert.equal(first.statusCode, 202);
    assert.equal(second.statusCode, 202);
    assert.equal(first.json().runId, second.json().runId);
    assert.equal(publisher.jobs.length, 1);
    assert.equal(second.json().reused, true);
  } finally {
    await app.close(); await rm(root, { recursive: true, force: true });
  }
});

test("queues an Agent follow-up only once for an idempotency key", async () => {
  const { app, publisher, root } = await fixture();
  try {
    const created = await app.inject({ method: "POST", url: "/api/v1/agent-runs", payload: { intent: "general-message", message: "Start", idempotencyKey: "agent-message-run-001" } });
    const runId = created.json().runId as string;
    const payload = { message: "Continue", idempotencyKey: "agent-message-001" };
    const first = await app.inject({ method: "POST", url: `/api/v1/agent-runs/${runId}/messages`, payload });
    const second = await app.inject({ method: "POST", url: `/api/v1/agent-runs/${runId}/messages`, payload });
    const conflicting = await app.inject({ method: "POST", url: `/api/v1/agent-runs/${runId}/messages`, payload: { ...payload, message: "Different" } });
    assert.equal(first.statusCode, 202);
    assert.equal(second.statusCode, 202);
    assert.equal(second.json().reused, true);
    assert.equal(conflicting.statusCode, 409);
    assert.equal(publisher.jobs.length, 2);
  } finally {
    await app.close(); await rm(root, { recursive: true, force: true });
  }
});

test("keeps development tenant headers isolated", async () => {
  const { app, root } = await fixture();
  try {
    await app.inject({ method: "POST", url: "/api/v1/layouts", payload: { name: "Private", snapshot, idempotencyKey: "tenant-a-layout" } });
    const other = await app.inject({ method: "GET", url: "/api/v1/layouts", headers: { "x-tenant-id": "00000000-0000-4000-8000-000000000010", "x-workspace-id": "00000000-0000-4000-8000-000000000011" } });
    assert.deepEqual(other.json(), []);
  } finally {
    await app.close(); await rm(root, { recursive: true, force: true });
  }
});
