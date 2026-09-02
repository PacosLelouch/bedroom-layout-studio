import * as THREE from "three";
import type { FurnitureRuntimeFactory } from "../../runtime-types";
import { box } from "./primitives";

export const createDeskChair: FurnitureRuntimeFactory = (configuration) => {
  const { width, depth, height } = configuration.dimensions; const group = new THREE.Group(); group.name = "body"; const color = String(configuration.parameters.color ?? "#6f877d"); const frame = "#454b48"; const seatHeight = Math.min(470, height * .56); const seatWidth = width * .82; const seatDepth = depth * .78;
  group.add(box([seatWidth, 78, seatDepth], color, [0, seatHeight, 12]), box([width * .76, height - seatHeight - 100, 72], color, [0, seatHeight + (height - seatHeight) / 2, -depth / 2 + 48]), box([width * .82, 46, 54], frame, [0, seatHeight + 70, -depth / 2 + 42]));
  for (const x of [-seatWidth * .42, seatWidth * .42]) for (const z of [-seatDepth * .4, seatDepth * .4]) group.add(box([42, seatHeight - 25, 42], frame, [x, (seatHeight - 25) / 2, z + 10]), box([66, 20, 66], "#2d302f", [x, 10, z + 10]));
  return group;
};
