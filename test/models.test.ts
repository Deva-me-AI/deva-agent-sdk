import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient, DevaError } from "../dist/esm/index.js";

function testClient(options: ConstructorParameters<typeof DevaClient>[0]): DevaClient {
  return new DevaClient({ payoutWalletAutoBind: false, ...options });
}

function captureFetch(body: unknown, status = 200): { fetch: typeof fetch; lastUrl: () => string } {
  let url = "";
  const fetchImpl = (async (u: string) => {
    url = String(u);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, lastUrl: () => url };
}

const SAMPLE_MODEL = {
  id: "openai/gpt-4o",
  object: "model",
  name: "GPT-4o",
  provider: "openai",
  context_length: 128000,
  max_completion_tokens: 16384,
  pricing: {
    prompt: "0.0000025",
    completion: "0.00001",
    prompt_karma: "0.0025",
    completion_karma: "0.01",
    unit: "per token",
    currency: "USD",
    note: "Platform fee included"
  },
  capabilities: { tool_calling: true, structured_output: true, reasoning: false, vision: true, streaming: true },
  enabled: true,
  deprecated: false,
  featured: true
};

test("models.list GETs /v1/models and parses the typed envelope", async () => {
  const r = captureFetch({
    object: "list",
    data: [SAMPLE_MODEL],
    total_count: 1,
    limit: 50,
    offset: 0,
    pricing_version: 7,
    last_updated: "2026-06-08T00:00:00Z"
  });
  const client = testClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });
  const list = await client.models.list();
  assert.ok(r.lastUrl().endsWith("/v1/models"), r.lastUrl());
  assert.equal(list.object, "list");
  assert.equal(list.total_count, 1);
  assert.equal(list.pricing_version, 7);
  assert.equal(list.data[0].pricing.completion_karma, "0.01");
  assert.equal(list.data[0].capabilities.vision, true);
});

test("models.list maps filters into the query string", async () => {
  const r = captureFetch({ object: "list", data: [], total_count: 0, limit: 5, offset: 0, pricing_version: 7 });
  const client = testClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });
  await client.models.list({ featured: true, capability: "reasoning", limit: 5 });
  const url = r.lastUrl();
  assert.ok(url.includes("featured=true"), url);
  assert.ok(url.includes("capability=reasoning"), url);
  assert.ok(url.includes("limit=5"), url);
});

test("models.get GETs /v1/models/{provider}/{name}", async () => {
  const r = captureFetch({ ...SAMPLE_MODEL, pricing_version: 7, last_updated: null });
  const client = testClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });
  const model = await client.models.get("openai/gpt-4o");
  assert.ok(r.lastUrl().endsWith("/v1/models/openai/gpt-4o"), r.lastUrl());
  assert.equal(model.id, "openai/gpt-4o");
  assert.equal(model.provider, "openai");
});

test("models.get on a 404 throws a DevaError carrying the status", async () => {
  const r = captureFetch({ error: { message: "Model 'x/y' not found", code: "model_not_found" } }, 404);
  const client = testClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });
  await assert.rejects(
    () => client.models.get("x/y"),
    (e: unknown) => e instanceof DevaError && e.status === 404
  );
});
