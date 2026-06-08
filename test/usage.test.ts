import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient } from "../dist/esm/index.js";

function jsonFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

test("chat.create surfaces typed usage.cost and usage.deva", async () => {
  const client = new DevaClient({
    apiKey: "deva_test",
    fetch: jsonFetch({
      id: "c1",
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0225, deva: { karma_cost: 45, karma_balance: 9955 } }
    })
  });
  const resp = await client.chat.create({ model: "m", messages: [{ role: "user", content: "hi" }] });
  assert.equal(resp.usage?.cost, 0.0225);
  assert.equal(resp.usage?.deva?.karma_cost, 45);
  assert.equal(resp.usage?.deva?.karma_balance, 9955);
});
