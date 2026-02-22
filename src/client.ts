import { DevaError } from "./errors.js";
import type { PaymentChallenge } from "./errors.js";
import type { DevaClientOptions, RequestOptions } from "./types.js";

const DEFAULT_API_BASE = "https://api.deva.me";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE = new Set([429, 500, 502, 503]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toQueryString(query: RequestOptions["query"]): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }

  const output = params.toString();
  return output.length > 0 ? `?${output}` : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractPaymentChallenge(payload: unknown, response: Response): PaymentChallenge | undefined {
  const raw = asRecord(payload);
  const rawError = asRecord(raw?.error);
  const fromPayload = asRecord(
    rawError?.payment_challenge ??
      rawError?.paymentChallenge ??
      rawError?.challenge ??
      raw?.payment_challenge ??
      raw?.paymentChallenge ??
      raw?.challenge
  );

  const scheme =
    (typeof fromPayload?.scheme === "string" ? fromPayload.scheme : undefined) ??
    response.headers.get("x-payment-scheme") ??
    response.headers.get("payment-scheme") ??
    undefined;
  const network =
    (typeof fromPayload?.network === "string" ? fromPayload.network : undefined) ??
    response.headers.get("x-payment-network") ??
    response.headers.get("payment-network") ??
    undefined;
  const amount =
    (typeof fromPayload?.amount === "string" || typeof fromPayload?.amount === "number" ? fromPayload.amount : undefined) ??
    response.headers.get("x-payment-amount") ??
    response.headers.get("payment-amount") ??
    undefined;
  const payTo =
    (typeof fromPayload?.pay_to === "string" ? fromPayload.pay_to : undefined) ??
    (typeof fromPayload?.payTo === "string" ? fromPayload.payTo : undefined) ??
    response.headers.get("x-payment-pay-to") ??
    response.headers.get("x-payment-pay_to") ??
    response.headers.get("payment-pay-to") ??
    response.headers.get("payment-pay_to") ??
    undefined;

  if (scheme || network || amount !== undefined || payTo) {
    return { scheme, network, amount, pay_to: payTo };
  }

  return undefined;
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

export class DevaHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private apiKey?: string;

  constructor(options: DevaClientOptions = {}) {
    this.baseUrl = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
    this.apiKey = options.apiKey;
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

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);

    let attempt = 0;
    let waitMs = 300;

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);

      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          ...options.headers
        };

        if (options.requiresAuth !== false) {
          if (!this.apiKey) {
            throw new DevaError({ message: "No API key configured. Pass apiKey when creating DevaClient." });
          }
          headers.authorization = `Bearer ${this.apiKey}`;
        }

        const response = await this.fetchImpl(url, {
          method: options.method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal
        });

        const payload = await parseBody(response);

        if (response.ok) {
          return payload as T;
        }

        const normalized = payload as {
          error?: {
            code?: string;
            message?: string;
            details?: unknown;
            balance?: number;
            required?: number;
          };
          code?: string;
          message?: string;
          details?: unknown;
          balance?: number;
          required?: number;
        };

        const code = normalized.error?.code ?? normalized.code;
        const message = normalized.error?.message ?? normalized.message ?? `HTTP ${response.status}`;
        const details = normalized.error?.details ?? normalized.details;
        const balance = normalized.error?.balance ?? normalized.balance;
        const required = normalized.error?.required ?? normalized.required;
        const paymentChallenge = response.status === 402 ? extractPaymentChallenge(payload, response) : undefined;

        const error = new DevaError({
          status: response.status,
          code,
          message,
          details,
          balance,
          required,
          paymentChallenge
        });

        if (RETRYABLE.has(response.status) && attempt < 3) {
          await sleep(waitMs);
          attempt += 1;
          waitMs *= 2;
          continue;
        }

        throw error;
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

    if (!headers.has("content-type") && init?.body) {
      headers.set("content-type", "application/json");
    }

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
