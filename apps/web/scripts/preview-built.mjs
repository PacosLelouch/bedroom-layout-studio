import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const clientRoot = path.resolve(root, "dist", "client");
const port = Number(process.env.WEB_PORT ?? process.env.PORT ?? process.argv[2] ?? 5555);
const host = process.env.WEB_HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("WEB_PORT/PORT/port argument must be an integer between 1 and 65535.");
}
const worker = (await import(pathToFileURL(path.resolve(root, "dist", "server", "index.js")).href)).default;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

async function assetResponse(url) {
  const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "");
  const filePath = path.resolve(clientRoot, pathname);
  if (filePath !== clientRoot && !filePath.startsWith(`${clientRoot}${path.sep}`)) return new Response("Forbidden", { status: 403 });
  try {
    await access(filePath);
    if (!(await stat(filePath)).isFile()) return new Response("Not found", { status: 404 });
    return new Response(Readable.toWeb(createReadStream(filePath)), {
      headers: { "content-type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

const server = createServer(async (request, response) => {
  const origin = `http://${request.headers.host ?? `localhost:${port}`}`;
  const url = new URL(request.url ?? "/", origin);
  let result = request.method === "GET" || request.method === "HEAD" ? await assetResponse(url) : new Response("Not found", { status: 404 });
  if (result.status === 404) {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : Readable.toWeb(request);
    const webRequest = new Request(url, { method: request.method, headers: request.headers, body, duplex: body ? "half" : undefined });
    result = await worker.fetch(webRequest, { ASSETS: { fetch: assetResponse } }, { waitUntil() {}, passThroughOnException() {} });
  }
  response.writeHead(result.status, Object.fromEntries(result.headers));
  if (request.method === "HEAD" || !result.body) return response.end();
  Readable.fromWeb(result.body).pipe(response);
});

server.listen(port, host, () => console.log(`Built preview running at http://${host}:${port}`));
