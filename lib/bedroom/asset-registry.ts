import * as THREE from "three";
import { createAdaptedGeneratedModel } from "./generated/model-adapter";
import { APPROVED_GENERATED_ASSETS } from "./generated/registry";
import type { FurnitureItem, ProceduralAssetOptions, RoomLayout } from "./types";

export type ProceduralAssetFactory = (spec: unknown, options: ProceduralAssetOptions) => THREE.Group;

export interface CatalogAsset {
  id: string;
  name: string;
  category: "bed" | "storage" | "desk" | "seat";
  size: ProceduralAssetOptions["dimensions"];
  color: string;
  factory: ProceduralAssetFactory;
  source: "builtin" | "img2threejs";
}

function box(size: [number, number, number], color: string, position: [number, number, number]) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const simpleFactory: ProceduralAssetFactory = (_spec, options) => {
  const { width, depth, height } = options.dimensions;
  const group = new THREE.Group();
  group.add(box([width, height, depth], options.color ?? "#c7b69d", [0, height / 2, 0]));
  return group;
};

const bedFactory: ProceduralAssetFactory = (_spec, options) => {
  const { width, depth, height } = options.dimensions;
  const group = new THREE.Group();
  const frameHeight = Math.min(240, height * 0.48);
  group.add(box([width, frameHeight, depth], "#9d7d5d", [0, frameHeight / 2, 0]));
  group.add(box([width * 0.94, height * 0.42, depth * 0.82], options.color ?? "#d7cabc", [0, frameHeight + height * 0.21, depth * 0.04]));
  group.add(box([width, Math.max(620, height), 90], "#aa8e6d", [0, Math.max(620, height) / 2, -depth / 2 + 45]));
  const pillowWidth = width * 0.38;
  group.add(box([pillowWidth, 110, 340], "#f2eee7", [-width * 0.23, frameHeight + height * 0.46, -depth * 0.28]));
  group.add(box([pillowWidth, 110, 340], "#f2eee7", [width * 0.23, frameHeight + height * 0.46, -depth * 0.28]));
  return group;
};

const sofaBedFactory: ProceduralAssetFactory = (spec, options) => {
  const item = spec as Partial<FurnitureItem>;
  if (item.interactionState === "open") return bedFactory(spec, options);
  const { width, depth } = options.dimensions;
  const group = new THREE.Group();
  const upholstery = options.color ?? "#c9c2d5";
  group.add(box([width - 130, 180, depth - 170], upholstery, [0, 390, 35]));
  group.add(box([width - 150, 430, 125], upholstery, [0, 565, -depth / 2 + 70]));
  group.add(box([105, 430, depth - 90], "#9f97ad", [-width / 2 + 55, 365, 25]));
  group.add(box([105, 430, depth - 90], "#9f97ad", [width / 2 - 55, 365, 25]));
  group.add(box([width - 230, 95, depth - 260], "#e7e0ed", [0, 515, 55]));
  for (const x of [-width * 0.38, width * 0.38]) group.add(box([70, 150, 70], "#675f70", [x, 75, depth * 0.27]));
  return group;
};

function wardrobeCarcass(group: THREE.Group, width: number, depth: number, height: number, color: string) {
  const t = Math.max(30, Math.min(48, width * 0.025));
  const interior = "#e9dfcc";
  group.add(box([width, t, depth], color, [0, t / 2, 0]));
  group.add(box([width, t, depth], color, [0, height - t / 2, 0]));
  group.add(box([t, height, depth], color, [-width / 2 + t / 2, height / 2, 0]));
  group.add(box([t, height, depth], color, [width / 2 - t / 2, height / 2, 0]));
  group.add(box([width - t * 2, height - t * 2, t], interior, [0, height / 2, -depth / 2 + t / 2]));
  group.add(box([t, height - t * 2, depth - t * 2], interior, [0, height / 2, 0]));
  for (const y of [620, 1180, height - 360]) group.add(box([width - t * 2, t, depth - t * 2], interior, [0, y, 0]));
  const rodMaterial = new THREE.MeshStandardMaterial({ color: "#8b8174", metalness: 0.55, roughness: 0.36 });
  for (const x of [-width / 4, width / 4]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, width / 2 - t * 2, 12), rodMaterial.clone());
    rod.rotation.z = Math.PI / 2;
    rod.position.set(x, height - 520, depth * 0.12);
    group.add(rod);
  }
  return t;
}

