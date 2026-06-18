import { existsSync } from "node:fs";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import { DevaClient, generatePayoutWallet } from "../dist/esm/index.js";

const API_BASE = "http://platform.test";
const BOUND_AT = "2026-06-18T00:00:00.000Z";
let keyCounter = 0;

interface MockCall {
  url: string;
  path: string;
  method: string;
  authorization: string | null;
  body?: unknown;
}

interface PayoutFlowOptions {
  initialPubkey?: string | null;
  registrationApiKey?: string;
  getDelayMs?: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string" || !body) return undefined;
  return JSON.parse(body) as unknown;
}

function uniqueApiKey(label: string): string {
  keyCounter += 1;
  return `deva_lazy_${label}_${process.pid}_${keyCounter}`;
}

async function tempStorePath(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `deva-${label}-`));
  return join(dir, "payout-wallet.json");
}

async function readOnlyStoredWallet(storePath: string): Promise<{ text: string; wallet: Record<string, string> }> {
  const text = await readFile(storePath, "utf8");
  const parsed = JSON.parse(text) as { wallets?: Record<string, Record<string, string>> };
  const entries = Object.values(parsed.wallets ?? {});
  assert.equal(entries.length, 1);
  return { text, wallet: entries[0] };
}

function createPayoutFlowFetch(options: PayoutFlowOptions = {}): { fetch: typeof fetch; calls: MockCall[] } {
  const calls: MockCall[] = [];
  let boundPubkey = options.initialPubkey ?? null;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = parseJsonBody(init?.body);
    const headers = new Headers(init?.headers);

    calls.push({
      url: String(input),
      path: url.pathname,
      method,
      authorization: headers.get("authorization"),
      body
    });

    if (url.pathname === "/agents/register" && method === "POST") {
      return jsonResponse({
        success: true,
        agent: {
          id: "a1",
          name: "lazy_agent",
          api_key: options.registrationApiKey ?? uniqueApiKey("registered")
        }
      });
    }

    if (url.pathname === "/api/v1/agent/payout-wallet" && method === "GET") {
      if (options.getDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.getDelayMs));
      }

      return jsonResponse({
        payout_pubkey: boundPubkey,
        bound_at: boundPubkey ? BOUND_AT : null
      });
    }

    if (url.pathname === "/api/v1/agent/payout-wallet/bind" && method === "POST") {
      const bindBody = body as { payout_pubkey?: string };
      const requestedPubkey = bindBody.payout_pubkey;
      assert.deepEqual(Object.keys(bindBody), ["payout_pubkey"]);
      assert.equal(typeof requestedPubkey, "string");

      const alreadyBound = Boolean(boundPubkey);
      if (!boundPubkey) boundPubkey = requestedPubkey ?? null;

      return jsonResponse({
        payout_pubkey: boundPubkey,
        bound_at: BOUND_AT,
        already_bound: alreadyBound
      });
    }

    return jsonResponse({
      object: "list",
      data: [],
      path: url.pathname,
      query: url.search
    });
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, calls };
}

function callsFor(calls: MockCall[], path: string, method?: string): MockCall[] {
  return calls.filter((call) => call.path === path && (!method || call.method === method));
}

test("first authenticated API call generates, stores, binds, and caches a payout wallet", async () => {
  const apiKey = uniqueApiKey("generated");
  const storePath = await tempStorePath("generated");
  const flow = createPayoutFlowFetch();
  const client = new DevaClient({
    apiBase: API_BASE,
    apiKey,
    fetch: flow.fetch,
    payoutWalletStorePath: storePath
  });

  await client.models.list();
  await client.models.list({ limit: 1 });

  const statusCalls = callsFor(flow.calls, "/api/v1/agent/payout-wallet", "GET");
  const bindCalls = callsFor(flow.calls, "/api/v1/agent/payout-wallet/bind", "POST");
  const resourceCalls = callsFor(flow.calls, "/v1/models", "GET");

  assert.equal(statusCalls.length, 1);
  assert.equal(bindCalls.length, 1);
  assert.equal(resourceCalls.length, 2);
  assert.equal(statusCalls[0].authorization, `Bearer ${apiKey}`);
  assert.equal(bindCalls[0].authorization, `Bearer ${apiKey}`);

  const bindBody = bindCalls[0].body as { payout_pubkey: string };
  assert.deepEqual(Object.keys(bindBody), ["payout_pubkey"]);
  assert.equal(bs58.decode(bindBody.payout_pubkey).length, 32);

  const stored = await readOnlyStoredWallet(storePath);
  assert.equal(stored.wallet.pubkey, bindBody.payout_pubkey);
  assert.equal(bs58.decode(stored.wallet.secret).length, 64);
  assert.equal(stored.text.includes(apiKey), false);
  assert.equal((await stat(storePath)).mode & 0o777, 0o600);
});

