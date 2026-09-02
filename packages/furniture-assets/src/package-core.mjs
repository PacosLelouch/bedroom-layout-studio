import { createHash } from "node:crypto";

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function computeFurnitureArtifactSetHash(objects) {
  return sha256Hex(canonicalJson([...objects]
    .filter((object) => object.logicalPath !== "package-index.json")
    .map(({ logicalPath, sha256, sizeBytes }) => ({ logicalPath, sha256, sizeBytes }))
    .sort((left, right) => left.logicalPath.localeCompare(right.logicalPath))));
}

export function expectedFurniturePackagePrefix({ tenantId, assetId, revisionId }) {
  return `tenants/${tenantId}/assets/${assetId}/revisions/${revisionId}`;
}

export function validateFurniturePackageKeyBoundary(index, prefix) {
  const expected = `${prefix}/`;
  return index.objects.flatMap((object) => object.objectKey === `${prefix}/${object.logicalPath}` && object.objectKey.startsWith(expected)
    ? []
    : [`${object.logicalPath} 的 objectKey 不在修订包前缀内`]);
}
