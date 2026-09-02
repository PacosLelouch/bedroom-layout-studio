import { createHash, randomUUID } from "node:crypto";
import type { WorkerConfig } from "./config.js";
import { CodexAppServerClient } from "./app-server-client.js";
import { ControlPlaneClient, type WorkerIdentity } from "./control-plane-client.js";
import type { RunWorkspace } from "./workspace.js";

export interface AgentQueueJob {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  message?: string;
  kind: "start" | "message" | "cancel" | "approval";
  requestId?: string;
  decision?: "approved" | "rejected";
}

export class AgentJobProcessor {
  constructor(private readonly config: WorkerConfig, private readonly controlPlane: ControlPlaneClient) {}

  async process(job: AgentQueueJob, workspace: RunWorkspace) {
    const identity: WorkerIdentity = { tenantId: job.tenantId, workspaceId: job.workspaceId, userId: job.userId };
    if (job.kind === "cancel") return;
    if (job.kind === "approval") {
      await this.controlPlane.update(job.runId, identity, { status: "running", event: { type: "approval.resolved", payload: { requestId: job.requestId, decision: job.decision } } });
      return;
    }
    if (this.config.executionMode === "mock") return this.#mock(job, identity);
    return this.#appServer(job, identity, workspace);
  }

  async #mock(job: AgentQueueJob, identity: WorkerIdentity) {
    const messageId = randomUUID(); const content = `Mock Agent received: ${job.message ?? ""}`;
    await this.controlPlane.update(job.runId, identity, { status: "running", event: { type: "run.started", payload: { status: "running" } } });
    await this.controlPlane.update(job.runId, identity, { event: { type: "agent.message.started", payload: { messageId, role: "assistant" } } });
    await this.controlPlane.update(job.runId, identity, { event: { type: "agent.message.delta", payload: { messageId, delta: content } } });
    await this.controlPlane.update(job.runId, identity, { event: { type: "agent.message.completed", payload: { messageId, contentHash: createHash("sha256").update(content).digest("hex"), finishReason: "stop" } } });
    await this.controlPlane.update(job.runId, identity, { status: "succeeded", event: { type: "run.completed", payload: { resultRevisionId: null, summary: content } } });
  }

  async #appServer(job: AgentQueueJob, identity: WorkerIdentity, workspace: RunWorkspace) {
    const client = new CodexAppServerClient(this.config.codexBinary, workspace.repo);
    const messageId = randomUUID(); let fullText = ""; let completed = false;
    let eventWrites = Promise.resolve();
    let resolveTurn!: () => void;
    const turnCompleted = new Promise<void>((resolve) => { resolveTurn = resolve; });
    await this.controlPlane.update(job.runId, identity, { status: "preparing", event: { type: "run.progress", payload: { status: "preparing", message: "Preparing isolated Agent workspace." } } });
    client.on("notification", (method: string, params: Record<string, unknown>) => {
      if (method === "item/agentMessage/delta") {
        const delta = typeof params.delta === "string" ? params.delta : ""; fullText += delta;
        eventWrites = eventWrites.then(() => this.controlPlane.update(job.runId, identity, { event: { type: "agent.message.delta", payload: { messageId, delta } } }));
      }
      if (method === "turn/completed" && !completed) {
        completed = true;
        eventWrites = eventWrites.then(() => this.controlPlane.update(job.runId, identity, { event: { type: "agent.message.completed", payload: { messageId, contentHash: createHash("sha256").update(fullText).digest("hex"), finishReason: "stop" } } }));
        resolveTurn();
      }
    });
    try {
      await client.initialize(); const threadId = await client.startThread(workspace.repo, this.config.codexModel);
      await this.controlPlane.update(job.runId, identity, { status: "running", event: { type: "run.started", payload: { status: "running" } } });
      await this.controlPlane.update(job.runId, identity, { event: { type: "agent.message.started", payload: { messageId, role: "assistant" } } });
      await client.startTurn(threadId, job.message ?? "");
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        turnCompleted,
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Agent task timed out.")), this.config.taskTimeoutMs); }),
      ]).finally(() => { if (timeout) clearTimeout(timeout); });
      await eventWrites;
      await this.controlPlane.update(job.runId, identity, { status: "succeeded", event: { type: "run.completed", payload: { resultRevisionId: null, summary: fullText } } });
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      await this.controlPlane.update(job.runId, identity, { status: "failed", failureSummary: summary, event: { type: "run.failed", payload: { code: "agent_failed", summary, retryable: false } } });
      throw error;
    } finally { await client.close(); }
  }
}
