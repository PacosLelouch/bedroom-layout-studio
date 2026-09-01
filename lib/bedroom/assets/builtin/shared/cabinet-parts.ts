import * as THREE from "three";
import type { FurnitureRuntimeFactory } from "../../runtime-types";
import { box } from "./primitives";

function carcass(group: THREE.Group, width: number, depth: number, height: number, color: string) {
  const t = Math.max(30, Math.min(48, width * 0.025));
  const inside = "#e9dfcc";
  group.add(box([width, t, depth], color, [0, t / 2, 0]), box([width, t, depth], color, [0, height - t / 2, 0]));
  group.add(box([t, height, depth], color, [-width / 2 + t / 2, height / 2, 0]), box([t, height, depth], color, [width / 2 - t / 2, height / 2, 0]));
  group.add(box([width - t * 2, height - t * 2, t], inside, [0, height / 2, -depth / 2 + t / 2]), box([t, height - t * 2, depth - t * 2], inside, [0, height / 2, 0]));
  for (const y of [620, 1180, height - 360]) group.add(box([width - t * 2, t, depth - t * 2], inside, [0, y, 0]));
  return t;
}

export const createHingedWardrobe: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth, height } = configuration.dimensions; const group = new THREE.Group(); group.name = "body"; const color = String(configuration.parameters.color ?? "#c8b696"); const t = carcass(group, width, depth, height, color);
  const doorWidth = (width - t * 2) / 2; const doorHeight = height - t * 2; const front = depth / 2 + 14; const open = configuration.stateId === "open";
  const left = new THREE.Group(); left.name = "left-door-pivot"; left.position.set(-width / 2 + t, t, front); left.rotation.y = open ? THREE.MathUtils.degToRad(-98) : 0; left.add(box([doorWidth - 8, doorHeight, 28], color, [doorWidth / 2, doorHeight / 2, 0]));
  const right = new THREE.Group(); right.name = "right-door-pivot"; right.position.set(width / 2 - t, t, front + 4); right.rotation.y = open ? THREE.MathUtils.degToRad(98) : 0; right.add(box([doorWidth - 8, doorHeight, 28], color, [-doorWidth / 2, doorHeight / 2, 0]));
  group.add(left, right); return group;
};

export const createSlidingWardrobe: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth, height } = configuration.dimensions; const group = new THREE.Group(); group.name = "body"; const color = String(configuration.parameters.color ?? "#c8b696"); const t = carcass(group, width, depth, height, color); const doorWidth = (width - t * 2) / 2; const doorHeight = height - t * 2;
  const fixedDoor = box([doorWidth - 6, doorHeight, 30], color, [-width / 4, height / 2, depth / 2 + 12]); fixedDoor.name = "fixed-door";
  const slidingDoor = box([doorWidth - 6, doorHeight, 30], "#b8a27e", [configuration.stateId === "open" ? -width / 4 : width / 4, height / 2, depth / 2 + 48]); slidingDoor.name = "sliding-door";
  group.add(fixedDoor, slidingDoor);
  group.add(box([width - t * 2, 22, 76], "#857767", [0, 42, depth / 2 + 26]), box([width - t * 2, 22, 76], "#857767", [0, height - 42, depth / 2 + 26]));
  return group;
};

export const createEntryCabinet: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth, height } = configuration.dimensions; const group = new THREE.Group(); group.name = "body"; const color = String(configuration.parameters.color ?? "#bda989"); const t = Math.max(28, width * 0.04);
  group.add(box([width, t, depth], color, [0, t / 2, 0]), box([width, t, depth], color, [0, height - t / 2, 0]), box([t, height, depth], color, [-width / 2 + t / 2, height / 2, 0]), box([t, height, depth], color, [width / 2 - t / 2, height / 2, 0]), box([width - t * 2, height - t * 2, t], "#eadfca", [0, height / 2, -depth / 2 + t / 2]));
  for (const y of [420, 850, 1280, 1710]) group.add(box([width - t * 2, t, depth - t * 2], "#eadfca", [0, y, 0]));
  const dw = (width - t * 2) / 2; const dh = height - t * 2; const front = depth / 2 + 14; const open = configuration.stateId === "open";
  for (const side of [-1, 1]) { const pivot = new THREE.Group(); pivot.name = side < 0 ? "left-door-pivot" : "right-door-pivot"; pivot.position.set(side * (width / 2 - t), t, front); pivot.rotation.y = open ? THREE.MathUtils.degToRad(side * 100) : 0; pivot.add(box([dw - 8, dh, 28], color, [-side * dw / 2, dh / 2, 0])); group.add(pivot); }
  return group;
};
