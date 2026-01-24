import assert from "node:assert/strict";
import { classifyEmail } from "../src/classifier/classifierService";
import type { ParsedEmail } from "../src/classifier/classifierModels";

type TestCase = {
  name: string;
  email: ParsedEmail;
  expectCampaign: boolean;
};

const cases: TestCase[] = [
  {
    name: "obvious spam",
    email: {
      from: "Security Bot <no-reply@bank.example>",
      subject: "Your verification code",
      snippet: "Use this code to reset your password. This is an automated message.",
    },
    expectCampaign: false,
  },
  {
    name: "brandy-looking spam",
    email: {
      from: "Marketing Updates <no-reply@newsletter.example>",
      subject: "Sponsorship opportunity inside",
      snippet:
        "Read our newsletter for creator news. Unsubscribe anytime. This is not an offer.",
    },
    expectCampaign: false,
  },
  {
    name: "obvious real deal",
    email: {
      from: "Acme Partnerships <partnerships@acme.example>",
      subject: "Campaign brief and statement of work",
      snippet:
        "Sharing the statement of work and usage rights. Budget is $1500 for two deliverables.",
    },
    expectCampaign: true,
  },
  {
    name: "suspicious but likely deal",
    email: {
      from: "Jamie <jamie@agency.example>",
      subject: "Quick collab?",
      snippet: "We have a collab opportunity. Budget is $500. Timeline next month.",
    },
    expectCampaign: true,
  },
];

let failed = 0;
for (const testCase of cases) {
  const result = classifyEmail(testCase.email);
  const pass = result.isCampaign === testCase.expectCampaign;
  if (!pass) failed += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"} ${testCase.name} -> ${result.isCampaign} (${result.reason})`
  );
  assert.equal(result.isCampaign, testCase.expectCampaign);
}

if (failed > 0) {
  throw new Error(`Classifier tests failed: ${failed} case(s)`);
}
