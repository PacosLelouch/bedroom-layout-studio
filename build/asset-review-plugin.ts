import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

const ENDPOINT = "/__asset-review/decision";
const CAPABILITIES = "/__asset-review/capabilities";
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const VALID_STATUSES = new Set(["candidate", "approved", "archived"]);
const VALID_SOURCES = new Set(["user-provided", "product-spec", "room-measurement", "other-context"]);

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > 64 * 1024) throw new Error("Request body is too large.");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isAllowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "terminal.local";
  } catch {
    return false;
  }
}

function validDimensions(value: unknown): value is { width: number; depth: number; height: number } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return [record.width, record.depth, record.height].every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0);
}

export function assetReviewWriter(): Plugin {
  let root = process.cwd();
  let inspectionServer: ViteDevServer | null = null;
  const getInspectionServer = async () => {
    if (!inspectionServer) {
      const { createServer } = await import("vite");
      inspectionServer = await createServer({
        appType: "custom",
        configFile: false,
        root,
        resolve: { alias: { "@": root } },
        server: { middlewareMode: true },
      });
    }
    return inspectionServer;
  };
  return {
    name: "asset-review-writer",
    apply: "serve",
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url ? new URL(request.url, "http://local").pathname : "";
        if (pathname === CAPABILITIES && request.method === "GET") {
          sendJson(response, 200, { writable: true, mode: "local-project" });
          return;
        }
        if (pathname !== ENDPOINT) return next();
        if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
        if (!isAllowedOrigin(request) || request.headers["x-asset-review-intent"] !== "local-write") return sendJson(response, 403, { error: "Local write intent was not verified." });

        try {
          const body = await readJson(request) as Record<string, unknown>;
          const assetId = body.assetId;
          const status = body.status;
          if (typeof assetId !== "string" || !ID_PATTERN.test(assetId) || typeof status !== "string" || !VALID_STATUSES.has(status)) return sendJson(response, 400, { error: "Invalid asset decision." });
          const assetDirectory = resolve(root, "lib", "bedroom", "generated", assetId);
          const manifestPath = resolve(assetDirectory, "asset.json");
          if (dirname(manifestPath) !== assetDirectory) return sendJson(response, 400, { error: "Invalid asset path." });
          const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
          if (manifest.id !== assetId || !Array.isArray(manifest.qualityEvidence)) return sendJson(response, 409, { error: "Asset manifest does not match the requested id." });
          const factoryPath = resolve(assetDirectory, manifest.factoryFile);
          if (dirname(factoryPath) !== assetDirectory) return sendJson(response, 409, { error: "Factory path escaped the asset directory." });
          const factoryHash = createHash("sha256").update(await readFile(factoryPath)).digest("hex");
          if (body.factoryHash !== factoryHash) return sendJson(response, 409, { error: "Factory changed; reload before reviewing it." });

          const updated = { ...manifest, status };
          if (status === "approved") {
            const dimensionSource = body.dimensionSource as Record<string, unknown> | null;
            if (!validDimensions(body.dimensions) || !dimensionSource || !VALID_SOURCES.has(String(dimensionSource.type)) || typeof dimensionSource.note !== "string" || !dimensionSource.note.trim()) return sendJson(response, 400, { error: "Approval requires positive dimensions and a reliable source note." });
            if (manifest.qualityEvidence.length === 0) return sendJson(response, 400, { error: "Approval requires quality evidence." });
            const inspectionRuntime = await getInspectionServer();
            const registry = await inspectionRuntime.ssrLoadModule("/lib/bedroom/generated/registry.ts");
            const adapter = await inspectionRuntime.ssrLoadModule("/lib/bedroom/generated/model-adapter.ts");
            const disposal = await inspectionRuntime.ssrLoadModule("/lib/bedroom/three-disposal.ts");
            const generatedAsset = registry.findGeneratedAsset(assetId);
            if (!generatedAsset || generatedAsset.factoryHash !== factoryHash) return sendJson(response, 409, { error: "Generated registry is stale; synchronize it before approval." });
            const inspection = adapter.createAdaptedGeneratedModel(generatedAsset.factory, body.dimensions);
            disposal.disposeObjectTree(inspection.group);
            if (!inspection.report.aspectCompatible) return sendJson(response, 422, { error: `Model proportions differ from the supplied dimensions by ${(inspection.report.aspectDeviation * 100).toFixed(1)}%; regenerate before approval.` });
            updated.dimensions = body.dimensions;
            updated.dimensionSource = { type: dimensionSource.type, note: dimensionSource.note.trim() };
            updated.approvedFactoryHash = factoryHash;
            updated.reviewedAt = new Date().toISOString();
          } else if (status === "candidate") {
            updated.approvedFactoryHash = null;
            updated.reviewedAt = null;
          }

          const temporaryPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
          await writeFile(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
          await rename(temporaryPath, manifestPath);
          sendJson(response, 200, { ok: true, status, factoryHash });
          server.ws.send({ type: "full-reload", path: "*" });
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          sendJson(response, code === "ENOENT" ? 404 : 500, { error: error instanceof Error ? error.message : "Unable to update asset." });
        }
      });
    },
    async closeBundle() {
      await inspectionServer?.close();
      inspectionServer = null;
    },
  };
}
