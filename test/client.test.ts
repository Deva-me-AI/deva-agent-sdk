import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DevaClient,
  InsufficientQuotaError,
  RateLimitError,
  InvalidRequestError,
  X402PaymentRequiredError
} from "../dist/esm/index.js";

function testClient(options: ConstructorParameters<typeof DevaClient>[0]): DevaClient {
  return new DevaClient({ payoutWalletAutoBind: false, ...options });
}

function jsonFetch(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers }
    })) as unknown as typeof fetch;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestHash(method: string, url: string, body: string): Promise<{ bodySha256: string; requestHash: string }> {
  const bodySha256 = await sha256Hex(body);
  return {
    bodySha256,
    requestHash: await sha256Hex(`${method}\n${url}\n${bodySha256}`)
  };
}

interface AutoPayFetchOptions {
  amount?: string;
  network?: string;
  payTo?: string;
  challengeId?: string | ((challengeNumber: number) => string);
  requestHashOverride?: string;
  omitRequestHash?: boolean;
  fallbackRequestBinding?: boolean;
  requestPath?: string | ((url: string) => string);
  omitExpiresAt?: boolean;
  omitReplayIdentifier?: boolean;
  expiresAt?: string;
}

function walletAutoPayFetch(walletRequests: unknown[], options: AutoPayFetchOptions = {}): typeof fetch {
  let apiCalls = 0;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/v1/agents/wallet/pay")) {
      walletRequests.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ authorization: "payment-token" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    apiCalls += 1;
    if (apiCalls % 2 === 1) {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : "";
      const binding = await requestHash(method, url, body);
      const challengeNumber = Math.ceil(apiCalls / 2);
      const challenge: Record<string, string> = {
        scheme: "exact",
        network: options.network ?? "base",
        amount: options.amount ?? "1000",
        pay_to: options.payTo ?? "0xpayee"
      };

      if (!options.omitReplayIdentifier) {
        challenge.challenge_id =
          typeof options.challengeId === "function"
            ? options.challengeId(challengeNumber)
            : options.challengeId ?? `challenge-${challengeNumber}`;
      }

      if (!options.omitExpiresAt) {
        challenge.expires_at = options.expiresAt ?? "2999-01-01T00:00:00.000Z";
      }

      if (!options.omitRequestHash) {
        challenge.request_hash = options.requestHashOverride ?? binding.requestHash;
      } else if (options.fallbackRequestBinding) {
        challenge.request_method = method;
        challenge.request_path =
          typeof options.requestPath === "function" ? options.requestPath(url) : options.requestPath ?? new URL(url).pathname;
        challenge.body_sha256 = binding.bodySha256;
      }

      return new Response(JSON.stringify({ error: { message: "pay", payment_challenge: challenge } }), {
        status: 402,
        headers: { "content-type": "application/json" }
      });
    }

    assert.equal(new Headers(init?.headers).get("x-payment-authorization"), "payment-token");
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as unknown as typeof fetch;
}

interface ConcurrentAutoPayFetchOptions {
  amount?: string;
  challengeId?: string | ((challengeNumber: number) => string);
  walletDelayMs?: number;
}

function concurrentWalletAutoPayFetch(walletRequests: unknown[], options: ConcurrentAutoPayFetchOptions = {}): typeof fetch {
  let challengeNumber = 0;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/v1/agents/wallet/pay")) {
      walletRequests.push(JSON.parse(String(init?.body ?? "{}")));
      if (options.walletDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.walletDelayMs));
      }
      return new Response(JSON.stringify({ authorization: "payment-token" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (new Headers(init?.headers).get("x-payment-authorization") === "payment-token") {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    const binding = await requestHash(method, url, body);
    challengeNumber += 1;
    const challengeId =
      typeof options.challengeId === "function"
        ? options.challengeId(challengeNumber)
        : options.challengeId ?? `concurrent-${challengeNumber}`;

    return new Response(
      JSON.stringify({
        error: {
          message: "pay",
          payment_challenge: {
            scheme: "exact",
            network: "base",
            amount: options.amount ?? "1000",
            pay_to: "0xpayee",
            challenge_id: challengeId,
            expires_at: "2999-01-01T00:00:00.000Z",
            request_hash: binding.requestHash
          }
        }
      }),
      {
        status: 402,
        headers: { "content-type": "application/json" }
      }
    );
  }) as unknown as typeof fetch;
}

function assertOneAutoPaySuccess(results: PromiseSettledResult<unknown>[]): void {
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  );
  assert.equal(
    results.filter((result) => result.status === "rejected" && result.reason instanceof X402PaymentRequiredError).length,
    1
  );
}

function walletPolicy(overrides: Partial<NonNullable<ConstructorParameters<typeof DevaClient>[0]>["x402"]> = {}) {
  return {
    enabled: true,
    walletAutoPay: true,
    autoPayPolicy: {
      maxAmount: "1000",
      maxCumulativeAmount: "2000",
      allowedNetworks: ["base"],
      allowedPayees: ["0xpayee"]
    },
    ...overrides
  };
}

