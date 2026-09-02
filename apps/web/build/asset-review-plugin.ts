import { execFile } from "node:child_process";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { candidateReadinessIssues, computeFurnitureAssetContractHash, readFurniturePackageContractSources } from "../scripts/furniture-asset-contract.mjs";

const ENDPOINT = "/__asset-review/decision";
const CAPABILITIES = "/__asset-review/capabilities";
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const VALID_STATUSES = new Set(["draft", "candidate", "approved", "archived"]);
const VALID_SOURCES = new Set(["user-provided", "product-spec", "room-measurement", "other-context"]);
const VALID_PARAMETER_TYPES = new Set(["number", "boolean", "enum", "color"]);

function runNode(file: string, cwd: string) {
  return new Promise<void>((resolvePromise, reject) => execFile(process.execPath, [file], { cwd }, (error) => error ? reject(error) : resolvePromise()));
}

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

function validCapabilities(body: Record<string, unknown>, dimensions: { width: number; depth: number; height: number }) {
  const states = body.states;
  const definitions = body.parameterDefinitions;
  const values = body.parameterValues;
  const constraints = body.dimensionConstraints;
  if (!Array.isArray(states) || !Array.isArray(definitions) || !values || typeof values !== "object" || !constraints || typeof constraints !== "object") return false;
  const stateIds = new Set<string>();
  for (const state of states) {
    if (!state || typeof state !== "object") return false;
    const entry = state as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !["id", "label"].includes(key)) || typeof entry.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(entry.id) || stateIds.has(entry.id) || typeof entry.label !== "string" || !entry.label.trim()) return false;
    stateIds.add(entry.id);
  }
  if (states.length ? typeof body.stateId !== "string" || !stateIds.has(body.stateId) : body.stateId !== null) return false;
  const parameterIds = new Set<string>();
  for (const definition of definitions) {
    if (!definition || typeof definition !== "object") return false;
    const entry = definition as Record<string, unknown>;
    const allowedKeys = entry.type === "number" ? ["id", "label", "type", "defaultValue", "min", "max", "step", "unit"] : entry.type === "enum" ? ["id", "label", "type", "defaultValue", "options"] : ["id", "label", "type", "defaultValue"];
    if (Object.keys(entry).some((key) => !allowedKeys.includes(key)) || typeof entry.id !== "string" || !/^[a-z][a-zA-Z0-9]*$/.test(entry.id) || parameterIds.has(entry.id) || typeof entry.label !== "string" || !entry.label.trim() || typeof entry.type !== "string" || !VALID_PARAMETER_TYPES.has(entry.type)) return false;
    parameterIds.add(entry.id);
    const value = (values as Record<string, unknown>)[entry.id] ?? entry.defaultValue;
    const candidates = [value, entry.defaultValue];
    if (entry.type === "number" && candidates.some((candidate) => typeof candidate !== "number" || !Number.isFinite(candidate) || typeof entry.min === "number" && candidate < entry.min || typeof entry.max === "number" && candidate > entry.max)) return false;
    if (entry.type === "boolean" && candidates.some((candidate) => typeof candidate !== "boolean")) return false;
    if ((entry.type === "color" || entry.type === "enum") && candidates.some((candidate) => typeof candidate !== "string")) return false;
    if (entry.type === "color" && candidates.some((candidate) => typeof candidate !== "string" || !/^#[0-9a-f]{6}$/i.test(candidate))) return false;
    if (entry.type === "enum") {
      if (!Array.isArray(entry.options)) return false;
      const options = entry.options as Array<Record<string, unknown>>;
      if (options.some((option) => !option || typeof option !== "object" || Object.keys(option).some((key) => !["value", "label"].includes(key)) || typeof option.value !== "string" || typeof option.label !== "string") || candidates.some((candidate) => !options.some((option) => option.value === candidate))) return false;
    }
  }
  if (Object.keys(values as Record<string, unknown>).some((key) => !parameterIds.has(key))) return false;
  for (const axis of ["width", "depth", "height"] as const) {
    const rule = (constraints as Record<string, unknown>)[axis];
    if (rule === undefined) continue;
    if (!rule || typeof rule !== "object") return false;
    const { min, max, step } = rule as Record<string, unknown>;
    if (Object.keys(rule as Record<string, unknown>).some((key) => !["min", "max", "step"].includes(key))) return false;
    if ([min, max, step].some((entry) => entry !== undefined && (typeof entry !== "number" || !Number.isFinite(entry) || entry <= 0))) return false;
    if (typeof min === "number" && typeof max === "number" && min > max) return false;
    if (typeof min === "number" && dimensions[axis] < min || typeof max === "number" && dimensions[axis] > max) return false;
  }
  return true;
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
          const scopeDirectories = ["user-generated", "builtin"].map((scope) => resolve(root, "lib", "bedroom", "assets", scope, assetId));
          const matches: string[] = [];
          for (const directory of scopeDirectories) await access(resolve(directory, "asset.json")).then(() => matches.push(directory), () => undefined);
          if (matches.length !== 1) return sendJson(response, matches.length ? 409 : 404, { error: matches.length ? "Asset id is ambiguous across scopes." : "Asset package was not found." });
          const assetDirectory = matches[0];
          const manifestPath = resolve(assetDirectory, "asset.json");
          if (dirname(manifestPath) !== assetDirectory) return sendJson(response, 400, { error: "Invalid asset path." });
          const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
          if (manifest.id !== assetId || !Array.isArray(manifest.qualityEvidence)) return sendJson(response, 409, { error: "Asset manifest does not match the requested id." });
          if (manifest.lifecyclePolicy !== "user-reviewed") return sendJson(response, 409, { error: "Only user-reviewed assets can be changed from the review UI." });
          const { modelSource, runtimeSource } = await readFurniturePackageContractSources(assetDirectory);
          const factoryHash = computeFurnitureAssetContractHash(modelSource, runtimeSource, manifest);
          if (body.factoryHash !== factoryHash) return sendJson(response, 409, { error: "Factory changed; reload before reviewing it." });

          const updated = { ...manifest, status };
          if (status === "approved") {
            const readiness = candidateReadinessIssues(manifest, factoryHash);
            if (manifest.status !== "candidate" || readiness.length) return sendJson(response, 409, { error: `Only a technically ready candidate can be approved: ${readiness.join("; ") || "asset is not a candidate"}` });
            updated.approvedFactoryHash = factoryHash;
            updated.reviewedAt = new Date().toISOString();
          } else if (status === "candidate") {
            const readiness = candidateReadinessIssues(manifest, factoryHash);
            if (readiness.length) return sendJson(response, 409, { error: `Asset is not candidate-ready: ${readiness.join("; ")}` });
            updated.approvedFactoryHash = null;
            updated.reviewedAt = null;
          } else if (status === "draft") {
            updated.approvedFactoryHash = null;
            updated.reviewedAt = null;
          }

          const temporaryPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
          await writeFile(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
          await rename(temporaryPath, manifestPath);
          await runNode(resolve(root, "scripts", "sync-furniture-assets.mjs"), root);
          sendJson(response, 200, { ok: true, status, factoryHash: updated.approvedFactoryHash ?? factoryHash });
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
