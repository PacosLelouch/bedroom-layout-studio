import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import readline from "node:readline";

interface RpcResponse { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string }; method?: string; params?: Record<string, unknown> }

export class CodexAppServerClient extends EventEmitter {
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  #requestId = 0;

  constructor(binary: string, cwd: string) {
    super();
    this.#process = spawn(binary, ["app-server", "--listen", "stdio://"], { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    readline.createInterface({ input: this.#process.stdout }).on("line", (line) => this.#onLine(line));
    this.#process.stderr.on("data", (chunk) => this.emit("stderr", chunk.toString()));
    this.#process.once("exit", (code, signal) => {
      const error = new Error(`Codex app-server exited (${code ?? signal ?? "unknown"}).`);
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear(); this.emit("exit", error);
    });
  }

  async initialize() {
    await this.request("initialize", { clientInfo: { name: "bedroom_layout_studio", title: "Bedroom Layout Studio Agent Worker", version: "0.2.0" } });
    this.notify("initialized", {});
  }

  async startThread(cwd: string, model?: string) {
    const response = await this.request("thread/start", { cwd, approvalPolicy: "never", sandbox: "workspaceWrite", ...(model ? { model } : {}) });
    const thread = response.thread as { id?: string } | undefined;
    if (!thread?.id) throw new Error("Codex app-server did not return a thread ID.");
    return thread.id;
  }

  async startTurn(threadId: string, text: string) {
    const response = await this.request("turn/start", { threadId, input: [{ type: "text", text }] });
    return response.turn as { id?: string } | undefined;
  }

  interrupt(threadId: string, turnId: string) { return this.request("turn/interrupt", { threadId, turnId }); }
  async close() { this.#process.stdin.end(); this.#process.kill("SIGTERM"); }

  request(method: string, params: Record<string, unknown>) {
    const id = ++this.#requestId;
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => this.#pending.set(id, { resolve, reject }));
    this.#write({ method, id, params }); return promise;
  }

  notify(method: string, params: Record<string, unknown>) { this.#write({ method, params }); }
  #write(value: unknown) { this.#process.stdin.write(`${JSON.stringify(value)}\n`); }
  #onLine(line: string) {
    let message: RpcResponse;
    try { message = JSON.parse(line) as RpcResponse; } catch { this.emit("protocol-error", new Error("Codex app-server emitted invalid JSONL.")); return; }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id); if (!pending) return; this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`)); else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method) this.emit("notification", message.method, message.params ?? {});
  }
}
