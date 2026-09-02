export function capabilityContract(manifest: Record<string, unknown>): Record<string, unknown>;
export function computeFurnitureAssetContractHash(modelSource: string | Buffer, runtimeSource: string | Buffer, manifest: Record<string, unknown>): string;
export function validateFurnitureAssetManifest(manifest: Record<string, unknown>, options?: { requireCandidateReady?: boolean }): string[];
export function candidateReadinessIssues(manifest: Record<string, unknown>, contractHash: string): string[];
export function readFurniturePackageContractSources(assetDirectory: string): Promise<{ modelSource: string; runtimeSource: string }>;