test("402 insufficient_quota throws InsufficientQuotaError, not X402", async () => {
  const client = testClient({
    apiKey: "deva_test",
    fetch: jsonFetch(402, { error: { type: "insufficient_quota", message: "out of credits" } })
  });
  await assert.rejects(
    () => client.embeddings.create({ model: "m", input: "hi" }),
    (err: unknown) => err instanceof InsufficientQuotaError && !(err instanceof X402PaymentRequiredError)
  );
});

test("402 with an x402 challenge still throws X402PaymentRequiredError", async () => {
  const client = testClient({
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
  const rl = testClient({ apiKey: "deva_test", fetch: jsonFetch(429, { error: { type: "rate_limit_error", message: "slow" } }) });
  await assert.rejects(() => rl.embeddings.create({ model: "m", input: "hi" }), (e: unknown) => e instanceof RateLimitError);

  const br = testClient({ apiKey: "deva_test", fetch: jsonFetch(400, { error: { type: "invalid_request_error", message: "bad" } }) });
  await assert.rejects(() => br.embeddings.create({ model: "m", input: "hi" }), (e: unknown) => e instanceof InvalidRequestError);
});

test("402 with a challenge but a declining payer still throws X402PaymentRequiredError", async () => {
  const client = testClient({
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

test("wallet auto-pay requires an explicit local policy", () => {
  assert.throws(
    () =>
      testClient({
        apiKey: "deva_test",
        x402: { walletAutoPay: true }
      }),
    /autoPayPolicy/
  );
});

test("wallet auto-pay pays only a policy-approved request-bound challenge", async () => {
  const walletRequests: unknown[] = [];
  const client = testClient({
    apiKey: "deva_test",
    x402: walletPolicy(),
    fetch: walletAutoPayFetch(walletRequests)
  });

  const response = await client.embeddings.create({ model: "m", input: "hi" });

  assert.deepEqual(response, { data: [] });
  assert.equal(walletRequests.length, 1);
  const walletRequest = walletRequests[0] as {
    challenge: { request_hash: string };
    request: { path: string; url: string; request_hash: string; body_sha256: string };
  };
  assert.equal(walletRequest.request.path, "/v1/ai/embeddings");
  assert.equal(walletRequest.request.url, "https://api.deva.me/v1/ai/embeddings");
  assert.equal(walletRequest.request.request_hash, walletRequest.challenge.request_hash);
  assert.match(walletRequest.request.body_sha256, /^[a-f0-9]{64}$/);
});

test("wallet auto-pay declines unapproved or unbound challenges", async () => {
  const cases: AutoPayFetchOptions[] = [
    { amount: "1001" },
    { network: "ethereum" },
    { payTo: "0xother" },
    { requestHashOverride: "0".repeat(64) },
    { omitRequestHash: true },
    { expiresAt: "2000-01-01T00:00:00.000Z" }
  ];

  for (const testCase of cases) {
    const walletRequests: unknown[] = [];
    const client = testClient({
      apiKey: "deva_test",
      x402: walletPolicy(),
      fetch: walletAutoPayFetch(walletRequests, testCase)
    });

    await assert.rejects(
      () => client.embeddings.create({ model: "m", input: "hi" }),
      (err: unknown) => err instanceof X402PaymentRequiredError
    );
    assert.equal(walletRequests.length, 0);
  }
});

test("wallet auto-pay fallback request path must include the query string", async () => {
  const pathnameOnlyWalletRequests: unknown[] = [];
  const pathnameOnlyClient = testClient({
    apiKey: "deva_test",
    x402: walletPolicy(),
    fetch: walletAutoPayFetch(pathnameOnlyWalletRequests, {
      omitRequestHash: true,
      fallbackRequestBinding: true,
      requestPath: "/v1/models"
    })
  });

  await assert.rejects(
    () => pathnameOnlyClient.models.list({ limit: 1 }),
    (err: unknown) => err instanceof X402PaymentRequiredError
  );
  assert.equal(pathnameOnlyWalletRequests.length, 0);

  const queryBoundWalletRequests: unknown[] = [];
  const queryBoundClient = testClient({
    apiKey: "deva_test",
    x402: walletPolicy(),
    fetch: walletAutoPayFetch(queryBoundWalletRequests, {
      omitRequestHash: true,
      fallbackRequestBinding: true,
      requestPath: (url) => {
        const parsed = new URL(url);
        return `${parsed.pathname}${parsed.search}`;
      }
    })
  });

  const response = await queryBoundClient.models.list({ limit: 1 });

  assert.deepEqual(response, { data: [] });
  assert.equal(queryBoundWalletRequests.length, 1);
  assert.equal(
    (queryBoundWalletRequests[0] as { challenge: { request_path: string } }).challenge.request_path,
    "/v1/models?limit=1"
  );
});

test("wallet auto-pay requires expiry and replay identifiers", async () => {
  const cases: AutoPayFetchOptions[] = [{ omitExpiresAt: true }, { omitReplayIdentifier: true }];

  for (const testCase of cases) {
    const walletRequests: unknown[] = [];
    const client = testClient({
      apiKey: "deva_test",
      x402: walletPolicy(),
      fetch: walletAutoPayFetch(walletRequests, testCase)
    });

    await assert.rejects(
      () => client.embeddings.create({ model: "m", input: "hi" }),
      (err: unknown) => err instanceof X402PaymentRequiredError
    );
    assert.equal(walletRequests.length, 0);
  }
});

test("wallet auto-pay enforces cumulative cap and replay guard", async () => {
  const cumulativeWalletRequests: unknown[] = [];
  const cumulativeClient = testClient({
    apiKey: "deva_test",
    x402: walletPolicy({
      autoPayPolicy: {
        maxAmount: "1000",
        maxCumulativeAmount: "1000",
        allowedNetworks: ["base"],
        allowedPayees: ["0xpayee"]
      }
    }),
    fetch: walletAutoPayFetch(cumulativeWalletRequests, {
      amount: "600",
      challengeId: (challengeNumber) => `cumulative-${challengeNumber}`
    })
  });

  await cumulativeClient.embeddings.create({ model: "m", input: "hi" });

  await assert.rejects(
    () => cumulativeClient.embeddings.create({ model: "m", input: "hi" }),
    (err: unknown) => err instanceof X402PaymentRequiredError
  );
  assert.equal(cumulativeWalletRequests.length, 1);

  const replayWalletRequests: unknown[] = [];
  const replayClient = testClient({
    apiKey: "deva_test",
    x402: walletPolicy(),
    fetch: walletAutoPayFetch(replayWalletRequests, { amount: "600", challengeId: "same-challenge" })
  });

  await replayClient.embeddings.create({ model: "m", input: "hi" });

  await assert.rejects(
    () => replayClient.embeddings.create({ model: "m", input: "hi" }),
    (err: unknown) => err instanceof X402PaymentRequiredError
  );
  assert.equal(replayWalletRequests.length, 1);
});

test("wallet auto-pay rolls back reservations when the payer declines", async () => {
  let payerCalls = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new Headers(init?.headers).get("x-payment-authorization") === "payment-token") {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    const binding = await requestHash(method, url, body);

    return new Response(
      JSON.stringify({
        error: {
          message: "pay",
          payment_challenge: {
            scheme: "exact",
            network: "base",
            amount: "600",
            pay_to: "0xpayee",
            challenge_id: "rollback-challenge",
            expires_at: "2999-01-01T00:00:00.000Z",
            request_hash: binding.requestHash
          }
        }
      }),
      {
        status: 402,
        headers: { "content-type": "application/json" }
      }
    );
  }) as unknown as typeof fetch;

  const client = testClient({
    apiKey: "deva_test",
    x402: walletPolicy({
      autoPayPolicy: {
        maxAmount: "1000",
        maxCumulativeAmount: "1000",
        allowedNetworks: ["base"],
        allowedPayees: ["0xpayee"]
      },
      payer: async () => {
        payerCalls += 1;
        return payerCalls === 1 ? { paid: false } : { paid: true, authorizationHeader: "payment-token" };
      }
    }),
    fetch: fetchImpl
  });

  await assert.rejects(
    () => client.embeddings.create({ model: "m", input: "hi" }),
    (err: unknown) => err instanceof X402PaymentRequiredError
  );
  assert.equal(payerCalls, 1);

  const response = await client.embeddings.create({ model: "m", input: "hi" });

  assert.deepEqual(response, { data: [] });
  assert.equal(payerCalls, 2);
});

test("wallet auto-pay reserves cumulative cap before awaiting the payer", async () => {
  const walletRequests: unknown[] = [];
  const client = testClient({
    apiKey: "deva_test",
    x402: walletPolicy({
      autoPayPolicy: {
        maxAmount: "1000",
        maxCumulativeAmount: "1000",
        allowedNetworks: ["base"],
        allowedPayees: ["0xpayee"]
      }
    }),
    fetch: concurrentWalletAutoPayFetch(walletRequests, {
      amount: "600",
      walletDelayMs: 25
    })
  });

  const results = await Promise.allSettled([
    client.embeddings.create({ model: "m", input: "hi" }),
    client.embeddings.create({ model: "m", input: "hi" })
  ]);

  assertOneAutoPaySuccess(results);
  assert.equal(walletRequests.length, 1);
});

test("wallet auto-pay reserves replay keys before awaiting the payer", async () => {
  const walletRequests: unknown[] = [];
  const client = testClient({
    apiKey: "deva_test",
    x402: walletPolicy(),
    fetch: concurrentWalletAutoPayFetch(walletRequests, {
      amount: "600",
      challengeId: "same-challenge",
      walletDelayMs: 25
    })
  });

  const results = await Promise.allSettled([
    client.embeddings.create({ model: "m", input: "hi" }),
    client.embeddings.create({ model: "m", input: "hi" })
  ]);

  assertOneAutoPaySuccess(results);
  assert.equal(walletRequests.length, 1);
});
