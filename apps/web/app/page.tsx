"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { publicUrl } from "@/lib/public-url";
import Link from "next/link";
import {
  Armchair, BedDouble, Box, CheckCircle2, ChevronDown, Copy, Download, FileImage, FileUp, FolderOpen, Grid3X3, Layers3,
  Maximize2, MousePointer2, Move, PenTool, Plus, Redo2, RotateCcw, RotateCw, Ruler, ShieldCheck, ShieldOff, Sparkles,
  Save, Trash2, Undo2, Upload, X, PackagePlus, Cuboid,
} from "lucide-react";
import { BedroomViewportLoading } from "@/components/bedroom-viewport-loading";
import { DataSourceStatus } from "@/components/data-source-status";
import { AgentPanel } from "@/components/agent-panel";
import { ASSET_CATALOG, catalogItemToFurniture, configurationIssues, findFurnitureAsset, itemConfiguration, nextFurnitureState } from "@/lib/bedroom/asset-registry";
import { createBackendFurnitureAssetProvider, installPublishedFurnitureCatalog } from "@/lib/bedroom/assets";
import { publicApiBaseUrl } from "@/lib/backend";
import {
  deleteFurniturePreset, exportFurniturePresets, importFurniturePresets, loadFurniturePresets,
  presetIsStale, saveFurniturePreset,
} from "@/lib/bedroom/furniture-presets";
import { BUILTIN_FURNITURE_COUNT, PENDING_USER_GENERATED_ASSET_COUNT } from "@/lib/bedroom/assets/registry";
import { collides } from "@/lib/bedroom/geometry";
import { loadLayoutFromBrowser, loadLayoutFromFile, saveLayoutCopy, saveLayoutToBrowser } from "@/lib/bedroom/layout-storage";
import { INITIAL_ROOMS } from "@/lib/bedroom/room-layouts";
import type { FurnitureDimensionConstraint, FurnitureItem, FurnitureParameterDefinition, FurnitureParameterValue, FurniturePreset, InteractionMode, RoomLayout, ViewMode } from "@/lib/bedroom/types";

const BedroomViewport = lazy(() => import("@/components/bedroom-viewport").then((module) => ({ default: module.BedroomViewport })));

interface LayoutHistory {
  past: RoomLayout[][];
  present: RoomLayout[];
  future: RoomLayout[][];
}

