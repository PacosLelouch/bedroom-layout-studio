CREATE TYPE "public"."asset_execution_policy" AS ENUM('repository-bundled', 'platform-built-esm', 'quarantined-source');
ALTER TABLE "assets" RENAME COLUMN "slug" TO "asset_key";
DROP INDEX IF EXISTS "assets_workspace_slug_uq";
ALTER TABLE "assets" ADD COLUMN "execution_policy" "asset_execution_policy" NOT NULL DEFAULT 'quarantined-source';
ALTER TABLE "assets" ADD COLUMN "published_revision_id" uuid;
CREATE UNIQUE INDEX "assets_workspace_key_uq" ON "assets" USING btree ("workspace_id", "asset_key");

ALTER TABLE "asset_revisions" ADD COLUMN "runtime_abi_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "asset_revisions" ADD COLUMN "artifact_set_hash" text;
ALTER TABLE "asset_revisions" ADD COLUMN "package_root_key" text;
ALTER TABLE "asset_revisions" ADD COLUMN "package_index_key" text;
ALTER TABLE "asset_revisions" ADD COLUMN "package_index_hash" text;
UPDATE "asset_revisions" SET
  "artifact_set_hash" = "contract_hash",
  "package_root_key" = regexp_replace("manifest_object_key", '/contract/asset.json$', ''),
  "package_index_key" = regexp_replace("manifest_object_key", '/contract/asset.json$', '/package-index.json'),
  "package_index_hash" = "contract_hash";
ALTER TABLE "asset_revisions" ALTER COLUMN "artifact_set_hash" SET NOT NULL;
ALTER TABLE "asset_revisions" ALTER COLUMN "package_root_key" SET NOT NULL;
ALTER TABLE "asset_revisions" ALTER COLUMN "package_index_key" SET NOT NULL;
ALTER TABLE "asset_revisions" ALTER COLUMN "package_index_hash" SET NOT NULL;
ALTER TABLE "asset_revisions" DROP COLUMN "manifest";
ALTER TABLE "asset_revisions" DROP COLUMN "manifest_object_id";
ALTER TABLE "asset_revisions" DROP COLUMN "runtime_object_id";
ALTER TABLE "asset_revisions" DROP COLUMN "model_object_id";
ALTER TABLE "asset_revisions" DROP COLUMN "manifest_object_key";
ALTER TABLE "asset_revisions" DROP COLUMN "runtime_object_key";
ALTER TABLE "asset_revisions" DROP COLUMN "model_object_key";

ALTER TABLE "asset_artifacts" ALTER COLUMN "object_id" DROP NOT NULL;
ALTER TABLE "asset_artifacts" ADD COLUMN "logical_path" text;
ALTER TABLE "asset_artifacts" ADD COLUMN "object_key" text;
ALTER TABLE "asset_artifacts" ADD COLUMN "sha256" text;
ALTER TABLE "asset_artifacts" ADD COLUMN "size_bytes" bigint;
ALTER TABLE "asset_artifacts" ADD COLUMN "media_type" text;
UPDATE "asset_artifacts" AS a SET
  "logical_path" = 'legacy/' || a."id"::text,
  "object_key" = o."object_key",
  "sha256" = o."sha256",
  "size_bytes" = o."size_bytes",
  "media_type" = o."media_type"
FROM "storage_objects" AS o WHERE a."object_id" = o."id";
ALTER TABLE "asset_artifacts" ALTER COLUMN "logical_path" SET NOT NULL;
ALTER TABLE "asset_artifacts" ALTER COLUMN "object_key" SET NOT NULL;
ALTER TABLE "asset_artifacts" ALTER COLUMN "sha256" SET NOT NULL;
ALTER TABLE "asset_artifacts" ALTER COLUMN "size_bytes" SET NOT NULL;
ALTER TABLE "asset_artifacts" ALTER COLUMN "media_type" SET NOT NULL;
CREATE UNIQUE INDEX "asset_artifacts_revision_path_uq" ON "asset_artifacts" USING btree ("revision_id", "logical_path");
