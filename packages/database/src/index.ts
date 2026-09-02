import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type BedroomDatabase = ReturnType<typeof drizzle<typeof schema>>;

export function createBedroomDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

export * as databaseSchema from "./schema.js";
