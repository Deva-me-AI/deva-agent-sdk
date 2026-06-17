import { DevaHttpClient } from "./client.js";
import { DevaError } from "./errors.js";
import { generatePayoutWallet } from "./payout-wallet.js";
import type { PayoutWallet, RegisterAgentInput, RegisterAgentOutput, RegisterAgentPayoutWallet } from "./types.js";

function normalizeSuppliedPayoutPubkey(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new DevaError({ message: `${field} must be a base58 public key string.` });
  }

  const pubkey = value.trim();
  return pubkey.length > 0 ? pubkey : undefined;
}

function getPayoutWalletPubkey(input: RegisterAgentPayoutWallet | undefined): string | undefined {
  if (input === undefined || input === "generate" || input === false) return undefined;
  if (!input || typeof input !== "object") {
    throw new DevaError({ message: "payoutWallet must be \"generate\", false, or an object containing pubkey." });
  }

  return (
    normalizeSuppliedPayoutPubkey(input.pubkey, "payoutWallet.pubkey") ??
    normalizeSuppliedPayoutPubkey(input.publicKey, "payoutWallet.publicKey")
  );
}

function prepareRegisterAgentInput(input: RegisterAgentInput): {
  body: Omit<RegisterAgentInput, "payoutWallet">;
  payoutWallet?: PayoutWallet;
} {
  const { payoutWallet: payoutWalletInput = "generate", ...body } = input;
  const directPayoutPubkey = normalizeSuppliedPayoutPubkey(body.payout_pubkey, "payout_pubkey");
  if (directPayoutPubkey) {
    return { body: { ...body, payout_pubkey: directPayoutPubkey } };
  }

  const suppliedPayoutPubkey = getPayoutWalletPubkey(payoutWalletInput);
  if (suppliedPayoutPubkey) {
    return { body: { ...body, payout_pubkey: suppliedPayoutPubkey } };
  }

  if (payoutWalletInput === false) {
    return { body };
  }

  const payoutWallet = generatePayoutWallet();
  return { body: { ...body, payout_pubkey: payoutWallet.pubkey }, payoutWallet };
}

/** Authentication and API key lifecycle helpers. */
export class AuthResource {
  constructor(private readonly client: DevaHttpClient) {}

  /** Returns the currently configured API key, if present. */
  getApiKey(): string | undefined {
    return this.client.getApiKey();
  }

  /** Sets or clears the current API key used for authenticated calls. */
  setApiKey(apiKey: string | undefined): void {
    this.client.setApiKey(apiKey);
  }

  /**
   * Registers a new agent and persists the returned API key in this client.
   * By default, this also generates a local v3 payout wallet and binds its pubkey.
   */
  async registerAgent(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    const { body, payoutWallet } = prepareRegisterAgentInput(input);
    const result = await this.client.request<RegisterAgentOutput>({
      method: "POST",
      path: "/agents/register",
      body,
      requiresAuth: false
    });

    const apiKey = result.agent?.api_key;
    if (!apiKey) {
      throw new DevaError({ message: "Registration succeeded but no api_key returned." });
    }

    this.client.setApiKey(apiKey);
    return payoutWallet ? { ...result, payoutWallet } : result;
  }
}
