import "dotenv/config";
import { CampaignContext, CampaignExtraction } from "./models";
import { findUserIdByEmail, upsertDealFromExtraction } from "./supabaseStore";

async function main() {
  const testEmail = "ezics.729@gmail.com";
  if (!testEmail) {
    throw new Error("Missing TEST_USER_EMAIL in environment");
  }

  const userId = await findUserIdByEmail(testEmail);
  if (!userId) {
    throw new Error(`No user found for ${testEmail}`);
  }

  const extraction: CampaignExtraction = {
    campaignName: "Glow Shift Launch",
    brand: "Aurora Skincare",
    threadId: "19b6a98e70b22866",
    draftRequired: "required",
    exclusivity:
      "30 days exclusivity for skincare brands (no competing skincare content from 2025-01-10 to 2025-02-09)",
    usageRights: "Paid usage rights for 6 months on brand social + paid ads (US only)",
    goLiveStart: "2025-01-20T00:00:00Z",
    goLiveEnd: "2025-01-28T00:00:00Z",
    payment: 2500,
    keyDates: [
      {
        name: "Product delivery",
        description: null,
        startDate: "2025-01-08T00:00:00Z",
        endDate: null,
      },
      {
        name: "Draft due",
        description: null,
        startDate: "2025-01-12T00:00:00Z",
        endDate: null,
      },
      {
        name: "Go-live window",
        description: null,
        startDate: "2025-01-20T00:00:00Z",
        endDate: "2025-01-28T00:00:00Z",
      },
    ],
    requiredActions: [
      { name: "Submit draft for approval", description: "by 2025-01-12" },
      {
        name: "Include hashtags",
        description: 'Include "#AuroraPartner" and "#ad" in the first line of caption',
      },
      { name: "Tag brand", description: "Tag @auroraskincare in the post" },
      {
        name: "Use trackable link",
        description: "Use the trackable link: https://aurora.example.com/glow",
      },
    ],
    notes: "Please avoid medical claims. Focus on hydration and glow benefits.",
  };

  const context: CampaignContext = {
    threadId: extraction.threadId ?? "test-thread-id",
    subject: 'Campaign: Aurora Skincare - "Glow Shift" Launch (Draft + Go-Live)',
    from: "Frank Ezike <franklinezike@gmail.com>",
    bodyPreview: "Test payload generated for admin API validation.",
  };

  const result = await upsertDealFromExtraction(extraction, context, userId);
  console.log("Supabase sync result:", result);
}

main().catch((err) => {
  console.error("Test failed:", err);
  throw err;
});
