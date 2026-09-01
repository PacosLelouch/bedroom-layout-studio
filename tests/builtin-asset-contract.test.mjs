import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createServer } from "vite";
import { validateFurnitureAssetManifest } from "../lib/bedroom/assets/contract-core.mjs";

function componentSignature(root, component, effect) {
  const entries = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!component.nodeNames.includes(object.name) && object.name !== component.pivotNode) return;
    const mesh = object instanceof THREE.Mesh;
    const box = new THREE.Box3().setFromObject(object);
    entries.push({
      name: object.name,
      transform: ["transform", "behavior"].includes(effect) ? object.matrix.toArray() : undefined,
      visibility: ["visibility", "behavior"].includes(effect) ? object.visible : undefined,
      geometry: ["geometry", "behavior"].includes(effect) && mesh ? [object.geometry.getAttribute("position")?.count ?? 0, object.geometry.index?.count ?? 0] : undefined,
      material: ["material", "behavior"].includes(effect) && mesh ? (Array.isArray(object.material) ? object.material : [object.material]).map((material) => [material.type, material.color?.getHexString(), material.roughness, material.metalness]) : undefined,
      dimensions: ["dimensions", "behavior"].includes(effect) && !box.isEmpty() ? box.getSize(new THREE.Vector3()).toArray() : undefined,
    });
  });
  return JSON.stringify(entries);
}

test("keeps every built-in on the shared manifest v3 technical contract", async () => {
  const server = await createServer({ appType: "custom", configFile: false, server: { middlewareMode: true } });
  try {
    const { BUILTIN_ASSETS } = await server.ssrLoadModule("/lib/bedroom/assets/registry/index.ts");
    const { FURNITURE_PACKAGE_RUNTIME_LOADERS } = await server.ssrLoadModule("/lib/bedroom/assets/registry/runtime-loaders.generated.ts");
    for (const entry of BUILTIN_ASSETS) {
      const asset = { ...entry.manifest, assetRevision: entry.contractHash };
      assert.equal(asset.schemaVersion, 3, asset.id);
      assert.equal(asset.assetScope, "builtin", asset.id);
      assert.equal(asset.lifecyclePolicy, "repository-trusted", asset.id);
      assert.match(asset.assetRevision, /^[0-9a-f]{64}$/, asset.id);
      assert.deepEqual(validateFurnitureAssetManifest(asset, { requireCandidateReady: true }), [], asset.id);
      const runtime = (await FURNITURE_PACKAGE_RUNTIME_LOADERS[asset.id]()).createFurnitureModel;
      const signatures = new Map();
      for (const configuration of asset.validationConfigurations) {
        for (const purpose of ["scene", "review", "export"]) {
          const root = runtime(configuration, { purpose });
          try {
            root.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(root);
            const names = new Set();
            root.traverse((object) => { if (object.name) names.add(object.name); });
            assert.equal(box.isEmpty(), false, `${asset.id}/${configuration.id}/${purpose}`);
            assert.ok(Math.abs(box.min.y) <= 0.01, `${asset.id}/${configuration.id}/${purpose} must be grounded`);
            for (const component of asset.components) {
              for (const nodeName of component.nodeNames) assert.ok(names.has(nodeName), `${asset.id} missing ${nodeName}`);
              if (component.pivotNode) assert.ok(names.has(component.pivotNode), `${asset.id} missing ${component.pivotNode}`);
            }
            if (purpose === "scene") for (const binding of asset.capabilityBindings) for (const componentId of binding.componentIds) {
              const component = asset.components.find((entry) => entry.id === componentId);
              signatures.set(`${configuration.id}:${binding.capabilityId}:${componentId}:${binding.effect}`, componentSignature(root, component, binding.effect));
            }
          } finally {
            root.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return;
              object.geometry.dispose();
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
            });
          }
        }
      }
      for (const binding of asset.capabilityBindings) {
        const tested = asset.validationConfigurations.find((entry) => entry.testsCapability === binding.capabilityId && entry.compareAgainst);
        let pair = tested ? [tested, asset.validationConfigurations.find((entry) => entry.id === tested.compareAgainst)] : null;
        if (!pair) {
          const stateId = binding.capabilityId.startsWith("state:") ? binding.capabilityId.slice(6) : null;
          const variant = stateId ? asset.validationConfigurations.find((entry) => entry.stateId === stateId) : null;
          const other = stateId ? asset.validationConfigurations.find((entry) => entry.stateId !== stateId && JSON.stringify(entry.parameters) === JSON.stringify(variant?.parameters)) : null;
          if (variant && other) pair = [variant, other];
        }
        assert.ok(pair?.[0] && pair?.[1], `${asset.id}/${binding.capabilityId} comparison pair`);
        for (const componentId of binding.componentIds) {
          const key = (configuration) => `${configuration.id}:${binding.capabilityId}:${componentId}:${binding.effect}`;
          assert.notEqual(signatures.get(key(pair[0])), signatures.get(key(pair[1])), `${asset.id}/${binding.capabilityId}/${componentId} must change ${binding.effect}`);
        }
      }
    }
  } finally {
    await server.close();
  }
});
