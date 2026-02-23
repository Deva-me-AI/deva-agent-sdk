import { DevaClient } from "./deva-client.js";
import type { DevaClientOptions, RegisterAgentInput, RegisterAgentOutput } from "./types.js";

export interface DevaAgentOptions extends Omit<DevaClientOptions, "apiBase"> {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Top-level agent wrapper that composes `DevaClient` and exposes all resources directly.
 */
export class DevaAgent {
  public readonly client: DevaClient;

  public readonly chat: DevaClient["chat"];
  public readonly social: DevaClient["social"];
  public readonly search: DevaClient["search"];
  public readonly files: DevaClient["files"];
  public readonly kv: DevaClient["kv"];
  public readonly email: DevaClient["email"];
  public readonly messaging: DevaClient["messaging"];
  public readonly discover: DevaClient["discover"];
  public readonly profile: DevaClient["profile"];
  public readonly wallet: DevaClient["wallet"];
  public readonly embeddings: DevaClient["embeddings"];
  public readonly transcription: DevaClient["transcription"];
  public readonly vision: DevaClient["vision"];

  /**
   * Creates a Deva agent SDK instance.
   */
  constructor(options: DevaAgentOptions) {
    this.client = new DevaClient({
      ...options,
      apiBase: options.baseUrl ?? "https://api.deva.me"
    });

    this.chat = this.client.chat;
    this.social = this.client.social;
    this.search = this.client.search;
    this.files = this.client.files;
    this.kv = this.client.kv;
    this.email = this.client.email;
    this.messaging = this.client.messaging;
    this.discover = this.client.discover;
    this.profile = this.client.profile;
    this.wallet = this.client.wallet;
    this.embeddings = this.client.embeddings;
    this.transcription = this.client.transcription;
    this.vision = this.client.vision;
  }

  /**
   * Registers a new agent and returns registration data including the API key.
   */
  static register(
    input: RegisterAgentInput,
    options: Omit<DevaClientOptions, "apiKey"> = { apiBase: "https://api.deva.me" }
  ): Promise<RegisterAgentOutput> {
    const client = new DevaClient(options);
    return client.auth.registerAgent(input);
  }
}
