import { DevaHttpClient } from "../client.js";

export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  /** @deprecated Use body_text. */
  body?: string;
  body_text?: string;
  body_html?: string;
  reply_to?: string;
  [key: string]: unknown;
}

export interface SendEmailResponse {
  success: boolean;
  message_id: string;
  karma_cost: number;
  [key: string]: unknown;
}

/** Outbound email operations. */
export class EmailResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Sends an email via `POST /v1/comms/email/send`. */
  send(payload: SendEmailRequest): Promise<SendEmailResponse> {
    return this.client.request<SendEmailResponse>({
      method: "POST",
      path: "/v1/comms/email/send",
      body: {
        subject: payload.subject,
        body_text: payload.body_text ?? payload.body,
        body_html: payload.body_html,
        reply_to: payload.reply_to,
        to: Array.isArray(payload.to) ? payload.to : [payload.to]
      }
    });
  }
}
