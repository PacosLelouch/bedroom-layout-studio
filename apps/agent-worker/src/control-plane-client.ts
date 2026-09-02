import type { AgentRunStatus, PublicAgentEventType } from "@bedroom/contracts";

export interface WorkerIdentity { userId: string; tenantId: string; workspaceId: string; subject?: string }

export class ControlPlaneClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetchImpl = globalThis.fetch) {}

  async update(runId: string, identity: WorkerIdentity, update: {
    status?: AgentRunStatus;
    resultRevisionId?: string | null;
    failureSummary?: string | null;
    event?: { type: PublicAgentEventType; payload: unknown };
  }) {
    const response = await this.fetchImpl(`${this.baseUrl}/internal/v1/agent-runs/${encodeURIComponent(runId)}/updates`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ identity: { ...identity, subject: identity.subject ?? "agent-worker" }, ...update }),
    });
    if (!response.ok) throw new Error(`Control plane update failed with ${response.status}: ${await response.text()}`);
    return response.json();
  }
}
