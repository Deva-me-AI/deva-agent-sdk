import bs58 from "bs58";
import nacl from "tweetnacl";
import type { PayoutWallet } from "./types.js";

/** Generates a local Bitplanet v3/Solana-compatible ed25519 payout wallet. */
export function generatePayoutWallet(): PayoutWallet {
  const keypair = nacl.sign.keyPair();

  return {
    version: "v3",
    pubkey: bs58.encode(keypair.publicKey),
    secret: bs58.encode(keypair.secretKey)
  };
}
