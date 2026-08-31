import { parseLayoutSnapshot } from "./layout-schema";
import type { LayoutSnapshot, RoomLayout } from "./types";

export const LAYOUT_STORAGE_KEY = "bedroom-layout-studio.layout.v1";

export function createLayoutSnapshot(rooms: RoomLayout[], savedAt = new Date()): LayoutSnapshot {
  return parseLayoutSnapshot({
    schemaVersion: 1,
    id: "browser-layout",
    name: "我的卧室布局",
    savedAt: savedAt.toISOString(),
    rooms,
  });
}

export function serializeLayoutSnapshot(snapshot: LayoutSnapshot): string {
  return JSON.stringify(parseLayoutSnapshot(snapshot));
}

export function serializeLayoutSnapshotPretty(snapshot: LayoutSnapshot): string {
  return `${JSON.stringify(parseLayoutSnapshot(snapshot), null, 2)}\n`;
}

export function deserializeLayoutSnapshot(raw: string): LayoutSnapshot {
  return parseLayoutSnapshot(JSON.parse(raw));
}

export function saveLayoutToBrowser(rooms: RoomLayout[]): LayoutSnapshot {
  const snapshot = createLayoutSnapshot(rooms);
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayoutSnapshot(snapshot));
  return snapshot;
}

export function loadLayoutFromBrowser(): LayoutSnapshot | null {
  const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  return raw ? deserializeLayoutSnapshot(raw) : null;
}

interface SaveFilePickerHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<SaveFilePickerHandle>;
};

function snapshotFileName(date: Date) {
  const stamp = date.toISOString().replace(/[:T]/g, "-").slice(0, 16);
  return `bedroom-layout-${stamp}.json`;
}

export async function saveLayoutCopy(rooms: RoomLayout[]): Promise<"picker" | "download"> {
  const snapshot = createLayoutSnapshot(rooms);
  const contents = serializeLayoutSnapshotPretty(snapshot);
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    const handle = await picker.call(window, {
      suggestedName: snapshotFileName(new Date(snapshot.savedAt)),
      types: [{ description: "卧室布局 JSON", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return "picker";
  }

  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = snapshotFileName(new Date(snapshot.savedAt));
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return "download";
}

export async function loadLayoutFromFile(file: File): Promise<LayoutSnapshot> {
  return deserializeLayoutSnapshot(await file.text());
}
