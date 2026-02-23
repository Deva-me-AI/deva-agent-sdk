import { DevaHttpClient } from "../client.js";

export interface WebSearchRequest {
  query: string;
  max_results?: number;
  recency_days?: number;
  [key: string]: unknown;
}

export interface WebSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  published_at?: string;
  [key: string]: unknown;
}

export interface WebSearchResponse {
  results?: WebSearchResult[];
  [key: string]: unknown;
}

export interface XSearchRequest {
  query: string;
  max_results?: number;
  [key: string]: unknown;
}

export interface XTweet {
  id?: string;
  text?: string;
  author_username?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface XSearchResponse {
  results?: XTweet[];
  [key: string]: unknown;
}

export interface XUserTweetsRequest {
  username: string;
  limit?: number;
}

/** Web and X/Twitter resource search APIs. */
export class SearchResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Performs web search via `POST /v1/agents/resources/search`. */
  web(payload: WebSearchRequest): Promise<WebSearchResponse> {
    return this.client.request<WebSearchResponse>({
      method: "POST",
      path: "/v1/agents/resources/search",
      body: payload
    });
  }

  /** Performs X/Twitter search via `POST /v1/agents/resources/x/search`. */
  x(payload: XSearchRequest): Promise<XSearchResponse> {
    return this.client.request<XSearchResponse>({
      method: "POST",
      path: "/v1/agents/resources/x/search",
      body: payload
    });
  }

  /** Fetches tweets for a specific X user via `GET /v1/agents/resources/x/user/{username}/tweets`. */
  xUserTweets(input: XUserTweetsRequest): Promise<XSearchResponse> {
    return this.client.request<XSearchResponse>({
      method: "GET",
      path: `/v1/agents/resources/x/user/${encodeURIComponent(input.username)}/tweets`,
      query: {
        limit: input.limit
      }
    });
  }
}
