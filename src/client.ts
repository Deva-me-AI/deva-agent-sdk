import { DevaError, X402PaymentRequiredError, classifyError, normalizeErrorEnvelope } from "./errors.js";
import {
  addX402Amounts,
  createWalletX402Payer,
  formatX402Amount,
  normalizeX402AutoPayPolicy,
  parseX402Challenge,
  validateX402AutoPay,
  zeroX402Amount
} from "./x402.js";
import type {
  DevaClientOptions,
  RequestOptions,
  X402Challenge,
  X402PaymentContext,
  X402PaymentResult,
  X402Payer
} from "./types.js";
import type { NormalizedX402AutoPayPolicy, X402Amount } from "./x402.js";

const DEFAULT_API_BASE = "https://api.deva.me";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toQueryString(query: RequestOptions["query"]): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }

  const output = params.toString();
  return output.length > 0 ? `?${output}` : "";
}

function isBodyInit(value: unknown): value is BodyInit {
  if (!value) return false;
  if (typeof value === "string") return true;
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return true;
  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(value)) return true;
  return false;
}

interface PreparedBody {
  body?: BodyInit;
  contentType?: string;
  bodySha256?: string;
  requestHash?: string;
}

function bytesFromString(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesFromBufferSource(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);

  const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

async function sha256Hex(value: Uint8Array): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;

  const bytes = new Uint8Array(value.byteLength);
  bytes.set(value);
  const digest = await subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashBody(body: BodyInit | undefined): Promise<string | undefined> {
  if (body === undefined) return sha256Hex(bytesFromString(""));
  if (typeof body === "string") return sha256Hex(bytesFromString(body));
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return sha256Hex(bytesFromString(body.toString()));
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return sha256Hex(new Uint8Array(await body.arrayBuffer()));
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return sha256Hex(bytesFromBufferSource(body));
  }

  return undefined;
}

