import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaAgent, DevaClient, BudgetExceededError, ToolRunTimeoutError } from "../dist/esm/index.js";

const estimate = (amount = 0.4) => ({ amount_usd: amount, deterministic: true, cap_usd: null });
const done = (cost = 0.2) => ({ status: "succeeded", actual_cost_usd: cost, run_id: "r1", charged: true });
function mock(handler: (url: URL, init: RequestInit) => unknown | Promise<unknown>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetch = (async (url, init) => {
    calls.push({ url: new URL(String(url)), init: init! });
    const data = await handler(calls.at(-1)!.url, init!);
    return data instanceof Response ? data : Response.json(data);
  }) as typeof globalThis.fetch;
  return { agent: new DevaAgent({ apiKey: "test", fetch }), calls, fetch };
}

test("tool methods use canonical paths, query, body and auth; agent discovery stays separate", async () => {
  const m = mock(() => ({ items: [], total: 0 }));
  const input = { params: { query: "hello" }, maxTotalChargeUsd: 1 };
  await m.agent.tools.discover({ q: "hello world", provider: "future", limit: 2, min_score: 0.5 });
  await m.agent.tools.inspect("future/tool?x#y");
  await m.agent.tools.estimate("future/tool", input);
  await m.agent.tools.run("future/tool", input);
  await m.agent.tools.getRun("r/a");
  await m.agent.discover.agents();
  assert.equal(m.calls[0].url.searchParams.get("q"), "hello world");
  assert.equal(m.calls[0].url.searchParams.get("provider"), "future");
  assert.equal(m.calls[1].url.pathname, "/v1/agents/resources/inspect/future%2Ftool%3Fx%23y");
  assert.equal(m.calls[2].url.pathname, "/v1/agents/resources/estimate/future%2Ftool");
  assert.deepEqual(JSON.parse(m.calls[2].init.body as string), input);
  assert.deepEqual(JSON.parse(m.calls[3].init.body as string), input);
  assert.equal(m.calls[3].init.method, "POST");
  assert.equal(m.calls[3].init.headers!.authorization, "Bearer test");
  assert.equal(m.calls[4].url.pathname, "/v1/agents/resources/runs/r%2Fa");
  assert.equal(m.calls[5].url.pathname, "/v1/agents/discover");
  const publicClient = new DevaClient({ fetch: m.fetch });
  await publicClient.tools.discover(); await publicClient.tools.inspect("tool"); await publicClient.tools.estimate("tool");
});

for (const failure of [429, 500, 502, 503, 504, 402, "network", "abort"]) {
  test(`run never retries ${failure}`, async () => {
    let payments = 0;
    const m = mock(() => {
      if (failure === "network") throw new TypeError("lost connection");
      if (failure === "abort") throw new DOMException("timeout", "AbortError");
      return Response.json({ error: "failure" }, { status: failure });
    });
    const client = new DevaClient({ apiKey: "test", fetch: m.fetch, x402: { payer: async () => { payments++; return { paid: true }; } } });
    await assert.rejects(client.tools.run("tool"));
    assert.equal(m.calls.length, 1); assert.equal(payments, 0);
  });
}

test("budget replaces estimates with actual spend and enforces run count", async () => {
  const m = mock(url => url.pathname.includes("/estimate/") ? estimate() : done());
  const tools = m.agent.tools.withBudget({ maxUsd: 0.5, maxRuns: 2 });
  await tools.run("tool");
  assert.deepEqual(tools.usage, { spentUsd: 0.2, reservedUsd: 0, runs: 1 });
  // A second scope is independent.
  assert.equal(m.agent.tools.withBudget({ maxUsd: 1, maxRuns: 1 }).usage.runs, 0);
  await assert.rejects(tools.run("tool", { maxTotalChargeUsd: 1 }), e => e instanceof BudgetExceededError && e.reason === "maxUsd");
  const count = m.agent.tools.withBudget({ maxUsd: 10, maxRuns: 1 });
  await count.run("tool");
  await assert.rejects(count.run("tool"), e => e instanceof BudgetExceededError && e.reason === "maxRuns");
});

