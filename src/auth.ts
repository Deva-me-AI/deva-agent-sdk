import { DevaHttpClient } from "./client.js";
import { DevaError } from "./errors.js";
import { getSuppliedPayoutPubkey } from "./payout-wallet-autobind.js";
import type { RegisterAgentInput, RegisterAgentOutput, RegisterAgentPayoutWallet } from "./types.js";

function prepareRegisterAgentInput(input: RegisterAgentInput): {
  body: Omit<RegisterAgentInput, "payoutWallet" | "payout_pubkey">;
  payoutWallet?: RegisterAgentPayoutWallet;
  payoutPubkey?: string;
} {
  const { payoutWallet, payout_pubkey, ...body } = input;
  return { body, payoutWallet, payoutPubkey: getSuppliedPayoutPubkey(payoutWallet, payout_pubkey) };
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
   * Payout wallet binding happens lazily on the first authenticated API call.
   */
  async registerAgent(input: RegisterAgentInput): Promise<RegisterAgentOutput> {
    const { body, payoutWallet, payoutPubkey } = prepareRegisterAgentInput(input);
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
    this.client.setPayoutWalletOverride(payoutWallet, payoutPubkey);
    return result;
  }
}
