import { createHash } from "node:crypto";

import {
  currentPrivacyVersion,
  currentTermsVersion,
} from "./consentPolicy";

export type ConsentDocumentSection = {
  heading: string;
  paragraphs: string[];
};

export type ConsentPolicyDocument = {
  id: string;
  title: string;
  version: string;
  effectiveDate: string;
  sections: ConsentDocumentSection[];
};

const effectiveDate = "2026-07-28";

const terms: ConsentPolicyDocument = {
  id: `legal-saathi-terms-${currentTermsVersion}`,
  title: "Legal Saathi Terms and Conditions",
  version: currentTermsVersion,
  effectiveDate,
  sections: [
    {
      heading: "1. Service scope",
      paragraphs: [
        "Legal Saathi provides AI-assisted legal information, document support, research tools, case workspaces, and related preparation features. It does not create an advocate-client relationship or replace representation by a qualified professional.",
        "Important facts, documents, dates, limitation periods, filing requirements, and generated drafts must be checked before anyone relies on them.",
      ],
    },
    {
      heading: "2. Account and security",
      paragraphs: [
        "You must provide accurate account information, protect your sign-in methods, and use only accounts and documents you are authorized to access.",
        "Do not submit passwords, one-time codes, authentication secrets, banking credentials, or unnecessary government-identity details.",
      ],
    },
    {
      heading: "3. Responsible use",
      paragraphs: [
        "You may use Legal Saathi for lawful information, preparation, organization, and research. You may not use it to facilitate wrongdoing, intimidation, obstruction, evidence destruction, evasion, false statements, or unauthorized access.",
        "Legal Saathi may refuse, limit, or require confirmation for unsafe, unlawful, or consequential actions.",
      ],
    },
    {
      heading: "4. AI-assisted legal-information limitations",
      paragraphs: [
        "AI outputs can be incomplete, outdated, or mistaken. Legal Saathi does not guarantee outcomes, court acceptance, legal accuracy, or suitability for a particular matter.",
        "Urgent matters involving arrest, violence, police, courts, bail, child safety, limitation periods, or immediate harm require prompt help from an appropriate authority or qualified professional.",
      ],
    },
    {
      heading: "5. Files, cases, and third-party processing",
      paragraphs: [
        "Uploaded files and bounded request context may be processed by approved infrastructure, storage, AI, embedding, and search providers as described in the Privacy Policy.",
        "Only submit confidential, privileged, sealed, or third-party information when you have lawful authority and it is necessary for the requested task.",
      ],
    },
    {
      heading: "6. Plans, units, payments, and refunds",
      paragraphs: [
        "Plans, units, add-ons, and prices shown at checkout are enforced by the server. A payment does not grant access until ownership, amount, currency, provider status, and signature verification succeed.",
        "Refunds, reversals, expiry, and cancellation rights follow the checkout terms, applicable law, and the status of work or units already supplied. Duplicate or replayed payments do not create duplicate credits.",
      ],
    },
    {
      heading: "7. Availability and changes",
      paragraphs: [
        "Features may depend on external providers and may be temporarily unavailable. Legal Saathi may change features or policies for security, legal, operational, or product reasons.",
        "A materially revised policy requires a new explicit acceptance before protected features resume.",
      ],
    },
    {
      heading: "8. Contact and governing requirements",
      paragraphs: [
        "Questions, complaints, and legal notices should use the support or grievance contact published inside Legal Saathi. Applicable mandatory consumer, privacy, and payment rights remain unaffected.",
      ],
    },
  ],
};

const privacy: ConsentPolicyDocument = {
  id: `legal-saathi-privacy-${currentPrivacyVersion}`,
  title: "Legal Saathi Privacy Policy",
  version: currentPrivacyVersion,
  effectiveDate,
  sections: [
    {
      heading: "1. Information processed",
      paragraphs: [
        "Legal Saathi processes account identifiers, authentication and security records, consent evidence, plan and unit records, chats, cases, uploaded files, generated outputs, support reports, and limited technical metadata needed to operate and secure the service.",
      ],
    },
    {
      heading: "2. Purposes",
      paragraphs: [
        "Information is used to authenticate users, preserve work, answer requests, retrieve relevant documents, enforce ownership and plan limits, process verified payments, prevent abuse, investigate incidents, and meet legal obligations.",
      ],
    },
    {
      heading: "3. AI, storage, and research providers",
      paragraphs: [
        "Only the bounded context required for a requested feature is sent to approved providers. Private case or document content must not be placed into public Web-search queries.",
        "Current online research may use privacy-safe search terms when the user requests it or the answer genuinely requires current information.",
      ],
    },
    {
      heading: "4. Retention and control",
      paragraphs: [
        "Records are retained only for product, security, accounting, dispute, or legal needs. Available settings and verified requests may be used to export, correct, or request deletion of eligible data.",
        "Some payment, fraud-prevention, security, and legal records may need to be retained or anonymized after an account request.",
      ],
    },
    {
      heading: "5. Cookies and security",
      paragraphs: [
        "Essential HttpOnly authentication and security cookies are required for signed-in features. Analytics and marketing cookies are not treated as accepted through this required service consent.",
        "Legal Saathi uses access controls, ownership checks, encryption in transit, input validation, and server-side authorization, but no online service can promise absolute security.",
      ],
    },
    {
      heading: "6. Contact",
      paragraphs: [
        "Privacy questions and verified rights requests should use the privacy or support contact published inside Legal Saathi.",
      ],
    },
  ],
};

function hashDocument(document: ConsentPolicyDocument) {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}

export const acceptedConsentItems = [
  "terms_and_conditions",
  "privacy_policy",
  "ai_legal_information_limitations",
  "account_and_data_processing_rules",
  "payment_and_refund_terms",
] as const;

export const consentDocumentBundle = {
  summary: "Please review how Legal Saathi provides AI-assisted legal information, processes account and case data, and handles plans and payments. Important details are available under View more.",
  effectiveDate,
  terms: {
    ...terms,
    sha256: hashDocument(terms),
  },
  privacy: {
    ...privacy,
    sha256: hashDocument(privacy),
  },
  acceptedItems: acceptedConsentItems,
} as const;
