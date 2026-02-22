import { AuthResource } from "./auth.js";
import { DevaHttpClient } from "./client.js";
import { AgentResource } from "./resources/agent.js";
import { AiResource } from "./resources/ai.js";
import { CommsResource } from "./resources/comms.js";
import { SocialResource } from "./resources/social.js";
import { StorageResource } from "./resources/storage.js";
import { ToolsResource } from "./resources/tools.js";
import type { DevaClientOptions } from "./types.js";

export class DevaClient {
  private readonly http: DevaHttpClient;

  public readonly auth: AuthResource;
  public readonly ai: AiResource;
  public readonly storage: StorageResource;
  public readonly social: SocialResource;
  public readonly comms: CommsResource;
  public readonly agent: AgentResource;
  public readonly tools: ToolsResource;

  constructor(options: DevaClientOptions = {}) {
    this.http = new DevaHttpClient(options);

    this.auth = new AuthResource(this.http);
    this.ai = new AiResource(this.http);
    this.storage = new StorageResource(this.http);
    this.social = new SocialResource(this.http);
    this.comms = new CommsResource(this.http);
    this.agent = new AgentResource(this.http, this.auth);
    this.tools = new ToolsResource(this.http);
  }

  setApiKey(apiKey: string | undefined): void {
    this.auth.setApiKey(apiKey);
  }

  getApiKey(): string | undefined {
    return this.auth.getApiKey();
  }
}

export * from "./auth.js";
export * from "./client.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./resources/agent.js";
export * from "./resources/ai.js";
export * from "./resources/comms.js";
export * from "./resources/social.js";
export * from "./resources/storage.js";
export * from "./resources/tools.js";
