import { DevaHttpClient } from "../client.js";
import { DevaError } from "../errors.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
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
  usage?: Record<string, number>;
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
  [key: string]: unknown;
}

/** Chat completions and streaming chat completions. */
export class ChatResource {
  constructor(private readonly client: DevaHttpClient) {}

  /**
   * Creates a chat completion via `POST /v1/ai/chat/completions`.
   */
  create(payload: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return this.client.request<ChatCompletionResponse>({
      method: "POST",
      path: "/v1/ai/chat/completions",
      body: payload
    });
  }

  /**
   * Streams chat completion chunks using Server-Sent Events.
   */
  async *stream(payload: ChatCompletionRequest): AsyncGenerator<ChatStreamChunk> {
    const response = await this.client.rawFetch("/v1/ai/chat/completions", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({ ...payload, stream: true })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new DevaError({ status: response.status, message: message || `HTTP ${response.status}` });
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

          try {
            yield JSON.parse(data) as ChatStreamChunk;
          } catch {
            // Skip malformed SSE frames and keep consuming the stream.
          }
        }
      }
    }
  }
}
