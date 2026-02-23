import { DevaError, X402PaymentRequiredError } from "./errors.js";
import { createWalletX402Payer, parseX402Challenge } from "./x402.js";
import type {
  ApiErrorPayload,
  DevaClientOptions,
  RequestOptions,
  X402Challenge,
  X402PaymentContext,
  X402PaymentResult,
  X402Payer
} from "./types.js";

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

function asApiErrorPayload(payload: unknown): ApiErrorPayload {
  if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    const err = (root.error ?? root) as Record<string, unknown>;
    return {
      code: typeof err.code === "string" ? err.code : undefined,
      message: typeof err.message === "string" ? err.message : undefined,
      details: err.details,
      balance: typeof err.balance === "number" ? err.balance : undefined,
      required: typeof err.required === "number" ? err.required : undefined
    };
  }

  return {};
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
  private apiKey?: string;

  constructor(options: DevaClientOptions = {}) {
    this.baseUrl = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
    this.apiKey = options.apiKey;

    this.x402Enabled = options.x402?.enabled !== false;
    this.x402MaxRetries = options.x402?.maxRetries ?? 1;
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
    extraHeaders: Record<string, string>
  ): Promise<boolean> {
    if (!this.x402Payer) return false;

    const result: X402PaymentResult = await this.x402Payer(challenge, context);
    if (!result.paid) return false;

    if (result.authorizationHeader) {
      extraHeaders["x-payment-authorization"] = result.authorizationHeader;
    }

    if (result.proof) {
      extraHeaders["x-payment-proof"] = result.proof;
    }

    return true;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);

    let attempt = 0;
    let waitMs = 300;
    let paymentRetries = 0;
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

        let body: BodyInit | undefined;
        if (options.body !== undefined) {
          if (isBodyInit(options.body)) {
            body = options.body;
          } else {
            headers["content-type"] = headers["content-type"] ?? "application/json";
            body = JSON.stringify(options.body);
          }
        }

        const response = await this.fetchImpl(url, {
          method: options.method,
          headers,
          body,
          signal: controller.signal
        });

        const payload = await parseBody(response);

        if (response.ok) {
          return payload as T;
        }

        const errorPayload = asApiErrorPayload(payload);
        const challenge = response.status === 402 ? parseX402Challenge(response, payload) : undefined;

        if (
          response.status === 402 &&
          challenge &&
          this.x402Enabled &&
          options.retryOn402 !== false &&
          paymentRetries < this.x402MaxRetries
        ) {
          const paid = await this.callPayer(
            challenge,
            {
              path: options.path,
              method: options.method,
              status: response.status,
              responseHeaders: response.headers
            },
            extraHeaders
          );

          if (paid) {
            paymentRetries += 1;
            continue;
          }
        }

        const normalized = {
          status: response.status,
          code: errorPayload.code,
          message: errorPayload.message ?? `HTTP ${response.status}`,
          details: errorPayload.details,
          balance: errorPayload.balance,
          required: errorPayload.required,
          paymentChallenge: challenge
        };

        if (RETRYABLE.has(response.status) && attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        if (response.status === 402) {
          throw new X402PaymentRequiredError(normalized);
        }

        throw new DevaError(normalized);
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
