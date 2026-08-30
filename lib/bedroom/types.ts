export type ViewMode = "top" | "perspective";
export type InteractionMode = "interact" | "move" | "rotate";

export interface Dimensions3D {
  width: number;
  depth: number;
  height: number;
}

export interface FurnitureItem {
  id: string;
  assetId: string;
  name: string;
  position: { x: number; z: number };
  rotation: number;
  size: Dimensions3D;
  color: string;
  wallMounted?: boolean;
  clearanceDepth?: number;
  clearanceLabel?: string;
  interactionState?: "open" | "closed";
  collapsedDepth?: number;
  expandedDepth?: number;
  collapsedPositionZ?: number;
  expandedPositionZ?: number;
}

export interface PlanPoint {
  x: number;
  z: number;
}

export interface KeepOutZone {
  id: string;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  kind: "door" | "circulation";
}

export interface BayWindow {
  side: "bottom" | "right";
  start: number;
  length: number;
  depth: number;
  sillHeight: number;
}

export interface DoorOpening {
  id: string;
  label: string;
  hinge: PlanPoint;
  width: number;
  wallAxis: "x" | "z";
  wallCoordinate: number;
  openingStart: number;
  closedAngle: number;
  openAngle: number;
  isOpen?: boolean;
}

export interface RoomLayout {
  id: string;
  name: string;
  dimensions: Dimensions3D;
  clearArea: number;
  planSrc: string;
  outline: PlanPoint[];
  keepOutZones: KeepOutZone[];
  doors: DoorOpening[];
  bayWindow: BayWindow;
  items: FurnitureItem[];
}

export interface ProceduralAssetOptions {
  dimensions: Dimensions3D;
  color?: string;
  seed?: number;
  exploded?: boolean;
}
