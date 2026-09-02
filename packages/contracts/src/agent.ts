import { z } from "zod";

export const agentRunStatusSchema = z.enum([
  "queued",
  "preparing",
  "running",
  "awaiting_user",
  "awaiting_approval",
  "validating",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const terminalAgentRunStatuses = new Set<AgentRunStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

export const agentRunIntentSchema = z.enum([
  "layout-analysis",
  "layout-advice",
  "furniture-create",
  "furniture-package",
  "furniture-revise",
  "general-message",
]);

export type AgentRunIntent = z.infer<typeof agentRunIntentSchema>;

export const publicAgentEventTypeSchema = z.enum([
  "run.started",
  "run.progress",
  "agent.message.started",
  "agent.message.delta",
  "agent.message.completed",
  "agent.tool.started",
  "agent.tool.completed",
  "artifact.created",
  "artifact.preview",
  "validation.started",
  "validation.result",
  "user_input.required",
  "approval.required",
  "approval.resolved",
  "run.completed",
  "run.failed",
]);

export type PublicAgentEventType = z.infer<typeof publicAgentEventTypeSchema>;

const eventBaseSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  sequence: z.number().int().positive(),
  createdAt: z.string().datetime(),
}).strict();

const typedEvent = <T extends PublicAgentEventType>(
  type: T,
  payload: z.ZodTypeAny,
) => eventBaseSchema.extend({ type: z.literal(type), payload });

export const publicAgentEventSchema = z.discriminatedUnion("type", [
  typedEvent("run.started", z.object({ status: z.literal("running") }).strict()),
  typedEvent("run.progress", z.object({ status: agentRunStatusSchema, message: z.string().min(1), progress: z.number().min(0).max(1).optional() }).strict()),
  typedEvent("agent.message.started", z.object({ messageId: z.string().uuid(), role: z.literal("assistant") }).strict()),
  typedEvent("agent.message.delta", z.object({ messageId: z.string().uuid(), delta: z.string() }).strict()),
  typedEvent("agent.message.completed", z.object({ messageId: z.string().uuid(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), usage: z.object({ inputTokens: z.number().int().nonnegative(), cachedInputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict().optional(), finishReason: z.string().min(1) }).strict()),
  typedEvent("agent.tool.started", z.object({ toolCallId: z.string().uuid(), label: z.string().min(1) }).strict()),
  typedEvent("agent.tool.completed", z.object({ toolCallId: z.string().uuid(), label: z.string().min(1), outcome: z.enum(["succeeded", "failed", "cancelled"]) }).strict()),
  typedEvent("artifact.created", z.object({ artifactId: z.string().uuid(), kind: z.string().min(1), name: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()),
  typedEvent("artifact.preview", z.object({ artifactId: z.string().uuid(), mediaType: z.string().min(1), url: z.string().url() }).strict()),
  typedEvent("validation.started", z.object({ validationId: z.string().uuid(), label: z.string().min(1) }).strict()),
  typedEvent("validation.result", z.object({ validationId: z.string().uuid(), passed: z.boolean(), summary: z.string().min(1) }).strict()),
  typedEvent("user_input.required", z.object({ requestId: z.string().uuid(), prompt: z.string().min(1), expiresAt: z.string().datetime().nullable() }).strict()),
  typedEvent("approval.required", z.object({ requestId: z.string().uuid(), prompt: z.string().min(1), artifactIds: z.array(z.string().uuid()), expiresAt: z.string().datetime().nullable() }).strict()),
  typedEvent("approval.resolved", z.object({ requestId: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).strict()),
  typedEvent("run.completed", z.object({ resultRevisionId: z.string().uuid().nullable(), summary: z.string() }).strict()),
  typedEvent("run.failed", z.object({ code: z.string().min(1), summary: z.string().min(1), retryable: z.boolean() }).strict()),
]);

export type PublicAgentEvent = z.infer<typeof publicAgentEventSchema>;

export const createAgentRunRequestSchema = z.object({
  intent: agentRunIntentSchema,
  message: z.string().trim().min(1).max(50_000),
  conversationId: z.string().uuid().optional(),
  baseRevisionId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  layoutId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export type CreateAgentRunRequest = z.infer<typeof createAgentRunRequestSchema>;

export const postAgentMessageRequestSchema = z.object({
  message: z.string().trim().min(1).max(50_000),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const resolveAgentRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  message: z.string().trim().max(20_000).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export interface AgentRunDto {
  id: string;
  conversationId: string;
  intent: AgentRunIntent;
  status: AgentRunStatus;
  baseRevisionId: string | null;
  resultRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
  heartbeatAt: string | null;
  failureSummary: string | null;
}

export interface CreateAgentRunResponse {
  runId: string;
  conversationId: string;
  eventsUrl: string;
  reused: boolean;
}
