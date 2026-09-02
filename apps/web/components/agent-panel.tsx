"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Square, X } from "lucide-react";
import { createAgentRunRequestSchema, publicAgentEventSchema, terminalAgentRunStatuses, type AgentRunIntent, type AgentRunStatus, type PublicAgentEvent } from "@bedroom/contracts";
import { publicApiBaseUrl } from "@/lib/backend";

interface AgentPanelProps {
  open: boolean;
  onClose(): void;
  roomContext: { id: string; name: string; dimensions: { width: number; depth: number; height: number }; itemCount: number };
}

type TranscriptItem = { id: string; kind: "user" | "agent" | "status" | "error"; text: string };
type PendingRequest = { requestId: string; kind: "input" | "approval"; prompt: string };

export function AgentPanel({ open, onClose, roomContext }: AgentPanelProps) {
  const [intent, setIntent] = useState<AgentRunIntent>("layout-advice");
  const [message, setMessage] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentRunStatus | "idle">("idle");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [requestResponse, setRequestResponse] = useState("");
  const streamAbort = useRef<AbortController | null>(null);

  useEffect(() => () => streamAbort.current?.abort(), []);
  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || !publicApiBaseUrl || (status !== "idle" && !terminalAgentRunStatuses.has(status))) return;
    const contextualMessage = `${text}\n\n当前房间上下文：${roomContext.name}（${roomContext.dimensions.width} × ${roomContext.dimensions.depth} × ${roomContext.dimensions.height} mm），现有 ${roomContext.itemCount} 件家具。`;
    const request = createAgentRunRequestSchema.parse({ intent, message: contextualMessage, idempotencyKey: crypto.randomUUID() });
    setMessage(""); setStatus("queued"); setTranscript((items) => [...items, { id: crypto.randomUUID(), kind: "user", text }]);
    try {
      const response = await fetch(`${publicApiBaseUrl}/api/v1/agent-runs`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(request) });
      if (!response.ok) throw new Error(await apiError(response));
      const created = await response.json() as { runId: string; eventsUrl: string };
      setRunId(created.runId); streamAbort.current?.abort(); streamAbort.current = new AbortController();
      await consumeEventStream(created.eventsUrl, streamAbort.current.signal, (agentEvent) => applyEvent(agentEvent, setStatus, setTranscript, setPendingRequest));
    } catch (error) {
      if ((error as Error).name !== "AbortError") { setStatus("failed"); setTranscript((items) => [...items, { id: crypto.randomUUID(), kind: "error", text: error instanceof Error ? error.message : String(error) }]); }
    }
  };

  const cancel = async () => {
    if (!runId) return;
    streamAbort.current?.abort();
    await fetch(`${publicApiBaseUrl}/api/v1/agent-runs/${runId}/cancel`, { method: "POST" }).catch(() => undefined);
    setStatus("cancelled");
  };

  const resolvePending = async (decision?: "approved" | "rejected") => {
    if (!runId || !pendingRequest) return;
    const isInput = pendingRequest.kind === "input";
    const text = requestResponse.trim();
    if (isInput && !text) return;
    const endpoint = isInput
      ? `${publicApiBaseUrl}/api/v1/agent-runs/${runId}/messages`
      : `${publicApiBaseUrl}/api/v1/agent-runs/${runId}/approvals/${pendingRequest.requestId}`;
    const body = isInput
      ? { message: text, idempotencyKey: crypto.randomUUID() }
      : { decision, ...(text ? { message: text } : {}), idempotencyKey: crypto.randomUUID() };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await apiError(response));
      if (text) setTranscript((items) => [...items, { id: crypto.randomUUID(), kind: "user", text }]);
      setRequestResponse(""); setPendingRequest(null); setStatus("running");
    } catch (error) {
      setTranscript((items) => [...items, { id: crypto.randomUUID(), kind: "error", text: error instanceof Error ? error.message : String(error) }]);
    }
  };

  const busy = status !== "idle" && !terminalAgentRunStatuses.has(status);
  return <div className="agent-panel" role="dialog" aria-modal="false" aria-label="卧室 Agent">
    <div className="agent-panel-heading"><span><Bot size={18} /><strong>卧室 Agent</strong></span><button onClick={onClose} aria-label="关闭 Agent"><X size={16} /></button></div>
    {!publicApiBaseUrl && <div className="agent-offline"><strong>云端 Agent 尚未配置</strong><span>本地布局仍可正常使用；设置 PUBLIC_API_BASE_URL 后即可连接后端。</span></div>}
    <div className="agent-transcript" aria-live="polite">
      {!transcript.length && <p>描述你想分析的布局，或要创建、包装、修改的家具。任务进度和结果会在这里持续更新。</p>}
      {transcript.map((item) => <div key={item.id} className={`agent-line ${item.kind}`}>{item.text}</div>)}
      {pendingRequest && <div className="agent-request">
        <strong>{pendingRequest.kind === "approval" ? "需要批准" : "需要补充信息"}</strong>
        <span>{pendingRequest.prompt}</span>
        <textarea value={requestResponse} onChange={(event) => setRequestResponse(event.target.value)} placeholder={pendingRequest.kind === "approval" ? "可选：填写审批意见" : "填写回复"} rows={2} />
        <div>{pendingRequest.kind === "approval"
          ? <><button type="button" className="secondary" onClick={() => resolvePending("rejected")}>拒绝</button><button type="button" onClick={() => resolvePending("approved")}>批准</button></>
          : <button type="button" disabled={!requestResponse.trim()} onClick={() => resolvePending()}>提交回复</button>}
        </div>
      </div>}
    </div>
    <form onSubmit={submit} className="agent-composer">
      <select value={intent} onChange={(event) => setIntent(event.target.value as AgentRunIntent)} aria-label="Agent 任务类型" disabled={busy}>
        <option value="layout-advice">布局建议</option><option value="layout-analysis">布局检查</option><option value="furniture-create">创建家具</option><option value="furniture-package">包装家具</option><option value="furniture-revise">修改家具</option><option value="general-message">普通问答</option>
      </select>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="例如：检查床尾通道，并给出不移动衣柜的调整建议" rows={3} disabled={!publicApiBaseUrl || busy} />
      <div><span>{status === "idle" ? "就绪" : status}</span>{busy ? <button type="button" onClick={cancel}><Square size={13} /> 取消</button> : <button type="submit" disabled={!message.trim() || !publicApiBaseUrl}><Send size={14} /> 发送</button>}</div>
    </form>
  </div>;
}

