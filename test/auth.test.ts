import { test } from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import { DevaClient, generatePayoutWallet } from "../dist/esm/index.js";

function registerFetch(body: unknown, status = 200): { fetch: typeof fetch; lastUrl: () => string; lastBody: () => unknown } {
  let url = "";
  let requestBody: unknown;
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    url = String(u);
    requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, lastUrl: () => url, lastBody: () => requestBody };
}

test("auth.registerAgent POSTs the canonical /agents/register path", async () => {
  const r = registerFetch({
    success: true,
    agent: { id: "a1", name: "smoke_test", api_key: "deva_xyz", profile_url: "http://x" },
    important: "save it"
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: r.fetch });
  await client.auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" });
  assert.ok(r.lastUrl().endsWith("/agents/register"), `expected …/agents/register, got ${r.lastUrl()}`);
  assert.ok(!r.lastUrl().includes("/v1/agents/register"), "must NOT use the dead /v1/agents/register path");
});

test("auth.registerAgent reads the nested agent.api_key and persists it", async () => {
  const r = registerFetch({
    success: true,
    agent: { id: "a1", name: "smoke_test", api_key: "deva_nested_key", profile_url: "http://x" },
    important: "save it"
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: r.fetch });
  const result = await client.auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" });
  assert.equal(result.agent.api_key, "deva_nested_key");
  assert.equal(client.getApiKey(), "deva_nested_key");
});

test("auth.registerAgent throws when the response carries no api_key", async () => {
  const r = registerFetch({
    success: true,
    agent: { id: "a1", name: "smoke_test", profile_url: "http://x" }
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: r.fetch });
  await assert.rejects(
    () => client.auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" }),
    /no api_key returned/
  );
});

test("auth.registerAgent generates and binds a payout pubkey by default", async () => {
  const r = registerFetch({
    success: true,
    agent: { id: "a1", name: "smoke_test", api_key: "deva_nested_key", profile_url: "http://x" },
    important: "save it"
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: r.fetch });

  const result = await client.auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" });
  const body = r.lastBody() as Record<string, unknown>;

  assert.equal(body.payout_pubkey, result.payoutWallet?.pubkey);
  assert.equal(typeof body.payout_pubkey, "string");
  assert.equal(bs58.decode(String(body.payout_pubkey)).length, 32);
  assert.ok(!("payoutWallet" in body));
  assert.ok(!("secret" in body));
  assert.equal(result.payoutWallet?.version, "v3");
  assert.equal(bs58.decode(result.payoutWallet.secret).length, 64);
});

test("auth.registerAgent accepts a caller-supplied payout pubkey", async () => {
  const suppliedWallet = generatePayoutWallet();
  const r = registerFetch({
    success: true,
    agent: { id: "a1", name: "smoke_test", api_key: "deva_nested_key", profile_url: "http://x" }
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: r.fetch });

  const result = await client.auth.registerAgent({
    name: "smoke_test",
    description: "a ten-plus char description",
    payoutWallet: { pubkey: suppliedWallet.pubkey }
  });
  const body = r.lastBody() as Record<string, unknown>;

  assert.equal(body.payout_pubkey, suppliedWallet.pubkey);
  assert.ok(!("payoutWallet" in body));
  assert.equal(result.payoutWallet, undefined);
});
