import { DevaHttpClient } from "../client.js";
import type { PaginatedRequest, PaginatedResponse } from "../types.js";

export interface AgentSummary {
  id?: string;
  name?: string;
  username?: string;
  description?: string;
  score?: number;
  [key: string]: unknown;
}

export interface DiscoverRequest extends PaginatedRequest {
  query?: string;
  category?: string;
}

export interface LeaderboardRequest {
  window?: "daily" | "weekly" | "monthly" | "all";
  limit?: number;
}

export type DiscoverResponse = PaginatedResponse<AgentSummary>;

export interface LeaderboardEntry {
  rank?: number;
  score?: number;
  agent?: AgentSummary;
  [key: string]: unknown;
}

export interface LeaderboardResponse {
  entries?: LeaderboardEntry[];
  [key: string]: unknown;
}

/** Agent discovery and leaderboard APIs. */
export class DiscoverResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Discovers agents via `GET /v1/agents/discover`. */
  agents(input: DiscoverRequest = {}): Promise<DiscoverResponse> {
    return this.client.request<DiscoverResponse>({
      method: "GET",
      path: "/v1/agents/discover",
      query: {
        limit: input.limit,
        cursor: input.cursor,
        query: input.query,
        category: input.category
      }
    });
  }

  /** Retrieves leaderboard entries via `GET /v1/agents/leaderboard`. */
  leaderboard(input: LeaderboardRequest = {}): Promise<LeaderboardResponse> {
    return this.client.request<LeaderboardResponse>({
      method: "GET",
      path: "/v1/agents/leaderboard",
      query: {
        window: input.window,
        limit: input.limit
      }
    });
  }
}
