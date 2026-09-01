import type { FurnitureConfiguration, FurnitureItem } from "../types";
import type { FurnitureAssetDescriptor } from "./contracts";

export interface FurnitureLocalFootprint { minX: number; maxX: number; minZ: number; maxZ: number }

export function resolveFurnitureFootprint(
  asset: FurnitureAssetDescriptor | undefined,
  configuration: FurnitureConfiguration,
): FurnitureLocalFootprint {
  let width = configuration.dimensions.width;
  let depth = configuration.dimensions.depth;
  let offsetX = 0;
  let offsetZ = 0;
  if (asset?.footprintPolicy.type === "state-overrides" && configuration.stateId) {
    const override = asset.footprintPolicy.states[configuration.stateId];
    if (override) ({ width, depth, offsetX = 0, offsetZ = 0 } = override);
  }
  if (asset?.id === "sofa-bed" && configuration.stateId === "open") {
    width = Number(configuration.parameters.expandedWidth ?? width);
    depth = Number(configuration.parameters.expandedDepth ?? depth);
  }
  return {
    minX: offsetX - width / 2,
    maxX: offsetX + width / 2,
    minZ: offsetZ - depth / 2,
    maxZ: offsetZ + depth / 2,
  };
}

export function furnitureItemConfiguration(item: FurnitureItem): FurnitureConfiguration {
  return {
    dimensions: { ...item.size },
    parameters: { color: item.color, ...item.parameterValues },
    stateId: item.stateId,
  };
}
