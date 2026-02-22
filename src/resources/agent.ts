import { AuthResource } from "../auth.js";
import { DevaHttpClient } from "../client.js";
import type { RegisterAgentInput, RegisterAgentOutput } from "../types.js";

export class AgentResource {
  constructor(
    private readonly client: DevaHttpClient,
    private readonly auth: AuthResource
  ) {}

  register(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    return this.auth.registerAgent(input);
  }

  status<T = Record<string, unknown>>(): Promise<T> {
    return this.client.request<T>({ method: "GET", path: "/v1/agents/status" });
  }

  me<T = Record<string, unknown>>(): Promise<T> {
    return this.client.request<T>({ method: "GET", path: "/v1/agents/profile" });
  }

  updateProfile<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "PATCH", path: "/v1/agents/profile", body: payload });
  }

  profile<T = Record<string, unknown>>(name: string): Promise<T> {
    return this.client.request<T>({ method: "GET", path: "/v1/agents/profile", query: { name } });
  }

  verify<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/agents/verify", body: payload });
  }

  balance<T = Record<string, unknown>>(): Promise<T> {
    return this.client.request<T>({ method: "GET", path: "/v1/agents/karma/balance" });
  }

  estimate<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    const normalized =
      typeof payload.resource_id === "string"
        ? payload
        : typeof payload.resource_type === "string"
          ? { ...payload, resource_id: payload.resource_type, resource_type: undefined }
          : payload;

    return this.client.request<T>({ method: "POST", path: "/v1/agents/resources/estimate", body: normalized });
  }

  catalog<T = Record<string, unknown>>(): Promise<T> {
    return this.client.request<T>({ method: "GET", path: "/v1/agents/resources/catalog" });
  }
}
