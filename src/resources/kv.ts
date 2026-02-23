import { DevaHttpClient } from "../client.js";

export interface KvGetResponse<TValue = unknown> {
  key?: string;
  value?: TValue;
  exists?: boolean;
  [key: string]: unknown;
}

export interface KvSetRequest<TValue = unknown> {
  value: TValue;
}

export interface KvMutationResponse {
  success?: boolean;
  [key: string]: unknown;
}

/** Agent-scoped key-value storage operations. */
export class KvResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Stores a value at `key` via `PUT /v1/agents/kv/{key}`. */
  set<TValue = unknown>(key: string, payload: KvSetRequest<TValue>): Promise<KvMutationResponse> {
    return this.client.request<KvMutationResponse>({
      method: "PUT",
      path: `/v1/agents/kv/${encodeURIComponent(key)}`,
      body: payload
    });
  }

  /** Reads a value from `key` via `GET /v1/agents/kv/{key}`. */
  get<TValue = unknown>(key: string): Promise<KvGetResponse<TValue>> {
    return this.client.request<KvGetResponse<TValue>>({
      method: "GET",
      path: `/v1/agents/kv/${encodeURIComponent(key)}`
    });
  }

  /** Deletes a value at `key` via `DELETE /v1/agents/kv/{key}`. */
  delete(key: string): Promise<KvMutationResponse> {
    return this.client.request<KvMutationResponse>({
      method: "DELETE",
      path: `/v1/agents/kv/${encodeURIComponent(key)}`
    });
  }
}