test("concurrent starts reserve funds; terminal polling settles once, including failures", async () => {
  const m = mock(url => url.pathname.includes("/estimate/") ? estimate(0.6) : url.pathname.includes("/runs/") ? { ...done(0.1), status: "failed" } : { status: "running", run_id: "r1", poll: "/unused" });
  const tools = m.agent.tools.withBudget({ maxUsd: 1, maxRuns: 10 });
  const results = await Promise.allSettled([tools.run("tool"), tools.run("tool")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(tools.usage.reservedUsd, 0.6);
  await tools.waitForRun("r1", { timeoutMs: 100, pollMs: 1 });
  await tools.getRun("r1");
  assert.deepEqual(tools.usage, { spentUsd: 0.1, reservedUsd: 0, runs: 1 });
});

test("unknown/invalid estimates fail closed; bounded variable estimate works", async () => {
  for (const amount of [null, -1, "0.1"]) {
    const m = mock(() => ({ ...estimate(), amount_usd: amount }));
    await assert.rejects(m.agent.tools.withBudget({ maxUsd: 1, maxRuns: 1 }).run("tool"), BudgetExceededError);
    assert.equal(m.calls.length, 1);
  }
  const m = mock(url => url.pathname.includes("/estimate/") ? { ...estimate(), deterministic: false, cap_usd: 0.5 } : done());
  await m.agent.tools.withBudget({ maxUsd: 1, maxRuns: 1 }).run("tool", { maxTotalChargeUsd: 0.5 });
});

test("ambiguous failures retain reservations and run counts", async () => {
  const m = mock(url => { if (url.pathname.includes("/estimate/")) return estimate(); throw new Error("connection lost"); });
  const tools = m.agent.tools.withBudget({ maxUsd: 0.5, maxRuns: 10 });
  await assert.rejects(tools.run("tool"));
  assert.deepEqual(tools.usage, { spentUsd: 0, reservedUsd: 0.4, runs: 1 });
  await assert.rejects(tools.run("tool"), BudgetExceededError);
  assert.equal(m.calls.filter(c => c.init.method === "POST" && c.url.pathname.includes("/run/")).length, 1);
});

test("polls running/settling to terminal and bounds waits including stalled reads", async () => {
  let i = 0;
  const m = mock(() => ({ ...done(), status: ["running", "settling", "succeeded"][i++] }));
  assert.equal((await m.agent.tools.waitForRun("r1", { pollMs: 1, timeoutMs: 100 })).status, "succeeded");
  assert.equal(m.calls.length, 3);
  const stalled = mock(() => new Promise(() => {}));
  await assert.rejects(stalled.agent.tools.waitForRun("r1", { timeoutMs: 10, pollMs: 1 }), ToolRunTimeoutError);
  await assert.rejects(m.agent.tools.waitForRun("r1", { timeoutMs: 0 }), ToolRunTimeoutError);
  await assert.rejects(m.agent.tools.waitForRun("r1", { pollMs: 0 }), RangeError);
});

test("validates budgets and treats zero runs as no runs", async () => {
  const m = mock(() => estimate(0));
  for (const budget of [{ maxUsd: NaN, maxRuns: 1 }, { maxUsd: 1, maxRuns: -1 }, { maxUsd: 1, maxRuns: 1.5 }]) {
    assert.throws(() => m.agent.tools.withBudget(budget), RangeError);
  }
  await assert.rejects(m.agent.tools.withBudget({ maxUsd: 0, maxRuns: 0 }).run("tool"), BudgetExceededError);
});

test("live tool rail smoke (free reads only)", { skip: !process.env.DEVA_API_KEY }, async () => {
  const agent = new DevaAgent({ apiKey: process.env.DEVA_API_KEY! });
  const page = await agent.tools.discover({ limit: 1 });
  assert.ok(Array.isArray(page.items)); assert.equal(typeof page.total, "number");
  assert.ok(page.items.length > 0);
  const spec = await agent.tools.inspect(page.items[0].slug);
  assert.equal(spec.slug, page.items[0].slug); assert.equal(typeof spec.input_schema, "object");
  const result = await agent.tools.estimate(spec.slug, { params: spec.defaults });
  assert.equal(typeof result.deterministic, "boolean");
  assert.ok(result.amount_usd === null || typeof result.amount_usd === "number");
});

 test("decimal budget equality accepts 0.2 plus 0.4 at a 0.6 limit", async () => {
  const m = mock(url => url.pathname.includes("/estimate/") ? estimate() : done());
  const tools = m.agent.tools.withBudget({ maxUsd: 0.6, maxRuns: 2 });
  await tools.run("tool"); await tools.run("tool");
  assert.equal(tools.usage.spentUsd, 0.4);
 });
