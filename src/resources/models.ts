import { DevaHttpClient } from "../client.js";

export interface ModelPricing {
  prompt: string; // USD per token (decimal string)
  completion: string; // USD per token
  prompt_karma: string; // karma per token
  completion_karma: string; // karma per token
  unit: string; // "per token"
  currency: string; // "USD"
  note: string;
  [key: string]: unknown;
}

export interface ModelCapabilities {
  tool_calling: boolean;
  structured_output: boolean;
  reasoning: boolean;
  vision: boolean;
  streaming: boolean;
  [key: string]: unknown;
}

export interface Model {
  id: string;
  object: string;
  name: string;
  provider: string;
  context_length: number;
  max_completion_tokens: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  enabled: boolean;
  deprecated: boolean;
  featured: boolean;
  [key: string]: unknown;
}

export interface ModelList {
  object: string;
  data: Model[];
  total_count: number;
  limit: number;
  offset: number;
  pricing_version: number;
  last_updated?: string | null;
  [key: string]: unknown;
}

export interface ModelListOptions {
  provider?: string;
  capability?: "tool_calling" | "reasoning" | "vision" | "structured_output";
  featured?: boolean;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

/** Model catalog: list and retrieve available models. */
export class ModelsResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Lists available models via `GET /v1/models`. */
  list(options: ModelListOptions = {}): Promise<ModelList> {
    return this.client.request<ModelList>({
      method: "GET",
      path: "/v1/models",
      query: {
        provider: options.provider,
        capability: options.capability,
        featured: options.featured,
        enabled: options.enabled,
        limit: options.limit,
        offset: options.offset
      }
    });
  }

  /** Retrieves a single model via `GET /v1/models/{provider}/{name}`. `id` is the `provider/name` form, e.g. `"openai/gpt-4o"`. */
  get(id: string): Promise<Model> {
    return this.client.request<Model>({
      method: "GET",
      path: `/v1/models/${id}`
    });
  }
}
