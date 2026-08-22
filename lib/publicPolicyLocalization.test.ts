import assert from "node:assert/strict";
import { translateUiText, type AppLanguage } from "./i18n";

const publicPolicyLabels = [
  "General legal information and preparation help",
  "Legal Saathi public information",
  "Return to Legal Saathi",
  "Privacy Notice",
  "Terms of Use",
  "Legal Information Disclaimer",
  "Support",
  "What we process",
  "External processors",
  "Sensitive information",
  "Retention and rights",
  "Service scope",
  "Lawful use",
  "AI limitations",
  "Urgent matters",
  "Not legal advice",
  "No outcome promise",
  "Verify current law",
  "Product support",
  "Legal emergencies",
  "Refunds",
  "Cancelled or failed checkout",
  "Refund review",
  "Credits after refund",
  "Data export",
  "Owner-scoped export",
  "Safety",
  "Data deletion",
  "Verified request",
  "What deletion means",
  "Refund and Cancellation Policy",
  "Data Export Request",
  "Account Deletion Request",
];

const requiredPolicySentences = [
  "How Legal Saathi handles account, case, document, AI, usage, and payment information.",
  "Do not submit Aadhaar, PAN, passwords, bank credentials, full addresses, sealed records, confidential government material, or private documents unless a lawful and necessary workflow explicitly requires them.",
  "Legal Saathi provides general legal information, organization, and preparation support. It is not a law firm, does not represent you, and does not replace a licensed advocate.",
  "AI outputs can be incomplete, outdated, or wrong. Check important claims against current official sources and obtain qualified professional advice before legal action.",
  "For arrest, bail, violence, criminal allegations, court deadlines, or emergencies, contact a licensed advocate and the appropriate emergency or public authority immediately.",
  "Legal Saathi does not predict or guarantee winning, bail, settlement, court outcomes, timelines, or legal strategy.",
  "Email inceptionaistudios@gmail.com with the feature name, safe error message, request reference, and browser version. Do not attach private legal documents or secrets.",
  "A cancelled or failed Razorpay checkout does not grant a plan or top-up. Access changes only after backend signature verification and idempotent payment finalization.",
  "Signed-in users can request profile, plan, usage-ledger, and case records associated with their verified account. Raw uploaded files are handled separately and are not embedded in the JSON export.",
  "A signed-in user can create a pending deletion request. The request is reviewed against ownership, security, fraud-prevention, payment-retention, and legal obligations.",
  "Download an owner-scoped JSON export after signing in.",
  "Submit a verified request for deletion or anonymization review.",
];

for (const language of ["hi", "hinglish"] as const satisfies AppLanguage[]) {
  for (const copy of publicPolicyLabels) {
    assert.ok(translateUiText(copy, language).trim().length > 0, `${language} must render public policy label: ${copy}`);
  }
  for (const copy of requiredPolicySentences) {
    assert.notEqual(
      translateUiText(copy, language),
      copy,
      `${language} must localize public policy label: ${copy}`,
    );
  }
}

const checks = (publicPolicyLabels.length + requiredPolicySentences.length) * 2;
process.stdout.write(`Public policy localization contract passed: ${checks}/${checks}\n`);
