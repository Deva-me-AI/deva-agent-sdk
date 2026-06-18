import { DevaError, classifyError, normalizeErrorEnvelope } from "./errors.js";
import { generatePayoutWallet } from "./payout-wallet.js";
import {
  defaultPayoutWalletStorePath,
  deleteStoredPayoutWallet,
  payoutWalletStoreKey,
  readStoredPayoutWallet,
  writeStoredPayoutWallet
} from "./payout-wallet-store.js";
import type { PayoutWallet, RegisterAgentPayoutWallet } from "./types.js";

const PAYOUT_WALLET_PATH = "/api/v1/agent/payout-wallet";
const PAYOUT_WALLET_BIND_PATH = "/api/v1/agent/payout-wallet/bind";

interface PayoutWalletStatusResponse {
  payout_pubkey?: string | null;
  bound_at?: string | null;
}

interface PayoutWalletBindResponse {
  payout_pubkey?: string;
  bound_at?: string | null;
  already_bound?: boolean;
}

interface PayoutWalletAutoBinderOptions {
  apiBase: string;
  fetch: typeof fetch;
  timeoutMs: number;
  storePath?: string;
  payoutWallet?: RegisterAgentPayoutWallet;
  payout_pubkey?: string;
}

const boundCache = new Set<string>();
const bindingPromises = new Map<string, Promise<void>>();

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function normalizeSuppliedPayoutPubkey(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new DevaError({ message: `${field} must be a base58 public key string.` });
  }

  const pubkey = value.trim();
  return pubkey.length > 0 ? pubkey : undefined;
}

export function getSuppliedPayoutPubkey(
  payoutWallet: RegisterAgentPayoutWallet | undefined,
  payoutPubkey?: unknown
): string | undefined {
  const directPayoutPubkey = normalizeSuppliedPayoutPubkey(payoutPubkey, "payout_pubkey");
  if (directPayoutPubkey) return directPayoutPubkey;

  if (payoutWallet === undefined || payoutWallet === "generate" || payoutWallet === false) return undefined;
  if (!payoutWallet || typeof payoutWallet !== "object") {
    throw new DevaError({ message: "payoutWallet must be \"generate\", false, or an object containing pubkey." });
  }

  return (
    normalizeSuppliedPayoutPubkey(payoutWallet.pubkey, "payoutWallet.pubkey") ??
    normalizeSuppliedPayoutPubkey(payoutWallet.publicKey, "payoutWallet.publicKey")
  );
}

/** Lazily provisions and binds an agent payout wallet on the first authenticated API call. */
export class PayoutWalletAutoBinder {
  private readonly apiBase: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly storePath: string;
  private suppliedPubkey?: string;

  constructor(options: PayoutWalletAutoBinderOptions) {
    this.apiBase = options.apiBase.replace(/\/$/, "");
    this.fetchImpl = options.fetch;
    this.timeoutMs = options.timeoutMs;
    this.storePath = options.storePath ?? defaultPayoutWalletStorePath();
    this.suppliedPubkey = getSuppliedPayoutPubkey(options.payoutWallet, options.payout_pubkey);
  }

  setPayoutWalletOverride(payoutWallet: RegisterAgentPayoutWallet | undefined, payoutPubkey?: unknown): void {
    const pubkey = getSuppliedPayoutPubkey(payoutWallet, payoutPubkey);
    if (pubkey) {
      this.suppliedPubkey = pubkey;
    }
  }

  async ensureBound(apiKey: string): Promise<void> {
    const key = payoutWalletStoreKey(this.apiBase, apiKey);
    if (boundCache.has(key)) return;

    const existing = bindingPromises.get(key);
    if (existing) {
      await existing;
      return;
    }

    const binding = this.bind(apiKey, key)
      .then(() => {
        boundCache.add(key);
      })
      .finally(() => {
        bindingPromises.delete(key);
      });

    bindingPromises.set(key, binding);
    await binding;
  }

  private async fetchJson(path: string, apiKey: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.apiBase}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal
      });
      const payload = await parseBody(response);

      if (!response.ok) {
        throw classifyError(normalizeErrorEnvelope(response.status, payload));
      }

      return payload;
    } catch (error) {
      if (error instanceof DevaError) throw error;
      throw new DevaError({ message: error instanceof Error ? error.message : "Payout wallet binding failed." });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async bind(apiKey: string, storeKey: string): Promise<void> {
    const status = (await this.fetchJson(PAYOUT_WALLET_PATH, apiKey, { method: "GET" })) as PayoutWalletStatusResponse;
    if (typeof status.payout_pubkey === "string" && status.payout_pubkey.trim()) {
      return;
    }

    const suppliedPubkey = this.suppliedPubkey;
    let wallet: PayoutWallet | undefined;
    let pubkey = suppliedPubkey;

    if (!pubkey) {
      wallet = await readStoredPayoutWallet(this.storePath, storeKey);
      if (!wallet) {
        wallet = generatePayoutWallet();
        await writeStoredPayoutWallet(this.storePath, storeKey, wallet);
      }
      pubkey = wallet.pubkey;
    }

    const response = (await this.fetchJson(PAYOUT_WALLET_BIND_PATH, apiKey, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ payout_pubkey: pubkey })
    })) as PayoutWalletBindResponse;

    const boundPubkey = typeof response.payout_pubkey === "string" && response.payout_pubkey.trim() ? response.payout_pubkey : pubkey;

    if (wallet) {
      if (boundPubkey === wallet.pubkey) {
        await writeStoredPayoutWallet(this.storePath, storeKey, wallet, response.bound_at ?? null);
      } else {
        await deleteStoredPayoutWallet(this.storePath, storeKey);
      }
    }
  }
}
