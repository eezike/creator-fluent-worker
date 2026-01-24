import { PubSub, type Subscription } from "@google-cloud/pubsub";
import type { EnvConfig } from "../env/envModels";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshAllWatches } from "../watch/gmailWatchService";
import { WATCH_REFRESH_INTERVAL_MS } from "./pubsubConstants";
import { processGmailNotification } from "../gmail/gmailWorkerService";
import { parseGmailNotificationPayload } from "./pubsubValidators";

/**
 * Initialize a Pub/Sub client with explicit credentials.
 */
export function createPubSubClient(projectId: string, keyFilename: string) {
  return new PubSub({
    projectId,
    keyFilename,
  });
}

/**
 * Ensure the Pub/Sub subscription exists, creating it if missing.
 */
export async function ensureSubscription(
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
export async function startPubsubWorker(
  subscription: Subscription,
  supabase: SupabaseClient,
  env: EnvConfig
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
        const rawPayload = JSON.parse(dataStr) as unknown;
        const payload = parseGmailNotificationPayload(rawPayload);
        if (!payload) {
          console.warn("Invalid Pub/Sub payload shape:", rawPayload);
          message.ack();
          return;
        }

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
