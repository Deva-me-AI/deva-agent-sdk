import { BudgetExceededError, DevaAgent } from "@deva-me/agent-sdk";

// Set DEVA_API_KEY, TOOL_QUERY, TOOL_PARAMS_JSON and optionally TOOL_SLUG.
// Discovery, inspection and estimation are free. Set DEVA_RUN_TOOL=1 to spend.
const agent = new DevaAgent({ apiKey: process.env.DEVA_API_KEY! });
const tools = agent.tools.withBudget({ maxUsd: 2, maxRuns: 3 });
const page = await tools.discover({ q: process.env.TOOL_QUERY ?? "search", limit: 5 });
const slug = process.env.TOOL_SLUG ?? page.items[0]?.slug;
if (!slug) throw new Error("No tools found");
const spec = await tools.inspect(slug);
console.log("Input schema:", spec.input_schema);
const input = {
  params: JSON.parse(process.env.TOOL_PARAMS_JSON ?? "{}"),
  maxTotalChargeUsd: 1
};
console.log("Estimate:", await tools.estimate(slug, input));
if (process.env.DEVA_RUN_TOOL === "1") {
  try {
    const started = await tools.run(slug, input);
    const result = "poll" in started
      ? await tools.waitForRun(started.run_id, { timeoutMs: 120_000, pollMs: 1_000 })
      : started;
    console.log("Result:", result, "Budget:", tools.usage);
  } catch (error) {
    if (error instanceof BudgetExceededError) console.error(error.reason, error.usage);
    else throw error;
  }
}
