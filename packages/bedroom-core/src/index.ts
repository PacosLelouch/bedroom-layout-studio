import type {
  AgentRunDto,
  CreateAgentRunRequest,
  CreateAgentRunResponse,
  LayoutSnapshot,
  PublicAgentEvent,
  PublishedFurnitureCatalogEntry,
} from "@bedroom/contracts";
import { publicAgentEventSchema } from "@bedroom/contracts";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

export class BedroomApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "BedroomApiError";
  }
}

export class BedroomApiClient {
  readonly #baseUrl: string;
  readonly #getAccessToken?: () => Promise<string | null>;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: ApiClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#getAccessToken = options.getAccessToken;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.#getAccessToken?.();
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const error = payload?.error as Record<string, unknown> | undefined;
      throw new BedroomApiError(
        response.status,
        typeof error?.code === "string" ? error.code : "http_error",
        typeof error?.message === "string" ? error.message : `Request failed with ${response.status}`,
        typeof error?.requestId === "string" ? error.requestId : undefined,
      );
    }
    return payload as T;
  }

  createAgentRun(request: CreateAgentRunRequest): Promise<CreateAgentRunResponse> {
    return this.#request("/api/v1/agent-runs", { method: "POST", body: JSON.stringify(request) });
  }

  getAgentRun(runId: string): Promise<AgentRunDto> {
    return this.#request(`/api/v1/agent-runs/${encodeURIComponent(runId)}`);
  }

  listLayouts(): Promise<Array<{ id: string; name: string; currentVersionId: string }>> {
    return this.#request("/api/v1/layouts");
  }

  listFurnitureCatalog(): Promise<PublishedFurnitureCatalogEntry[]> {
    return this.#request("/api/v1/furniture-catalog");
  }

  createLayout(name: string, snapshot: LayoutSnapshot, idempotencyKey: string) {
    return this.#request<{ id: string; currentVersionId: string }>("/api/v1/layouts", {
      method: "POST",
      body: JSON.stringify({ name, snapshot, idempotencyKey }),
    });
  }
}

export function decodeSseEvent(data: string): PublicAgentEvent {
  return publicAgentEventSchema.parse(JSON.parse(data));
}

export type LayoutRepository = {
  list(): Promise<Array<{ id: string; name: string; currentVersionId: string }>>;
  create(name: string, snapshot: LayoutSnapshot, idempotencyKey: string): Promise<{ id: string; currentVersionId: string }>;
};

export class RemoteLayoutRepository implements LayoutRepository {
  constructor(private readonly client: BedroomApiClient) {}
  list() { return this.client.listLayouts(); }
  create(name: string, snapshot: LayoutSnapshot, idempotencyKey: string) {
    return this.client.createLayout(name, snapshot, idempotencyKey);
  }
}
