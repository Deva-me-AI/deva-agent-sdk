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
   * Registers a new agent and persists the returned API key in this client.
   */
  async registerAgent(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    const result = await this.client.request<RegisterAgentOutput>({
      method: "POST",
      path: "/agents/register",
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
