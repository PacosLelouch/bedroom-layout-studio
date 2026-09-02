import { spawn } from "node:child_process";

const nodeBinary = process.env.CODEX_MCP_NODE_PATH ?? process.execPath;
const bridgedVariables = [
  "BEDROOM_BUILD_NODE/p",
  "WEB_HOST",
  "WEB_PORT",
  "PUBLIC_API_BASE_URL",
  "PUBLIC_BASE_PATH",
  "SITES_BUILD_TIMEOUT",
  "SITES_BUILD_KILL_AFTER",
].filter((name) => name.split("/", 1)[0] in process.env || name.startsWith("BEDROOM_BUILD_NODE"));
const wslEnv = [process.env.WSLENV, ...bridgedVariables].filter(Boolean).join(":");
const child = spawn("bash", ["scripts/build-verified.sh", nodeBinary], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    BEDROOM_BUILD_NODE: nodeBinary,
    WSLENV: wslEnv,
  },
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
