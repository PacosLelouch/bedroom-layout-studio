import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
  PUBLIC_API_BASE_URL: z.string().url().default("http://127.0.0.1:3333"),
  CORS_ALLOWED_ORIGINS: z.string().default("http://127.0.0.1:5555"),
  AUTH_MODE: z.enum(["development", "oidc"]).default("development"),
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().min(1).optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),
  API_REPOSITORY_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  AGENT_QUEUE_DRIVER: z.enum(["memory", "pg-boss"]).default("memory"),
  AGENT_WORKER_TOKEN: z.string().min(32).optional(),
  STORAGE_DRIVER: z.enum(["filesystem", "s3"]).default("filesystem"),
  STORAGE_ROOT: z.string().optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  MAX_JSON_BODY_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
}).superRefine((env, context) => {
  if (env.AUTH_MODE === "oidc" && (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URL)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL are required in oidc mode." });
  }
  if ((env.API_REPOSITORY_DRIVER === "postgres" || env.AGENT_QUEUE_DRIVER === "pg-boss") && !env.DATABASE_URL) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "DATABASE_URL is required for PostgreSQL repository or pg-boss." });
  }
  if (env.AUTH_MODE === "oidc" && env.API_REPOSITORY_DRIVER !== "postgres") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "OIDC mode requires the PostgreSQL identity mapping repository." });
  }
  if (env.STORAGE_DRIVER === "filesystem" && !env.STORAGE_ROOT) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "STORAGE_ROOT is required for filesystem storage." });
  }
  if (env.STORAGE_DRIVER === "s3" && (!env.S3_BUCKET || !env.S3_REGION)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "S3_BUCKET and S3_REGION are required for S3 storage." });
  }
});

export type ApiConfig = ReturnType<typeof loadApiConfig>;

export function loadApiConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = envSchema.parse(source);
  return {
    environment: env.NODE_ENV,
    host: env.API_HOST,
    port: env.API_PORT,
    publicBaseUrl: env.PUBLIC_API_BASE_URL.replace(/\/$/, ""),
    corsOrigins: env.CORS_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean),
    auth: { mode: env.AUTH_MODE, issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, jwksUrl: env.OIDC_JWKS_URL },
    databaseUrl: env.DATABASE_URL,
    repositoryDriver: env.API_REPOSITORY_DRIVER,
    queueDriver: env.AGENT_QUEUE_DRIVER,
    workerToken: env.AGENT_WORKER_TOKEN,
    storage: {
      driver: env.STORAGE_DRIVER,
      root: env.STORAGE_ROOT ? path.resolve(env.STORAGE_ROOT) : undefined,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    },
    maxJsonBodyBytes: env.MAX_JSON_BODY_BYTES,
  } as const;
}
