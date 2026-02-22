export interface PaymentChallenge {
  scheme?: string;
  network?: string;
  amount?: string | number;
  pay_to?: string;
}

export interface NormalizedErrorData {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
  balance?: number;
  required?: number;
  paymentChallenge?: PaymentChallenge;
}

export class DevaError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly details?: unknown;
  public readonly balance?: number;
  public readonly required?: number;
  public readonly paymentChallenge?: PaymentChallenge;

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

export function normalizeError(error: unknown): DevaError {
  if (error instanceof DevaError) return error;
  if (error instanceof Error) return new DevaError({ message: error.message });
  return new DevaError({ message: "Unknown error" });
}
