import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient } from "../dist/esm/index.js";

function testClient(options: ConstructorParameters<typeof DevaClient>[0]): DevaClient {
  return new DevaClient({ payoutWalletAutoBind: false, ...options });
}

test("typed request params reach the request body", async () => {
  let captured: any;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "c1", choices: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as unknown as typeof fetch;

  const client = testClient({ apiKey: "deva_test", fetch: fetchImpl });
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

test("tool_choice, tool-capable messages, and json_schema reach the request body", async () => {
  let captured: any;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "c1", choices: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as unknown as typeof fetch;

  const client = testClient({ apiKey: "deva_test", fetch: fetchImpl });
  await client.chat.create({
    model: "m",
    messages: [
      { role: "assistant", content: "", tool_calls: [{ id: "t1", type: "function", function: { name: "f", arguments: "{}" } }] },
      { role: "tool", content: "result", tool_call_id: "t1" }
    ],
    tool_choice: "auto",
    response_format: { type: "json_schema", json_schema: { name: "x", schema: {} } }
  });

  assert.equal(captured.tool_choice, "auto");
  assert.equal(captured.messages[0].tool_calls[0].id, "t1");
  assert.equal(captured.messages[1].tool_call_id, "t1");
  assert.equal(captured.response_format.type, "json_schema");
});
