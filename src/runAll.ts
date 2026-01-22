import "dotenv/config";
import { PubSub, Subscription } from "@google-cloud/pubsub";
import { getEnvConfig, logCredentialInfo, resolveCredentialsPath } from "./env";
import { createSupabaseClient } from "./supabaseConnections";
import { refreshAllWatches } from "./gmailWatch";
import { processGmailNotification } from "./gmailWorker";

const WATCH_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Ensure the Pub/Sub subscription exists, creating it if missing.
 */
async function ensureSubscription(
  pubsub: PubSub,
  subscriptionId: string,
  topicId: string
): Promise<Subscription> {
  const subscription = pubsub.subscription(subscriptionId);

  try {
    await subscription.getMetadata();
    console.log(`Subscription exists: ${subscriptionId}`);
    return subscription;
  } catch (err: any) {
    if (err?.code !== 5) {
      throw err;
    }
  }

  console.log(`Creating subscription "${subscriptionId}" on topic "${topicId}"...`);
  const [created] = await pubsub.topic(topicId).createSubscription(subscriptionId);
  console.log("Created subscription:", created.name);
  return created;
}

/**
 * Start the Pub/Sub listener and dispatch messages to the Gmail worker.
 */
async function startWorker(
  subscription: Subscription,
  supabase: ReturnType<typeof createSupabaseClient>,
  env: ReturnType<typeof getEnvConfig>
) {
  console.log(
    `Listening for messages on subscription: ${env.subscriptionId} (project ${env.projectId})`
  );

  // Serialize message handling to avoid overlapping Gmail history reads.
  let processingQueue = Promise.resolve();

  subscription.on("message", (message) => {
    processingQueue = processingQueue
      .then(async () => {
        // Pub/Sub payloads contain the Gmail emailAddress + historyId.
        const dataStr = message.data.toString("utf8");
        const payload = JSON.parse(dataStr) as {
          emailAddress: string;
          historyId: string;
        };

        console.log("Received Gmail push notification:", payload);

        await processGmailNotification(supabase, env, payload);
        message.ack();
      })
      .catch((err) => {
        console.error("Error handling message:", err);
        message.ack();
      });
  });

  subscription.on("error", (err) => {
    console.error("Subscription error:", err);
    process.exit(1);
  });

  // Refresh watches periodically so they don't expire (~7 days).
  setInterval(() => {
    refreshAllWatches(supabase, env).catch((err) => {
      console.error("Failed to refresh Gmail watches:", err);
    });
  }, WATCH_REFRESH_INTERVAL_MS);
}

/**
 * Bootstrap environment config and start the background worker.
 */
async function main() {
  // Load env/config and confirm the service account identity.
  const env = getEnvConfig();
  const credentialsPath = resolveCredentialsPath(env.applicationCredentials);
  console.log("Using GOOGLE_APPLICATION_CREDENTIALS:", credentialsPath);
  logCredentialInfo(credentialsPath);
  console.log("Pub/Sub target:", {
    projectId: env.projectId,
    topicId: env.topicId,
    subscriptionId: env.subscriptionId,
  });

  const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);

  console.log("Ensuring Gmail watches for existing connections");
  await refreshAllWatches(supabase, env);

  // Initialize Pub/Sub and ensure the subscription exists before listening.
  const pubsub = new PubSub({
    projectId: env.projectId,
    keyFilename: credentialsPath,
  });

  console.log("Ensuring Pub/Sub subscription");
  const subscription = await ensureSubscription(
    pubsub,
    env.subscriptionId,
    env.topicId
  );

  console.log("Starting worker listener");
  await startWorker(subscription, supabase, env);
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(1);
});
