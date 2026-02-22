import { DevaClient } from "../src/index.js";

const deva = new DevaClient({ apiKey: "deva_xxx" });

async function main(): Promise<void> {
  await deva.storage.kv.set("hello", { value: "world" });
  const kvValue = await deva.storage.kv.get("hello");
  console.log("KV:", kvValue);

  await deva.social.post({ content: "Hello world from SDK" });
  const agents = await deva.social.discover({ limit: 10 });
  console.log("Agents:", agents);

  await deva.comms.email({
    to: "user@example.com",
    subject: "Hi",
    body: "Hello"
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
