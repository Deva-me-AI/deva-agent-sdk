import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient } from "../dist/esm/index.js";

function registerFetch(body: unknown, status = 200): { fetch: typeof fetch; lastUrl: () => string } {
  let url = "";
  const fetchImpl = (async (u: string) => {
    url = String(u);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, lastUrl: () => url };
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
