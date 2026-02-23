import type { X402Challenge } from "./types.js";

export interface NormalizedErrorData {
  status?: number;
  code?: string;
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
  public readonly details?: unknown;
  public readonly balance?: number;
  public readonly required?: number;
  public readonly paymentChallenge?: X402Challenge;

  constructor(data: NormalizedErrorData) {
    super(data.message);
    this.name = "DevaError";
    this.status = data.status;
    this.code = data.code;
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

/** Normalizes unknown exceptions into DevaError instances. */
export function normalizeError(error: unknown): DevaError {
  if (error instanceof DevaError) return error;
  if (error instanceof Error) return new DevaError({ message: error.message });
  return new DevaError({ message: "Unknown error" });
}
