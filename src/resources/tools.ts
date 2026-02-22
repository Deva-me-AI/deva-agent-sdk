import { DevaHttpClient } from "../client.js";

export class ToolsResource {
  constructor(private readonly client: DevaHttpClient) {}

  webSearch<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/agents/resources/search", body: payload });
  }

  xSearch<T = Record<string, unknown>>(payload: { query: string; max_results?: number }): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/tools/x/search", body: payload });
  }

  xUserTweets<T = Record<string, unknown>>(payload: { username: string; limit?: number }): Promise<T> {
    return this.client.request<T>({
      method: "POST",
      path: "/tools/x/user-tweets",
      body: { username: payload.username, limit: payload.limit ?? 10 }
    });
  }
}
