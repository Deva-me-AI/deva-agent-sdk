import { test } from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { generatePayoutWallet } from "../dist/esm/index.js";

test("generatePayoutWallet returns a v3 ed25519 wallet with base58 key material", () => {
  const wallet = generatePayoutWallet();
  const publicKey = bs58.decode(wallet.pubkey);
  const secretKey = bs58.decode(wallet.secret);

  assert.equal(wallet.version, "v3");
  assert.equal(publicKey.length, 32);
  assert.equal(secretKey.length, 64);
  assert.deepEqual(Array.from(secretKey.slice(32)), Array.from(publicKey));

  const message = new TextEncoder().encode("payout wallet round trip");
  const signature = nacl.sign.detached(message, secretKey);
  assert.equal(nacl.sign.detached.verify(message, signature, publicKey), true);
});
