import { DevaHttpClient } from "../client.js";
import { DevaError, errorFromResponse } from "../errors.js";
import type { DevaUsage } from "../types.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  [key: string]: unknown;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: Record<string, unknown> };
  reasoning?: { effort?: "low" | "medium" | "high"; enabled?: boolean };
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

export interface ChatChoice {
  index?: number;
  message?: ChatMessage;
  finish_reason?: string | null;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: ChatChoice[];
  usage?: DevaUsage;
  [key: string]: unknown;
}

export interface ChatStreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    delta?: Partial<ChatMessage>;
    finish_reason?: string | null;
    [key: string]: unknown;
  }>;
  usage?: DevaUsage;
  [key: string]: unknown;
}

/** Chat completions and streaming chat completions. */
export class ChatResource {
  constructor(private readonly client: DevaHttpClient) {}

  /**
   * Creates a chat completion via `POST /v1/chat/completions`.
   */
  create(payload: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return this.client.request<ChatCompletionResponse>({
      method: "POST",
      path: "/v1/chat/completions",
      body: payload
    });
  }

  /**
   * Streams chat completion chunks using Server-Sent Events.
   */
  async *stream(payload: ChatCompletionRequest): AsyncGenerator<ChatStreamChunk> {
    const response = await this.client.rawFetch("/v1/chat/completions", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({ ...payload, stream: true })
    });

    if (!response.ok) {
      const text = await response.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: { message: text } };
      }
      throw errorFromResponse(response.status, body);
    }

    if (!response.body) {
      throw new DevaError({ message: "No response stream returned by server." });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;

          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Skip malformed (non-JSON) SSE frames and keep consuming the stream.
            continue;
          }
          if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).error) {
            throw errorFromResponse(200, parsed);
          }
          yield parsed as ChatStreamChunk;
        }
      }
    }
  }
}