function createClientId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export default function Home() {
  const [assetCatalog, setAssetCatalog] = useState(() => [...ASSET_CATALOG]);
  const [layoutHistory, setLayoutHistory] = useState<LayoutHistory>(() => ({ past: [], present: INITIAL_ROOMS, future: [] }));
  const rooms = layoutHistory.present;
  const [roomId, setRoomId] = useState("master");
  const [selectedId, setSelectedId] = useState<string | null>("master-bed");
  const [viewMode, setViewMode] = useState<ViewMode>("perspective");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("interact");
  const [snap, setSnap] = useState(100);
  const [showGrid, setShowGrid] = useState(true);
  const [showWalls, setShowWalls] = useState(true);
  const [showReference, setShowReference] = useState(false);
  const [collisionDetectionEnabled, setCollisionDetectionEnabled] = useState(true);
  const [layoutNotice, setLayoutNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<"load" | "save" | null>(null);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: "新房间", width: 3000, depth: 3600, height: 2800 });
  const [presets, setPresets] = useState<FurniturePreset[]>([]);
  const layoutFileRef = useRef<HTMLInputElement>(null);
  const presetFileRef = useRef<HTMLInputElement>(null);
  const room = rooms.find((entry) => entry.id === roomId) ?? rooms[0];
  const selected = room.items.find((item) => item.id === selectedId) ?? null;
  const selectedAsset = selected ? findFurnitureAsset(selected.assetId) : undefined;
  const selectedIssues = selected && selectedAsset ? configurationIssues(selectedAsset, itemConfiguration(selected)) : [];
  const dimensionDeviation = selected && selectedAsset
    ? Math.max(
        selected.size.width / selectedAsset.defaultConfiguration.dimensions.width,
        selectedAsset.defaultConfiguration.dimensions.width / selected.size.width,
        selected.size.depth / selectedAsset.defaultConfiguration.dimensions.depth,
        selectedAsset.defaultConfiguration.dimensions.depth / selected.size.depth,
        selected.size.height / selectedAsset.defaultConfiguration.dimensions.height,
        selectedAsset.defaultConfiguration.dimensions.height / selected.size.height,
      ) - 1
    : 0;
  const collisionIds = useMemo(() => collisionDetectionEnabled
    ? new Set(room.items.filter((item) => collides(item, room)).map((item) => item.id))
    : new Set<string>(), [collisionDetectionEnabled, room]);
  const occupiedArea = useMemo(() => room.items.filter((item) => !item.wallMounted && item.supportSurface !== "bay-window").reduce((sum, item) => sum + item.size.width * item.size.depth, 0), [room.items]);
  const occupancy = Math.min(100, Math.round(occupiedArea / (room.clearArea * 1_000_000) * 100));

  useEffect(() => {
    const timer = window.setTimeout(() => setPresets(loadFurniturePresets()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!publicApiBaseUrl) return;
    const abort = new AbortController();
    createBackendFurnitureAssetProvider(publicApiBaseUrl).listCatalog()
      .then((entries) => {
        if (abort.signal.aborted) return;
        setAssetCatalog(installPublishedFurnitureCatalog(entries));
        window.dispatchEvent(new CustomEvent("bedroom:catalog-source", { detail: { source: "server" } }));
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        console.warn("Published furniture catalog could not be loaded; using bundled assets.", error);
        window.dispatchEvent(new CustomEvent("bedroom:catalog-source", { detail: { source: "frontend" } }));
      });
    return () => abort.abort();
  }, []);

  const applyRooms = useCallback((updater: (current: RoomLayout[]) => RoomLayout[], recordHistory = true) => {
    setLayoutHistory((current) => {
      const next = updater(current.present);
      if (next === current.present) return current;
      return recordHistory
        ? { past: [...current.past, current.present].slice(-60), present: next, future: [] }
        : { ...current, present: next };
    });
  }, []);

  const undo = useCallback(() => {
    setLayoutHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future].slice(0, 60) };
    });
  }, []);

  const redo = useCallback(() => {
    setLayoutHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return { past: [...current.past, current.present].slice(-60), present: next, future: current.future.slice(1) };
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const updateItem = useCallback((id: string, patch: Partial<FurnitureItem>, options?: { recordHistory?: boolean }) => {
    applyRooms((current) => {
      let changed = false;
      const next = current.map((entry) => {
        if (entry.id !== roomId) return entry;
        const items = entry.items.map((item) => item.id === id ? { ...item, ...patch } : item);
        if (collisionDetectionEnabled && (patch.position || patch.rotation !== undefined)) {
          const candidateRoom = { ...entry, items };
          const candidate = items.find((item) => item.id === id);
          if (candidate && collides(candidate, candidateRoom)) return entry;
        }
        changed = true;
        return { ...entry, items };
      });
      return changed ? next : current;
    }, options?.recordHistory !== false);
  }, [applyRooms, collisionDetectionEnabled, roomId]);
  const updateOutline = useCallback((outline: RoomLayout["outline"], options?: {
    recordHistory?: boolean;
    wallMove?: { axis: "x" | "z"; from: number; to: number };
  }) => {
    applyRooms((current) => current.map((entry) => {
      if (entry.id !== roomId) return entry;
      const width = Math.max(...outline.map((point) => point.x));
      const depth = Math.max(...outline.map((point) => point.z));
      const area = Math.abs(outline.reduce((sum, point, index) => {
        const next = outline[(index + 1) % outline.length];
        return sum + point.x * next.z - next.x * point.z;
      }, 0)) / 2_000_000;
      const wallMove = options?.wallMove;
      const delta = wallMove ? wallMove.to - wallMove.from : 0;
      const doors = wallMove ? entry.doors.map((door) => door.wallAxis !== wallMove.axis || door.wallCoordinate !== wallMove.from ? door : {
        ...door,
        wallCoordinate: wallMove.to,
        hinge: { ...door.hinge, [wallMove.axis]: wallMove.to },
      }) : entry.doors;
      const keepOutZones = wallMove ? entry.keepOutZones.map((zone) => {
        if (wallMove.axis === "x") {
          if (zone.x === wallMove.from) return { ...zone, x: wallMove.to };
          if (zone.x + zone.width === wallMove.from) return { ...zone, x: zone.x + delta };
        } else {
          if (zone.z === wallMove.from) return { ...zone, z: wallMove.to };
          if (zone.z + zone.depth === wallMove.from) return { ...zone, z: zone.z + delta };
        }
        return zone;
      }) : entry.keepOutZones;
      return {
        ...entry,
        outline,
        doors,
        keepOutZones,
        dimensions: { ...entry.dimensions, width, depth },
        clearArea: Number(area.toFixed(2)),
      };
    }), options?.recordHistory !== false);
  }, [applyRooms, roomId]);
  const toggleDoor = useCallback((doorId: string) => {
    applyRooms((current) => current.map((entry) => entry.id !== roomId ? entry : {
      ...entry, doors: entry.doors.map((door) => door.id === doorId ? { ...door, isOpen: door.isOpen === false } : door),
    }));
  }, [applyRooms, roomId]);
  const interactItem = useCallback((itemId: string) => {
    applyRooms((current) => current.map((entry) => entry.id !== roomId ? entry : {
      ...entry,
      items: entry.items.map((item) => item.id === itemId && nextFurnitureState(item)
        ? { ...item, stateId: nextFurnitureState(item) }
        : item),
    }));
  }, [applyRooms, roomId]);
  const addItem = (assetId: string) => {
    const item = catalogItemToFurniture(assetId, room);
    applyRooms((current) => current.map((entry) => entry.id === roomId ? { ...entry, items: [...entry.items, item] } : entry));
    setSelectedId(item.id);
  };
  const addPreset = (preset: FurniturePreset) => {
    if (presetIsStale(preset)) {
      showLayoutNotice("error", "该预制体基于旧资产版本，请重新保存后再使用");
      return;
    }
    const item = catalogItemToFurniture(preset.assetId, room);
    item.size = { ...preset.configuration.dimensions };
    item.parameterValues = { ...preset.configuration.parameters };
    item.stateId = preset.configuration.stateId;
    item.presetId = preset.id;
    item.name = preset.name;
    applyRooms((current) => current.map((entry) => entry.id === roomId ? { ...entry, items: [...entry.items, item] } : entry));
    setSelectedId(item.id);
  };
  const removeItem = () => {
    if (!selectedId) return;
    applyRooms((current) => current.map((entry) => entry.id === roomId ? { ...entry, items: entry.items.filter((item) => item.id !== selectedId) } : entry));
    setSelectedId(null);
  };
  const duplicate = () => {
    if (!selected) return;
    const copy = { ...selected, id: createClientId(selected.assetId), position: { x: selected.position.x + 200, z: selected.position.z + 200 }, size: { ...selected.size }, parameterValues: { ...selected.parameterValues } };
    applyRooms((current) => current.map((entry) => entry.id === roomId ? { ...entry, items: [...entry.items, copy] } : entry));
    setSelectedId(copy.id);
  };

  const showLayoutNotice = (kind: "success" | "error", message: string) => {
    setLayoutNotice({ kind, message });
    window.setTimeout(() => setLayoutNotice(null), 3200);
  };

  const saveSelectedPreset = () => {
    if (!selected) return;
    const name = window.prompt("预制体名称", selected.name)?.trim();
    if (!name) return;
    try {
      setPresets(saveFurniturePreset(selected, name));
      showLayoutNotice("success", `已保存预制体“${name}”`);
    } catch (error) {
      if (error instanceof Error && error.message === "DUPLICATE_NAME") {
        const existing = presets.find((preset) => preset.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        if (existing && window.confirm(`“${name}”已存在，是否明确覆盖？`)) {
          setPresets(saveFurniturePreset(selected, name, existing.id));
          showLayoutNotice("success", `已覆盖预制体“${name}”`);
        }
        return;
      }
      showLayoutNotice("error", error instanceof Error ? error.message : "无法保存预制体");
    }
  };

  const exportSelectedGlb = async () => {
    if (!selected) return;
    try {
      const { downloadFurnitureGlb } = await import("@/lib/bedroom/export/glb-export");
      await downloadFurnitureGlb(selected);
      showLayoutNotice("success", "当前家具 GLB 已导出");
    } catch (error) {
      showLayoutNotice("error", error instanceof Error ? error.message : "无法导出 GLB");
    }
  };

  const importPresetFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const next = await importFurniturePresets(file);
      setPresets(next);
      showLayoutNotice("success", "家具预制体已导入");
    } catch (error) {
      showLayoutNotice("error", error instanceof Error ? error.message : "无法导入预制体");
    }
  };

  const saveLayout = () => {
    try {
      saveLayoutToBrowser(rooms);
      showLayoutNotice("success", "方案已保存到此浏览器");
    } catch {
      showLayoutNotice("error", "保存失败，请检查浏览器存储权限");
    }
  };

  const saveCopy = async () => {
    setOpenActionMenu(null);
    try {
      const method = await saveLayoutCopy(rooms);
      showLayoutNotice("success", method === "picker" ? "JSON 副本已保存" : "JSON 副本已下载");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showLayoutNotice("error", "无法保存 JSON 副本");
    }
  };

  const restoreLayout = (nextRooms: RoomLayout[], message: string) => {
    const nextRoom = nextRooms.find((entry) => entry.id === roomId) ?? nextRooms[0];
    setLayoutHistory((current) => ({
      past: [...current.past, current.present].slice(-60),
      present: nextRooms,
      future: [],
    }));
    setRoomId(nextRoom.id);
    setSelectedId(nextRoom.items[0]?.id ?? null);
    setShowReference(false);
    showLayoutNotice("success", message);
  };

  const loadLayout = () => {
    setOpenActionMenu(null);
    try {
      const snapshot = loadLayoutFromBrowser();
      if (!snapshot) {
        showLayoutNotice("error", "此浏览器中还没有已保存方案");
        return;
      }
      restoreLayout(snapshot.rooms, "已读取浏览器方案");
    } catch {
      showLayoutNotice("error", "已保存方案格式无效，无法读取");
    }
  };

  const loadLayoutFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const snapshot = await loadLayoutFromFile(file);
      restoreLayout(snapshot.rooms, `已读取 ${file.name}`);
    } catch {
      showLayoutNotice("error", "所选文件不是有效的布局 JSON");
    }
  };

  const addRoom = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const width = Math.max(1000, Math.round(newRoom.width));
    const depth = Math.max(1000, Math.round(newRoom.depth));
    const height = Math.max(2000, Math.round(newRoom.height));
    const id = createClientId("room");
    const created: RoomLayout = {
      id,
      name: newRoom.name.trim() || "新房间",
      dimensions: { width, depth, height },
      clearArea: Number((width * depth / 1_000_000).toFixed(2)),
      outline: [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }],
      keepOutZones: [],
      doors: [],
      items: [],
    };
    applyRooms((current) => [...current, created]);
    setRoomId(id);
    setSelectedId(null);
    setShowReference(false);
    setAddRoomOpen(false);
    setNewRoom({ name: "新房间", width: 3000, depth: 3600, height: 2800 });
    showLayoutNotice("success", `${created.name}已创建`);
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-mark"><Layers3 size={18} /></div>
        <div className="brand-copy"><strong>卧室布局工作台</strong><span>装修 / 空间规划</span></div>
        <nav className="room-tabs" aria-label="选择卧室">
          {rooms.map((entry) => (
            <button key={entry.id} className={entry.id === roomId ? "room-tab active" : "room-tab"}
              onClick={() => { setRoomId(entry.id); setSelectedId(entry.items[0]?.id ?? null); }}>{entry.name}</button>
          ))}
          <button className="room-tab add-room" title="添加房间" aria-label="添加房间" onClick={() => setAddRoomOpen(true)}>＋</button>
        </nav>
        <div className="top-actions">
          <button className="load-button" onClick={() => setAgentOpen((value) => !value)} aria-expanded={agentOpen}><Sparkles size={15} /> Agent</button>
          <button className={layoutHistory.past.length ? "icon-button" : "icon-button muted"} aria-label="撤销" title="撤销 Ctrl+Z" onClick={undo} disabled={!layoutHistory.past.length}><Undo2 size={17} /></button>
          <button className={layoutHistory.future.length ? "icon-button" : "icon-button muted"} aria-label="重做" title="重做 Ctrl+Y" onClick={redo} disabled={!layoutHistory.future.length}><Redo2 size={17} /></button>
          <div className="action-menu-wrap">
            <button className="load-button" onClick={() => setOpenActionMenu((value) => value === "load" ? null : "load")} aria-haspopup="menu" aria-expanded={openActionMenu === "load"}><FolderOpen size={15} /> 读取方案 <ChevronDown size={13} /></button>
            {openActionMenu === "load" && <div className="action-menu" role="menu">
              <button role="menuitem" onClick={loadLayout}><FolderOpen size={15} /><span><strong>读取浏览器方案</strong><small>恢复上次保存的版本</small></span></button>
              <button role="menuitem" onClick={() => { setOpenActionMenu(null); layoutFileRef.current?.click(); }}><FileUp size={15} /><span><strong>从 JSON 文件读取</strong><small>导入之前保存的副本</small></span></button>
            </div>}
          </div>
          <div className="action-menu-wrap">
            <button className="primary-button" onClick={() => setOpenActionMenu((value) => value === "save" ? null : "save")} aria-haspopup="menu" aria-expanded={openActionMenu === "save"}><Save size={15} /> 保存方案 <ChevronDown size={13} /></button>
            {openActionMenu === "save" && <div className="action-menu save-menu" role="menu">
              <button role="menuitem" onClick={() => { setOpenActionMenu(null); saveLayout(); }}><Save size={15} /><span><strong>保存到浏览器</strong><small>覆盖当前浏览器中的方案</small></span></button>
              <button role="menuitem" onClick={saveCopy}><Download size={15} /><span><strong>另存为 JSON 副本</strong><small>选择目录和文件名</small></span></button>
            </div>}
          </div>
          <input ref={layoutFileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={loadLayoutFile} />
        </div>
      </header>

      <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} roomContext={{ id: room.id, name: room.name, dimensions: room.dimensions, itemCount: room.items.length }} />

      {layoutNotice && <div className={`layout-notice ${layoutNotice.kind}`} role="status">
        {layoutNotice.kind === "success" ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
        {layoutNotice.message}
      </div>}

      {addRoomOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddRoomOpen(false); }}>
        <form className="room-dialog" onSubmit={addRoom} role="dialog" aria-modal="true" aria-labelledby="add-room-title">
          <div className="room-dialog-heading"><span><Plus size={17} /></span><div><h2 id="add-room-title">添加空房间</h2><p>创建后可从左侧加入家具，并随方案一起保存。</p></div><button type="button" onClick={() => setAddRoomOpen(false)} aria-label="关闭"><X size={16} /></button></div>
          <label className="dialog-field"><span>房间名称</span><input autoFocus value={newRoom.name} onChange={(event) => setNewRoom((current) => ({ ...current, name: event.target.value }))} /></label>
          <div className="dialog-dimensions">
            <label className="dialog-field"><span>宽度（mm）</span><input type="number" min="1000" max="20000" value={newRoom.width} onChange={(event) => setNewRoom((current) => ({ ...current, width: Number(event.target.value) }))} /></label>
            <label className="dialog-field"><span>深度（mm）</span><input type="number" min="1000" max="20000" value={newRoom.depth} onChange={(event) => setNewRoom((current) => ({ ...current, depth: Number(event.target.value) }))} /></label>
            <label className="dialog-field"><span>层高（mm）</span><input type="number" min="2000" max="10000" value={newRoom.height} onChange={(event) => setNewRoom((current) => ({ ...current, height: Number(event.target.value) }))} /></label>
          </div>
          <div className="dialog-actions"><button type="button" onClick={() => setAddRoomOpen(false)}>取消</button><button type="submit" className="dialog-primary"><Plus size={14} /> 创建房间</button></div>
        </form>
      </div>}

      <section className="workspace">
        <aside className="asset-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">ASSET LIBRARY</span><h2>家具素材</h2></div>
            <Link className="icon-button" title="检视全部家具资产" href="/furniture-review"><Upload size={16} /></Link>
          </div>
          <div className="asset-search"><MousePointer2 size={15} /><span>点击家具添加到房间</span></div>
          <div className="asset-grid">
            {assetCatalog.map((asset) => (
              <button key={asset.id} className="asset-card" onClick={() => addItem(asset.id)}>
                <span className={`asset-thumb ${asset.id}`}>
                  {asset.category === "bed" ? <BedDouble size={30} /> : asset.category === "seat" ? <Armchair size={27} /> : <Box size={27} />}
                </span>
                <span className="asset-name">{asset.name}</span>
                <span className="asset-size">{asset.defaultConfiguration.dimensions.width} × {asset.defaultConfiguration.dimensions.depth}</span>
              </button>
            ))}
          </div>
          <div className="preset-heading">
            <span><strong>我的预制体</strong><small>{presets.length} 项 · 当前浏览器</small></span>
            <span>
              <button title="导入预制体" onClick={() => presetFileRef.current?.click()}><Upload size={13} /></button>
              <button title="导出全部预制体" disabled={!presets.length} onClick={() => exportFurniturePresets(presets)}><Download size={13} /></button>
            </span>
          </div>
          <input ref={presetFileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importPresetFile} />
          <div className="preset-list">
            {presets.map((preset) => {
              const stale = presetIsStale(preset);
              return <div key={preset.id} className={stale ? "preset-card stale" : "preset-card"}>
                <button onClick={() => addPreset(preset)} disabled={stale}><PackagePlus size={15} /><span><strong>{preset.name}</strong><small>{stale ? "基础资产已更新" : `${preset.configuration.dimensions.width} × ${preset.configuration.dimensions.depth}`}</small></span></button>
                <button aria-label={`导出${preset.name}`} onClick={() => exportFurniturePresets([preset], "furniture-preset.json")}><Download size={13} /></button>
                <button aria-label={`删除${preset.name}`} onClick={() => setPresets(deleteFurniturePreset(preset.id))}><X size={13} /></button>
              </div>;
            })}
            {!presets.length && <p className="preset-empty">选中家具后可将当前参数和状态保存为预制体。</p>}
          </div>
          <Link className="pipeline-card" href="/furniture-review">
            <span className="pipeline-icon"><Sparkles size={18} /></span>
            <span><strong>家具资产检视</strong><small>{BUILTIN_FURNITURE_COUNT} 件内置家具与 {PENDING_USER_GENERATED_ASSET_COUNT} 个用户资产使用同一包契约</small></span>
            <ChevronDown size={16} />
          </Link>
          <div className="panel-note">所有尺寸均为毫米 · Y 轴向上</div>
        </aside>

        <section className="canvas-panel">
          <DataSourceStatus />
          <div className="canvas-toolbar">
            <div className="segmented">
              <button className={viewMode === "top" ? "active" : ""} onClick={() => setViewMode("top")}><Grid3X3 size={15} /> 平面</button>
              <button className={viewMode === "perspective" ? "active" : ""} onClick={() => setViewMode("perspective")}><Box size={15} /> 3D</button>
            </div>
            <div className="segmented interaction-modes" aria-label="鼠标模式">
              <button className={interactionMode === "interact" ? "active" : ""} onClick={() => setInteractionMode("interact")} title="单击门或其他可交互素材"><MousePointer2 size={15} /> 交互</button>
              <button className={interactionMode === "move" ? "active" : ""} onClick={() => setInteractionMode("move")} title="拖拽家具移动位置"><Move size={15} /> 移动</button>
              <button className={interactionMode === "rotate" ? "active" : ""} onClick={() => setInteractionMode("rotate")} title="左右拖拽家具旋转"><RotateCw size={15} /> 旋转</button>
              <button className={interactionMode === "outline" ? "active" : ""} onClick={() => { setInteractionMode("outline"); setViewMode("top"); setSelectedId(null); }} title="在平面视图拖拽墙段控制点"><PenTool size={15} /> 轮廓</button>
            </div>
            <button className={collisionDetectionEnabled ? "tool-button collision-toggle active" : "tool-button collision-toggle"}
              onClick={() => setCollisionDetectionEnabled((value) => !value)} title="移动和旋转时启用或关闭碰撞约束">
              {collisionDetectionEnabled ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
              {collisionDetectionEnabled ? "碰撞开启" : "碰撞关闭"}
            </button>
            <span className="room-dimension"><Ruler size={14} /> 净尺寸 {room.dimensions.width} × {room.dimensions.depth} mm</span>
            {room.planSrc
              ? <button className={showReference ? "tool-button reference active" : "tool-button reference"} onClick={() => setShowReference((value) => !value)}><FileImage size={14} /> 标尺原图</button>
              : <span className="toolbar-spacer" />}
            <button className="tool-button" onClick={() => setShowWalls((value) => !value)}>{showWalls ? "隐藏墙体" : "显示墙体"}</button>
            <button className="icon-button" title="适应窗口"><Maximize2 size={16} /></button>
          </div>
          <Suspense fallback={<BedroomViewportLoading />}><BedroomViewport room={room} rooms={layoutHistory.present} selectedId={selectedId} collisionIds={collisionIds}
            viewMode={viewMode} interactionMode={interactionMode} snap={snap} showGrid={showGrid} showWalls={showWalls}
            collisionDetectionEnabled={collisionDetectionEnabled} onSelect={setSelectedId} onChangeItem={updateItem}
            onChangeOutline={updateOutline} onToggleDoor={toggleDoor} onInteractItem={interactItem} /></Suspense>
          {showReference && room.planSrc && <aside className="plan-reference no-scrollbar" aria-label={`${room.name}标尺原图`}>
            <div className="plan-reference-heading"><span><strong>{room.name}标尺原图</strong><small>SVG · 尺寸权威来源</small></span><button onClick={() => setShowReference(false)} aria-label="关闭标尺原图"><X size={15} /></button></div>
            <Image src={publicUrl(room.planSrc)} alt={`${room.name}建筑标尺图`} width={1200} height={1300} unoptimized />
          </aside>}
          <div className="canvas-help">
            <span>{interactionMode === "interact" ? "单击素材触发交互" : interactionMode === "move" ? "拖拽家具移动" : interactionMode === "rotate" ? "左右拖拽家具旋转" : "拖拽橙色墙段控制点调整轮廓"}</span>
            <i /><span>滚轮缩放</span><i /><span>拖动空白处观察</span>
          </div>
          <div className="status-pill"><span className={collisionIds.size ? "status-dot warning" : "status-dot"} />
            {!collisionDetectionEnabled ? "碰撞约束已关闭" : collisionIds.size ? `${collisionIds.size} 件家具需要调整` : "布局无冲突"}</div>
        </section>

        <aside className="property-panel">
          <div className="panel-heading property-heading"><div><span className="eyebrow">INSPECTOR</span><h2>属性</h2></div></div>
          {selected ? <>
            <div className="selection-card">
              <span className="selection-thumb"><BedDouble size={28} /></span>
              <span><strong>{selected.name}</strong><small>{selected.assetId}</small></span>
            </div>
            <div className="property-actions furniture-actions">
              <button onClick={() => updateItem(selected.id, { rotation: (selected.rotation + 90) % 360 })}><RotateCcw size={15} /> 旋转</button>
              <button onClick={duplicate}><Copy size={15} /> 复制</button>
              <button onClick={saveSelectedPreset} disabled={selectedIssues.length > 0}><PackagePlus size={15} /> 预制体</button>
              <button onClick={exportSelectedGlb} disabled={!selectedAsset?.exportReady || selectedIssues.length > 0}><Cuboid size={15} /> GLB</button>
              <button className="danger" onClick={removeItem}><Trash2 size={15} /></button>
            </div>
            <PropertySection title="位置"><div className="field-grid">
              <NumberField label="X" value={Math.round(selected.position.x)} onChange={(x) => updateItem(selected.id, { position: { ...selected.position, x } })} />
              <NumberField label="Z" value={Math.round(selected.position.z)} onChange={(z) => updateItem(selected.id, { position: { ...selected.position, z } })} />
            </div></PropertySection>
            <PropertySection title="尺寸">
              <div className="field-grid">
                <NumberField label="宽" value={selected.size.width} constraint={selectedAsset?.dimensionConstraints?.width} onChange={(width) => updateItem(selected.id, { size: { ...selected.size, width } })} />
                <NumberField label="深" value={selected.size.depth} constraint={selectedAsset?.dimensionConstraints?.depth} onChange={(depth) => updateItem(selected.id, { size: { ...selected.size, depth } })} />
              </div>
              <NumberField label="高" value={selected.size.height} constraint={selectedAsset?.dimensionConstraints?.height} onChange={(height) => updateItem(selected.id, { size: { ...selected.size, height } })} />
            </PropertySection>
            {selectedAsset && selectedAsset.parameterDefinitions.length > 0 && <PropertySection title="特殊参数">
              <div className="parameter-list">
                {selectedAsset.parameterDefinitions.map((definition) => <ParameterField key={definition.id} definition={definition}
                  value={selected.parameterValues[definition.id] ?? definition.defaultValue}
                  onChange={(value) => updateItem(selected.id, { parameterValues: { ...selected.parameterValues, [definition.id]: value } })} />)}
              </div>
            </PropertySection>}
            <PropertySection title="旋转"><div className="rotation-row">
              {[0, 90, 180, 270].map((angle) => <button key={angle} className={selected.rotation === angle ? "active" : ""}
                onClick={() => updateItem(selected.id, { rotation: angle })}>{angle}°</button>)}
            </div></PropertySection>
            {selected.clearanceDepth && <div className="clearance-card"><strong>{selected.clearanceLabel}</strong><span>柜体深 {selected.size.depth} mm；斜线区域必须保持空置。</span></div>}
            {selectedAsset && selectedAsset.states.length > 0 && <button className="interaction-state-card" onClick={() => interactItem(selected.id)}>
              <strong>当前：{selectedAsset.states.find((state) => state.id === selected.stateId)?.label ?? "未知状态"}</strong>
              <span>点击切换到下一个状态：{selectedAsset.states.find((state) => state.id === nextFurnitureState(selected))?.label}</span>
            </button>}
            {dimensionDeviation > 0.25 && <div className="warning-card"><strong>尺寸明显偏离已检视版本</strong><span>当前最大轴偏差 {Math.round(dimensionDeviation * 100)}%。没有明确范围时仍可使用，但请检查模型结构是否失真。</span></div>}
            {selectedIssues.length > 0 && <div className="warning-card"><strong>当前配置不能保存或导出</strong><span>{selectedIssues.join("；")}</span></div>}
            {selectedAsset && !selectedAsset.exportReady && <div className="clearance-card neutral"><strong>暂不可导出 GLB</strong><span>{selectedAsset.assetScope === "user-generated" ? "该用户资产尚未通过 glTF 外观兼容检视。" : "该资产尚未通过导出检视。"}</span></div>}
            {selected.wallMounted && <div className="clearance-card neutral"><strong>墙面安装</strong><span>吊柜不占用地面通行空间，建议底沿离地 1450–1550 mm。</span></div>}
            {selected.supportSurface === "bay-window" && <div className="clearance-card neutral"><strong>飘窗台承托</strong><span>柜体落在飘窗台上，不悬挂在窗前；柜底标高 {selected.baseHeight ?? room.bayWindow?.sillHeight ?? 0} mm。</span></div>}
            {collisionIds.has(selected.id) && <div className="warning-card"><strong>检测到空间冲突</strong><span>家具重叠或超出房间边界，请调整后再保存。</span></div>}
          </> : <div className="empty-inspector"><MousePointer2 size={28} /><strong>选择一件家具</strong><span>点击场景内的对象查看并编辑尺寸。</span></div>}

          <div className="layout-settings"><PropertySection title="画布设置">
            <button className="setting-row" onClick={() => setShowGrid((value) => !value)}><span>显示网格</span><span className={showGrid ? "mini-switch on" : "mini-switch"}><i /></span></button>
            <button className="setting-row" onClick={() => setCollisionDetectionEnabled((value) => !value)}><span>移动/旋转碰撞约束</span><span className={collisionDetectionEnabled ? "mini-switch on" : "mini-switch"}><i /></span></button>
            <div className="setting-select"><span>吸附精度</span><select value={snap} onChange={(event) => setSnap(Number(event.target.value))}>
              <option value={50}>50 mm</option><option value={100}>100 mm</option><option value={200}>200 mm</option>
            </select></div>
          </PropertySection></div>
          <div className="room-stats">
            <div><span>占地率</span><strong>{occupancy}%</strong></div>
            <div className="progress-track"><span style={{ width: `${occupancy}%` }} /></div>
            <small>{room.items.length} 件家具 · 净面积 {room.clearArea.toFixed(2)} m²</small>
          </div>
        </aside>
      </section>
    </main>
  );
}

function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="property-section"><h3>{title}</h3>{children}</section>;
}

function NumberField({ label, value, constraint, onChange }: { label: string; value: number; constraint?: FurnitureDimensionConstraint; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><input type="number" min={constraint?.min ?? 1} max={constraint?.max} step={constraint?.step ?? 1} value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>mm</small></label>;
}

function ParameterField({ definition, value, onChange }: { definition: FurnitureParameterDefinition; value: FurnitureParameterValue; onChange: (value: FurnitureParameterValue) => void }) {
  if (definition.type === "boolean") return <label className="parameter-field boolean"><span>{definition.label}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /></label>;
  if (definition.type === "enum") return <label className="parameter-field"><span>{definition.label}</span><select value={String(value)} onChange={(event) => onChange(event.target.value)}>{definition.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (definition.type === "color") return <label className="parameter-field"><span>{definition.label}</span><input type="color" value={String(value)} onChange={(event) => onChange(event.target.value)} /></label>;
  return <label className="parameter-field"><span>{definition.label}</span><span className="parameter-number"><input type="number" value={Number(value)} min={definition.min} max={definition.max} step={definition.step ?? 1} onChange={(event) => onChange(Number(event.target.value))} /><small>{definition.unit ?? ""}</small></span></label>;
}
