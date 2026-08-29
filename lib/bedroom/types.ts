export type ViewMode = "top" | "perspective";

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
}

export interface RoomLayout {
  id: string;
  name: string;
  dimensions: Dimensions3D;
  items: FurnitureItem[];
}

export interface ProceduralAssetOptions {
  dimensions: Dimensions3D;
  color?: string;
  seed?: number;
  exploded?: boolean;
}
