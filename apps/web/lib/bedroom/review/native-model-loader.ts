import { FURNITURE_SOURCE_MODEL_LOADERS } from "../assets/registry/model-loaders.generated";
export async function loadFurnitureNativeFactory(assetId: string) { return (await FURNITURE_SOURCE_MODEL_LOADERS[assetId]?.())?.createSourceModel; }
