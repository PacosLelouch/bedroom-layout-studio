import { PgBoss } from "pg-boss";

export interface AgentJob {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  message?: string;
  kind: "start" | "message" | "cancel" | "approval";
  requestId?: string;
  decision?: "approved" | "rejected";
}

export interface AgentJobPublisher {
  publish(job: AgentJob): Promise<void>;
  close(): Promise<void>;
}

export class MemoryAgentJobPublisher implements AgentJobPublisher {
  readonly jobs: AgentJob[] = [];
  async publish(job: AgentJob) { this.jobs.push(job); }
  async close() {}
}

export class PgBossAgentJobPublisher implements AgentJobPublisher {
  readonly #boss: PgBoss;
  constructor(databaseUrl: string) { this.#boss = new PgBoss(databaseUrl); }
  async start() { await this.#boss.start(); await this.#boss.createQueue("bedroom-agent-runs"); return this; }
  async publish(job: AgentJob) { await this.#boss.send("bedroom-agent-runs", job, { retryLimit: 3, retryDelay: 30, expireInSeconds: 7_200 }); }
  async close() { await this.#boss.stop({ graceful: true, timeout: 30_000 }); }
}
