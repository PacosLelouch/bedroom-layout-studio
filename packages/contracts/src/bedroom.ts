export type ViewMode = "top" | "perspective";
export type InteractionMode = "interact" | "move" | "rotate" | "outline";

export interface Dimensions3D {
  width: number;
  depth: number;
  height: number;
}

export type FurnitureParameterValue = number | boolean | string;

export interface FurnitureDimensionConstraint {
  min?: number;
  max?: number;
  step?: number;
}

export interface FurnitureDimensionConstraints {
  width?: FurnitureDimensionConstraint;
  depth?: FurnitureDimensionConstraint;
  height?: FurnitureDimensionConstraint;
}

export type FurnitureParameterDefinition =
  | { id: string; label: string; type: "number"; defaultValue: number; min?: number; max?: number; step?: number; unit?: string }
  | { id: string; label: string; type: "boolean"; defaultValue: boolean }
  | { id: string; label: string; type: "enum"; defaultValue: string; options: Array<{ value: string; label: string }> }
  | { id: string; label: string; type: "color"; defaultValue: string };

export interface FurnitureStateDefinition {
  id: string;
  label: string;
}

export interface FurnitureConfiguration {
  dimensions: Dimensions3D;
  parameters: Record<string, FurnitureParameterValue>;
  stateId: string | null;
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
  supportSurface?: "floor" | "bay-window" | "wall";
  baseHeight?: number;
  clearanceDepth?: number;
  clearanceLabel?: string;
  parameterValues: Record<string, FurnitureParameterValue>;
  stateId: string | null;
  presetId?: string;
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
  planSrc?: string;
  outline: PlanPoint[];
  keepOutZones: KeepOutZone[];
  doors: DoorOpening[];
  bayWindow?: BayWindow;
  items: FurnitureItem[];
}

export interface LayoutSnapshot {
  schemaVersion: 2;
  id: string;
  name: string;
  savedAt: string;
  rooms: RoomLayout[];
}

export interface FurniturePreset {
  schemaVersion: 1;
  id: string;
  name: string;
  assetId: string;
  assetRevision: string;
  createdAt: string;
  updatedAt: string;
  configuration: FurnitureConfiguration;
}
