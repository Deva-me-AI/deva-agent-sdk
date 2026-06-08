import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient } from "../dist/esm/index.js";

test("typed request params reach the request body", async () => {
  let captured: any;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "c1", choices: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as unknown as typeof fetch;

  const client = new DevaClient({ apiKey: "deva_test", fetch: fetchImpl });
  await client.chat.create({
    model: "m",
    messages: [{ role: "user", content: "hi" }],
    response_format: { type: "json_object" },
    reasoning: { effort: "high", enabled: true },
    tools: [{ type: "function", function: { name: "f" } }]
  });

  assert.deepEqual(captured.response_format, { type: "json_object" });
  assert.deepEqual(captured.reasoning, { effort: "high", enabled: true });
  assert.equal(captured.tools.length, 1);
});
