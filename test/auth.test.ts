import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient } from "../dist/esm/index.js";

function registerFetch(
  body: unknown,
  status = 200
): { fetch: typeof fetch; lastUrl: () => string; lastBody: () => unknown } {
  let url = "";
  let sent: unknown;
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    url = String(u);
    sent = init?.body ? JSON.parse(String(init.body)) : undefined;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, lastUrl: () => url, lastBody: () => sent };
}

test("auth.registerAgent POSTs the canonical /v1/agents/register path", async () => {
  const r = registerFetch({
    success: true,
    agent: { id: "a1", name: "smoke_test", api_key: "deva_xyz", profile_url: "http://x" },
    important: "save it"
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: r.fetch });
  await client.auth.registerAgent({ name: "smoke_test", description: "a ten-plus char description" });
  assert.equal(r.lastUrl(), "http://localhost:8000/v1/agents/register");
  // Bare /agents/register (no /v1 prefix) returns 404 on api.deva.me.
  assert.ok(!/\/\/[^/]+\/agents\/register/.test(r.lastUrl()), "must NOT use the dead bare /agents/register path");
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

test("auth.registerAgent forwards client_id and accepts the 201 register response shape", async () => {
  const r = registerFetch(
    {
      success: true,
      agent: {
        id: "a1",
        name: "smoke_test.agent",
        api_key: "deva_new_key",
        claim_url: "https://deva.me/claim/x",
        verification_code: "ABC-123",
        profile_url: "http://x"
      },
      important: "save it",
      recoverable: true,
      next: { discover_url: "/v1/agents/resources/discover", claim_url: "https://deva.me/claim/x", hint: "h" }
    },
    201
  );
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: r.fetch });
  const clientId = "550e8400-e29b-41d4-a716-446655440000";
  const result = await client.auth.registerAgent({
    name: "smoke_test",
    description: "a ten-plus char description",
    client_id: clientId
  });
  assert.deepEqual(r.lastBody(), { name: "smoke_test", description: "a ten-plus char description", client_id: clientId });
  assert.equal(result.recoverable, true);
  assert.equal(result.agent.claim_url, "https://deva.me/claim/x");
  assert.equal(client.getApiKey(), "deva_new_key");
});

test("auth.registerAgent recovery: a 200 retry with the same client_id replaces the stored key", async () => {
  const clientId = "0123456789abcdef0123456789abcdef";
  const replies = [
    { status: 201, key: "deva_first_key" },
    { status: 200, key: "deva_recovered_key" }
  ];
  const sent: unknown[] = [];
  const fetchImpl = (async (_u: string, init?: RequestInit) => {
    sent.push(init?.body ? JSON.parse(String(init.body)) : undefined);
    const reply = replies.shift()!;
    return new Response(
      JSON.stringify({
        success: true,
        agent: { id: "a1", name: "smoke_test.agent", api_key: reply.key, profile_url: "http://x" },
        recoverable: true
      }),
      { status: reply.status, headers: { "content-type": "application/json" } }
    );
  }) as unknown as typeof fetch;
  const client = new DevaClient({ apiBase: "http://localhost:8000", fetch: fetchImpl });
  const input = { name: "smoke_test", description: "a ten-plus char description", client_id: clientId };

  await client.auth.registerAgent(input);
  assert.equal(client.getApiKey(), "deva_first_key");

  // Lost the response? Retrying with the SAME name + client_id returns 200 and a
  // new key; the server revokes the old one, so the client must switch to it.
  // Without force, a client that already holds a key refuses (no request sent).
  await assert.rejects(() => client.auth.registerAgent(input), /already has an API key/);
  assert.equal(sent.length, 1);
  const recovered = await client.auth.registerAgent(input, { force: true });
  assert.equal(recovered.agent.api_key, "deva_recovered_key");
  assert.equal(client.getApiKey(), "deva_recovered_key");
  assert.deepEqual(sent[0], sent[1], "retry must resend the same name + client_id");
});
