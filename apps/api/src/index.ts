import { FilesystemObjectStorage, S3Client, S3ObjectStorage } from "@bedroom/storage";
import { createBedroomDatabase } from "@bedroom/database";
import { loadApiConfig } from "./config.js";
import { MemoryAgentJobPublisher, PgBossAgentJobPublisher } from "./queue.js";
import { MemoryControlPlaneRepository } from "./repository.js";
import { createPostgresIdentityMapper, ensureDevelopmentIdentity, PostgresControlPlaneRepository } from "./postgres-repository.js";
import { createApiServer } from "./server.js";

const config = loadApiConfig();
const database = config.repositoryDriver === "postgres" ? createBedroomDatabase(config.databaseUrl!) : null;
if (database && config.auth.mode === "development") await ensureDevelopmentIdentity(database.db);
const repository = database ? new PostgresControlPlaneRepository(database.db) : new MemoryControlPlaneRepository();
const storage = config.storage.driver === "filesystem"
  ? new FilesystemObjectStorage(config.storage.root!)
  : new S3ObjectStorage({
      client: new S3Client({ region: config.storage.region!, endpoint: config.storage.endpoint, forcePathStyle: config.storage.forcePathStyle }),
      bucket: config.storage.bucket!,
    });
const publisher = config.queueDriver === "pg-boss"
  ? await new PgBossAgentJobPublisher(config.databaseUrl!).start()
  : new MemoryAgentJobPublisher();
const identityMapper = database ? createPostgresIdentityMapper(database.db) : undefined;
const app = await createApiServer({ config, repository, storage, publisher, identityMapper });
if (database) app.addHook("onClose", database.close);
await app.listen({ host: config.host, port: config.port });
