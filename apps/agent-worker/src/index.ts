import { PgBoss } from "pg-boss";
import { loadWorkerConfig } from "./config.js";
import { ControlPlaneClient } from "./control-plane-client.js";
import { AgentJobProcessor, type AgentQueueJob } from "./processor.js";
import { WorkspaceManager } from "./workspace.js";

const config = loadWorkerConfig();
const boss = new PgBoss(config.databaseUrl);
const workspaces = new WorkspaceManager(config.workspaceRoot);
const processor = new AgentJobProcessor(config, new ControlPlaneClient(config.apiBaseUrl, config.workerToken));
await boss.start();
await boss.createQueue("bedroom-agent-runs");
await boss.work<AgentQueueJob>("bedroom-agent-runs", { batchSize: 1, pollingIntervalSeconds: 1, localConcurrency: config.concurrency }, async ([job]) => {
  const workspace = await workspaces.create(job.data.tenantId, job.data.runId);
  try {
    if (config.executionMode === "app-server") await workspaces.prepareWorktree(workspace, config.repositoryRoot, config.repositoryRevision);
    await processor.process(job.data, workspace);
    await workspaces.remove(workspace, config.executionMode === "app-server" ? config.repositoryRoot : undefined);
  } catch (error) {
    console.error(error);
    throw error;
  }
});

const shutdown = async () => { await boss.stop({ graceful: true, timeout: 30_000 }); process.exit(0); };
process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
