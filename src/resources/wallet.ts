import { DevaHttpClient } from "../client.js";
import { DevaError } from "../errors.js";
import type { PaginatedRequest, PaginatedResponse } from "../types.js";

export interface WalletBalance {
  success: boolean;
  unit: "credits" | "usd" | "karma";
  subject: { type: string; agent_id?: string | null; user_id?: string | null; owner_user_id?: string | null };
  agent_balance: Record<"bronze" | "silver" | "gold" | "purchased_silver" | "purchased_gold" | "sdk_subscription" | "sdk_earned" | "sdk_top_up" | "total", number>;
  total_spendable?: number | null;
  owner_budget_enabled: boolean;
  owner_budget_remaining?: number | null;
  owner_daily_allowance_remaining?: number | null;
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

  /** Reads wallet balance via `GET /v1/agents/balance`. */
  balance(): Promise<WalletBalance> {
    return this.client.request<WalletBalance>({ method: "GET", path: "/v1/agents/balance" });
  }

  /** @deprecated Not supported by the live API; rejects without a network request. */
  transactions(_input: WalletTransactionsRequest = {}): Promise<WalletTransactionsResponse> {
    return Promise.reject(new DevaError({ code: "unsupported_operation", message: "Wallet transactions are not supported by the live API." }));
  }
}
