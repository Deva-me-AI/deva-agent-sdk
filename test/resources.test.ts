import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient, InvalidRequestError } from "../dist/esm/index.js";

interface CapturedRequest {
  url: string;
  method?: string;
  body?: unknown;
  authorization?: string | null;
}

function captureFetch(responseBody: unknown, status = 200): { fetch: typeof fetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({
      url: String(input),
      method: init?.method,
      body: rawBody,
      authorization: new Headers(init?.headers).get("authorization")
    });

    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" }
    });
  }) as unknown as typeof fetch;

  return { fetch: fetchImpl, requests };
}

const WEB_SEARCH_RESOURCE = {
  id: "web_search",
  name: "Web Search",
  category: "utility",
  description: "Search the web",
  endpoint: "/v1/agents/resources/search",
  provider: "openrouter",
  method: "POST",
  pricing: { unit: "per search", karma_cost: 8 },
  status: "available",
  auth_required: true,
  rate_limit: null,
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      count: { type: "integer", minimum: 1, maximum: 20 }
    },
    required: ["query"]
  },
  output_description: "Search results, result count, normalized query, and karma_cost.",
  supports_generic_run: true,
  run_endpoint: "/v1/agents/resources/web_search/run"
};

test("resources.list GETs the catalog and returns ResourceInfo[]", async () => {
  const r = captureFetch({ success: true, resources: [WEB_SEARCH_RESOURCE], total: 1 });
  const client = new DevaClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });

  const resources = await client.resources.list();

  assert.deepEqual(resources, [WEB_SEARCH_RESOURCE]);
  assert.equal(r.requests[0].method, "GET");
  assert.equal(r.requests[0].authorization, "Bearer deva_test");
  assert.ok(r.requests[0].url.endsWith("/v1/agents/resources/catalog"), r.requests[0].url);
});

test("resources.inspect GETs /catalog/{resource_id}", async () => {
  const r = captureFetch(WEB_SEARCH_RESOURCE);
  const client = new DevaClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });

  const resource = await client.resources.inspect("web_search");

  assert.equal(resource.id, "web_search");
  assert.equal(resource.supports_generic_run, true);
  assert.deepEqual(resource.input_schema.properties?.query, WEB_SEARCH_RESOURCE.input_schema.properties.query);
  assert.equal(r.requests[0].method, "GET");
  assert.ok(r.requests[0].url.endsWith("/v1/agents/resources/catalog/web_search"), r.requests[0].url);
});

test("resources.estimate POSTs the estimate envelope", async () => {
  const r = captureFetch({
    success: true,
    resource_id: "web_search",
    estimated_karma_cost: 8,
    unit: "per search",
    breakdown: { count: 5 }
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });

  const estimate = await client.resources.estimate("web_search", { query: "deva", count: 5 });

  assert.equal(estimate.estimated_karma_cost, 8);
  assert.equal(r.requests[0].method, "POST");
  assert.deepEqual(r.requests[0].body, {
    resource_id: "web_search",
    params: { query: "deva", count: 5 }
  });
  assert.ok(r.requests[0].url.endsWith("/v1/agents/resources/estimate"), r.requests[0].url);
});

test("resources.run POSTs params to /{resource_id}/run", async () => {
  const r = captureFetch({
    success: true,
    resource_id: "web_search",
    karma_charged: 8,
    result: {
      results: [{ title: "Deva", url: "https://deva.me" }],
      karma_cost: 8
    }
  });
  const client = new DevaClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });

  const run = await client.resources.run("web_search", { query: "deva", count: 1 });

  assert.equal(run.resource_id, "web_search");
  assert.equal(run.karma_charged, 8);
  assert.equal(run.result.karma_cost, 8);
  assert.equal(r.requests[0].method, "POST");
  assert.deepEqual(r.requests[0].body, { query: "deva", count: 1 });
  assert.ok(r.requests[0].url.endsWith("/v1/agents/resources/web_search/run"), r.requests[0].url);
});

test("resources.run against an unsupported id throws InvalidRequestError with backend code", async () => {
  const r = captureFetch(
    {
      detail: {
        error: "RESOURCE_RUN_UNSUPPORTED",
        message: "Generic run is not supported for this resource yet."
      }
    },
    400
  );
  const client = new DevaClient({ apiBase: "http://localhost:8000", apiKey: "deva_test", fetch: r.fetch });

  await assert.rejects(
    () => client.resources.run("email", { to: ["user@example.com"], subject: "Hi", body_text: "Hello" }),
    (error: unknown) =>
      error instanceof InvalidRequestError &&
      error.status === 400 &&
      error.code === "RESOURCE_RUN_UNSUPPORTED" &&
      error.message === "Generic run is not supported for this resource yet."
  );
  assert.ok(r.requests[0].url.endsWith("/v1/agents/resources/email/run"), r.requests[0].url);
});
