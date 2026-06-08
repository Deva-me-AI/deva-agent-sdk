import type { X402Challenge } from "./types.js";

export interface NormalizedErrorData {
  status?: number;
  code?: string;
  type?: string;
  message: string;
  details?: unknown;
  balance?: number;
  required?: number;
  paymentChallenge?: X402Challenge;
}

/** Error type thrown for non-2xx API responses and transport failures. */
export class DevaError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly type?: string;
  public readonly details?: unknown;
  public readonly balance?: number;
  public readonly required?: number;
  public readonly paymentChallenge?: X402Challenge;

  constructor(data: NormalizedErrorData) {
    super(data.message);
    this.name = "DevaError";
    this.status = data.status;
    this.code = data.code;
    this.type = data.type;
    this.details = data.details;
    this.balance = data.balance;
    this.required = data.required;
    this.paymentChallenge = data.paymentChallenge;
  }
}

/** Specialized error used when an x402 payment challenge is returned. */
export class X402PaymentRequiredError extends DevaError {
  constructor(data: NormalizedErrorData) {
    super(data);
    this.name = "X402PaymentRequiredError";
  }
}

/** Out of karma / quota exhausted (HTTP 402 `insufficient_quota`). */
export class InsufficientQuotaError extends DevaError {
  constructor(data: NormalizedErrorData) {
    super(data);
    this.name = "InsufficientQuotaError";
  }
}

/** Rate limited (HTTP 429). */
export class RateLimitError extends DevaError {
  constructor(data: NormalizedErrorData) {
    super(data);
    this.name = "RateLimitError";
  }
}

/** Invalid request (HTTP 400). */
export class InvalidRequestError extends DevaError {
  constructor(data: NormalizedErrorData) {
    super(data);
    this.name = "InvalidRequestError";
  }
}

/** Authentication failed / invalid API key (HTTP 401). */
export class AuthenticationError extends DevaError {
  constructor(data: NormalizedErrorData) {
    super(data);
    this.name = "AuthenticationError";
  }
}

/** Forbidden (HTTP 403). */
export class PermissionError extends DevaError {
  constructor(data: NormalizedErrorData) {
    super(data);
    this.name = "PermissionError";
  }
}

/** Upstream/server error (HTTP 5xx). */
export class ServerError extends DevaError {
  constructor(data: NormalizedErrorData) {
    super(data);
    this.name = "ServerError";
  }
}

/** Parses the OpenAI-compatible `{error:{message,type,code,...}}` envelope into NormalizedErrorData. */
export function normalizeErrorEnvelope(status: number, body: unknown): NormalizedErrorData {
  let code: string | undefined;
  let message: string | undefined;
  let type: string | undefined;
  let details: unknown;
  let balance: number | undefined;
  let required: number | undefined;

  if (body && typeof body === "object") {
    const root = body as Record<string, unknown>;
    const err = (root.error ?? root) as Record<string, unknown>;
    code = typeof err.code === "string" ? err.code : undefined;
    message = typeof err.message === "string" ? err.message : undefined;
    type = typeof err.type === "string" ? err.type : undefined;
    details = err.details;
    balance = typeof err.balance === "number" ? err.balance : undefined;
    required = typeof err.required === "number" ? err.required : undefined;
  }

  return {
    status,
    code,
    type,
    message: message ?? `HTTP ${status}`,
    details,
    balance,
    required
  };
}

/** Maps a NormalizedErrorData to a typed DevaError subclass (by `type`, then by `status`). */
export function classifyError(data: NormalizedErrorData): DevaError {
  switch (data.type) {
    case "insufficient_quota":
      return new InsufficientQuotaError(data);
    case "rate_limit_error":
      return new RateLimitError(data);
    case "invalid_request_error":
      return new InvalidRequestError(data);
    case "invalid_api_key":
      return new AuthenticationError(data);
    case "permission_error":
      return new PermissionError(data);
    case "server_error":
      return new ServerError(data);
    default:
      break;
  }

  switch (data.status) {
    case 402:
      return new InsufficientQuotaError(data);
    case 429:
      return new RateLimitError(data);
    case 400:
      return new InvalidRequestError(data);
    case 401:
      return new AuthenticationError(data);
    case 403:
      return new PermissionError(data);
    default:
      break;
  }

  if (typeof data.status === "number" && data.status >= 500) {
    return new ServerError(data);
  }

  return new DevaError(data);
}

/** Builds a typed DevaError from a raw (status, body) pair — used by the streaming/rawFetch paths. */
export function errorFromResponse(status: number, body: unknown): DevaError {
  return classifyError(normalizeErrorEnvelope(status, body));
}

/** Normalizes unknown exceptions into DevaError instances. */
export function normalizeError(error: unknown): DevaError {
  if (error instanceof DevaError) return error;
  if (error instanceof Error) return new DevaError({ message: error.message });
  return new DevaError({ message: "Unknown error" });
}
