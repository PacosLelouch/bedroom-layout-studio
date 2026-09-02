import * as THREE from "three";
import type { FurnitureRuntimeFactory } from "../../runtime-types";
import { box } from "./primitives";

export const createDesk: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth, height } = configuration.dimensions; const group = new THREE.Group(); group.name = "body";
  group.add(box([width, 70, depth], String(configuration.parameters.color ?? "#a98d69"), [0, height, 0]));
  for (const x of [-width * 0.43, width * 0.43]) for (const z of [-depth * 0.38, depth * 0.38]) group.add(box([65, height, 65], "#715b43", [x, height / 2, z]));
  return group;
};

export const createAdjustableDesk: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth } = configuration.dimensions; const height = configuration.stateId === "open" ? Number(configuration.parameters.raisedHeight ?? 1100) : Number(configuration.parameters.loweredHeight ?? configuration.dimensions.height); const group = new THREE.Group(); group.name = "body"; const top = 64;
  group.add(box([width, top, depth], String(configuration.parameters.color ?? "#a98d69"), [0, height - top / 2, 0]), box([width * .78, 54, 70], "#5f625f", [0, height - top - 48, 0]));
  for (const x of [-width * .36, width * .36]) { const lower = Math.min(520, height * .62); const upper = Math.max(120, height - lower - top - 40); group.add(box([92, lower, 92], "#4c504e", [x, 45 + lower / 2, 0]), box([62, upper + 150, 62], "#7a7d79", [x, lower + (upper + 60) / 2, 0]), box([220, 42, depth * .78], "#4c504e", [x, 22, 0])); for (const z of [-depth * .34, depth * .34]) group.add(box([54, 18, 72], "#303432", [x, 9, z])); }
  group.add(box([115, 44, 68], "#2e3331", [width * .3, height - top - 24, depth * .35])); return group;
};
