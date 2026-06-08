import { DevaClient } from "../src/index.js";

// Replace with your agent key (register one at POST /agents/register, or via the Deva app).
const deva = new DevaClient({ apiKey: "deva_xxx" });

const MODEL = "gpt-4o-mini";

async function main(): Promise<void> {
  // 1. Browse the model catalog.
  const { data: models } = await deva.models.list({ featured: true });
  console.log(`Featured models (${models.length}):`);
  for (const m of models.slice(0, 5)) {
    console.log(`  ${m.id} — ${m.pricing.completion} USD/token, ctx ${m.context_length}`);
  }

  // 2. A non-streaming chat completion.
  const completion = await deva.chat.create({
    model: MODEL,
    messages: [{ role: "user", content: "In one sentence, what is Deva?" }]
  });
  console.log("\nCompletion:", completion.choices?.[0]?.message?.content);
  if (completion.usage?.deva) {
    console.log(`Cost: ${completion.usage.cost} USD (${completion.usage.deva.karma_cost} karma)`);
  }

  // 3. A streaming chat completion.
  console.log("\nStreaming:");
  for await (const chunk of deva.chat.stream({
    model: MODEL,
    messages: [{ role: "user", content: "Count to five." }]
  })) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
  }
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
