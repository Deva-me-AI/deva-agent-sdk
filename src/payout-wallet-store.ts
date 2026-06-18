import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PayoutWallet } from "./types.js";

const STORE_VERSION = 1;

interface StoredPayoutWallet {
  version: "v3";
  pubkey: string;
  secret: string;
  created_at: string;
  bound_at?: string | null;
}

interface PayoutWalletStoreFile {
  version: typeof STORE_VERSION;
  wallets: Record<string, StoredPayoutWallet>;
}

const storeLocks = new Map<string, Promise<void>>();

/** Returns the default secure local payout-wallet credential path. */
export function defaultPayoutWalletStorePath(): string {
  return join(homedir() || ".", ".deva", "payout-wallet.json");
}

/** Fingerprints an API base/key pair without storing the raw API key locally. */
export function payoutWalletStoreKey(apiBase: string, apiKey: string): string {
  return createHash("sha256").update(`${apiBase}\0${apiKey}`).digest("hex");
}

function emptyStore(): PayoutWalletStoreFile {
  return { version: STORE_VERSION, wallets: {} };
}

function isNodeErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

function normalizeStoredWallet(value: unknown): StoredPayoutWallet | undefined {
  if (!value || typeof value !== "object") return undefined;
  const wallet = value as Record<string, unknown>;
  if (wallet.version !== "v3" || typeof wallet.pubkey !== "string" || typeof wallet.secret !== "string") {
    return undefined;
  }

  return {
    version: "v3",
    pubkey: wallet.pubkey,
    secret: wallet.secret,
    created_at: typeof wallet.created_at === "string" ? wallet.created_at : new Date(0).toISOString(),
    bound_at: typeof wallet.bound_at === "string" || wallet.bound_at === null ? wallet.bound_at : undefined
  };
}

async function withStoreLock<T>(storePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = storeLocks.get(storePath);
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  storeLocks.set(storePath, current);
  if (previous) await previous.catch(() => undefined);

  try {
    return await fn();
  } finally {
    release();
    if (storeLocks.get(storePath) === current) {
      storeLocks.delete(storePath);
    }
  }
}

async function readStore(storePath: string): Promise<PayoutWalletStoreFile> {
  let text: string;
  try {
    text = await readFile(storePath, "utf8");
  } catch (error) {
    if (isNodeErrno(error, "ENOENT")) return emptyStore();
    throw error;
  }

  if (!text.trim()) return emptyStore();

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") return emptyStore();

  const root = parsed as Record<string, unknown>;
  if (root.version !== STORE_VERSION || !root.wallets || typeof root.wallets !== "object") {
    return emptyStore();
  }

  const wallets: Record<string, StoredPayoutWallet> = {};
  for (const [key, value] of Object.entries(root.wallets as Record<string, unknown>)) {
    const wallet = normalizeStoredWallet(value);
    if (wallet) wallets[key] = wallet;
  }

  return { version: STORE_VERSION, wallets };
}

async function writeStore(storePath: string, store: PayoutWalletStoreFile): Promise<void> {
  const dir = dirname(storePath);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);

  const tmpPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await chmod(tmpPath, 0o600).catch(() => undefined);
    await rename(tmpPath, storePath);
    await chmod(storePath, 0o600).catch(() => undefined);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Reads a locally persisted payout wallet for an API key fingerprint. */
export async function readStoredPayoutWallet(storePath: string, key: string): Promise<PayoutWallet | undefined> {
  return withStoreLock(storePath, async () => {
    const store = await readStore(storePath);
    const wallet = store.wallets[key];
    return wallet ? { version: "v3", pubkey: wallet.pubkey, secret: wallet.secret } : undefined;
  });
}

/** Persists a payout wallet secret locally without storing the raw API key. */
export async function writeStoredPayoutWallet(
  storePath: string,
  key: string,
  wallet: PayoutWallet,
  boundAt?: string | null
): Promise<void> {
  await withStoreLock(storePath, async () => {
    const store = await readStore(storePath);
    store.wallets[key] = {
      version: "v3",
      pubkey: wallet.pubkey,
      secret: wallet.secret,
      created_at: store.wallets[key]?.created_at ?? new Date().toISOString(),
      bound_at: boundAt
    };
    await writeStore(storePath, store);
  });
}

/** Removes a generated payout wallet when another writer won the server-side bind race. */
export async function deleteStoredPayoutWallet(storePath: string, key: string): Promise<void> {
  await withStoreLock(storePath, async () => {
    const store = await readStore(storePath);
    if (!(key in store.wallets)) return;
    delete store.wallets[key];
    await writeStore(storePath, store);
  });
}
