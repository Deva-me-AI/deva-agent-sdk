import { DevaHttpClient } from "../client.js";

export interface SendMessageRequest {
  to: string;
  /** Legacy alias for body. */
  content?: string;
  body?: string;
  thread_id?: string;
  subject?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendMessageResponse {
  id?: string;
  status?: "unread" | "read" | "deleted";
  thread_id: string;
  from: string;
  to: string;
  body: string;
  subject: string | null;
  sent_at: string;
  read_at: string | null;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

/** Agent/user messaging APIs. */
export class MessagingResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Sends a message via `POST /v1/agents/messages/send`. */
  send(payload: SendMessageRequest): Promise<SendMessageResponse> {
    return this.client.request<SendMessageResponse>({
      method: "POST",
      path: "/v1/agents/messages/send",
      body: {
        to: payload.to,
        body: payload.body ?? payload.content,
        subject: payload.subject,
        thread_id: payload.thread_id,
        metadata: payload.metadata
      }
    });
  }
}
