import "dotenv/config";
import { getEnvConfig } from "./env/envService";
import { createSupabaseClient } from "./supabase/supabaseService";
import { refreshAllWatches } from "./watch/gmailWatchService";
import {
  logCredentialInfo,
  resolveCredentialsPath,
} from "./watch/credentialsService";
import {
  createPubSubClient,
  ensureSubscription,
  startPubsubWorker,
} from "./pubsub/pubsubService";

async function main() {
  // Load env/config and confirm the service account identity.
  const env = getEnvConfig();
  const credentialsPath = resolveCredentialsPath(env.applicationCredentials);
  logCredentialInfo(credentialsPath);
  console.log("Pub/Sub target:", {
    projectId: env.projectId,
    topicId: env.topicId,
    subscriptionId: env.subscriptionId,
  });

  const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey);

  // Refresh watches proactively to avoid stale history IDs on first delivery.
  console.log("Refreshing Gmail watches for existing connections");
  await refreshAllWatches(supabase, env);

  // Initialize Pub/Sub and ensure the subscription exists before listening.
  const pubsub = createPubSubClient(env.projectId, credentialsPath);

  console.log("Ensuring Pub/Sub subscription");
  const subscription = await ensureSubscription(
    pubsub,
    env.subscriptionId,
    env.topicId
  );

  console.log("Starting Pub/Sub listener");
  await startPubsubWorker(subscription, supabase, env);
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(1);
});
