import type { PolicySection } from "@/components/PublicPolicyPage";

export const privacySections: PolicySection[] = [
  { heading: "What we process", items: ["Verified account and session information", "Case details and documents you choose to submit", "Usage, plan, payment-order, consent, and security-event metadata", "Redacted prompts and bounded context sent to an approved AI provider when AI is enabled"] },
  { heading: "External processors", paragraphs: ["Google may verify sign-in, Razorpay may process checkout, Supabase may store tenant-scoped application records, approved AI providers may process sanitized prompts, and OCR services may extract text from documents. Provider use depends on environment configuration."] },
  { heading: "Sensitive information", paragraphs: ["Do not submit Aadhaar, PAN, passwords, bank credentials, full addresses, sealed records, confidential government material, or private documents unless a lawful and necessary workflow explicitly requires them."] },
  { heading: "Retention and rights", paragraphs: ["Development stores are temporary. Production retention must follow the approved policy and applicable law. You may request an export or deletion review; legally required payment and security records may be retained or anonymized rather than immediately erased."] },
];

export const termsSections: PolicySection[] = [
  { heading: "Service scope", paragraphs: ["Legal Saathi provides general legal information, organization, and preparation support. It is not a law firm, does not represent you, and does not replace a licensed advocate."] },
  { heading: "Lawful use", items: ["Provide truthful information", "Do not request evidence tampering, evasion, false statements, intimidation, bribery, violence, or other illegal conduct", "Do not upload material you are not authorized to process"] },
  { heading: "AI limitations", paragraphs: ["AI outputs can be incomplete, outdated, or wrong. Check important claims against current official sources and obtain qualified professional advice before legal action."] },
  { heading: "Urgent matters", paragraphs: ["For arrest, bail, violence, criminal allegations, court deadlines, or emergencies, contact a licensed advocate and the appropriate emergency or public authority immediately."] },
];

export const disclaimerSections: PolicySection[] = [
  { heading: "Not legal advice", paragraphs: ["Outputs are educational and preparatory. No advocate-client relationship is created."] },
  { heading: "No outcome promise", paragraphs: ["Legal Saathi does not predict or guarantee winning, bail, settlement, court outcomes, timelines, or legal strategy."] },
  { heading: "Verify current law", paragraphs: ["Laws, rules, judgments, portals, fees, and procedures change. Citations and retrieved material should be checked for authority, date, jurisdiction, and continuing validity."] },
];

export const refundSections: PolicySection[] = [
  { heading: "Cancelled or failed checkout", paragraphs: ["A cancelled or failed Razorpay checkout does not grant a plan or top-up. Access changes only after backend signature verification and idempotent payment finalization."] },
  { heading: "Refund review", paragraphs: ["Refund eligibility depends on the purchased product, consumption, payment state, and applicable law. Contact support with the transaction reference. Never email card details, OTPs, passwords, or payment secrets."] },
  { heading: "Credits after refund", paragraphs: ["A refund cannot create a negative unit balance. Consumed or disputed credits may require an administrator reconciliation review."] },
];

export const supportSections: PolicySection[] = [
  { heading: "Product support", paragraphs: ["Email inceptionaistudios@gmail.com with the feature name, safe error message, request reference, and browser version. Do not attach private legal documents or secrets."] },
  { heading: "Legal emergencies", paragraphs: ["Support cannot provide emergency or legal representation. Contact an enrolled advocate, police, court registry, emergency service, or relevant authority as appropriate."] },
];

export const exportSections: PolicySection[] = [
  { heading: "Owner-scoped export", paragraphs: ["Signed-in users can request profile, plan, usage-ledger, and case records associated with their verified account. Raw uploaded files are handled separately and are not embedded in the JSON export."] },
  { heading: "Safety", paragraphs: ["Store an export securely. It may contain private case information. Do not share it in public chats, issue trackers, or support messages."] },
];

export const deletionSections: PolicySection[] = [
  { heading: "Verified request", paragraphs: ["A signed-in user can create a pending deletion request. The request is reviewed against ownership, security, fraud-prevention, payment-retention, and legal obligations."] },
  { heading: "What deletion means", paragraphs: ["Eligible case and document data should be deleted or anonymized after verification. Records that must be retained are restricted and minimized; the interface does not claim immediate deletion when that would be inaccurate."] },
];
