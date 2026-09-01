import { spawn } from "node:child_process";
import path from "node:path";

const forwardedArgs = process.argv.slice(2);
const hasPortArgument = forwardedArgs.some(
  (argument) => argument === "-p" || argument === "--port" || argument.startsWith("--port="),
);

if (!hasPortArgument) {
  const defaultPort = process.env.WEB_PORT ?? process.env.PORT ?? "5555";
  forwardedArgs.unshift("--port", defaultPort);
}

const cliPath = path.resolve("node_modules", "vinext", "dist", "cli.js");
const child = spawn(process.execPath, [cliPath, "start", ...forwardedArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? ".wrangler/wrangler.log",
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
