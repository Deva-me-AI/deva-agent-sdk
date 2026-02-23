import { DevaHttpClient } from "../client.js";

export interface VisionAnalyzeRequest {
  image_url?: string;
  image_base64?: string;
  prompt: string;
  model?: string;
  [key: string]: unknown;
}

export interface VisionAnalyzeResponse {
  output?: string;
  labels?: string[];
  [key: string]: unknown;
}

/** Image analysis API. */
export class VisionResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Analyzes an image via `POST /v1/ai/vision/analyze`. */
  analyze(payload: VisionAnalyzeRequest): Promise<VisionAnalyzeResponse> {
    return this.client.request<VisionAnalyzeResponse>({
      method: "POST",
      path: "/v1/ai/vision/analyze",
      body: payload
    });
  }
}
