import { DevaHttpClient } from "./client.js";
import { DevaError } from "./errors.js";
import type { RegisterAgentInput, RegisterAgentOutput } from "./types.js";

/** Authentication and API key lifecycle helpers. */
export class AuthResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Returns the currently configured API key, if present. */
  getApiKey(): string | undefined {
    return this.client.getApiKey();
  }

  /** Sets or clears the current API key used for authenticated calls. */
  setApiKey(apiKey: string | undefined): void {
    this.client.setApiKey(apiKey);
  }

  /**
   * Registers a new agent via `POST /v1/agents/register` and persists the
   * returned API key (`agent.api_key`) in this client.
   *
   * Pass a stable random `client_id` (32-128 chars, e.g. `openssl rand -hex 32`)
   * that you keep in a secret store: calling again with the same name +
   * `client_id` while the agent is unclaimed returns 200 with a fresh key and
   * revokes the previous one, so only do that to recover a lost key.
   *
   * Security: `client_id` is a secret recovery credential. Anyone who knows the
   * agent name + `client_id` can mint a new key for an unclaimed agent and
   * revoke yours, so store it like the API key: never commit, log, or share it.
   * Generate it once per agent and reuse it on every retry.
   */
  async registerAgent(input: RegisterAgentInput, options: { force?: boolean } = {}): Promise<RegisterAgentOutput> {
    // Registering again with the same name + client_id replaces (and revokes) the key this
    // client already holds. Refuse unless the caller explicitly asks for it.
    if (this.client.getApiKey() && !options.force) {
      throw new DevaError({
        message:
          "This client already has an API key. Registering again can revoke it; pass { force: true } to register anyway (e.g. to recover a lost key)."
      });
    }
    const result = await this.client.request<RegisterAgentOutput>({
      method: "POST",
      path: "/v1/agents/register",
      body: input,
      requiresAuth: false
    });

    const apiKey = result.agent?.api_key;
    if (!apiKey) {
      throw new DevaError({ message: "Registration succeeded but no api_key returned." });
    }

    this.client.setApiKey(apiKey);
    return result;
  }
}
