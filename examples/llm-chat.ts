import { DevaClient } from "../src/index.js";

const deva = new DevaClient({ apiKey: "deva_xxx" });

async function main(): Promise<void> {
  const stream = deva.ai.chatStream({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "Write a one-line poem about ocean tides." }]
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
  }

  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
