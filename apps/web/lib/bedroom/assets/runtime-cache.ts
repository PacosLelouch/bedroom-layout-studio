import * as THREE from "three";
import type { FurnitureItem } from "../types";
import { findFurnitureAsset } from "./catalog";
import { itemConfiguration } from "./catalog-operations";
import { FURNITURE_RUNTIME_LOADERS } from "./runtime-loaders";
import type { FurnitureRuntimeFactory, FurnitureRuntimePurpose } from "./runtime-types";
import { createSimpleFurniture } from "./builtin/shared/primitives";
import { BEDROOM_PERFORMANCE_MARKS, markBedroomPerformance } from "../performance";

interface CacheEntry { promise: Promise<FurnitureRuntimeFactory>; error?: unknown }
const runtimeCache = new Map<string, CacheEntry>();
const remoteRuntimes = new Map<string, { revisionId: string; url: string; resources: Record<string, string> }>();

function announceRuntimeCacheChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bedroom:runtime-cache", { detail: getFurnitureRuntimeCacheState() }));
}

/** Aggregate only: used by the shared status indicator without exposing module details. */
export function getFurnitureRuntimeCacheState() {
  return { entries: runtimeCache.size, remoteEntries: remoteRuntimes.size };
}

export function registerRemoteFurnitureRuntime(assetId: string, revisionId: string, url: string, resources: Record<string, string>) {
  remoteRuntimes.set(assetId, { revisionId, url, resources });
  clearFurnitureRuntimeCache(assetId);
}

export function clearFurnitureRuntimeCache(assetId?: string) {
  if (!assetId) {
    runtimeCache.clear();
    announceRuntimeCacheChange();
    return;
  }
  for (const key of runtimeCache.keys()) if (key.startsWith(`${assetId}:`)) runtimeCache.delete(key);
  announceRuntimeCacheChange();
}

export function loadFurnitureRuntime(assetId: string): Promise<FurnitureRuntimeFactory> {
  const asset = findFurnitureAsset(assetId); const key = `${assetId}:${asset?.assetRevision ?? "missing"}`; const cached = runtimeCache.get(key); if (cached) return cached.promise;
  const loader = FURNITURE_RUNTIME_LOADERS[assetId];
  const remote = remoteRuntimes.get(assetId);
  const entry: CacheEntry = { promise: remote
    ? loadRemoteRuntime(assetId, remote)
    : loader ? loader().then((module) => { markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.assetRuntimeLoad, { assetId }); return module.createFurnitureModel; }) : Promise.resolve(createSimpleFurniture) };
  entry.promise.catch((error) => { entry.error = error; }); runtimeCache.set(key, entry); announceRuntimeCacheChange(); return entry.promise;
}

export async function createFurnitureModel(item: FurnitureItem, purpose: FurnitureRuntimePurpose = "scene"): Promise<THREE.Group> {
  const factory = await loadFurnitureRuntime(item.assetId); const remote = remoteRuntimes.get(item.assetId); const group = factory(itemConfiguration(item), { purpose, runtimeAbiVersion: 1, three: THREE, resolveResource: (path) => remote?.resources[path] ?? path }); group.name = item.name;
  group.userData = { ...group.userData, furnitureId: item.id, assetId: item.assetId, clickable: true, explodable: true };
  group.traverse((child) => { child.userData.furnitureId = item.id; }); return group;
}

async function loadRemoteRuntime(assetId: string, runtime: { revisionId: string; url: string; resources: Record<string, string> }): Promise<FurnitureRuntimeFactory> {
  (globalThis as typeof globalThis & { __BEDROOM_FURNITURE_RUNTIME_V1__?: unknown }).__BEDROOM_FURNITURE_RUNTIME_V1__ = { three: THREE };
  const module = await import(/* @vite-ignore */ runtime.url) as { runtimeAbiVersion?: number; createFurnitureModel?: FurnitureRuntimeFactory };
  if (module.runtimeAbiVersion !== 1 || typeof module.createFurnitureModel !== "function") throw new Error(`Furniture ${assetId}@${runtime.revisionId} does not implement runtime ABI v1.`);
  markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.assetRuntimeLoad, { assetId, revisionId: runtime.revisionId });
  return module.createFurnitureModel;
}
