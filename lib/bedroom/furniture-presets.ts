import { configurationIssues, findFurnitureAsset, itemConfiguration } from "./asset-registry";
import type { FurnitureItem, FurniturePreset } from "./types";

export const FURNITURE_PRESET_STORAGE_KEY = "bedroom-layout-studio.furniture-presets.v1";

function presetId() {
  return globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parsePreset(value: unknown): FurniturePreset {
  if (!value || typeof value !== "object") throw new Error("预制体格式无效。");
  const preset = value as FurniturePreset;
  if (preset.schemaVersion !== 1 || !preset.id || !preset.name || !preset.assetId || !preset.assetRevision) throw new Error("预制体缺少必要信息。");
  const asset = findFurnitureAsset(preset.assetId);
  if (!asset) throw new Error(`家具资产不存在：${preset.assetId}`);
  const issues = configurationIssues(asset, preset.configuration);
  if (issues.length) throw new Error(`预制体参数无效：${issues.join("；")}`);
  return {
    ...preset,
    configuration: {
      dimensions: { ...preset.configuration.dimensions },
      parameters: { ...preset.configuration.parameters },
      stateId: preset.configuration.stateId,
    },
  };
}

export function loadFurniturePresets(): FurniturePreset[] {
  try {
    const raw = window.localStorage.getItem(FURNITURE_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as { schemaVersion?: unknown; presets?: unknown };
    if (value.schemaVersion !== 1 || !Array.isArray(value.presets)) return [];
    return value.presets.flatMap((entry) => {
      try { return [parsePreset(entry)]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

export function storeFurniturePresets(presets: FurniturePreset[]) {
  window.localStorage.setItem(FURNITURE_PRESET_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, presets }));
}

export function saveFurniturePreset(item: FurnitureItem, name: string, existingId?: string): FurniturePreset[] {
  const asset = findFurnitureAsset(item.assetId);
  if (!asset) throw new Error("找不到这件家具的基础资产。");
  const configuration = itemConfiguration(item);
  const issues = configurationIssues(asset, configuration);
  if (issues.length) throw new Error(issues.join("；"));
  const presets = loadFurniturePresets();
  const sameName = presets.find((preset) => preset.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  if (sameName && sameName.id !== existingId) throw new Error("DUPLICATE_NAME");
  const now = new Date().toISOString();
  const previous = existingId ? presets.find((preset) => preset.id === existingId) : undefined;
  const next: FurniturePreset = {
    schemaVersion: 1,
    id: previous?.id ?? presetId(),
    name: name.trim(),
    assetId: item.assetId,
    assetRevision: asset.assetRevision,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    configuration,
  };
  const result = previous ? presets.map((preset) => preset.id === previous.id ? next : preset) : [...presets, next];
  storeFurniturePresets(result);
  return result;
}

export function deleteFurniturePreset(id: string): FurniturePreset[] {
  const result = loadFurniturePresets().filter((preset) => preset.id !== id);
  storeFurniturePresets(result);
  return result;
}

export function exportFurniturePresets(presets: FurniturePreset[], name = "furniture-presets.json") {
  const blob = new Blob([`${JSON.stringify({ schemaVersion: 1, presets }, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function importFurniturePresets(file: File): Promise<FurniturePreset[]> {
  const payload = JSON.parse(await file.text()) as { schemaVersion?: unknown; presets?: unknown };
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.presets)) throw new Error("不支持的预制体文件版本。");
  const imported = payload.presets.map(parsePreset);
  const existing = loadFurniturePresets();
  const ids = new Set(existing.map((preset) => preset.id));
  const names = new Set(existing.map((preset) => preset.name.trim().toLocaleLowerCase()));
  for (const preset of imported) {
    if (ids.has(preset.id)) throw new Error(`预制体 ID 重复：${preset.id}`);
    if (names.has(preset.name.trim().toLocaleLowerCase())) throw new Error(`预制体名称重复：${preset.name}`);
    ids.add(preset.id);
    names.add(preset.name.trim().toLocaleLowerCase());
  }
  const result = [...existing, ...imported];
  storeFurniturePresets(result);
  return result;
}

export function presetIsStale(preset: FurniturePreset) {
  return findFurnitureAsset(preset.assetId)?.assetRevision !== preset.assetRevision;
}
