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
  count?: number;
  search_type?: "Latest" | "Top";
  source?: "anyapi" | "monid" | "rapidapi";
  max_price?: number;
  /** @deprecated Use count. */
  max_results?: number;
  [key: string]: unknown;
}

export interface XTweet {
  id?: string;
  text?: string;
  author?: { id?: string | null; username?: string | null; name?: string | null };
  metrics?: { likes?: number | null; retweets?: number | null; replies?: number | null; views?: number | null };
  created_at?: string;
  [key: string]: unknown;
}

export interface XSearchResponse {
  success: boolean;
  tweets: XTweet[];
  total: number;
  credits_cost: number;
  query?: string;
  search_type?: string;
  username?: string;
  [key: string]: unknown;
}

export interface XUserTweetsRequest {
  username: string;
  count?: number;
  /** @deprecated Use count. */
  limit?: number;
}

/** Web and X/Twitter resource search APIs. */
export class SearchResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Performs web search via Perplexity Sonar (5 ₭ per search). `POST /v1/agents/resources/search`. */
  web(payload: WebSearchRequest): Promise<WebSearchResponse> {
    return this.client.request<WebSearchResponse>({
      method: "POST",
      path: "/v1/agents/resources/search",
      body: payload
    });
  }

  /** Performs X/Twitter search (15 ₭ per search). `POST /v1/tools/x/search`. */
  x(payload: XSearchRequest): Promise<XSearchResponse> {
    return this.client.request<XSearchResponse>({
      method: "POST",
      path: "/v1/tools/x/search",
      body: {
        query: payload.query,
        count: payload.count ?? payload.max_results,
        search_type: payload.search_type,
        source: payload.source,
        max_price: payload.max_price
      }
    });
  }

  /** Fetches user tweets via POST /v1/tools/x/user-tweets. */
  xUserTweets(input: XUserTweetsRequest): Promise<XSearchResponse> {
    return this.client.request<XSearchResponse>({
      method: "POST",
      path: "/v1/tools/x/user-tweets",
      body: { username: input.username, count: input.count ?? input.limit }
    });
  }
}
