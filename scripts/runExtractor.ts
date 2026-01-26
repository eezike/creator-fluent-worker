import "dotenv/config";
import readline from "node:readline";
import { extractCampaignDetailsWithMeta } from "../src/aiExtractor/aiExtractorService";
import { buildDealPayloadFromExtraction } from "../src/dealSync/dealSyncService";
import type { CampaignEmail } from "../src/gmail/gmailModels";

const contexts: CampaignEmail[] = [
  {
    subject: "Brand deal: WaveSkin campaign brief",
    from: "Avery <partnerships@waveskin.example>",
    body:
      "Hi! We'd love to work with you on a paid partnership. Budget is $2,500 for two TikTok videos and one IG Reel. Usage rights for 6 months. Go-live window March 10–20. Please confirm.",
    receivedAt: "2025-01-20T18:30:00.000Z",
  },
  {
    subject: "GlowPop x You — Spring campaign",
    from: "Maya Chen <maya@brightreachagency.com>",
    body:
      "Hi! I'm reaching out on behalf of GlowPop for a spring skincare campaign. Deliverables would be 1 Instagram Reel and 3 IG Stories. Draft due by Feb 5. Budget is $3,000 net 30. We’ll need an invoice after posting.",
    receivedAt: "2025-01-20T18:35:00.000Z",
  },
  {
    subject: "Re: Orbit Energy collaboration",
    from: "Sam <sam@orbitenergy.example>",
    body:
      "Thanks for getting back to us! We can increase the budget to $4,000 total.\n\nOn Jan 10, you wrote:\n> Budget would be $3,000 for 1 YouTube Short\n> Go live around early February\n\nNew timeline: post between Feb 12–18. Let us know if that works.",
    receivedAt: "2025-01-20T18:40:00.000Z",
  },
  {
    subject: "Posting details — FreshFuel",
    from: "Lena <creators@freshfuel.example>",
    body:
      "Hey! Just confirming details. Please submit draft by March 1. Video should go live March 8 at 9am PST. Payment is $1,500 via ACH.",
    receivedAt: "2025-01-20T18:45:00.000Z",
  },
  {
    subject: "Gifted collab opportunity — TerraWear",
    from: "Influencer Team <collabs@terrawear.example>",
    body:
      "We’d love to gift you a TerraWear set (retail value $600) in exchange for one Instagram post. No payment included. Let us know if you're interested!",
    receivedAt: "2025-01-20T18:50:00.000Z",
  },
  {
    subject: "Affiliate partnership invite",
    from: "Jordan <partners@snackcrate.example>",
    body:
      "Hi! We’re inviting you to join SnackCrate’s affiliate program. You’ll earn 15% commission on every sale through your unique link. No posting requirements, but we'd love a TikTok if you're up for it.",
    receivedAt: "2025-01-20T18:55:00.000Z",
  },
  {
    subject: "Quick intro!",
    from: "Alex <alex@gmail.com>",
    body:
      "Hey! Love your content and would love to connect sometime. Let me know if you're open to chatting!",
    receivedAt: "2025-01-20T19:00:00.000Z",
  },
  {
    subject: "January Creator Updates",
    from: "Creator Platform <updates@creatorhub.example>",
    body:
      "Here’s what’s new this month on CreatorHub: improved analytics, faster payouts, and new brand discovery tools.",
    receivedAt: "2025-01-20T19:05:00.000Z",
  },
  {
    subject: "Summer launch — SunSip Beverages",
    from: "Renee <renee@sunsip.example>",
    body:
      "We’re planning a summer launch with 1 TikTok, 1 Instagram Reel, and 2 IG Stories. TikTok should post June 3–5, IG content June 6–10. Total compensation $5,500 USD. Paid usage + whitelisting included for 30 days.",
    receivedAt: "2025-01-20T19:10:00.000Z",
  },
  {
    subject: "Next steps — CloudDesk campaign",
    from: "Legal Team <contracts@clouddesk.example>",
    body:
      "Attached is the contract for the CloudDesk campaign. Once signed and we receive your W-9, we’ll confirm final rates and timelines.",
    receivedAt: "2025-01-20T19:15:00.000Z",
  },
  {
    subject: "Your order has shipped",
    from: "Orders <orders@techshop.example>",
    body:
      "Good news! Your order #48392 has shipped and will arrive in 3–5 business days.",
    receivedAt: "2025-01-20T19:20:00.000Z",
  },
  {
    subject: "Re: content collab",
    from: "Nina <nina@brandx.example>",
    body:
      "Hey!! Super excited :) Thinking 2 vids + maybe some stories? Budget is around 2–3k. We'd like drafts first if possible. Can you post sometime the week of April 15? Usage TBD.",
    receivedAt: "2025-01-20T19:25:00.000Z",
  },
];

function waitForEnter(rl: readline.Interface, label: string) {
  return new Promise<void>((resolve) => {
    rl.question(label, () => resolve());
  });
}

async function run() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (let i = 0; i < contexts.length; i += 1) {
      if (i > 0) {
        await waitForEnter(rl, "\nPress Enter to run the next email...\n");
      }
      const context = contexts[i]!;
      console.log(`\n=== Email ${i + 1}/${contexts.length} ===`);
      console.log(`Subject: ${context.subject}`);
      console.log(`From: ${context.from}`);
      console.log(`Body: ${context.body}`);
      console.log(`Received at: ${context.receivedAt}`);
      const result = await extractCampaignDetailsWithMeta(context);
      console.log(JSON.stringify(result, null, 2));
      if (result.extraction.isDeal) {
        try {
          buildDealPayloadFromExtraction(result.extraction, context, "debug-user");
          console.log("Supabase payload parse check: ok (not uploaded)");
        } catch (err) {
          console.error("Supabase payload parse check failed:", err);
        }
      } else {
        console.log("Supabase payload parse check: skipped (not a deal)");
      }
    }
  } finally {
    rl.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
