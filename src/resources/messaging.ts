import { DevaHttpClient } from "../client.js";

export interface SendMessageRequest {
  to: string;
  content: string;
  channel?: "agent" | "user";
  subject?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendMessageResponse {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

/** Agent/user messaging APIs. */
export class MessagingResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Sends a message via `POST /v1/agents/messaging/send`. */
  send(payload: SendMessageRequest): Promise<SendMessageResponse> {
    return this.client.request<SendMessageResponse>({
      method: "POST",
      path: "/v1/agents/messaging/send",
      body: payload
    });
  }
}
