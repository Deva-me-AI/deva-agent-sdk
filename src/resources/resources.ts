import { DevaHttpClient } from "../client.js";
import type {
  ResourceCatalogResponse,
  ResourceEstimateResponse,
  ResourceInfo,
  ResourceRunResponse
} from "../types.js";

export type ResourceRunParams = Record<string, unknown>;
export type ResourceEstimateParams = Record<string, unknown>;

/** Generic discover, inspect, estimate, and run APIs for agent resources. */
export class ResourcesResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Lists the authenticated resource catalog via `GET /v1/agents/resources/catalog`. */
  async list(): Promise<ResourceInfo[]> {
    const response = await this.client.request<ResourceCatalogResponse>({
      method: "GET",
      path: "/v1/agents/resources/catalog"
    });
    return response.resources;
  }

  /** Inspects a single resource via `GET /v1/agents/resources/catalog/{resource_id}`. */
  inspect(resourceId: string): Promise<ResourceInfo> {
    return this.client.request<ResourceInfo>({
      method: "GET",
      path: `/v1/agents/resources/catalog/${encodeURIComponent(resourceId)}`
    });
  }

  /** Estimates the karma cost for a planned resource call via `POST /v1/agents/resources/estimate`. */
  estimate(resourceId: string, params: ResourceEstimateParams = {}): Promise<ResourceEstimateResponse> {
    return this.client.request<ResourceEstimateResponse>({
      method: "POST",
      path: "/v1/agents/resources/estimate",
      body: {
        resource_id: resourceId,
        params
      }
    });
  }

  /** Runs a generic-supported resource via `POST /v1/agents/resources/{resource_id}/run`. */
  run<T = Record<string, unknown>>(resourceId: string, params: ResourceRunParams): Promise<ResourceRunResponse<T>> {
    return this.client.request<ResourceRunResponse<T>>({
      method: "POST",
      path: `/v1/agents/resources/${encodeURIComponent(resourceId)}/run`,
      body: params
    });
  }
}