const hingedWardrobeFactory: ProceduralAssetFactory = (spec, options) => {
  const item = spec as Partial<FurnitureItem>;
  const { width, depth, height } = options.dimensions;
  const group = new THREE.Group();
  const color = options.color ?? "#c8b696";
  const t = wardrobeCarcass(group, width, depth, height, color);
  const doorWidth = (width - t * 2) / 2;
  const doorHeight = height - t * 2;
  const frontZ = depth / 2 + 14;
  const leftPivot = new THREE.Group();
  leftPivot.position.set(-width / 2 + t, t, frontZ);
  leftPivot.rotation.y = item.interactionState === "open" ? THREE.MathUtils.degToRad(-98) : 0;
  leftPivot.add(box([doorWidth - 8, doorHeight, 28], color, [doorWidth / 2, doorHeight / 2, 0]));
  const rightPivot = new THREE.Group();
  rightPivot.position.set(width / 2 - t, t, frontZ + 4);
  rightPivot.rotation.y = item.interactionState === "open" ? THREE.MathUtils.degToRad(98) : 0;
  rightPivot.add(box([doorWidth - 8, doorHeight, 28], color, [-doorWidth / 2, doorHeight / 2, 0]));
  group.add(leftPivot, rightPivot);
  return group;
};

const slidingWardrobeFactory: ProceduralAssetFactory = (spec, options) => {
  const item = spec as Partial<FurnitureItem>;
  const { width, depth, height } = options.dimensions;
  const group = new THREE.Group();
  const color = options.color ?? "#c8b696";
  const t = wardrobeCarcass(group, width, depth, height, color);
  const doorWidth = (width - t * 2) / 2;
  const doorHeight = height - t * 2;
  const open = item.interactionState === "open";
  group.add(box([doorWidth - 6, doorHeight, 30], color, [-width / 4, height / 2, depth / 2 + 12]));
  group.add(box([doorWidth - 6, doorHeight, 30], "#b8a27e", [open ? -width / 4 : width / 4, height / 2, depth / 2 + 48]));
  group.add(box([width - t * 2, 22, 76], "#857767", [0, 42, depth / 2 + 26]));
  group.add(box([width - t * 2, 22, 76], "#857767", [0, height - 42, depth / 2 + 26]));
  return group;
};

const deskFactory: ProceduralAssetFactory = (_spec, options) => {
  const { width, depth, height } = options.dimensions;
  const group = new THREE.Group();
  group.add(box([width, 70, depth], options.color ?? "#a98d69", [0, height, 0]));
  for (const x of [-width * 0.43, width * 0.43]) for (const z of [-depth * 0.38, depth * 0.38]) {
    group.add(box([65, height, 65], "#715b43", [x, height / 2, z]));
  }
  return group;
};

