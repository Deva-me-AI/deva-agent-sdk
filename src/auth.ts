import { DevaHttpClient } from "./client.js";
import { DevaError } from "./errors.js";
import type { RegisterAgentInput, RegisterAgentOutput } from "./types.js";

export class AuthResource {
  constructor(private readonly client: DevaHttpClient) {}

  getApiKey(): string | undefined {
    return this.client.getApiKey();
  }

  setApiKey(apiKey: string | undefined): void {
    this.client.setApiKey(apiKey);
  }

  requireApiKey(): string {
    const key = this.client.getApiKey();
    if (!key) {
      throw new DevaError({ message: "No API key configured. Pass apiKey when creating DevaClient." });
    }
    return key;
  }

  async registerAgent(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    const result = await this.client.request<RegisterAgentOutput>({
      method: "POST",
      path: "/agents/register",
      body: input,
      requiresAuth: false
    });

    if (!result.api_key) {
      throw new DevaError({ message: "Registration succeeded but no api_key returned." });
    }

    this.client.setApiKey(result.api_key);
    return result;
  }
}
