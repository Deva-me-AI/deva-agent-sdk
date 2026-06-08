import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DevaError,
  InsufficientQuotaError,
  RateLimitError,
  InvalidRequestError,
  AuthenticationError,
  PermissionError,
  ServerError,
  classifyError,
  errorFromResponse,
  normalizeErrorEnvelope
} from "../dist/esm/index.js";

test("classifyError maps by error.type", () => {
  assert.ok(classifyError({ type: "insufficient_quota", message: "x" }) instanceof InsufficientQuotaError);
  assert.ok(classifyError({ type: "rate_limit_error", message: "x" }) instanceof RateLimitError);
  assert.ok(classifyError({ type: "invalid_request_error", message: "x" }) instanceof InvalidRequestError);
  assert.ok(classifyError({ type: "invalid_api_key", message: "x" }) instanceof AuthenticationError);
  assert.ok(classifyError({ type: "permission_error", message: "x" }) instanceof PermissionError);
  assert.ok(classifyError({ type: "server_error", message: "x" }) instanceof ServerError);
});

test("classifyError falls back to status when type missing", () => {
  assert.ok(classifyError({ status: 402, message: "x" }) instanceof InsufficientQuotaError);
  assert.ok(classifyError({ status: 429, message: "x" }) instanceof RateLimitError);
  assert.ok(classifyError({ status: 400, message: "x" }) instanceof InvalidRequestError);
  assert.ok(classifyError({ status: 401, message: "x" }) instanceof AuthenticationError);
  assert.ok(classifyError({ status: 403, message: "x" }) instanceof PermissionError);
  assert.ok(classifyError({ status: 503, message: "x" }) instanceof ServerError);
});

test("classifyError returns base DevaError for unknown", () => {
  const e = classifyError({ status: 418, message: "teapot" });
  assert.equal(e.constructor.name, "DevaError");
  assert.equal(e.message, "teapot");
});

test("all subclasses are instanceof DevaError and carry type", () => {
  const e = classifyError({ type: "insufficient_quota", status: 402, message: "no credits", balance: 0 });
  assert.ok(e instanceof DevaError);
  assert.equal(e.type, "insufficient_quota");
  assert.equal(e.status, 402);
  assert.equal(e.name, "InsufficientQuotaError");
});

test("normalizeErrorEnvelope reads the OpenAI envelope incl. type", () => {
  const d = normalizeErrorEnvelope(402, { error: { type: "insufficient_quota", code: "no_credits", message: "out" } });
  assert.equal(d.type, "insufficient_quota");
  assert.equal(d.code, "no_credits");
  assert.equal(d.message, "out");
  assert.equal(d.status, 402);
});

test("normalizeErrorEnvelope defaults message and tolerates non-object body", () => {
  assert.equal(normalizeErrorEnvelope(500, null).message, "HTTP 500");
  assert.equal(normalizeErrorEnvelope(500, "boom").message, "HTTP 500");
});

test("errorFromResponse classifies a raw response body", () => {
  assert.ok(errorFromResponse(429, { error: { type: "rate_limit_error", message: "slow down" } }) instanceof RateLimitError);
});
