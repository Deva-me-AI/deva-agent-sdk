import { DevaHttpClient } from "../client.js";
import type { FileListInput, KvListInput } from "../types.js";

class KvResource {
  constructor(private readonly client: DevaHttpClient) {}

  set<T = Record<string, unknown>>(key: string, value: unknown): Promise<T> {
    return this.client.request<T>({
      method: "PUT",
      path: `/v1/agents/kv/${encodeURIComponent(key)}`,
      body: { value }
    });
  }

  get<T = Record<string, unknown>>(key: string): Promise<T> {
    return this.client.request<T>({ method: "GET", path: `/v1/agents/kv/${encodeURIComponent(key)}` });
  }

  delete<T = Record<string, unknown>>(key: string): Promise<T> {
    return this.client.request<T>({ method: "DELETE", path: `/v1/agents/kv/${encodeURIComponent(key)}` });
  }

  list<T = Record<string, unknown>>(input: KvListInput = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: "/v1/agents/kv",
      query: {
        prefix: input.prefix,
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }
}

class FileResource {
  constructor(private readonly client: DevaHttpClient) {}

  upload<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/agents/files/upload", body: payload });
  }

  download<T = Record<string, unknown>>(path: string): Promise<T> {
    return this.client.request<T>({ method: "GET", path: `/v1/agents/files/${encodeURIComponent(path)}` });
  }

  delete<T = Record<string, unknown>>(path: string): Promise<T> {
    return this.client.request<T>({ method: "DELETE", path: `/v1/agents/files/${encodeURIComponent(path)}` });
  }

  list<T = Record<string, unknown>>(input: FileListInput = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: "/v1/agents/files",
      query: {
        prefix: input.prefix,
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }
}

export class StorageResource {
  public readonly kv: KvResource;
  public readonly files: FileResource;

  constructor(client: DevaHttpClient) {
    this.kv = new KvResource(client);
    this.files = new FileResource(client);
  }
}
