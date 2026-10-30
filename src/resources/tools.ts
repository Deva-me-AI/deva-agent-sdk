import { DevaHttpClient } from "../client.js";
import { BudgetExceededError, DevaError, ToolRunTimeoutError } from "../errors.js";
import { addX402Amounts, compareX402Amounts, formatX402Amount, zeroX402Amount } from "../x402.js";
import type { X402Amount } from "../x402.js";
import type { JsonObject } from "../types.js";

export interface ToolCatalogEntry {
  provider: string;
  slug: string;
  name: string;
  description: string | null;
  categories: string[];
  pricing_summary: string;
  unit_price_usd: number | null;
  payable_with: string[];
  run_kind: "SYNC" | "ASYNC";
  provider_tool_id: string;
  provider_native_id: string | null;
  popularity: number;
  pricing: JsonObject;
  pricing_model: "FREE" | "PER_RESULT" | "PER_EVENT" | null;
  min_cap_usd: number | null;
  relevance_score: number | null;
  burn_rate: JsonObject | null;
}
export interface ToolsDiscoverRequest {
  q?: string;
  category?: string;
  provider?: string;
  status?: string;
  cursor?: string;
  limit?: number;
  min_score?: number;
}
export interface ToolsDiscoverResponse {
  items: ToolCatalogEntry[];
  total: number;
  next_cursor: string | null;
  next: Record<string, string> | null;
}
export interface ToolSpec {
  slug: string;
  provider: string;
  input_schema: JsonObject;
  output_hint: string | null;
  pricing: JsonObject;
  defaults: JsonObject;
  caps: JsonObject;
  build: JsonObject | null;
  min_cap_usd: number | null;
  next: Record<string, string> | null;
}
export interface ToolRunInput {
  params?: JsonObject;
  maxTotalChargeUsd?: number;
}
export interface ToolCostEstimate {
  amount_usd: number | null;
  amount_credits: number | null;
  deterministic: boolean;
  cap_usd: number | null;
  breakdown: JsonObject;
  basis: string;
  sample_size: number | null;
  cap_credits: number | null;
  min_charge_usd: number | null;
  min_cap_usd: number | null;
  next: Record<string, string> | null;
}
export interface ToolRunResponse {
  status: string;
  charged: boolean;
  credits_charged: number;
  actual_cost_usd: number;
  run_id: string | null;
  output: JsonObject | null;
  message: string | null;
}
export interface ToolRunStartResponse {
  run_id: string;
  status: string;
  poll: string;
  max_total_charge_credits: number | null;
  next: Record<string, string> | null;
}
export interface ToolRunStatusResponse {
  status: string;
  run_id: string;
  credits_charged: number | null;
  actual_cost_usd: number | null;
  items: unknown[] | null;
  dataset_id: string | null;
  result_count: number | null;
  usage_breakdown: JsonObject | null;
  max_total_charge_credits: number | null;
  cap_hit: boolean | null;
  message: string | null;
  next: Record<string, string> | null;
}
export interface ToolWaitOptions { timeoutMs?: number; pollMs?: number }
export interface ToolBudget { maxUsd: number; maxRuns: number }
export interface ToolBudgetUsage { spentUsd: number; reservedUsd: number; runs: number }

const ROOT = "/v1/agents/resources";
const terminal = (status: string): boolean => ["succeeded", "failed", "settled"].includes(status.toLowerCase());
const validMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Convert finite nonnegative JSON numbers to decimal arithmetic, including exponent notation.
function decimal(value: number): X402Amount {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  return { units: BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, -scale)), scale: Math.max(0, scale) };
}

/** Provider-independent tool discovery and execution. */
export class ToolsResource {
  constructor(protected readonly client: DevaHttpClient) {}

