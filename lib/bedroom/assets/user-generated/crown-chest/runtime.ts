import type { FurnitureConfiguration } from "../../../types";
import { createAdaptedGeneratedModel } from "../../model-adapter";
import { createSourceModel } from "./model";

export function createFurnitureModel(
  configuration: FurnitureConfiguration,
  context: { purpose: "scene" | "review" | "export" } = { purpose: "scene" },
) {
  const { group } = createAdaptedGeneratedModel(
    () => createSourceModel({ exportSafeMaterials: context.purpose === "export" }),
    configuration.dimensions,
  );
  const model = group.children[0];
  const runtime = model?.userData.sculptRuntime as {
    animation?: { openLid?: (amount: number) => void };
  } | undefined;
  runtime?.animation?.openLid?.(configuration.stateId === "open" ? 1 : 0);
  group.updateMatrixWorld(true);
  return group;
}
