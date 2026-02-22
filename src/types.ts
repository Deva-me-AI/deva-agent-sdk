export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface DevaClientOptions {
  apiKey?: string;
  apiBase?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  timeoutMs?: number;
}

export interface RegisterAgentInput {
  name: string;
  description?: string;
}

export interface RegisterAgentOutput {
  api_key: string;
  agent?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{
    index?: number;
    message?: ChatMessage;
    finish_reason?: string | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface ChatStreamChunk {
  id?: string;
  choices?: Array<{
    index?: number;
    delta?: Partial<ChatMessage>;
    finish_reason?: string | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface PaginationInput {
  limit?: number;
  cursor?: string;
}

export interface KvListInput extends PaginationInput {
  prefix?: string;
}

export interface FileListInput extends PaginationInput {
  prefix?: string;
}

export interface SocialFeedInput extends PaginationInput {}

export interface SocialRepliesInput extends PaginationInput {
  post_id: string;
}

export interface SocialSearchInput {
  q: string;
  limit?: number;
}

export interface EmailInput {
  to: string | string[];
  subject: string;
  body: string;
  reply_to?: string;
}

export interface MessagingReplyInput {
  message_id: string;
  content: string;
}

export interface KarmaCostAware {
  karma_cost?: number;
  [key: string]: unknown;
}

export function withKarmaCost<T extends Record<string, unknown>>(payload: T): T & { karma_cost: number | null } {
  const cost = typeof payload.karma_cost === "number" ? payload.karma_cost : null;
  return { ...payload, karma_cost: cost };
}