  discover(input: ToolsDiscoverRequest = {}): Promise<ToolsDiscoverResponse> {
    return this.client.request({ method: "GET", path: `${ROOT}/discover`, query: { ...input }, requiresAuth: false });
  }
  inspect(slug: string): Promise<ToolSpec> {
    return this.client.request({ method: "GET", path: `${ROOT}/inspect/${encodeURIComponent(slug)}`, requiresAuth: false });
  }
  estimate(slug: string, input: ToolRunInput = {}): Promise<ToolCostEstimate> {
    return this.client.request({ method: "POST", path: `${ROOT}/estimate/${encodeURIComponent(slug)}`, body: input, requiresAuth: false });
  }
  /** Starts one run. Paid POSTs are never automatically retried, including on 402. */
  run(slug: string, input: ToolRunInput = {}): Promise<ToolRunResponse | ToolRunStartResponse> {
    return this.client.request({ method: "POST", path: `${ROOT}/run/${encodeURIComponent(slug)}`, body: input, retry: false, retryOn402: false });
  }
  async getRun(runId: string, options: { timeoutMs?: number } = {}): Promise<ToolRunStatusResponse> {
    return this.client.request({ method: "GET", path: `${ROOT}/runs/${encodeURIComponent(runId)}`, timeoutMs: options.timeoutMs, retry: options.timeoutMs === undefined });
  }
  /** Poll until terminal; timeout does not cancel the remote run. */
  async waitForRun(runId: string, { timeoutMs = 120_000, pollMs = 1_000 }: ToolWaitOptions = {}): Promise<ToolRunStatusResponse> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
      throw new RangeError("timeoutMs must be nonnegative and pollMs must be positive and finite.");
    }
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new ToolRunTimeoutError(runId, timeoutMs);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: ToolRunStatusResponse;
      try {
        result = await Promise.race([
          this.getRun(runId, { timeoutMs: remaining }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ToolRunTimeoutError(runId, timeoutMs)), remaining); })
        ]);
      } finally { clearTimeout(timer); }
      if (terminal(result.status)) return result;
      await new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
    }
  }
  /** Creates an independent, in-memory task budget. Zero means no runs/spend allowed. */
  withBudget(budget: ToolBudget): BudgetedToolsResource {
    return new BudgetedToolsResource(this.client, budget);
  }
}

/**
 * Task budget inspired by monid-ai/activegraph-monid's budget_guard behavior:
 * count attempted calls, account for actual cost when completed. Independently implemented.
 */
export class BudgetedToolsResource extends ToolsResource {
  private readonly budget: ToolBudget;
  private spent = zeroX402Amount();
  private runs = 0;
  private readonly reservations = new Map<object, number>();
  private readonly pending = new Map<string, object>();
  private gate: Promise<void> = Promise.resolve();

  constructor(client: DevaHttpClient, budget: ToolBudget) {
    super(client);
    if (!validMoney(budget.maxUsd) || !Number.isSafeInteger(budget.maxRuns) || budget.maxRuns < 0) {
      throw new RangeError("maxUsd must be finite and nonnegative; maxRuns must be a nonnegative safe integer.");
    }
    this.budget = { ...budget };
  }
  private reserved(): X402Amount {
    return [...this.reservations.values()].reduce((sum, value) => addX402Amounts(sum, decimal(value)), zeroX402Amount());
  }
  get usage(): ToolBudgetUsage {
    return { spentUsd: Number(formatX402Amount(this.spent)), reservedUsd: Number(formatX402Amount(this.reserved())), runs: this.runs };
  }
  override async run(slug: string, input: ToolRunInput = {}): Promise<ToolRunResponse | ToolRunStartResponse> {
    // Snapshot input so a caller cannot change the paid request after its estimate.
    const snapshot: ToolRunInput = JSON.parse(JSON.stringify(input));
    const previous = this.gate;
    let release!: () => void;
    this.gate = new Promise(resolve => { release = resolve; });
    const token = {};
    await previous;
    try {
      const estimate = await this.estimate(slug, snapshot);
      const usage = this.usage;
      if (usage.runs >= this.budget.maxRuns) throw new BudgetExceededError("maxRuns", { ...this.budget }, usage);
      // Variable-price tools need a known cap; never interpret an unknown estimate as free.
      const amount = estimate.deterministic ? estimate.amount_usd : estimate.cap_usd;
      if (!validMoney(amount)) throw new BudgetExceededError("unknownEstimate", { ...this.budget }, usage);
      const reserve = Math.max(amount, validMoney(estimate.amount_usd) ? estimate.amount_usd : 0);
      if (compareX402Amounts(addX402Amounts(addX402Amounts(this.spent, this.reserved()), decimal(reserve)), decimal(this.budget.maxUsd)) > 0) {
        throw new BudgetExceededError("maxUsd", { ...this.budget }, usage, reserve);
      }
      this.reservations.set(token, reserve);
      this.runs += 1;
    } finally { release(); }
    // On ambiguous transport errors, retain both reservation and attempted-run count.
    const result = await super.run(slug, snapshot);
    if ("actual_cost_usd" in result) {
      this.settle(token, result.actual_cost_usd);
    } else {
      this.pending.set(result.run_id, token);
    }
    return result;
  }
  override async getRun(runId: string, options: { timeoutMs?: number } = {}): Promise<ToolRunStatusResponse> {
    const result = await super.getRun(runId, options);
    const token = this.pending.get(runId);
    if (token && terminal(result.status) && validMoney(result.actual_cost_usd)) {
      this.settle(token, result.actual_cost_usd);
      this.pending.delete(runId);
    }
    return result;
  }
  private settle(token: object, cost: number): void {
    if (!validMoney(cost)) throw new DevaError({ message: "Invalid actual tool cost; budget reservation retained." });
    if (this.reservations.delete(token)) this.spent = addX402Amounts(this.spent, decimal(cost));
  }
}
