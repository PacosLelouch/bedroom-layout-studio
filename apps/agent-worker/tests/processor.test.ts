import assert from "node:assert/strict";
import test from "node:test";
import type { WorkerConfig } from "../src/config.js";
import type { ControlPlaneClient } from "../src/control-plane-client.js";
import { AgentJobProcessor } from "../src/processor.js";

test("maps a mock job to the public Agent event sequence", async () => {
  const updates: Array<{ status?: string; event?: { type: string; payload: unknown } }> = [];
  const controlPlane = { update: async (_runId: string, _identity: unknown, update: typeof updates[number]) => { updates.push(update); return {}; } } as unknown as ControlPlaneClient;
  const config = { executionMode: "mock" } as WorkerConfig;
  const processor = new AgentJobProcessor(config, controlPlane);
  await processor.process({ kind: "start", runId: "00000000-0000-4000-8000-000000000004", tenantId: "00000000-0000-4000-8000-000000000002", workspaceId: "00000000-0000-4000-8000-000000000003", userId: "00000000-0000-4000-8000-000000000001", message: "hello" }, { root: "unused", repo: "unused", input: "unused", output: "unused", temp: "unused", logs: "unused" });
  assert.deepEqual(updates.map((entry) => entry.event?.type), ["run.started", "agent.message.started", "agent.message.delta", "agent.message.completed", "run.completed"]);
  assert.equal(updates.at(-1)?.status, "succeeded");
});
