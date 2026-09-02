import { spawn } from "node:child_process";
import path from "node:path";

const required = ["DATABASE_URL", "AGENT_WORKER_TOKEN", "AGENT_WORKSPACE_ROOT", "AGENT_REPOSITORY_ROOT"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`dev:all requires ${missing.join(", ")}. Copy .env.example, load the values into the process environment, and retry.`);
  process.exit(64);
}
if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error(`Node.js 22 or newer is required; found ${process.version}.`);
  process.exit(69);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const storageRoot = process.env.STORAGE_ROOT ?? path.resolve(".local", "storage");
const common = { ...process.env, STORAGE_ROOT: storageRoot, API_REPOSITORY_DRIVER: process.env.API_REPOSITORY_DRIVER ?? "postgres", AGENT_QUEUE_DRIVER: process.env.AGENT_QUEUE_DRIVER ?? "pg-boss" };
const commands = ["dev:web", "dev:api", "dev:worker"];
const children = commands.map((script) => spawn(npm, ["run", script], { cwd: process.cwd(), env: common, stdio: "inherit", windowsHide: true }));

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
};
for (const child of children) {
  child.once("error", (error) => { console.error(error); process.exitCode = 1; stop(); });
  child.once("exit", (code) => { if (!stopping && code !== 0) { process.exitCode = code ?? 1; stop(); } });
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