async function prepareBody(bodyInput: unknown, method: RequestOptions["method"], url: string): Promise<PreparedBody> {
  let body: BodyInit | undefined;
  let contentType: string | undefined;

  if (bodyInput !== undefined) {
    if (isBodyInit(bodyInput)) {
      body = bodyInput;
    } else {
      contentType = "application/json";
      body = JSON.stringify(bodyInput);
    }
  }

  const bodySha256 = await hashBody(body);
  const requestHash = bodySha256 ? await sha256Hex(bytesFromString(`${method}\n${url}\n${bodySha256}`)) : undefined;

  return {
    body,
    contentType,
    bodySha256,
    requestHash
  };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

/** Low-level HTTP transport for Deva APIs with retries, auth and x402 support. */
export class DevaHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly x402Enabled: boolean;
  private readonly x402MaxRetries: number;
  private readonly x402Payer?: X402Payer;
  private readonly x402AutoPayPolicy?: NormalizedX402AutoPayPolicy;
  private x402CumulativeSpent: X402Amount = zeroX402Amount();
  private readonly x402PaidChallengeKeys = new Set<string>();
  private apiKey?: string;

  constructor(options: DevaClientOptions = {}) {
    this.baseUrl = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
    this.apiKey = options.apiKey;

    this.x402Enabled = options.x402?.enabled !== false;
    this.x402MaxRetries = options.x402?.maxRetries ?? 1;
    if (options.x402?.walletAutoPay && !options.x402.autoPayPolicy) {
      throw new DevaError({
        message:
          "walletAutoPay requires x402.autoPayPolicy with maxAmount, maxCumulativeAmount, allowedNetworks, and allowedPayees."
      });
    }
    this.x402AutoPayPolicy = options.x402?.autoPayPolicy ? normalizeX402AutoPayPolicy(options.x402.autoPayPolicy) : undefined;
    this.x402Payer =
      options.x402?.payer ??
      (options.x402?.walletAutoPay
        ? createWalletX402Payer(
            this.fetchImpl,
            this.baseUrl,
            () => this.apiKey,
            options.x402?.walletPayPath ?? "/v1/agents/wallet/pay"
          )
        : undefined);
  }

  setApiKey(apiKey: string | undefined): void {
    this.apiKey = apiKey;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  buildUrl(path: string, query?: RequestOptions["query"]): string {
    return `${this.baseUrl}${path}${toQueryString(query)}`;
  }

  private async callPayer(
    challenge: X402Challenge,
    context: X402PaymentContext,
    extraHeaders: Record<string, string>,
    requestSpent: X402Amount
  ): Promise<{ paid: boolean; amount?: X402Amount }> {
    if (!this.x402Payer) return { paid: false };

    let paidAmount: X402Amount | undefined;
    let replayKey: string | undefined;

    if (this.x402AutoPayPolicy) {
      const validation = validateX402AutoPay(
        challenge,
        context,
        this.x402AutoPayPolicy,
        requestSpent,
        this.x402CumulativeSpent,
        this.x402PaidChallengeKeys
      );
      if (!validation.allowed) return { paid: false };

      paidAmount = validation.amount;
      replayKey = validation.replayKey;
    }

    const result: X402PaymentResult = await this.x402Payer(challenge, context);
    if (!result.paid) return { paid: false };

    if (result.authorizationHeader) {
      extraHeaders["x-payment-authorization"] = result.authorizationHeader;
    }

    if (result.proof) {
      extraHeaders["x-payment-proof"] = result.proof;
    }

    if (paidAmount) {
      this.x402CumulativeSpent = addX402Amounts(this.x402CumulativeSpent, paidAmount);
    }

    if (replayKey) {
      this.x402PaidChallengeKeys.add(replayKey);
    }

    return { paid: true, amount: paidAmount };
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const preparedBody = await prepareBody(options.body, options.method, url);

    let attempt = 0;
    let waitMs = 300;
    let paymentRetries = 0;
    let requestSpent = zeroX402Amount();
    const extraHeaders: Record<string, string> = {};

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);

      try {
        const headers: Record<string, string> = {
          ...options.headers,
          ...extraHeaders
        };

        if (options.requiresAuth !== false) {
          if (!this.apiKey) {
            throw new DevaError({ message: "No API key configured. Pass apiKey when creating DevaClient." });
          }
          headers.authorization = `Bearer ${this.apiKey}`;
        }

        if (preparedBody.contentType) {
          headers["content-type"] = headers["content-type"] ?? preparedBody.contentType;
        }

        const response = await this.fetchImpl(url, {
          method: options.method,
          headers,
          body: preparedBody.body,
          signal: controller.signal
        });

        const payload = await parseBody(response);

        if (response.ok) {
          return payload as T;
        }

        const challenge = response.status === 402 ? parseX402Challenge(response, payload) : undefined;

        if (
          response.status === 402 &&
          challenge &&
          this.x402Enabled &&
          options.retryOn402 !== false &&
          paymentRetries < this.x402MaxRetries
        ) {
          const payment = await this.callPayer(
            challenge,
            {
              path: options.path,
              url,
              method: options.method,
              status: response.status,
              bodySha256: preparedBody.bodySha256,
              bodyHashAlgorithm: preparedBody.bodySha256 ? "sha-256" : undefined,
              requestHash: preparedBody.requestHash,
              requestHashAlgorithm: preparedBody.requestHash ? "sha-256" : undefined,
              autoPayAttempt: paymentRetries + 1,
              autoPaySpent: formatX402Amount(requestSpent),
              responseHeaders: response.headers
            },
            extraHeaders,
            requestSpent
          );

          if (payment.paid) {
            if (payment.amount) {
              requestSpent = addX402Amounts(requestSpent, payment.amount);
            }
            paymentRetries += 1;
            continue;
          }
        }

        const normalized = normalizeErrorEnvelope(response.status, payload);
        normalized.paymentChallenge = challenge;

        if (RETRYABLE.has(response.status) && attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        if (response.status === 402 && challenge) {
          throw new X402PaymentRequiredError(normalized);
        }

        throw classifyError(normalized);
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";

        if (isAbort && attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        if (error instanceof DevaError) {
          throw error;
        }

        if (attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        throw new DevaError({ message: error instanceof Error ? error.message : "HTTP request failed" });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  async rawFetch(path: string, init?: RequestInit, query?: RequestOptions["query"]): Promise<Response> {
    const url = this.buildUrl(path, query);
    const headers = new Headers(init?.headers ?? {});

    if (!headers.has("authorization")) {
      if (!this.apiKey) {
        throw new DevaError({ message: "No API key configured. Pass apiKey when creating DevaClient." });
      }
      headers.set("authorization", `Bearer ${this.apiKey}`);
    }

    return this.fetchImpl(url, {
      ...init,
      headers
    });
  }
}
