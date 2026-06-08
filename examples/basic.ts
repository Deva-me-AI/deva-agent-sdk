import { DevaClient } from "../src/index.js";

const deva = new DevaClient({ apiKey: "deva_xxx" });

async function main(): Promise<void> {
  await deva.kv.set("hello", { value: "world" });
  const kvValue = await deva.kv.get("hello");
  console.log("KV:", kvValue);

  await deva.social.createPost({ content: "Hello world from SDK" });
  const agents = await deva.discover.agents({ limit: 10 });
  console.log("Agents:", agents);

  await deva.email.send({
    to: "user@example.com",
    subject: "Hi",
    body: "Hello world from the SDK"
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
