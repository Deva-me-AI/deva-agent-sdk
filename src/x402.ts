import { DevaError } from "./errors.js";
import type {
  JsonObject,
  JsonValue,
  X402AutoPayPolicy,
  X402Challenge,
  X402PaymentContext,
  X402PaymentResult,
  X402Payer
} from "./types.js";

export interface X402Amount {
  units: bigint;
  scale: number;
}

export interface NormalizedX402AutoPayPolicy {
  maxAmount: X402Amount;
  maxCumulativeAmount: X402Amount;
  allowedNetworks: ReadonlySet<string>;
  allowedPayees: ReadonlySet<string>;
  allowedSchemes: ReadonlySet<string>;
}

export interface X402AutoPayValidationResult {
  allowed: boolean;
  amount?: X402Amount;
  replayKey?: string;
  reason?: string;
}

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

function readString(source: JsonObject | undefined, keys: string[]): string | undefined {
  if (!source) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
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
  const requestBinding =
    getNestedObject(embedded, ["request", "request_binding", "requestBinding"]) ??
    getNestedObject(root, ["request", "request_binding", "requestBinding"]);

  const challenge: X402Challenge = {
    scheme: readString(embedded, ["scheme"]) ?? readTextHeader(response.headers, ["x-payment-scheme", "payment-scheme"]),
    network: readString(embedded, ["network"]) ?? readTextHeader(response.headers, ["x-payment-network", "payment-network"]),
    amount:
      (typeof embedded?.amount === "string" || typeof embedded?.amount === "number" ? embedded.amount : undefined) ??
      readTextHeader(response.headers, ["x-payment-amount", "payment-amount"]),
    pay_to:
      readString(embedded, ["pay_to", "payTo", "payee"]) ??
      readTextHeader(response.headers, ["x-payment-pay-to", "x-payment-pay_to", "payment-pay-to", "payment-pay_to"]),
    memo: readString(embedded, ["memo"]) ?? readTextHeader(response.headers, ["x-payment-memo", "payment-memo"]),
    token: readString(embedded, ["token"]) ?? readTextHeader(response.headers, ["x-payment-token", "payment-token", "www-authenticate"]),
    challenge_id:
      readString(embedded, ["challenge_id", "challengeId"]) ??
      readTextHeader(response.headers, ["x-payment-challenge-id", "payment-challenge-id"]),
    expires_at:
      readString(embedded, ["expires_at", "expiresAt"]) ??
      readTextHeader(response.headers, ["x-payment-expires-at", "payment-expires-at"]),
    request_hash:
      readString(embedded, ["request_hash", "requestHash"]) ??
      readString(requestBinding, ["hash", "request_hash", "requestHash"]) ??
      readTextHeader(response.headers, ["x-payment-request-hash", "payment-request-hash"]),
    request_method:
      readString(embedded, ["request_method", "requestMethod"]) ??
      readString(requestBinding, ["method", "request_method", "requestMethod"]) ??
      readTextHeader(response.headers, ["x-payment-request-method", "payment-request-method"]),
    request_path:
      readString(embedded, ["request_path", "requestPath"]) ??
      readString(requestBinding, ["path", "request_path", "requestPath"]) ??
      readTextHeader(response.headers, ["x-payment-request-path", "payment-request-path"]),
    request_url:
      readString(embedded, ["request_url", "requestUrl"]) ??
      readString(requestBinding, ["url", "request_url", "requestUrl"]) ??
      readTextHeader(response.headers, ["x-payment-request-url", "payment-request-url"]),
    body_sha256:
      readString(embedded, ["body_sha256", "bodySha256", "body_hash", "bodyHash"]) ??
      readString(requestBinding, ["body_sha256", "bodySha256", "body_hash", "bodyHash"]) ??
      readTextHeader(response.headers, ["x-payment-body-sha256", "payment-body-sha256", "x-payment-body-hash", "payment-body-hash"]),
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

function amountString(value: string | number): string | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return String(value);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseX402Amount(value: string | number | undefined): X402Amount | undefined {
  if (value === undefined) return undefined;

  const text = amountString(value);
  if (!text || !/^\d+(?:\.\d+)?$/.test(text)) return undefined;

  const [whole, fraction = ""] = text.split(".");
  return {
    units: BigInt(`${whole}${fraction}`),
    scale: fraction.length
  };
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function alignAmount(amount: X402Amount, scale: number): bigint {
  return amount.units * pow10(scale - amount.scale);
}

export function compareX402Amounts(left: X402Amount, right: X402Amount): number {
  const scale = Math.max(left.scale, right.scale);
  const alignedLeft = alignAmount(left, scale);
  const alignedRight = alignAmount(right, scale);
  if (alignedLeft < alignedRight) return -1;
  if (alignedLeft > alignedRight) return 1;
  return 0;
}

export function addX402Amounts(left: X402Amount, right: X402Amount): X402Amount {
  const scale = Math.max(left.scale, right.scale);
  return {
    units: alignAmount(left, scale) + alignAmount(right, scale),
    scale
  };
}

export function zeroX402Amount(): X402Amount {
  return { units: 0n, scale: 0 };
}

export function formatX402Amount(amount: X402Amount): string {
  const raw = amount.units.toString().padStart(amount.scale + 1, "0");
  if (amount.scale === 0) return raw;

  const whole = raw.slice(0, -amount.scale) || "0";
  const fraction = raw.slice(-amount.scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function normalizeRequiredList(name: string, values: readonly string[] | undefined, lower = false): string[] {
  const normalized = (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
  if (normalized.length === 0) {
    throw new DevaError({ message: `x402 auto-pay policy requires at least one ${name}.` });
  }
  return lower ? normalized.map((value) => value.toLowerCase()) : normalized;
}

export function normalizeX402AutoPayPolicy(policy: X402AutoPayPolicy | undefined): NormalizedX402AutoPayPolicy {
  if (!policy) {
    throw new DevaError({
      message:
        "walletAutoPay requires x402.autoPayPolicy with maxAmount, maxCumulativeAmount, allowedNetworks, and allowedPayees."
    });
  }

  const maxAmount = parseX402Amount(policy.maxAmount);
  const maxCumulativeAmount = parseX402Amount(policy.maxCumulativeAmount);

  if (!maxAmount) {
    throw new DevaError({ message: "x402 auto-pay policy maxAmount must be a non-negative decimal amount string or number." });
  }

  if (!maxCumulativeAmount) {
    throw new DevaError({
      message: "x402 auto-pay policy maxCumulativeAmount must be a non-negative decimal amount string or number."
    });
  }

  return {
    maxAmount,
    maxCumulativeAmount,
    allowedNetworks: new Set(normalizeRequiredList("allowed network", policy.allowedNetworks, true)),
    allowedPayees: new Set(normalizeRequiredList("allowed payee", policy.allowedPayees)),
    allowedSchemes: new Set(normalizeRequiredList("allowed scheme", policy.allowedSchemes ?? ["exact"], true))
  };
}

function normalizeHash(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && /^[a-f0-9]{64}$/.test(trimmed) ? trimmed : undefined;
}

function requestPathFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return undefined;
  }
}

function requestBindingError(challenge: X402Challenge, context: X402PaymentContext): string | undefined {
  const contextRequestHash = normalizeHash(context.requestHash);
  const challengeRequestHash = normalizeHash(challenge.request_hash);

  if (challengeRequestHash) {
    return challengeRequestHash === contextRequestHash ? undefined : "x402 challenge request hash does not match this request.";
  }

  const method = challenge.request_method?.trim().toUpperCase();
  const url = challenge.request_url?.trim();
  const path = challenge.request_path?.trim();
  const bodySha256 = normalizeHash(challenge.body_sha256);
  const contextBodySha256 = normalizeHash(context.bodySha256);
  const contextPathWithQuery = requestPathFromUrl(context.url);

  const methodMatches = method !== undefined && method === context.method;
  const targetMatches =
    (url !== undefined && url === context.url) ||
    (path !== undefined && (path === context.path || path === contextPathWithQuery));
  const bodyMatches = bodySha256 !== undefined && bodySha256 === contextBodySha256;

  if (methodMatches && targetMatches && bodyMatches) return undefined;

  return "x402 challenge is not bound to this request.";
}

export function getX402ChallengeReplayKey(challenge: X402Challenge): string | undefined {
  if (challenge.challenge_id) return `challenge_id:${challenge.challenge_id}`;
  if (challenge.token) return `token:${challenge.token}`;
  return undefined;
}

export function validateX402AutoPay(
  challenge: X402Challenge,
  context: X402PaymentContext,
  policy: NormalizedX402AutoPayPolicy,
  requestSpent: X402Amount,
  cumulativeSpent: X402Amount,
  paidChallengeKeys: ReadonlySet<string>
): X402AutoPayValidationResult {
  const amount = parseX402Amount(challenge.amount);
  if (!amount) return { allowed: false, reason: "x402 challenge amount is missing or invalid." };

  const scheme = challenge.scheme?.trim().toLowerCase();
  if (!scheme || !policy.allowedSchemes.has(scheme)) {
    return { allowed: false, amount, reason: "x402 challenge scheme is not approved for auto-pay." };
  }

  const network = challenge.network?.trim().toLowerCase();
  if (!network || !policy.allowedNetworks.has(network)) {
    return { allowed: false, amount, reason: "x402 challenge network is not approved for auto-pay." };
  }

  const payee = challenge.pay_to?.trim();
  if (!payee || !policy.allowedPayees.has(payee)) {
    return { allowed: false, amount, reason: "x402 challenge payee is not approved for auto-pay." };
  }

  const requestTotal = addX402Amounts(requestSpent, amount);
  if (compareX402Amounts(requestTotal, policy.maxAmount) > 0) {
    return { allowed: false, amount, reason: "x402 challenge exceeds the per-call auto-pay cap." };
  }

  const cumulativeTotal = addX402Amounts(cumulativeSpent, amount);
  if (compareX402Amounts(cumulativeTotal, policy.maxCumulativeAmount) > 0) {
    return { allowed: false, amount, reason: "x402 challenge exceeds the cumulative auto-pay cap." };
  }

  if (challenge.expires_at) {
    const expiresAt = Date.parse(challenge.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { allowed: false, amount, reason: "x402 challenge is expired." };
    }
  }

  const replayKey = getX402ChallengeReplayKey(challenge);
  if (replayKey && paidChallengeKeys.has(replayKey)) {
    return { allowed: false, amount, replayKey, reason: "x402 challenge was already paid by this client." };
  }

  const bindingError = requestBindingError(challenge, context);
  if (bindingError) return { allowed: false, amount, replayKey, reason: bindingError };

  return { allowed: true, amount, replayKey };
}

function serializePaymentContext(context: X402PaymentContext): JsonObject {
  return {
    path: context.path,
    url: context.url ?? null,
    method: context.method,
    status: context.status,
    body_sha256: context.bodySha256 ?? null,
    body_hash_algorithm: context.bodyHashAlgorithm ?? null,
    request_hash: context.requestHash ?? null,
    request_hash_algorithm: context.requestHashAlgorithm ?? null,
    auto_pay_attempt: context.autoPayAttempt ?? null,
    auto_pay_spent: context.autoPaySpent ?? null
  };
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
      body: JSON.stringify({ challenge, request: serializePaymentContext(context) })
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
