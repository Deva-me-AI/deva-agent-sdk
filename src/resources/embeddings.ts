import { DevaHttpClient } from "../client.js";

export interface EmbeddingsRequest {
  model: string;
  input: string | string[];
  [key: string]: unknown;
}

export interface EmbeddingData {
  index?: number;
  embedding?: number[];
  [key: string]: unknown;
}

export interface EmbeddingsResponse {
  data?: EmbeddingData[];
  model?: string;
  usage?: Record<string, number>;
  [key: string]: unknown;
}

/** Embedding generation API. */
export class EmbeddingsResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Generates embeddings via `POST /v1/ai/embeddings`. */
  create(payload: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    return this.client.request<EmbeddingsResponse>({ method: "POST", path: "/v1/ai/embeddings", body: payload });
  }
}
