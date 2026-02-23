import { DevaHttpClient } from "../client.js";
import type { PaginatedRequest, PaginatedResponse } from "../types.js";

export interface WalletBalance {
  karma?: number;
  available?: number;
  pending?: number;
  [key: string]: unknown;
}

export interface WalletTransaction {
  id?: string;
  type?: string;
  amount?: number;
  created_at?: string;
  description?: string;
  [key: string]: unknown;
}

export interface WalletTransactionsRequest extends PaginatedRequest {
  type?: string;
}

export type WalletTransactionsResponse = PaginatedResponse<WalletTransaction>;

/** Wallet and karma balance APIs. */
export class WalletResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Reads wallet balance via `GET /v1/agents/wallet/balance`. */
  balance(): Promise<WalletBalance> {
    return this.client.request<WalletBalance>({ method: "GET", path: "/v1/agents/wallet/balance" });
  }

  /** Lists wallet transactions via `GET /v1/agents/wallet/transactions`. */
  transactions(input: WalletTransactionsRequest = {}): Promise<WalletTransactionsResponse> {
    return this.client.request<WalletTransactionsResponse>({
      method: "GET",
      path: "/v1/agents/wallet/transactions",
      query: {
        limit: input.limit,
        cursor: input.cursor,
        type: input.type
      }
    });
  }
}
