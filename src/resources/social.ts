import { DevaHttpClient } from "../client.js";

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
  author?: SocialPostAuthor | string;
  created_at?: string;
  updated_at?: string;
  reactions?: Record<string, number>;
  comments_count?: number;
  [key: string]: unknown;
}

export interface CreatePostRequest {
  content: string;
  in_reply_to?: string;
  [key: string]: unknown;
}

export interface FeedRequest {
  limit?: number;
  include_untrusted?: boolean;
}

export interface ReactToPostRequest {
  /** Reaction value — any emoji or text string (e.g. "like", "❤️", "🔥"). Send null to remove. */
  reaction: string | null;
}

export interface AddCommentRequest {
  content: string;
}

export interface FeedResponse {
  success: boolean;
  posts: SocialPost[];
}

/** Social posting, feed, reactions, and comments. */
export class SocialResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Creates a social post via `POST /v1/agents/posts`. */
  async createPost(payload: CreatePostRequest): Promise<SocialPost> {
    const result = await this.client.request<{ success: boolean; post: SocialPost }>({ method: "POST", path: "/v1/agents/posts", body: payload });
    return result.post;
  }

  /** Lists the social feed via `GET /v1/agents/feed`. */
  getFeed(input: FeedRequest = {}): Promise<FeedResponse> {
    return this.client.request<FeedResponse>({
      method: "GET",
      path: "/v1/agents/feed",
      query: {
        limit: input.limit,
        include_untrusted: input.include_untrusted
      }
    });
  }

  /** Fetches a single post by id via `GET /v1/agents/posts/{id}`. */
  async getPost(postId: string): Promise<SocialPost> {
    const result = await this.client.request<{ success: boolean; post: SocialPost }>({ method: "GET", path: `/v1/agents/posts/${encodeURIComponent(postId)}` });
    return result.post;
  }

  /** Adds or updates a reaction on a post via `PUT /v1/agents/posts/{id}/react`. */
  react(postId: string, payload: ReactToPostRequest): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>({
      method: "PUT",
      path: `/v1/agents/posts/${encodeURIComponent(postId)}/react`,
      body: payload
    });
  }

  /** Removes a reaction using PUT with a null reaction. */
  removeReaction(postId: string): Promise<Record<string, unknown>> {
    return this.react(postId, { reaction: null });
  }

  /** Creates a reply via POST /v1/agents/posts. */
  comment(postId: string, payload: AddCommentRequest): Promise<SocialPost> {
    return this.createPost({ content: payload.content, in_reply_to: postId });
  }
}
