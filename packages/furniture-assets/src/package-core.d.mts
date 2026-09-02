import type { FurniturePackageIndex, FurniturePackageObject } from "@bedroom/contracts";

export declare function sha256Hex(value: string | Uint8Array): string;
export declare function canonicalJson(value: unknown): string;
export declare function computeFurnitureArtifactSetHash(objects: FurniturePackageObject[]): string;
export declare function expectedFurniturePackagePrefix(input: { tenantId: string; assetId: string; revisionId: string }): string;
export declare function validateFurniturePackageKeyBoundary(index: FurniturePackageIndex, prefix: string): string[];
