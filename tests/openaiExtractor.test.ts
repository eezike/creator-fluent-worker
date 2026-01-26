import "dotenv/config";
import assert from "node:assert/strict";
import type { CampaignEmail } from "../src/gmail/gmailModels";
import { extractCampaignDetailsWithMeta } from "../src/aiExtractor/aiExtractorService";

type TestCase = {
  name: string;
  context: CampaignEmail;
  expectBrandDeal: boolean;
  expectBrandName?: boolean;
};

const cases: TestCase[] = [
  {
    name: "obvious deal",
    context: {
      subject: "Brand deal: WaveSkin campaign brief",
      from: "Avery <partnerships@waveskin.example>",
      body:
        "Hi! We'd love to work with you on a paid partnership. Budget is $2,500 for two TikTok videos and one IG reel. Usage rights for 6 months. Go-live window March 10-20. Please confirm.",
      receivedAt: "2025-01-20T18:30:00.000Z",
    },
    expectBrandDeal: true,
    expectBrandName: true,
  },
  {
    name: "not a deal",
    context: {
      subject: "Password reset request",
      from: "Security <no-reply@bank.example>",
      body:
        "We received a request to reset your password. If this wasn't you, ignore this email.",
      receivedAt: "2025-01-20T18:35:00.000Z",
    },
    expectBrandDeal: false,
  },
  {
    name: "suspicious but likely deal",
    context: {
      subject: "Quick collab opportunity",
      from: "Jamie <jamie@agency.example>",
      body:
        "We have a collab opportunity for your channel. Paid partnership, budget $700, deliverables: 1 reel + 3 stories. Timeline next month.",
      receivedAt: "2025-01-20T18:40:00.000Z",
    },
    expectBrandDeal: true,
    expectBrandName: false,
  },
];

async function run() {
  let failed = 0;

  for (const testCase of cases) {
    const { extraction, usage, latencyMs, model } =
      await extractCampaignDetailsWithMeta(testCase.context);

    const dealPass = extraction.isBrandDeal === testCase.expectBrandDeal;
    if (!dealPass) failed += 1;

    if (!testCase.expectBrandDeal) {
      const arraysEmpty =
        extraction.keyDates.length === 0 && extraction.requiredActions.length === 0;
      const scalarsNull =
        extraction.campaignName === null &&
        extraction.brand === null &&
        extraction.draftRequired === null &&
        extraction.draftDeadline === null &&
        extraction.exclusivity === null &&
        extraction.usageRights === null &&
        extraction.goLiveStart === null &&
        extraction.goLiveEnd === null &&
        extraction.payment === null &&
        extraction.paymentStatus === null &&
        extraction.paymentTerms === null &&
        extraction.invoiceSentDate === null &&
        extraction.expectedPaymentDate === null &&
        extraction.notes === null;
      if (!arraysEmpty || !scalarsNull) failed += 1;
    }

    if (testCase.expectBrandName) {
      if (!extraction.brand) failed += 1;
    }

    console.log(
      `${dealPass ? "PASS" : "FAIL"} ${testCase.name} -> isBrandDeal=${
        extraction.isBrandDeal
      } reason=${extraction.brandDealReason ?? "(none)"}`
    );
    console.log(
      `  model=${model} latencyMs=${latencyMs} usage=${usage ? JSON.stringify(usage) : "n/a"}`
    );

    assert.equal(extraction.isBrandDeal, testCase.expectBrandDeal);
  }

  if (failed > 0) {
    throw new Error(`OpenAI extractor tests failed: ${failed} check(s)`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
