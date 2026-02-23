import { DevaHttpClient } from "../client.js";

export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  [key: string]: unknown;
}

export interface SendEmailResponse {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

/** Outbound email operations. */
export class EmailResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Sends an email via `POST /v1/agents/email/send`. */
  send(payload: SendEmailRequest): Promise<SendEmailResponse> {
    return this.client.request<SendEmailResponse>({
      method: "POST",
      path: "/v1/agents/email/send",
      body: {
        ...payload,
        to: Array.isArray(payload.to) ? payload.to : [payload.to]
      }
    });
  }
}
