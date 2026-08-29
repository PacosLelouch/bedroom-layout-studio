"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Armchair, BedDouble, Box, ChevronDown, Copy, Grid3X3, Layers3,
  Maximize2, MousePointer2, Redo2, RotateCcw, Ruler, Sparkles,
  Trash2, Undo2, Upload,
} from "lucide-react";
import { BedroomViewport } from "@/components/bedroom-viewport";
import { ASSET_CATALOG, catalogItemToFurniture } from "@/lib/bedroom/asset-registry";
import type { FurnitureItem, RoomLayout, ViewMode } from "@/lib/bedroom/types";

const INITIAL_ROOMS: RoomLayout[] = [
  {
    id: "master", name: "主卧", dimensions: { width: 4200, depth: 3600, height: 2800 },
    items: [
      { id: "master-bed", assetId: "double-bed", name: "双人床", position: { x: 2200, z: 1850 }, rotation: 0, size: { width: 1800, depth: 2100, height: 520 }, color: "#d9cbb9" },
      { id: "master-side-a", assetId: "nightstand", name: "床头柜", position: { x: 1000, z: 1100 }, rotation: 0, size: { width: 480, depth: 420, height: 520 }, color: "#b99f7c" },
      { id: "master-side-b", assetId: "nightstand", name: "床头柜", position: { x: 3400, z: 1100 }, rotation: 0, size: { width: 480, depth: 420, height: 520 }, color: "#b99f7c" },
      { id: "master-wardrobe", assetId: "wardrobe", name: "衣柜", position: { x: 3650, z: 2700 }, rotation: 90, size: { width: 1800, depth: 600, height: 2400 }, color: "#c8b696" },
    ],
  },
  {
    id: "large-secondary", name: "大次卧", dimensions: { width: 3600, depth: 3300, height: 2800 },
    items: [
      { id: "secondary-bed", assetId: "single-bed", name: "单人床", position: { x: 1050, z: 1700 }, rotation: 0, size: { width: 1200, depth: 2000, height: 500 }, color: "#b8c8bf" },
      { id: "secondary-desk", assetId: "desk", name: "书桌", position: { x: 2800, z: 600 }, rotation: 0, size: { width: 1200, depth: 600, height: 750 }, color: "#a98d69" },
    ],
  },
  {
    id: "small-secondary", name: "小次卧", dimensions: { width: 3000, depth: 2800, height: 2800 },
    items: [
      { id: "small-bed", assetId: "single-bed", name: "单人床", position: { x: 750, z: 1600 }, rotation: 0, size: { width: 1200, depth: 2000, height: 500 }, color: "#c9c2d5" },
      { id: "small-wardrobe", assetId: "wardrobe", name: "衣柜", position: { x: 2450, z: 1750 }, rotation: 0, size: { width: 1400, depth: 600, height: 2400 }, color: "#d0bda1" },
    ],
  },
];

function footprint(item: FurnitureItem) {
  return Math.abs(item.rotation % 180) === 90
    ? { width: item.size.depth, depth: item.size.width }
    : { width: item.size.width, depth: item.size.depth };
}

function collides(item: FurnitureItem, room: RoomLayout) {
  const a = footprint(item);
  if (item.position.x - a.width / 2 < 0 || item.position.x + a.width / 2 > room.dimensions.width ||
      item.position.z - a.depth / 2 < 0 || item.position.z + a.depth / 2 > room.dimensions.depth) return true;
  return room.items.some((other) => {
    if (other.id === item.id) return false;
    const b = footprint(other);
    return Math.abs(item.position.x - other.position.x) < (a.width + b.width) / 2 &&
      Math.abs(item.position.z - other.position.z) < (a.depth + b.depth) / 2;
  });
}

