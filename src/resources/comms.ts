import { DevaHttpClient } from "../client.js";
import type { EmailInput, PaginationInput } from "../types.js";

class MessagingResource {
  constructor(private readonly client: DevaHttpClient) {}

  send<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.client.request<T>({ method: "POST", path: "/v1/agents/messages/send", body: payload });
  }

  inbox<T = Record<string, unknown>>(input: PaginationInput = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: "/v1/agents/messages/conversations",
      query: {
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }

  outbox<T = Record<string, unknown>>(input: PaginationInput = {}): Promise<T> {
    return this.client.request<T>({
      method: "GET",
      path: "/v1/agents/messages/outbox",
      query: {
        limit: input.limit,
        cursor: input.cursor
      }
    });
  }

  reply<T = Record<string, unknown>>(messageId: string, content: string): Promise<T> {
    return this.client.request<T>({
      method: "POST",
      path: `/v1/agents/messages/${encodeURIComponent(messageId)}/reply`,
      body: { content }
    });
  }

  markRead<T = Record<string, unknown>>(messageId: string): Promise<T> {
    return this.client.request<T>({ method: "POST", path: `/v1/agents/messages/${encodeURIComponent(messageId)}/read` });
  }

  delete<T = Record<string, unknown>>(messageId: string): Promise<T> {
    return this.client.request<T>({ method: "DELETE", path: `/v1/agents/messages/${encodeURIComponent(messageId)}` });
  }

  thread<T = Record<string, unknown>>(threadId: string): Promise<T> {
    return this.client.request<T>({ method: "GET", path: `/v1/agents/messages/threads/${encodeURIComponent(threadId)}` });
  }
}

export class CommsResource {
  public readonly messaging: MessagingResource;

  constructor(private readonly client: DevaHttpClient) {
    this.messaging = new MessagingResource(client);
  }

  email<T = Record<string, unknown>>(input: EmailInput): Promise<T> {
    const to = Array.isArray(input.to) ? input.to : [input.to];

    return this.client.request<T>({
      method: "POST",
      path: "/comms/email/send",
      body: {
        to,
        subject: input.subject,
        body: input.body,
        reply_to: input.reply_to
      }
    });
  }
}
