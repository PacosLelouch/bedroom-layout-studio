import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { candidateReadinessIssues, computeFurnitureAssetContractHash, validateFurnitureAssetManifest } from "../scripts/furniture-asset-contract.mjs";

function manifest(overrides = {}) {
  return {
    schemaVersion: 3, assetScope: "user-generated", id: "test-chair", name: "测试椅", category: "seat", status: "draft", origin: { method: "manual-procedural" }, lifecyclePolicy: "user-reviewed", appearance: { defaultColor: "#887766" }, qualityEvidence: [{ kind: "source", label: "fixture", path: "fixture" }],
    dimensions: null, dimensionSource: null, defaultConfiguration: null, dimensionConstraints: {},
    parameterDefinitions: [], states: [], components: [{ id: "body", label: "主体", nodeNames: ["body"], movable: false }],
    capabilityBindings: [], validationConfigurations: [], designOverrides: [], footprintPolicy: { type: "configuration-dimensions" }, clearancePolicy: { type: "none" }, exportCapabilities: { formats: ["glb"], materialPolicy: "portable-pbr", preserveComponentNodes: true }, exportReady: false,
    exportIssue: "not checked", candidateEvidence: null, exportEvidence: null, ...overrides,
  };
}

test("draft may remain incomplete while candidate may not", () => {
  assert.deepEqual(validateFurnitureAssetManifest(manifest()), []);
  assert.ok(validateFurnitureAssetManifest(manifest({ status: "candidate" })).some((issue) => issue.includes("尺寸")));
});

test("empty states and parameters are valid when a default configuration is fully verified", () => {
  const dimensions = { width: 400, depth: 400, height: 800 };
  const value = manifest({
    status: "draft", dimensions, dimensionSource: { type: "user-provided", note: "用户测量" },
    defaultConfiguration: { dimensions, parameters: {}, stateId: null }, exportReady: true, exportIssue: undefined,
    validationConfigurations: [{ id: "default", dimensions, parameters: {}, stateId: null }],
  });
  assert.deepEqual(validateFurnitureAssetManifest(value, { requireCandidateReady: true }), []);
});

test("contract hash ignores status and evidence but changes with capabilities", () => {
  const base = manifest();
  const first = computeFurnitureAssetContractHash("model", "runtime", base);
  const evidenceOnly = computeFurnitureAssetContractHash("model", "runtime", { ...base, status: "approved", reviewedAt: "later", candidateEvidence: { contractHash: "old" } });
  const readinessOnly = computeFurnitureAssetContractHash("model", "runtime", { ...base, exportReady: true, exportIssue: undefined });
  const changed = computeFurnitureAssetContractHash("model", "runtime", { ...base, states: [{ id: "open", label: "打开" }] });
  const exportCapabilityChanged = computeFurnitureAssetContractHash("model", "runtime", { ...base, exportCapabilities: { ...base.exportCapabilities, preserveComponentNodes: false } });
  assert.equal(first, evidenceOnly);
  assert.equal(first, readinessOnly);
  assert.notEqual(first, changed);
  assert.notEqual(first, exportCapabilityChanged);
});

test("candidate evidence must match the current contract", () => {
  const dimensions = { width: 400, depth: 400, height: 800 };
  const value = manifest({
    status: "candidate", dimensions, dimensionSource: { type: "user-provided", note: "用户测量" },
    defaultConfiguration: { dimensions, parameters: {}, stateId: null }, exportReady: true, exportIssue: undefined,
    validationConfigurations: [{ id: "default", dimensions, parameters: {}, stateId: null }],
  });
  assert.ok(candidateReadinessIssues(value, "current").some((issue) => issue.includes("候选证据")));
});

test("img2threejs integration documentation uses the repository submodule", async () => {
  const documentation = await readFile("docs/IMG2THREEJS_INTEGRATION.md", "utf8");
  assert.match(documentation, /git submodule update --init --recursive/);
  assert.match(documentation, /Git submodule/);
});
