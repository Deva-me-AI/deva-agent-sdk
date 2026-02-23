import { DevaError } from "./errors.js";
import type {
  JsonObject,
  JsonValue,
  X402Challenge,
  X402PaymentContext,
  X402PaymentResult,
  X402Payer
} from "./types.js";

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" ? (value as JsonObject) : undefined;
}

function readTextHeader(headers: Headers, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = headers.get(key);
    if (value) return value;
  }
  return undefined;
}

function getNestedObject(source: JsonObject | undefined, keys: string[]): JsonObject | undefined {
  if (!source) return undefined;

  for (const key of keys) {
    const candidate = asObject(source[key]);
    if (candidate) return candidate;
  }

  return undefined;
}

/**
 * Extracts x402 challenge details from response headers and response body.
 */
export function parseX402Challenge(response: Response, payload?: unknown): X402Challenge | undefined {
  const root = asObject(payload);
  const error = getNestedObject(root, ["error"]);
  const embedded =
    getNestedObject(error, ["payment_challenge", "paymentChallenge", "challenge", "x402"]) ??
    getNestedObject(root, ["payment_challenge", "paymentChallenge", "challenge", "x402"]);

  const challenge: X402Challenge = {
    scheme:
      (typeof embedded?.scheme === "string" ? embedded.scheme : undefined) ??
      readTextHeader(response.headers, ["x-payment-scheme", "payment-scheme"]),
    network:
      (typeof embedded?.network === "string" ? embedded.network : undefined) ??
      readTextHeader(response.headers, ["x-payment-network", "payment-network"]),
    amount:
      (typeof embedded?.amount === "string" || typeof embedded?.amount === "number" ? embedded.amount : undefined) ??
      readTextHeader(response.headers, ["x-payment-amount", "payment-amount"]),
    pay_to:
      (typeof embedded?.pay_to === "string" ? embedded.pay_to : undefined) ??
      (typeof embedded?.payTo === "string" ? embedded.payTo : undefined) ??
      readTextHeader(response.headers, ["x-payment-pay-to", "x-payment-pay_to", "payment-pay-to", "payment-pay_to"]),
    memo:
      (typeof embedded?.memo === "string" ? embedded.memo : undefined) ??
      readTextHeader(response.headers, ["x-payment-memo", "payment-memo"]),
    token:
      (typeof embedded?.token === "string" ? embedded.token : undefined) ??
      readTextHeader(response.headers, ["x-payment-token", "payment-token", "www-authenticate"]),
    challenge_id:
      (typeof embedded?.challenge_id === "string" ? embedded.challenge_id : undefined) ??
      (typeof embedded?.challengeId === "string" ? embedded.challengeId : undefined) ??
      readTextHeader(response.headers, ["x-payment-challenge-id", "payment-challenge-id"]),
    expires_at:
      (typeof embedded?.expires_at === "string" ? embedded.expires_at : undefined) ??
      (typeof embedded?.expiresAt === "string" ? embedded.expiresAt : undefined) ??
      readTextHeader(response.headers, ["x-payment-expires-at", "payment-expires-at"]),
    raw: embedded ?? root
  };

  if (
    challenge.scheme ||
    challenge.network ||
    challenge.amount !== undefined ||
    challenge.pay_to ||
    challenge.token ||
    challenge.challenge_id
  ) {
    return challenge;
  }

  return undefined;
}

/**
 * Creates a built-in wallet-backed x402 payer that calls a Deva wallet pay endpoint.
 */
export function createWalletX402Payer(
  fetchImpl: typeof fetch,
  apiBase: string,
  apiKeyGetter: () => string | undefined,
  payPath = "/v1/agents/wallet/pay"
): X402Payer {
  return async (challenge: X402Challenge, context: X402PaymentContext): Promise<X402PaymentResult> => {
    const apiKey = apiKeyGetter();
    if (!apiKey) {
      throw new DevaError({ message: "Cannot auto-pay x402 challenge: missing API key." });
    }

    const response = await fetchImpl(`${apiBase}${payPath}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ challenge, request: context })
    });

    const text = await response.text();
    let payload: JsonObject | undefined;
    if (text) {
      try {
        payload = JSON.parse(text) as JsonObject;
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      throw new DevaError({
        status: response.status,
        message: (typeof payload?.message === "string" ? payload.message : undefined) ?? "Wallet auto-pay failed.",
        details: payload
      });
    }

    const proof = typeof payload?.proof === "string" ? payload.proof : undefined;
    const authorizationHeader =
      (typeof payload?.authorization === "string" ? payload.authorization : undefined) ??
      (typeof payload?.payment_authorization === "string" ? payload.payment_authorization : undefined) ??
      (typeof payload?.paymentAuthorization === "string" ? payload.paymentAuthorization : undefined);

    return {
      paid: true,
      authorizationHeader,
      proof,
      metadata: payload as Record<string, JsonValue>
    };
  };
}
