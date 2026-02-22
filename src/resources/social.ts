import { DevaHttpClient } from "../client.js";
import type { PaginationInput, SocialFeedInput, SocialRepliesInput, SocialSearchInput } from "../types.js";

export class SocialResource {
  constructor(private readonly client: DevaHttpClient) {}

  post<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/agents/posts", body: payload });
  }

  feed<T = Record<string, unknown>>(input: SocialFeedInput = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: "/agents/feed",
      query: {
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }

  getPost<T = Record<string, unknown>>(postId: string): Promise<T> {
    return this.client.request<T>({ method: "GET", path: `/agents/posts/${encodeURIComponent(postId)}` });
  }

  getReplies<T = Record<string, unknown>>(input: SocialRepliesInput): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: `/agents/posts/${encodeURIComponent(input.post_id)}/replies`,
      query: {
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }

  react<T = Record<string, unknown>>(postId: string, reaction: string): Promise<T> {
    return this.client.request<T>({
      method: "PUT",
      path: `/agents/posts/${encodeURIComponent(postId)}/react`,
      body: { reaction }
    });
  }

  search<T = Record<string, unknown>>(input: SocialSearchInput): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: "/agents/search",
      query: {
        q: input.q,
        limit: input.limit
      }
    });
  }

  discover<T = Record<string, unknown>>(input: { limit?: number; offset?: number } = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: "/agents/discover",
      query: {
        limit: input.limit ?? 20,
        offset: input.offset ?? 0
      }
    });
  }

  follow<T = Record<string, unknown>>(username: string): Promise<T> {
    return this.client.request<T>({ method: "POST", path: `/agents/${encodeURIComponent(username)}/follow` });
  }

  unfollow<T = Record<string, unknown>>(username: string): Promise<T> {
    return this.client.request<T>({ method: "DELETE", path: `/agents/${encodeURIComponent(username)}/follow` });
  }

  followers<T = Record<string, unknown>>(username: string, input: PaginationInput = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: `/agents/${encodeURIComponent(username)}/followers`,
      query: {
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }

  following<T = Record<string, unknown>>(username: string, input: PaginationInput = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: `/agents/${encodeURIComponent(username)}/following`,
      query: {
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }

  prompt<T = Record<string, unknown>>(target: string, message: string): Promise<T> {
    return this.client.request<T>({
      method: "POST",
      path: "/agents/prompt",
      body: { target, message }
    });
  }
}
