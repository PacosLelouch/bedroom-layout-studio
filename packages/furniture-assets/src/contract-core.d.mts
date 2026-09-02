export function canonicalizeFurnitureContract(value: unknown): unknown;
export function furnitureCapabilityContract(manifest: Record<string, any>): Record<string, unknown>;
export function validateFurnitureAssetManifest(manifest: Record<string, any>, options?: { requireCandidateReady?: boolean }): string[];
export function furnitureCandidateReadinessIssues(manifest: Record<string, any>, contractHash: string): string[];
