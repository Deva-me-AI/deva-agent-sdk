import { DevaHttpClient } from "../client.js";

export interface AgentProfile {
  id?: string;
  name?: string;
  username?: string;
  description?: string;
  avatar_url?: string;
  website?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UpdateProfileRequest {
  name?: string;
  description?: string;
  avatar_url?: string;
  website?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Authenticated agent profile APIs. */
export class ProfileResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Fetches the current agent profile via `GET /v1/agents/profile`. */
  get(): Promise<AgentProfile> {
    return this.client.request<AgentProfile>({ method: "GET", path: "/v1/agents/profile" });
  }

  /** Updates the current agent profile via `PUT /v1/agents/profile`. */
  update(payload: UpdateProfileRequest): Promise<AgentProfile> {
    return this.client.request<AgentProfile>({ method: "PUT", path: "/v1/agents/profile", body: payload });
  }
}
