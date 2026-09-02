import path from "node:path";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  API_INTERNAL_BASE_URL: z.string().url().default("http://127.0.0.1:3333"),
  AGENT_WORKER_TOKEN: z.string().min(32),
  AGENT_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  AGENT_EXECUTION_MODE: z.enum(["mock", "app-server"]).default("mock"),
  AGENT_WORKSPACE_ROOT: z.string().min(1),
  AGENT_REPOSITORY_ROOT: z.string().min(1),
  AGENT_REPOSITORY_REVISION: z.string().min(1).default("HEAD"),
  CODEX_BINARY: z.string().min(1).default("codex"),
  CODEX_MODEL: z.string().min(1).optional(),
  AGENT_TASK_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(7_200_000).default(3_600_000),
  ALLOW_UNTRUSTED_SOURCE: z.literal("false").default("false"),
});

export function loadWorkerConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = schema.parse(source);
  return {
    databaseUrl: env.DATABASE_URL,
    apiBaseUrl: env.API_INTERNAL_BASE_URL.replace(/\/$/, ""),
    workerToken: env.AGENT_WORKER_TOKEN,
    concurrency: env.AGENT_WORKER_CONCURRENCY,
    executionMode: env.AGENT_EXECUTION_MODE,
    workspaceRoot: path.resolve(env.AGENT_WORKSPACE_ROOT),
    repositoryRoot: path.resolve(env.AGENT_REPOSITORY_ROOT),
    repositoryRevision: env.AGENT_REPOSITORY_REVISION,
    codexBinary: env.CODEX_BINARY,
    codexModel: env.CODEX_MODEL,
    taskTimeoutMs: env.AGENT_TASK_TIMEOUT_MS,
  } as const;
}

export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;
