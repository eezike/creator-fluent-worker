// src/createSubscription.ts
import "dotenv/config";
import { PubSub } from "@google-cloud/pubsub";

async function createSubscription() {
  const projectId = process.env.GCP_PROJECT_ID || "fluent-480417";
  const topicName = process.env.PUBSUB_TOPIC_ID || "gmail-events";
  const subName = process.env.PUBSUB_SUB_ID || "gmail-events-local-sub";

  const pubsub = new PubSub({ projectId });

  console.log(`Creating subscription "${subName}" on topic "${topicName}"...`);

  const [subscription] = await pubsub
    .topic(topicName)
    .createSubscription(subName);

  console.log("✅ Created subscription:", subscription.name);
}

createSubscription().catch((err) => {
  console.error("Error creating subscription:", err);
  process.exit(1);
});
