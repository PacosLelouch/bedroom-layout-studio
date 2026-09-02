import type { FurnitureAssetCatalogEntry } from "../package-types";
import { USER_GENERATED_PACKAGE_CATALOG } from "../registry/catalog.generated";
import type { PublishedFurnitureCatalogEntry } from "@bedroom/contracts";
import { BedroomApiClient } from "@bedroom/bedroom-core";

/** Boundary for replacing the current frontend snapshot with a backend catalog API. */
export interface UserGeneratedAssetProvider {
  readonly kind: "frontend-bundled" | "backend-api";
  listCatalog(): Promise<readonly FurnitureAssetCatalogEntry[]>;
}

export const frontendUserGeneratedAssetProvider: UserGeneratedAssetProvider = {
  kind: "frontend-bundled",
  async listCatalog() { return USER_GENERATED_PACKAGE_CATALOG; },
};

/** Synchronous snapshot used by the current client bundle. */
export const FRONTEND_USER_GENERATED_ASSETS = USER_GENERATED_PACKAGE_CATALOG;

export function createBackendFurnitureAssetProvider(baseUrl: string) {
  const client = new BedroomApiClient({ baseUrl });
  return { kind: "backend-api" as const, listCatalog: (): Promise<PublishedFurnitureCatalogEntry[]> => client.listFurnitureCatalog() };
}
