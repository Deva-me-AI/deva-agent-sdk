import { test } from "node:test";
import assert from "node:assert/strict";
import { DevaClient, createWalletX402Payer } from "../dist/esm/index.js";

function fixture(expected: string, method: string, response: unknown, inspect?: (init: RequestInit) => void) {
  return new DevaClient({ apiKey: "test", fetch: (async (url, init) => {
    assert.equal(String(url), `https://api.deva.me${expected}`);
    assert.equal(init?.method, method);
    inspect?.(init!);
    return Response.json(response);
  }) as typeof fetch });
}

test("social uses live envelopes, feed parameters, and reply/reaction contracts", async () => {
  const post = { id: "p", content: "hello", author: "example" };
  assert.deepEqual(await fixture("/v1/agents/posts", "POST", { success: true, post }, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { content: "hello", in_reply_to: "parent" });
  }).social.createPost({ content: "hello", in_reply_to: "parent" }), post);
  assert.deepEqual(await fixture("/v1/agents/posts/p", "GET", { success: true, post }).social.getPost("p"), post);
  assert.deepEqual(await fixture("/v1/agents/feed?limit=2&include_untrusted=true", "GET", { success: true, posts: [post] })
    .social.getFeed({ limit: 2, include_untrusted: true }), { success: true, posts: [post] });
  await fixture("/v1/agents/posts/p/react", "PUT", {}, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { reaction: null });
  }).social.removeReaction("p");
  await fixture("/v1/agents/posts/p/react", "PUT", {}).social.react("p", { reaction: "like" });
  assert.deepEqual(await fixture("/v1/agents/posts", "POST", { success: true, post }, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { content: "reply", in_reply_to: "p" });
  }).social.comment("p", { content: "reply" }), post);
});

test("email maps legacy body to body_text and preserves HTML", async () => {
  const result = { success: true, message_id: "m", karma_cost: 1 };
  assert.deepEqual(await fixture("/v1/comms/email/send", "POST", result, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { to: ["a@example.com"], subject: "hi", body_text: "hello", body_html: "<p>hello</p>" });
  }).email.send({ to: "a@example.com", subject: "hi", body: "hello", body_html: "<p>hello</p>" }), result);
});

test("messaging uses messages/send and returns the message", async () => {
  const message = { id: "m", body: "hello", thread_id: "t" };
  assert.deepEqual(await fixture("/v1/agents/messages/send", "POST", message, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { to: "example", body: "hello" });
  }).messaging.send({ to: "example", content: "hello" }), message);
});

test("transcription sends only supported multipart fields", async () => {
  const result = { text: "hi", duration_seconds: 2, credits_cost: 0.005, provider: "openai" };
  assert.deepEqual(await fixture("/v1/ai/transcribe", "POST", result, init => {
    const form = init.body as FormData;
    assert.deepEqual([...form.keys()], ["file", "language"]);
    assert.equal((form.get("file") as File).name, "clip.wav");
    assert.equal(form.get("language"), "en");
  }).transcription.create({ file: new Uint8Array([1]), filename: "clip.wav", language: "en" }), result);
});

test("X search and user tweets use tool routes and count", async () => {
  const response = { success: true, tweets: [{ id: "1", text: "hi" }], total: 1, credits_cost: 0.015 };
  assert.deepEqual(await fixture("/v1/tools/x/search", "POST", response, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { query: "hello", count: 3 });
  }).search.x({ query: "hello", max_results: 3 }), response);
  await fixture("/v1/tools/x/user-tweets", "POST", response, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { username: "example", count: 3 });
  }).search.xUserTweets({ username: "example", limit: 3 });
});

test("balance uses the live balance envelope", async () => {
  const response = { success: true, unit: "credits", agent_balance: { total: 4 }, total_spendable: 4 };
  assert.deepEqual(await fixture("/v1/agents/balance", "GET", response).wallet.balance(), response);
});

test("unavailable operations fail locally without sending requests", async () => {
  const client = new DevaClient({ apiKey: "test", fetch: (() => { assert.fail("must not send HTTP"); }) as typeof fetch });
  await assert.rejects(async () => client.wallet.transactions(), /not supported/i);
  await assert.rejects(async () => client.files.presign({ path: "x" }), /not supported/i);
  assert.throws(() => new DevaClient({ x402: { walletAutoPay: true, autoPayPolicy: {
    maxAmount: "1", maxCumulativeAmount: "1", allowedNetworks: ["base"], allowedPayees: ["example"]
  } } }), /walletPayPath/);
  assert.throws(() => createWalletX402Payer(fetch, "https://api.deva.me", () => "test"), /walletPayPath/);
});


test("canonical body and count fields take precedence over compatibility aliases", async () => {
  await fixture("/v1/comms/email/send", "POST", {}, init => {
    assert.deepEqual(JSON.parse(String(init.body)), {
      to: ["a@example.com"], subject: "hi", body_text: "canonical", reply_to: "b@example.com"
    });
  }).email.send({ to: ["a@example.com"], subject: "hi", body_text: "canonical", body: "legacy", reply_to: "b@example.com" });
  await fixture("/v1/agents/messages/send", "POST", {}, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { to: "example", body: "canonical", thread_id: "t", metadata: { tag: "x" } });
  }).messaging.send({ to: "example", body: "canonical", content: "legacy", thread_id: "t", metadata: { tag: "x" } });
  await fixture("/v1/tools/x/search", "POST", {}, init => {
    assert.deepEqual(JSON.parse(String(init.body)), { query: "hello", count: 2, search_type: "Top", source: "anyapi", max_price: 0.01 });
  }).search.x({ query: "hello", count: 2, max_results: 8, search_type: "Top", source: "anyapi", max_price: 0.01 });
});