test("already-bound payout wallets skip POST, local generation, and repeat checks", async () => {
  const apiKey = uniqueApiKey("already-bound");
  const storePath = await tempStorePath("already-bound");
  const existing = generatePayoutWallet().pubkey;
  const flow = createPayoutFlowFetch({ initialPubkey: existing });
  const client = new DevaClient({
    apiBase: API_BASE,
    apiKey,
    fetch: flow.fetch,
    payoutWalletStorePath: storePath
  });

  await client.models.list();
  await client.models.list({ limit: 2 });

  assert.equal(callsFor(flow.calls, "/api/v1/agent/payout-wallet", "GET").length, 1);
  assert.equal(callsFor(flow.calls, "/api/v1/agent/payout-wallet/bind", "POST").length, 0);
  assert.equal(callsFor(flow.calls, "/v1/models", "GET").length, 2);
  assert.equal(existsSync(storePath), false);
});

test("caller-supplied payout wallet binds without generating a local secret", async () => {
  const apiKey = uniqueApiKey("supplied");
  const storePath = await tempStorePath("supplied");
  const supplied = generatePayoutWallet().pubkey;
  const flow = createPayoutFlowFetch();
  const client = new DevaClient({
    apiBase: API_BASE,
    apiKey,
    fetch: flow.fetch,
    payoutWalletStorePath: storePath,
    payoutWallet: { publicKey: supplied }
  });

  await client.models.list();

  const bindCalls = callsFor(flow.calls, "/api/v1/agent/payout-wallet/bind", "POST");
  assert.equal(bindCalls.length, 1);
  assert.deepEqual(bindCalls[0].body, { payout_pubkey: supplied });
  assert.equal(existsSync(storePath), false);
});

test("registration payout override is bound lazily on the first authenticated call", async () => {
  const apiKey = uniqueApiKey("registered-override");
  const storePath = await tempStorePath("registered-override");
  const supplied = generatePayoutWallet().pubkey;
  const flow = createPayoutFlowFetch({ registrationApiKey: apiKey });
  const client = new DevaClient({
    apiBase: API_BASE,
    fetch: flow.fetch,
    payoutWalletStorePath: storePath
  });

  await client.auth.registerAgent({
    name: "lazy_agent",
    description: "a ten-plus char description",
    payout_pubkey: supplied
  });
  await client.models.list();

  const registrationBody = callsFor(flow.calls, "/agents/register", "POST")[0].body as Record<string, unknown>;
  assert.ok(!("payout_pubkey" in registrationBody));
  assert.ok(!("payoutWallet" in registrationBody));

  const bindCalls = callsFor(flow.calls, "/api/v1/agent/payout-wallet/bind", "POST");
  assert.equal(bindCalls.length, 1);
  assert.deepEqual(bindCalls[0].body, { payout_pubkey: supplied });
  assert.equal(existsSync(storePath), false);
});

test("concurrent first API calls share one payout-wallet check and bind", async () => {
  const apiKey = uniqueApiKey("concurrent");
  const storePath = await tempStorePath("concurrent");
  const flow = createPayoutFlowFetch({ getDelayMs: 25 });
  const client = new DevaClient({
    apiBase: API_BASE,
    apiKey,
    fetch: flow.fetch,
    payoutWalletStorePath: storePath
  });

  await Promise.all([client.models.list(), client.models.list({ limit: 3 }), client.profile.get()]);

  assert.equal(callsFor(flow.calls, "/api/v1/agent/payout-wallet", "GET").length, 1);
  assert.equal(callsFor(flow.calls, "/api/v1/agent/payout-wallet/bind", "POST").length, 1);
  assert.equal(flow.calls.filter((call) => call.path !== "/api/v1/agent/payout-wallet" && call.path !== "/api/v1/agent/payout-wallet/bind").length, 3);
});

test("payout wallet API base can differ from the resource API base", async () => {
  const apiKey = uniqueApiKey("api-base");
  const storePath = await tempStorePath("api-base");
  const flow = createPayoutFlowFetch();
  const client = new DevaClient({
    apiBase: "http://resources.test",
    payoutWalletApiBase: "http://wallets.test",
    apiKey,
    fetch: flow.fetch,
    payoutWalletStorePath: storePath
  });

  await client.models.list();

  const statusCall = callsFor(flow.calls, "/api/v1/agent/payout-wallet", "GET")[0];
  const resourceCall = callsFor(flow.calls, "/v1/models", "GET")[0];
  assert.equal(new URL(statusCall.url).origin, "http://wallets.test");
  assert.equal(new URL(resourceCall.url).origin, "http://resources.test");
});
