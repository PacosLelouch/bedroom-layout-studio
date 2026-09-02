import { FURNITURE_RUNTIME_LOADERS } from "../assets/runtime-loaders";

export async function loadFurnitureReviewFactory(assetId: string) {
  const loader = FURNITURE_RUNTIME_LOADERS[assetId];
  if (!loader) throw new Error(`找不到 ${assetId} 的家具运行模块。`);
  return (await loader()).createFurnitureModel;
}