export default function Home() {
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [roomId, setRoomId] = useState("master");
  const [selectedId, setSelectedId] = useState<string | null>("master-bed");
  const [viewMode, setViewMode] = useState<ViewMode>("perspective");
  const [snap, setSnap] = useState(100);
  const [showGrid, setShowGrid] = useState(true);
  const [showWalls, setShowWalls] = useState(true);
  const room = rooms.find((entry) => entry.id === roomId) ?? rooms[0];
  const selected = room.items.find((item) => item.id === selectedId) ?? null;
  const collisionIds = useMemo(() => new Set(room.items.filter((item) => collides(item, room)).map((item) => item.id)), [room]);
  const occupiedArea = useMemo(() => room.items.reduce((sum, item) => sum + item.size.width * item.size.depth, 0), [room.items]);
  const occupancy = Math.min(100, Math.round(occupiedArea / (room.dimensions.width * room.dimensions.depth) * 100));

  const updateItem = useCallback((id: string, patch: Partial<FurnitureItem>) => {
    setRooms((current) => current.map((entry) => entry.id !== roomId ? entry : {
      ...entry, items: entry.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  }, [roomId]);
  const addItem = (assetId: string) => {
    const item = catalogItemToFurniture(assetId, room);
    setRooms((current) => current.map((entry) => entry.id === roomId ? { ...entry, items: [...entry.items, item] } : entry));
    setSelectedId(item.id);
  };
  const removeItem = () => {
    if (!selectedId) return;
    setRooms((current) => current.map((entry) => entry.id === roomId ? { ...entry, items: entry.items.filter((item) => item.id !== selectedId) } : entry));
    setSelectedId(null);
  };
  const duplicate = () => {
    if (!selected) return;
    const copy = { ...selected, id: `${selected.assetId}-${Date.now()}`, position: { x: selected.position.x + 200, z: selected.position.z + 200 } };
    setRooms((current) => current.map((entry) => entry.id === roomId ? { ...entry, items: [...entry.items, copy] } : entry));
    setSelectedId(copy.id);
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
          <button className="room-tab add-room" title="添加房间">＋</button>
        </nav>
        <div className="top-actions">
          <button className="icon-button" aria-label="撤销"><Undo2 size={17} /></button>
          <button className="icon-button muted" aria-label="重做"><Redo2 size={17} /></button>
          <button className="primary-button"><Sparkles size={15} /> 保存方案</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="asset-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">ASSET LIBRARY</span><h2>家具素材</h2></div>
            <button className="icon-button" title="导入 img2threejs 资产"><Upload size={16} /></button>
          </div>
          <div className="asset-search"><MousePointer2 size={15} /><span>点击家具添加到房间</span></div>
          <div className="asset-grid">
            {ASSET_CATALOG.map((asset) => (
              <button key={asset.id} className="asset-card" onClick={() => addItem(asset.id)}>
                <span className={`asset-thumb ${asset.id}`}>
                  {asset.category === "bed" ? <BedDouble size={30} /> : asset.category === "seat" ? <Armchair size={27} /> : <Box size={27} />}
                </span>
                <span className="asset-name">{asset.name}</span>
                <span className="asset-size">{asset.size.width} × {asset.size.depth}</span>
              </button>
            ))}
          </div>
          <button className="pipeline-card">
            <span className="pipeline-icon"><Sparkles size={18} /></span>
            <span><strong>img2threejs 资产入口</strong><small>接入程序化 Group 工厂</small></span>
            <ChevronDown size={16} />
          </button>
          <div className="panel-note">所有尺寸均为毫米 · Y 轴向上</div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="segmented">
              <button className={viewMode === "top" ? "active" : ""} onClick={() => setViewMode("top")}><Grid3X3 size={15} /> 平面</button>
              <button className={viewMode === "perspective" ? "active" : ""} onClick={() => setViewMode("perspective")}><Box size={15} /> 3D</button>
            </div>
            <span className="room-dimension"><Ruler size={14} /> {room.dimensions.width} × {room.dimensions.depth} mm</span>
            <button className="tool-button" onClick={() => setShowWalls((value) => !value)}>{showWalls ? "隐藏墙体" : "显示墙体"}</button>
            <button className="icon-button" title="适应窗口"><Maximize2 size={16} /></button>
          </div>
          <BedroomViewport room={room} selectedId={selectedId} collisionIds={collisionIds}
            viewMode={viewMode} snap={snap} showGrid={showGrid} showWalls={showWalls}
            onSelect={setSelectedId} onChangeItem={updateItem} />
          <div className="canvas-help"><span>拖拽移动</span><i /><span>滚轮缩放</span><i /><span>拖动空白处旋转视角</span></div>
          <div className="status-pill"><span className={collisionIds.size ? "status-dot warning" : "status-dot"} />
            {collisionIds.size ? `${collisionIds.size} 件家具需要调整` : "布局无冲突"}</div>
        </section>

        <aside className="property-panel">
          <div className="panel-heading property-heading"><div><span className="eyebrow">INSPECTOR</span><h2>属性</h2></div></div>
          {selected ? <>
            <div className="selection-card">
              <span className="selection-thumb"><BedDouble size={28} /></span>
              <span><strong>{selected.name}</strong><small>{selected.assetId}</small></span>
            </div>
            <div className="property-actions">
              <button onClick={() => updateItem(selected.id, { rotation: (selected.rotation + 90) % 360 })}><RotateCcw size={15} /> 旋转</button>
              <button onClick={duplicate}><Copy size={15} /> 复制</button>
              <button className="danger" onClick={removeItem}><Trash2 size={15} /></button>
            </div>
            <PropertySection title="位置"><div className="field-grid">
              <NumberField label="X" value={Math.round(selected.position.x)} onChange={(x) => updateItem(selected.id, { position: { ...selected.position, x } })} />
              <NumberField label="Z" value={Math.round(selected.position.z)} onChange={(z) => updateItem(selected.id, { position: { ...selected.position, z } })} />
            </div></PropertySection>
            <PropertySection title="尺寸">
              <div className="field-grid">
                <NumberField label="宽" value={selected.size.width} onChange={(width) => updateItem(selected.id, { size: { ...selected.size, width } })} />
                <NumberField label="深" value={selected.size.depth} onChange={(depth) => updateItem(selected.id, { size: { ...selected.size, depth } })} />
              </div>
              <NumberField label="高" value={selected.size.height} onChange={(height) => updateItem(selected.id, { size: { ...selected.size, height } })} />
            </PropertySection>
            <PropertySection title="旋转"><div className="rotation-row">
              {[0, 90, 180, 270].map((angle) => <button key={angle} className={selected.rotation === angle ? "active" : ""}
                onClick={() => updateItem(selected.id, { rotation: angle })}>{angle}°</button>)}
            </div></PropertySection>
            {collisionIds.has(selected.id) && <div className="warning-card"><strong>检测到空间冲突</strong><span>家具重叠或超出房间边界，请调整后再保存。</span></div>}
          </> : <div className="empty-inspector"><MousePointer2 size={28} /><strong>选择一件家具</strong><span>点击场景内的对象查看并编辑尺寸。</span></div>}

          <div className="layout-settings"><PropertySection title="画布设置">
            <button className="setting-row" onClick={() => setShowGrid((value) => !value)}><span>显示网格</span><span className={showGrid ? "mini-switch on" : "mini-switch"}><i /></span></button>
            <div className="setting-select"><span>吸附精度</span><select value={snap} onChange={(event) => setSnap(Number(event.target.value))}>
              <option value={50}>50 mm</option><option value={100}>100 mm</option><option value={200}>200 mm</option>
            </select></div>
          </PropertySection></div>
          <div className="room-stats">
            <div><span>占地率</span><strong>{occupancy}%</strong></div>
            <div className="progress-track"><span style={{ width: `${occupancy}%` }} /></div>
            <small>{room.items.length} 件家具 · {(room.dimensions.width * room.dimensions.depth / 1_000_000).toFixed(1)} m²</small>
          </div>
        </aside>
      </section>
    </main>
  );
}

function PropertySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="property-section"><h3>{title}</h3>{children}</section>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>mm</small></label>;
}
