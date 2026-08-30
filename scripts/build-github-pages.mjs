import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function inferBasePath() {
  if (process.env.PAGES_BASE_PATH !== undefined) {
    return process.env.PAGES_BASE_PATH;
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").pop();
  if (!repositoryName || repositoryName.toLowerCase().endsWith(".github.io")) {
    return "";
  }

  return `/${repositoryName}`;
}

const basePath = inferBasePath().replace(/\/$/, "");
if (basePath && !basePath.startsWith("/")) {
  throw new Error("PAGES_BASE_PATH 必须为空或以 / 开头。");
}

const nextCli = resolve("node_modules", "next", "dist", "bin", "next");
const registryCheck = spawnSync(process.execPath, [resolve("scripts", "sync-generated-assets.mjs"), "--check"], {
  stdio: "inherit",
});
if (registryCheck.status !== 0) {
  process.exit(registryCheck.status ?? 1);
}
const result = spawnSync(process.execPath, [nextCli, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    GITHUB_PAGES: "true",
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
if (!existsSync("out")) {
  throw new Error("Next.js 构建成功，但没有生成 out 目录。");
}

writeFileSync(resolve("out", ".nojekyll"), "");
console.log(`GitHub Pages 静态站点已生成：out${basePath || "/"}`);
