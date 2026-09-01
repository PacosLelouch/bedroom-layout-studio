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

export function clearFurnitureRuntimeCache(assetId?: string) {
  if (!assetId) return runtimeCache.clear();
  for (const key of runtimeCache.keys()) if (key.startsWith(`${assetId}:`)) runtimeCache.delete(key);
}

export function loadFurnitureRuntime(assetId: string): Promise<FurnitureRuntimeFactory> {
  const asset = findFurnitureAsset(assetId); const key = `${assetId}:${asset?.assetRevision ?? "missing"}`; const cached = runtimeCache.get(key); if (cached) return cached.promise;
  const loader = FURNITURE_RUNTIME_LOADERS[assetId];
  const entry: CacheEntry = { promise: loader ? loader().then((module) => { markBedroomPerformance(BEDROOM_PERFORMANCE_MARKS.assetRuntimeLoad, { assetId }); return module.createFurnitureModel; }) : Promise.resolve(createSimpleFurniture) };
  entry.promise.catch((error) => { entry.error = error; }); runtimeCache.set(key, entry); return entry.promise;
}

export async function createFurnitureModel(item: FurnitureItem, purpose: FurnitureRuntimePurpose = "scene"): Promise<THREE.Group> {
  const factory = await loadFurnitureRuntime(item.assetId); const group = factory(itemConfiguration(item), { purpose }); group.name = item.name;
  group.userData = { ...group.userData, furnitureId: item.id, assetId: item.assetId, clickable: true, explodable: true };
  group.traverse((child) => { child.userData.furnitureId = item.id; }); return group;
}
