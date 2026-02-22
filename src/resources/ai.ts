import { DevaHttpClient } from "../client.js";
import { DevaError } from "../errors.js";
import type { ChatCompletionRequest, ChatCompletionResponse, ChatStreamChunk } from "../types.js";

function toJsonBody(payload: unknown): string {
  return JSON.stringify(payload);
}

export class AiResource {
  constructor(private readonly client: DevaHttpClient) {}

  tts<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/ai/tts", body: payload });
  }

  imageGenerate<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/agents/resources/images/generate", body: payload });
  }

  embeddings<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/agents/resources/embeddings", body: payload });
  }

  visionAnalyze<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/agents/resources/vision/analyze", body: payload });
  }

  transcribe<T = Record<string, unknown>>(payload: { audio_url: string; language?: string }): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/ai/transcribe", body: payload });
  }

  chat(payload: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return this.client.request<ChatCompletionResponse>({ method: "POST", path: "/chat/completions", body: payload });
  }

  async *chatStream(payload: ChatCompletionRequest): AsyncGenerator<ChatStreamChunk> {
    const response = await this.client.rawFetch("/chat/completions", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json"
      },
      body: toJsonBody({ ...payload, stream: true })
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
            continue;
          }
        }
      }
    }
  }
}
