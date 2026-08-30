import type { RoomLayout } from "./types";

/**
 * Authoritative room geometry transcribed from docs/三个卧室-标尺图-SVG和PNG.
 * Coordinates use millimetres, with x running left-to-right and z top-to-bottom.
 */
export const INITIAL_ROOMS: RoomLayout[] = [
  {
    id: "master",
    name: "主卧",
    dimensions: { width: 3001, depth: 5155, height: 2800 },
    clearArea: 11.34,
    planSrc: "/floorplans/master-bedroom.svg",
    outline: [
      { x: 0, z: 0 }, { x: 982, z: 0 }, { x: 982, z: 2047 },
      { x: 3001, z: 2047 }, { x: 3001, z: 5155 }, { x: 0, z: 5155 },
    ],
    keepOutZones: [
      { id: "master-entry-door", label: "入户门开启区 R900", x: 0, z: 900, width: 900, depth: 900, kind: "door" },
    ],
    doors: [
      { id: "master-entry", label: "主卧门 W900", hinge: { x: 0, z: 900 }, width: 900, wallAxis: "x", wallCoordinate: 0, openingStart: 900, closedAngle: 90, openAngle: 0, isOpen: true },
      { id: "master-ensuite", label: "套卫门 W900", hinge: { x: 982, z: 900 }, width: 900, wallAxis: "x", wallCoordinate: 982, openingStart: 900, closedAngle: 90, openAngle: 0, isOpen: true },
    ],
    bayWindow: { side: "bottom", start: 0, length: 3001, depth: 650, sillHeight: 600 },
    items: [
      { id: "master-bed", assetId: "double-bed", name: "1800 双人床", position: { x: 900, z: 4000 }, rotation: 0, size: { width: 1800, depth: 2100, height: 520 }, color: "#d9cbb9" },
      { id: "master-wardrobe", assetId: "sliding-wardrobe", name: "推拉门衣柜", position: { x: 1800, z: 2372 }, rotation: 0, size: { width: 1800, depth: 650, height: 2400 }, color: "#c8b696", clearanceDepth: 200, clearanceLabel: "推拉门操作区 200", interactionState: "closed" },
      { id: "master-vanity", assetId: "vanity", name: "飘窗梳妆台", position: { x: 2476, z: 4930 }, rotation: 0, size: { width: 1050, depth: 450, height: 750 }, color: "#aa8b69" },
      { id: "master-stool", assetId: "stool", name: "梳妆凳", position: { x: 2200, z: 4400 }, rotation: 0, size: { width: 420, depth: 420, height: 450 }, color: "#b97968" },
      { id: "master-entry-cabinet", assetId: "entry-cabinet", name: "入户收纳薄柜", position: { x: 550, z: 175 }, rotation: 0, size: { width: 800, depth: 350, height: 2200 }, color: "#bda989" },
    ],
  },
  {
    id: "large-secondary",
    name: "大次卧",
    dimensions: { width: 2716, depth: 3108, height: 2800 },
    clearArea: 8.44,
    planSrc: "/floorplans/large-secondary-bedroom.svg",
    outline: [{ x: 0, z: 0 }, { x: 2716, z: 0 }, { x: 2716, z: 3108 }, { x: 0, z: 3108 }],
    keepOutZones: [
      { id: "large-entry-door", label: "房门开启区 R900", x: 0, z: 0, width: 900, depth: 900, kind: "door" },
    ],
    doors: [
      { id: "large-entry", label: "房门 W900", hinge: { x: 900, z: 0 }, width: 900, wallAxis: "z", wallCoordinate: 0, openingStart: 0, closedAngle: 180, openAngle: 90, isOpen: true },
    ],
    bayWindow: { side: "bottom", start: 0, length: 2716, depth: 650, sillHeight: 600 },
    items: [
      { id: "large-wardrobe", assetId: "sliding-wardrobe", name: "推拉门衣柜", position: { x: 1816, z: 325 }, rotation: 0, size: { width: 1800, depth: 650, height: 2400 }, color: "#c8b696", clearanceDepth: 200, clearanceLabel: "推拉门操作区 200", interactionState: "closed" },
      { id: "large-bed", assetId: "queen-bed", name: "1500 双人床", position: { x: 750, z: 2054 }, rotation: 0, size: { width: 1500, depth: 2000, height: 520 }, color: "#b8c8bf" },
      { id: "large-desk", assetId: "desk", name: "飘窗侧书桌", position: { x: 2466, z: 1800 }, rotation: 90, size: { width: 1000, depth: 500, height: 750 }, color: "#a98d69" },
      { id: "large-cabinet", assetId: "wall-cabinet", name: "吊书柜", position: { x: 2566, z: 1800 }, rotation: 90, size: { width: 1000, depth: 300, height: 700 }, color: "#c5ad8c", wallMounted: true },
      { id: "large-chair", assetId: "desk-chair", name: "书桌椅", position: { x: 1850, z: 1800 }, rotation: 90, size: { width: 460, depth: 460, height: 820 }, color: "#6f877d" },
    ],
  },
  {
    id: "small-secondary",
    name: "小次卧",
    dimensions: { width: 2716, depth: 2513, height: 2800 },
    clearArea: 6.82,
    planSrc: "/floorplans/small-secondary-bedroom.svg",
    outline: [{ x: 0, z: 0 }, { x: 2716, z: 0 }, { x: 2716, z: 2513 }, { x: 0, z: 2513 }],
    keepOutZones: [
      { id: "small-entry-door", label: "房门开启区 R900", x: 1816, z: 1613, width: 900, depth: 900, kind: "door" },
    ],
    doors: [
      { id: "small-entry", label: "房门 W900", hinge: { x: 2716, z: 2513 }, width: 900, wallAxis: "z", wallCoordinate: 2513, openingStart: 1816, closedAngle: 180, openAngle: 270, isOpen: true },
    ],
    bayWindow: { side: "right", start: 0, length: 1500, depth: 650, sillHeight: 600 },
    items: [
      { id: "small-sofa-bed", assetId: "sofa-bed", name: "1200 折叠沙发床", position: { x: 600, z: 425 }, rotation: 0, size: { width: 1200, depth: 850, height: 720 }, color: "#c9c2d5", interactionState: "closed", collapsedDepth: 850, expandedDepth: 2000, collapsedPositionZ: 425, expandedPositionZ: 1000 },
      { id: "small-wardrobe", assetId: "sliding-wardrobe", name: "推拉门衣柜", position: { x: 1700, z: 325 }, rotation: 0, size: { width: 1000, depth: 650, height: 2400 }, color: "#c8b696", clearanceDepth: 200, clearanceLabel: "推拉门操作区 200", interactionState: "closed" },
      { id: "small-desk", assetId: "desk", name: "飘窗书桌", position: { x: 2466, z: 700 }, rotation: 90, size: { width: 1000, depth: 500, height: 750 }, color: "#a98d69" },
      { id: "small-cabinet", assetId: "wall-cabinet", name: "吊书柜", position: { x: 2566, z: 700 }, rotation: 90, size: { width: 1000, depth: 300, height: 700 }, color: "#cab698", wallMounted: true },
      { id: "small-chair", assetId: "desk-chair", name: "书桌椅", position: { x: 1800, z: 1350 }, rotation: 90, size: { width: 420, depth: 420, height: 800 }, color: "#826f8f" },
    ],
  },
];
