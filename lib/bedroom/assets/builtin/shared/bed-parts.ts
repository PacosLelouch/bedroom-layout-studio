import * as THREE from "three";
import type { FurnitureRuntimeFactory } from "../../runtime-types";
import { box } from "./primitives";

export const createBed: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth, height } = configuration.dimensions;
  const group = new THREE.Group();
  group.name = "body";
  const frameHeight = Math.min(240, height * 0.48);
  group.add(box([width, frameHeight, depth], "#9d7d5d", [0, frameHeight / 2, 0]));
  group.add(box([width * 0.94, height * 0.42, depth * 0.82], String(configuration.parameters.color ?? "#d7cabc"), [0, frameHeight + height * 0.21, depth * 0.04]));
  group.add(box([width, Math.max(620, height), 90], "#aa8e6d", [0, Math.max(620, height) / 2, -depth / 2 + 45]));
  const pillowWidth = width * 0.38;
  group.add(box([pillowWidth, 110, 340], "#f2eee7", [-width * 0.23, frameHeight + height * 0.46, -depth * 0.28]));
  group.add(box([pillowWidth, 110, 340], "#f2eee7", [width * 0.23, frameHeight + height * 0.46, -depth * 0.28]));
  return group;
};

export const createSofaBed: FurnitureRuntimeFactory = (configuration, context) => {
  if (configuration.stateId === "open") {
    return createBed({ ...configuration, dimensions: { ...configuration.dimensions, width: Number(configuration.parameters.expandedWidth ?? 1200), depth: Number(configuration.parameters.expandedDepth ?? 2000) } }, context);
  }
  const { width, depth } = configuration.dimensions;
  const group = new THREE.Group();
  group.name = "body";
  const color = String(configuration.parameters.color ?? "#c9c2d5");
  group.add(box([width - 170, 180, depth - 130], color, [35, 390, 0]));
  group.add(box([125, 430, depth - 150], color, [-width / 2 + 70, 565, 0]));
  group.add(box([width - 90, 430, 105], "#9f97ad", [25, 365, -depth / 2 + 55]));
  group.add(box([width - 90, 430, 105], "#9f97ad", [25, 365, depth / 2 - 55]));
  group.add(box([width - 260, 95, depth - 230], "#e7e0ed", [55, 515, 0]));
  for (const z of [-depth * 0.38, depth * 0.38]) group.add(box([70, 150, 70], "#675f70", [width * 0.27, 75, z]));
  return group;
};