async function consumeEventStream(url: string, signal: AbortSignal, onEvent: (event: PublicAgentEvent) => void) {
  let lastSequence = 0;
  while (!signal.aborted) {
    const response = await fetch(url, { headers: { accept: "text/event-stream", ...(lastSequence ? { "Last-Event-ID": String(lastSequence) } : {}) }, signal });
    if (!response.ok || !response.body) throw new Error(await apiError(response));
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader(); let buffer = "";
    while (!signal.aborted) {
      const { value, done } = await reader.read(); if (done) break; buffer += value;
      const chunks = buffer.split("\n\n"); buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const data = chunk.split("\n").filter((line) => line.startsWith("data:")) .map((line) => line.slice(5).trimStart()).join("\n");
        if (!data) continue; const event = publicAgentEventSchema.parse(JSON.parse(data));
        if (event.sequence <= lastSequence) continue; lastSequence = event.sequence; onEvent(event);
        if (event.type === "run.completed" || event.type === "run.failed") return;
      }
    }
    if (!signal.aborted) await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
}

function applyEvent(event: PublicAgentEvent, setStatus: React.Dispatch<React.SetStateAction<AgentRunStatus | "idle">>, setTranscript: React.Dispatch<React.SetStateAction<TranscriptItem[]>>, setPendingRequest: React.Dispatch<React.SetStateAction<PendingRequest | null>>) {
  if (event.type === "run.started") setStatus("running");
  else if (event.type === "run.progress") { setStatus(event.payload.status); appendStatus(event.payload.message, setTranscript); }
  else if (event.type === "agent.message.delta") setTranscript((items) => { const id = event.payload.messageId; const existing = items.findIndex((item) => item.id === id); if (existing < 0) return [...items, { id, kind: "agent", text: event.payload.delta }]; return items.map((item, index) => index === existing ? { ...item, text: item.text + event.payload.delta } : item); });
  else if (event.type === "validation.result") appendStatus(`${event.payload.passed ? "✓" : "✗"} ${event.payload.summary}`, setTranscript);
  else if (event.type === "run.completed") { setStatus("succeeded"); setPendingRequest(null); if (event.payload.summary) appendStatus(event.payload.summary, setTranscript); }
  else if (event.type === "run.failed") { setStatus("failed"); setPendingRequest(null); setTranscript((items) => [...items, { id: event.id, kind: "error", text: event.payload.summary }]); }
  else if (event.type === "approval.resolved") setPendingRequest(null);
  else if (event.type === "user_input.required" || event.type === "approval.required") {
    const kind = event.type === "user_input.required" ? "input" : "approval";
    setStatus(kind === "input" ? "awaiting_user" : "awaiting_approval");
    setPendingRequest({ requestId: event.payload.requestId, kind, prompt: event.payload.prompt });
  }
}

function appendStatus(text: string, setTranscript: React.Dispatch<React.SetStateAction<TranscriptItem[]>>) { setTranscript((items) => items.at(-1)?.kind === "status" && items.at(-1)?.text === text ? items : [...items, { id: crypto.randomUUID(), kind: "status", text }]); }
async function apiError(response: Response) { const value = await response.json().catch(() => null) as { error?: { message?: string } } | null; return value?.error?.message ?? `请求失败（${response.status}）`; }
