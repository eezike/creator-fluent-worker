import type { EnvConfig } from "./envModels";

/**
 * Load and validate required environment configuration.
 */
export function getEnvConfig(): EnvConfig {
  const projectId = process.env.GCP_PROJECT_ID!;
  const topicId = process.env.PUBSUB_TOPIC_ID!;
  const subscriptionId = process.env.PUBSUB_SUB_ID || "gmail-events-local-sub";
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  const applicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS!;
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const tokenEncryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY!;

  const missing = [
    ["GCP_PROJECT_ID", projectId],
    ["PUBSUB_TOPIC_ID", topicId],
    ["GOOGLE_CLIENT_ID", clientId],
    ["GOOGLE_CLIENT_SECRET", clientSecret],
    ["GOOGLE_REDIRECT_URI", redirectUri],
    ["GOOGLE_APPLICATION_CREDENTIALS", applicationCredentials],
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey],
    ["GMAIL_TOKEN_ENCRYPTION_KEY", tokenEncryptionKey],
  ].filter(([, val]) => !val);

  if (missing.length) {
    throw new Error(
      `Missing env vars: ${missing.map(([k]) => k).join(", ")}. Check .env.`
    );
  }

  return {
    projectId,
    topicId,
    subscriptionId,
    clientId,
    clientSecret,
    redirectUri,
    applicationCredentials,
    supabaseUrl,
    supabaseServiceRoleKey,
    tokenEncryptionKey,
  };
}
