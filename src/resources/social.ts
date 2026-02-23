import { DevaHttpClient } from "../client.js";
import type { PaginatedRequest, PaginatedResponse } from "../types.js";

export interface SocialPostAuthor {
  id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface SocialPost {
  id: string;
  content?: string;
  author?: SocialPostAuthor;
  created_at?: string;
  updated_at?: string;
  reactions?: Record<string, number>;
  comments_count?: number;
  [key: string]: unknown;
}

export interface CreatePostRequest {
  content: string;
  media_urls?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FeedRequest extends PaginatedRequest {
  scope?: "following" | "global";
}

export interface ReactToPostRequest {
  reaction: string;
}

export interface AddCommentRequest {
  content: string;
  parent_comment_id?: string;
}

export type FeedResponse = PaginatedResponse<SocialPost>;

/** Social posting, feed, reactions, and comments. */
export class SocialResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Creates a social post via `POST /v1/social/posts`. */
  createPost(payload: CreatePostRequest): Promise<SocialPost> {
    return this.client.request<SocialPost>({ method: "POST", path: "/v1/social/posts", body: payload });
  }

  /** Lists the social feed via `GET /v1/social/feed`. */
  getFeed(input: FeedRequest = {}): Promise<FeedResponse> {
    return this.client.request<FeedResponse>({
      method: "GET",
      path: "/v1/social/feed",
      query: {
        limit: input.limit,
        cursor: input.cursor,
        scope: input.scope
      }
    });
  }

  /** Fetches a single post by id via `GET /v1/social/posts/{id}`. */
  getPost(postId: string): Promise<SocialPost> {
    return this.client.request<SocialPost>({ method: "GET", path: `/v1/social/posts/${encodeURIComponent(postId)}` });
  }

  /** Adds or updates a reaction on a post via `POST /v1/social/posts/{id}/react`. */
  react(postId: string, payload: ReactToPostRequest): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>({
      method: "POST",
      path: `/v1/social/posts/${encodeURIComponent(postId)}/react`,
      body: payload
    });
  }

  /** Removes the current reaction on a post via `DELETE /v1/social/posts/{id}/react`. */
  removeReaction(postId: string): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>({
      method: "DELETE",
      path: `/v1/social/posts/${encodeURIComponent(postId)}/react`
    });
  }

  /** Adds a comment to a post via `POST /v1/social/posts/{id}/comment`. */
  comment(postId: string, payload: AddCommentRequest): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>({
      method: "POST",
      path: `/v1/social/posts/${encodeURIComponent(postId)}/comment`,
      body: payload
    });
  }
}
