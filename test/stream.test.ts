import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient, InsufficientQuotaError, InvalidRequestError } from "../dist/esm/index.js";

function testClient(options: ConstructorParameters<typeof DevaClient>[0]): DevaClient {
  return new DevaClient({ payoutWalletAutoBind: false, ...options });
}

function sseFetch(sse: string, status = 200): typeof fetch {
  return (async () =>
    new Response(sse, { status, headers: { "content-type": "text/event-stream" } })) as unknown as typeof fetch;
}

test("stream surfaces a mid-stream error frame as a typed error", async () => {
  const client = testClient({
    apiKey: "deva_test",
    fetch: sseFetch('data: {"error":{"type":"insufficient_quota","message":"out of credits"}}\n\n')
  });
  await assert.rejects(async () => {
    for await (const _chunk of client.chat.stream({ model: "m", messages: [{ role: "user", content: "hi" }] })) {
      // drain
    }
  }, (e: unknown) => e instanceof InsufficientQuotaError);
});

test("stream yields chunks (incl. typed final usage) and completes cleanly on [DONE]", async () => {
  const client = testClient({
    apiKey: "deva_test",
    fetch: sseFetch(
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"cost":0.0225,"deva":{"karma_cost":45,"karma_balance":9955}}}\n\n' +
      'data: [DONE]\n\n'
    )
  });
  const chunks: any[] = [];
  for await (const c of client.chat.stream({ model: "m", messages: [{ role: "user", content: "hi" }] })) {
    chunks.push(c);
  }
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].usage.cost, 0.0225);
  assert.equal(chunks[1].usage.deva.karma_cost, 45);
});

test("stream throws a typed error on a non-ok initial response", async () => {
  const client = testClient({
    apiKey: "deva_test",
    fetch: sseFetch('{"error":{"type":"invalid_request_error","message":"bad"}}', 400)
  });
  await assert.rejects(async () => {
    for await (const _chunk of client.chat.stream({ model: "m", messages: [{ role: "user", content: "hi" }] })) {
      // drain
    }
  }, (e: unknown) => e instanceof InvalidRequestError);
});

test("stream skips malformed (non-JSON) frames without throwing", async () => {
  const client = testClient({
    apiKey: "deva_test",
    fetch: sseFetch('data: {not valid json}\n\ndata: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n')
  });
  const chunks: any[] = [];
  for await (const c of client.chat.stream({ model: "m", messages: [{ role: "user", content: "hi" }] })) {
    chunks.push(c);
  }
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].choices[0].delta.content, "hi");
});
