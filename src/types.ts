export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Resource availability status returned by the catalog endpoint. */
export type ResourceStatus = "AVAILABLE" | "UNAVAILABLE" | "DEGRADED";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface DevaClientOptions {
  apiKey?: string;
  apiBase?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  /**
   * Enables automatic first-call payout wallet binding. Defaults to true.
   * Set false only when the runtime cannot use the local credential store.
   */
  payoutWalletAutoBind?: boolean;
  /** Optional base URL for the payout-wallet contract. Defaults to apiBase. */
  payoutWalletApiBase?: string;
  /** Optional local credential-store path. Defaults to ~/.deva/payout-wallet.json. */
  payoutWalletStorePath?: string;
  /** Optional external/passkey payout wallet pubkey to bind lazily instead of generating one. */
  payoutWallet?: RegisterAgentPayoutWallet;
  /** Optional direct external/passkey payout pubkey. Takes precedence over payoutWallet. */
  payout_pubkey?: string;
  x402?: X402Options;
}

export interface X402Options {
  enabled?: boolean;
  maxRetries?: number;
  walletAutoPay?: boolean;
  walletPayPath?: string;
  autoPayPolicy?: X402AutoPayPolicy;
  payer?: X402Payer;
}

export interface X402AutoPayPolicy {
  /** Maximum amount the SDK may pay for one SDK request, in the same units as the challenge amount. */
  maxAmount: string | number;
  /** Maximum cumulative amount this client instance may auto-pay, in the same units as the challenge amount. */
  maxCumulativeAmount: string | number;
  /** Networks the caller has approved for auto-pay challenges. Compared case-insensitively. */
  allowedNetworks: readonly string[];
  /** Payees the caller has approved for auto-pay challenges. Compared exactly after trimming. */
  allowedPayees: readonly string[];
  /** Challenge schemes the caller has approved. Defaults to ["exact"]. Compared case-insensitively. */
  allowedSchemes?: readonly string[];
}

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  timeoutMs?: number;
  retryOn402?: boolean;
}

export interface PayoutWallet {
  /** Bitplanet v3 wallet format. Compatible with Solana/Agave ed25519 keys. */
  version: "v3";
  /** Base58-encoded 32-byte ed25519 public key. */
  pubkey: string;
  /** Base58-encoded 64-byte ed25519 secret key. Persist this locally; it is not sent to the API. */
  secret: string;
}

export interface SuppliedPayoutWallet {
  /** Base58-encoded 32-byte ed25519 public key from an external/passkey wallet. */
  pubkey?: string;
  /** Alias for callers that prefer Web Crypto-style naming. */
  publicKey?: string;
}

export type RegisterAgentPayoutWallet = "generate" | false | SuppliedPayoutWallet;

export interface RegisterAgentInput {
  /** Unique agent name: 3-30 chars, alphanumeric + underscore (`^[a-zA-Z0-9_]+$`), not a reserved word. */
  name: string;
  /** What the agent does: 10-500 characters. Required by the API. */
  description: string;
  /**
   * Optional external/passkey payout wallet pubkey to bind lazily on the first authenticated API call.
   * Registration itself does not send or require a payout pubkey.
   */
  payoutWallet?: RegisterAgentPayoutWallet;
  /** Optional base58 payout public key to bind lazily. Registration itself does not send it. */
  payout_pubkey?: string;
  [key: string]: unknown;
}

export interface RegisteredAgent {
  id: string;
  name: string;
  /** Returned only at registration — persist it; it is not shown again. */
  api_key?: string;
  claim_url?: string;
  verification_code?: string;
  profile_url?: string;
  payout_pubkey?: string;
  [key: string]: unknown;
}

export interface RegisterAgentOutput {
  success?: boolean;
  agent: RegisteredAgent;
  important?: string;
  /** @deprecated Wallets are now generated and stored locally during lazy first-call binding. */
  payoutWallet?: PayoutWallet;
  [key: string]: unknown;
}

export interface PaginatedRequest {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor?: string | null;
  has_more?: boolean;
  [key: string]: unknown;
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
  balance?: number;
  required?: number;
  [key: string]: unknown;
}

export interface X402Challenge {
  scheme?: string;
  network?: string;
  amount?: string | number;
  pay_to?: string;
  memo?: string;
  token?: string;
  challenge_id?: string;
  expires_at?: string;
  request_hash?: string;
  request_method?: string;
  request_path?: string;
  request_url?: string;
  body_sha256?: string;
  raw?: unknown;
}

export interface X402PaymentContext {
  path: string;
  url?: string;
  method: HttpMethod;
  status: number;
  bodySha256?: string;
  bodyHashAlgorithm?: "sha-256";
  requestHash?: string;
  requestHashAlgorithm?: "sha-256";
  autoPayAttempt?: number;
  autoPaySpent?: string;
  responseHeaders: Headers;
}

export interface X402PaymentResult {
  paid: boolean;
  authorizationHeader?: string;
  proof?: string;
  metadata?: Record<string, unknown>;
}

export type X402Payer = (
  challenge: X402Challenge,
  context: X402PaymentContext
) => Promise<X402PaymentResult>;

export interface DevaUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: number; // USD
  deva?: { karma_cost: number; karma_balance?: number };
  [key: string]: unknown;
}