const BUILTIN_ASSET_CATALOG: CatalogAsset[] = [
  { id: "double-bed", name: "双人床", category: "bed", size: { width: 1800, depth: 2100, height: 520 }, color: "#d9cbb9", factory: bedFactory, source: "builtin" },
  { id: "queen-bed", name: "1500 双人床", category: "bed", size: { width: 1500, depth: 2000, height: 520 }, color: "#b8c8bf", factory: bedFactory, source: "builtin" },
  { id: "single-bed", name: "单人床", category: "bed", size: { width: 1200, depth: 2000, height: 500 }, color: "#b8c8bf", factory: bedFactory, source: "builtin" },
  { id: "sofa-bed", name: "折叠沙发床", category: "bed", size: { width: 1200, depth: 850, height: 720 }, color: "#c9c2d5", factory: sofaBedFactory, source: "builtin" },
  { id: "wardrobe", name: "平开门衣柜", category: "storage", size: { width: 1800, depth: 600, height: 2400 }, color: "#c8b696", factory: hingedWardrobeFactory, source: "builtin" },
  { id: "sliding-wardrobe", name: "推拉门衣柜", category: "storage", size: { width: 1800, depth: 650, height: 2400 }, color: "#c8b696", factory: slidingWardrobeFactory, source: "builtin" },
  { id: "desk", name: "书桌", category: "desk", size: { width: 1200, depth: 600, height: 750 }, color: "#a98d69", factory: deskFactory, source: "builtin" },
  { id: "vanity", name: "梳妆台", category: "desk", size: { width: 1050, depth: 450, height: 750 }, color: "#aa8b69", factory: deskFactory, source: "builtin" },
  { id: "wall-cabinet", name: "吊书柜", category: "storage", size: { width: 1000, depth: 300, height: 700 }, color: "#c5ad8c", factory: simpleFactory, source: "builtin" },
  { id: "entry-cabinet", name: "收纳薄柜", category: "storage", size: { width: 800, depth: 350, height: 2200 }, color: "#bda989", factory: simpleFactory, source: "builtin" },
  { id: "nightstand", name: "床头柜", category: "storage", size: { width: 480, depth: 420, height: 520 }, color: "#b99f7c", factory: simpleFactory, source: "builtin" },
  { id: "desk-chair", name: "书桌椅", category: "seat", size: { width: 460, depth: 460, height: 820 }, color: "#6f877d", factory: simpleFactory, source: "builtin" },
  { id: "stool", name: "凳子", category: "seat", size: { width: 420, depth: 420, height: 450 }, color: "#b97968", factory: simpleFactory, source: "builtin" },
  { id: "lounge-chair", name: "休闲椅", category: "seat", size: { width: 720, depth: 760, height: 820 }, color: "#b76e5d", factory: simpleFactory, source: "builtin" },
];

const GENERATED_ASSET_CATALOG: CatalogAsset[] = APPROVED_GENERATED_ASSETS.map((asset) => ({
  id: asset.manifest.id,
  name: asset.manifest.name,
  category: asset.manifest.category,
  size: asset.manifest.dimensions!,
  color: asset.manifest.color,
  source: "img2threejs",
  factory: (_spec, options) => createAdaptedGeneratedModel(asset.factory, options.dimensions, { strict: true }).group,
}));

export const ASSET_CATALOG: CatalogAsset[] = [...BUILTIN_ASSET_CATALOG, ...GENERATED_ASSET_CATALOG];

const externalFactories = new Map<string, CatalogAsset>();

/** Register a Group factory generated by img2threejs without coupling it to the editor. */
export function registerImg2ThreeAsset(asset: Omit<CatalogAsset, "source">) {
  externalFactories.set(asset.id, { ...asset, source: "img2threejs" });
}

export function createAssetGroup(item: FurnitureItem) {
  const asset = externalFactories.get(item.assetId) ?? ASSET_CATALOG.find((entry) => entry.id === item.assetId);
  const group = (asset?.factory ?? simpleFactory)(item, { dimensions: item.size, color: item.color, seed: 1 });
  group.name = item.name;
  group.userData = { ...group.userData, furnitureId: item.id, assetId: item.assetId, clickable: true, explodable: true };
  group.traverse((child) => { child.userData.furnitureId = item.id; });
  return group;
}

export function catalogItemToFurniture(assetId: string, room: RoomLayout): FurnitureItem {
  const asset = ASSET_CATALOG.find((entry) => entry.id === assetId) ?? ASSET_CATALOG[0];
  return {
    id: `${asset.id}-${Date.now()}`,
    assetId: asset.id,
    name: asset.name,
    position: { x: room.dimensions.width / 2, z: room.dimensions.depth / 2 },
    rotation: 0,
    size: { ...asset.size },
    color: asset.color,
    wallMounted: asset.id === "wall-cabinet",
    clearanceDepth: asset.id === "wardrobe" ? 900 : asset.id === "sliding-wardrobe" ? 200 : undefined,
    clearanceLabel: asset.id === "wardrobe" ? "平开门开启区 900" : asset.id === "sliding-wardrobe" ? "推拉门操作区 200" : undefined,
    interactionState: ["wardrobe", "sliding-wardrobe", "sofa-bed"].includes(asset.id) ? "closed" : undefined,
    collapsedDepth: asset.id === "sofa-bed" ? 850 : undefined,
    expandedDepth: asset.id === "sofa-bed" ? 2000 : undefined,
  };
}
