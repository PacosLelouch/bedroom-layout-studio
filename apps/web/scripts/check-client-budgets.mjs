import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const clientRoot = path.join(root, "dist", "client");
const manifest = JSON.parse(await readFile(path.join(clientRoot, ".vite", "manifest.json"), "utf8"));
const main = manifest["app/page.tsx"];
if (!main) throw new Error("缺少 app/page.tsx 客户端构建清单。");

const byFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]));
const staticFiles = new Set();
function collect(entry) {
  if (!entry || staticFiles.has(entry.file)) return;
  staticFiles.add(entry.file);
  for (const key of entry.imports ?? []) collect(manifest[key] ?? byFile.get(key));
}
collect(main);
const gzipBytes = (await Promise.all([...staticFiles].map(async (file) => gzipSync(await readFile(path.join(clientRoot, file))).byteLength))).reduce((sum, size) => sum + size, 0);
const cssFiles = (await readdir(path.join(clientRoot, "assets"))).filter((file) => file.endsWith(".css"));
const cssGzip = (await Promise.all(cssFiles.map(async (file) => gzipSync(await readFile(path.join(clientRoot, "assets", file))).byteLength))).reduce((sum, size) => sum + size, 0);
for (const forbidden of ["GLTFExporter", "GLTFLoader", "createSourceModel", "createFurnitureModel"]) {
  if ([...staticFiles].some((file) => file.includes(forbidden))) throw new Error(`首页静态依赖意外包含 ${forbidden}`);
}
if (gzipBytes > 160 * 1024) throw new Error(`3D 加载前首页 JS Gzip ${Math.round(gzipBytes / 1024)}KB，超过 160KB 预算。`);
if (cssGzip > 30 * 1024) throw new Error(`CSS Gzip ${Math.round(cssGzip / 1024)}KB，超过 30KB 预算。`);
if (!(main.dynamicImports ?? []).includes("components/bedroom-viewport.tsx")) throw new Error("BedroomViewport 不是动态依赖。");
if (!(main.dynamicImports ?? []).includes("lib/bedroom/export/glb-export.ts")) throw new Error("GLB 导出不是操作级动态依赖。");
console.log(`客户端预算通过：首页静态 JS ${Math.round(gzipBytes / 1024)}KB Gzip，CSS ${Math.round(cssGzip / 1024)}KB Gzip。`);
