import assert from "node:assert/strict";
import test from "node:test";
import { BedroomApiClient, BedroomApiError, decodeSseEvent } from "../src/index.js";

test("adds bearer authentication and preserves idempotency payloads", async () => {
  let observed: Request | null = null;
  const client = new BedroomApiClient({
    baseUrl: "https://api.example.test/",
    getAccessToken: async () => "token",
    fetch: async (input, init) => {
      observed = new Request(input, init);
      return Response.json({ runId: "run", conversationId: "conversation", eventsUrl: "/events", reused: false }, { status: 202 });
    },
  });
  await client.createAgentRun({ intent: "general-message", message: "hello", idempotencyKey: "request-123" });
  assert.equal(observed?.headers.get("authorization"), "Bearer token");
  assert.match(await observed?.text() ?? "", /request-123/);
});

test("turns API errors into stable client errors", async () => {
  const client = new BedroomApiClient({
    baseUrl: "https://api.example.test",
    fetch: async () => Response.json({ error: { code: "conflict", message: "stale revision", requestId: "req" } }, { status: 409 }),
  });
  await assert.rejects(() => client.listLayouts(), (error: unknown) => error instanceof BedroomApiError && error.code === "conflict");
});

test("validates public SSE envelopes before exposing them to the UI", () => {
  const event = decodeSseEvent(JSON.stringify({
    id: "0d3f25d8-f928-4dde-b114-4fc2a44cbdfa",
    runId: "78ad4564-b5c6-4f62-856d-a40398da42f7",
    sequence: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    type: "run.started",
    payload: { status: "running" },
  }));
  assert.equal(event.sequence, 1);
});
