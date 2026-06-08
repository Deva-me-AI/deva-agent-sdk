import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DevaClient,
  InsufficientQuotaError,
  RateLimitError,
  InvalidRequestError,
  X402PaymentRequiredError
} from "../dist/esm/index.js";

function jsonFetch(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers }
    })) as unknown as typeof fetch;
}

test("402 insufficient_quota throws InsufficientQuotaError, not X402", async () => {
  const client = new DevaClient({
    apiKey: "deva_test",
    fetch: jsonFetch(402, { error: { type: "insufficient_quota", message: "out of credits" } })
  });
  await assert.rejects(
    () => client.embeddings.create({ model: "m", input: "hi" }),
    (err: unknown) => err instanceof InsufficientQuotaError && !(err instanceof X402PaymentRequiredError)
  );
});

test("402 with an x402 challenge still throws X402PaymentRequiredError", async () => {
  const client = new DevaClient({
    apiKey: "deva_test",
    x402: { enabled: false },
    fetch: jsonFetch(402, { error: { message: "pay" } }, {
      "x-payment-scheme": "exact",
      "x-payment-pay-to": "0xabc",
      "x-payment-amount": "1000"
    })
  });
  await assert.rejects(
    () => client.embeddings.create({ model: "m", input: "hi" }),
    (err: unknown) => err instanceof X402PaymentRequiredError
  );
});

test("429 throws RateLimitError; 400 throws InvalidRequestError", async () => {
  const rl = new DevaClient({ apiKey: "deva_test", fetch: jsonFetch(429, { error: { type: "rate_limit_error", message: "slow" } }) });
  await assert.rejects(() => rl.embeddings.create({ model: "m", input: "hi" }), (e: unknown) => e instanceof RateLimitError);

  const br = new DevaClient({ apiKey: "deva_test", fetch: jsonFetch(400, { error: { type: "invalid_request_error", message: "bad" } }) });
  await assert.rejects(() => br.embeddings.create({ model: "m", input: "hi" }), (e: unknown) => e instanceof InvalidRequestError);
});

test("402 with a challenge but a declining payer still throws X402PaymentRequiredError", async () => {
  const client = new DevaClient({
    apiKey: "deva_test",
    x402: { payer: async () => ({ paid: false }) },
    fetch: jsonFetch(402, { error: { message: "pay" } }, {
      "x-payment-scheme": "exact",
      "x-payment-pay-to": "0xabc",
      "x-payment-amount": "1000"
    })
  });
  await assert.rejects(
    () => client.embeddings.create({ model: "m", input: "hi" }),
    (err: unknown) => err instanceof X402PaymentRequiredError
  );
});
