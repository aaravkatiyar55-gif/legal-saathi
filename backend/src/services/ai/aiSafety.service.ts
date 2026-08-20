import { env } from "../../config/env";

export const legalInformationDisclaimer =
  "Legal Saathi provides AI-assisted legal information and may make mistakes. Verify important decisions, documents, and deadlines.";

export type ExternalAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RedactionCounts = Record<string, number>;
export type AiSafetyBlockCode = "CONFIDENTIAL_DATA_BLOCKED" | "ILLEGAL_CONDUCT_BLOCKED" | "INTERNAL_DATA_BLOCKED" | "PROVIDER_NOT_ALLOWED";

export class AiSafetyBlockError extends Error {
  code: AiSafetyBlockCode;

  constructor(code: AiSafetyBlockCode, message: string) {
    super(message);
    this.code = code;
  }
}

function parseProviderAllowlist() {
  return env.aiProviderAllowlist
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
}

export function isProviderAllowedInSafeMode(provider: string) {
  if (!env.aiSafeMode) return true;
  return parseProviderAllowlist().includes(provider.toLowerCase());
}

function replaceAndCount(text: string, pattern: RegExp, placeholder: string, counts: RedactionCounts) {
  return text.replace(pattern, () => {
    counts[placeholder] = (counts[placeholder] ?? 0) + 1;
    return placeholder;
  });
}

export function redactSensitiveText(value: string) {
  const counts: RedactionCounts = {};
  let text = value;

  text = replaceAndCount(text, /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, "[REDACTED_PAN]", counts);
  text = replaceAndCount(text, /\b(?:\d[\s-]?){12}\b/g, "[REDACTED_AADHAAR]", counts);
  text = replaceAndCount(text, /\b[6-9]\d{9}\b/g, "[REDACTED_PHONE]", counts);
  text = replaceAndCount(text, /(?:\+91[\s-]?)?[6-9]\d{9}\b/g, "[REDACTED_PHONE]", counts);
  text = replaceAndCount(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]", counts);
  text = replaceAndCount(text, /\b[A-Z0-9._-]+@[a-z]{2,}\b/gi, "[REDACTED_UPI_ID]", counts);
  text = replaceAndCount(text, /\b(?:account|a\/c|bank)\s*(?:number|no\.?)?\s*[:#-]?\s*\d{9,18}\b/gi, "[REDACTED_BANK_ACCOUNT]", counts);
  text = replaceAndCount(text, /\b(?:\d[\s-]?){13,18}\b/g, "[REDACTED_BANK_ACCOUNT]", counts);
  text = replaceAndCount(text, /\b(?:fir|f\.i\.r\.?)\s*(?:no\.?|number)?\s*[:#-]?\s*(?=[A-Z0-9/-]*\d)[A-Z0-9/-]{3,}\b/gi, "[REDACTED_FIR_NUMBER]", counts);
  text = replaceAndCount(text, /\b(?:case|court file|filing|diary|cnr)\s*(?:no\.?|number)?\s*[:#-]?\s*(?=[A-Z0-9/-]*\d)[A-Z0-9/-]{3,}\b/gi, "[REDACTED_CASE_NUMBER]", counts);
  text = replaceAndCount(text, /\b(?:aadhaar|pan|passport|driving licence|voter id|document id)\s*[:#-]?\s*[A-Z0-9/-]{4,}\b/gi, "[REDACTED_DOCUMENT_ID]", counts);
  text = replaceAndCount(text, /\baddress\s*[:#-]\s*[^.\n]{8,160}/gi, "[REDACTED_ADDRESS]", counts);
  text = replaceAndCount(text, /\bpolice station\s*[:#-]?\s*[^,.\n]{3,80}/gi, "[REDACTED_POLICE_STATION]", counts);
  text = replaceAndCount(
    text,
    /\b(?:my name is|name is|complainant is|victim is|accused is|petitioner is|respondent is)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/g,
    "[REDACTED_PERSON_NAME]",
    counts,
  );
  text = replaceAndCount(
    text,
    /\b(?:Mr|Mrs|Ms|Shri|Smt|Adv)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/g,
    "[REDACTED_PERSON_NAME]",
    counts,
  );

  return { text, counts };
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function detectConfidentialGovernmentData(value: string) {
  const text = value.toLowerCase();
  return includesAny(text, [
    "classified",
    "official secret",
    "official secrets act",
    "sealed court record",
    "sealed record",
    "sealed file",
    "confidential government",
    "government confidential",
    "internal police file",
    "police internal file",
    "case diary leak",
    "leaked government",
    "defence document",
    "defense document",
    "military secret",
    "intelligence document",
    "security agency document",
    "state secret",
  ]);
}

export function detectIllegalConductRequest(value: string) {
  const text = value.toLowerCase();
  return includesAny(text, [
    "hide evidence",
    "destroy evidence",
    "delete evidence",
    "alter evidence",
    "fabricate evidence",
    "fake evidence",
    "create false alibi",
    "fake alibi",
    "false statement",
    "lie to police",
    "mislead police",
    "evade arrest",
    "avoid arrest illegally",
    "abscond",
    "intimidate witness",
    "threaten witness",
    "influence witness",
    "bribe",
    "bribery",
    "hide drugs",
    "hide weapon",
    "hide contraband",
    "hide body",
    "dispose body",
    "delete chats",
    "delete records",
    "forge document",
    "fake document",
    "hack records",
    "revenge attack",
    "cover up crime",
    "escape police",
  ]);
}

export function detectPrivateSystemExtraction(value: string) {
  // Preserve detection for both the corrected public brand and legacy prompts.
  const text = value.toLowerCase().replace(/\blegal saathi\b/g, "legal sathi").replace(/\s+/g, " ");
  const asksToReveal = includesAny(text, [
    "show", "reveal", "print", "repeat", "share", "give me", "tell me", "extract", "dump", "expose", "copy", "list",
  ]);
  const systemPromptTarget = includesAny(text, [
    "system prompt", "developer prompt", "hidden prompt", "initial instructions", "internal instructions", "prompt hierarchy",
  ]);
  const encodedOrRolePlay = includesAny(text, [
    "base64", "rot13", "encode it", "encoded form", "roleplay as", "role play as", "pretend you are the developer",
    "ignore previous instructions", "ignore all instructions", "jailbreak", "developer mode",
  ]);
  const credentialTarget = includesAny(text, [
    "api key", "secret key", "service role", "session secret", "admin pin", "access token", "bearer token", ".env",
  ]);
  const privateArchitectureTarget = includesAny(text, [
    "private architecture", "internal architecture", "exact backend architecture", "private database schema", "internal security design",
    "private provider routing", "production infrastructure", "internal endpoint map",
  ]);
  const roadmapTarget = includesAny(text, ["unpublished roadmap", "internal roadmap", "secret roadmap", "unreleased feature list", "confidential roadmap"]);
  const exploitTarget = includesAny(text, [
    "bypass legal sathi", "hack legal sathi", "exploit legal sathi", "break legal sathi auth", "evade legal sathi quota",
    "bypass payment verification", "steal another user", "find an exploitable weakness",
  ]);
  const cloningTarget = includesAny(text, [
    "clone legal sathi exactly", "copy legal sathi exactly", "recreate your private", "copy your private architecture",
    "build a competitor from your internal", "duplicate your hidden prompt",
  ]);
  const crossUserTarget = includesAny(text, [
    "another user's case", "another user case", "other user's case", "someone else's case", "another user's chat",
    "another user's document", "all users' data", "all user data", "other customers' data", "cross-user data",
  ]);

  return (
    (systemPromptTarget && (asksToReveal || encodedOrRolePlay))
    || (credentialTarget && (asksToReveal || encodedOrRolePlay))
    || (privateArchitectureTarget && asksToReveal)
    || (roadmapTarget && asksToReveal)
    || exploitTarget
    || cloningTarget
    || crossUserTarget
    || (encodedOrRolePlay && (systemPromptTarget || credentialTarget || privateArchitectureTarget))
  );
}

export function safeBlockedReply(reason: AiSafetyBlockError["code"]) {
  if (reason === "CONFIDENTIAL_DATA_BLOCKED") {
    return "Please remove confidential, sealed, official, or government/state-sensitive information. Legal Saathi cannot process such material.";
  }
  if (reason === "PROVIDER_NOT_ALLOWED") {
    return "AI provider is not enabled in Safe Mode.";
  }
  if (reason === "INTERNAL_DATA_BLOCKED") {
    return "I cannot expose hidden prompts, credentials, private architecture, unpublished plans, exploitable weaknesses, or another user's data. I can explain public features, normal product limitations, and general security practices.";
  }
  return "Legal Saathi cannot help with illegal conduct, evasion, evidence tampering, false statements, witness intimidation, or obstruction of justice. I can help with lawful rights awareness, process information, documents to preserve, and questions to ask a licensed advocate.";
}

export function legalSafetyInstruction() {
  return [
    "Legal Saathi is a legal-information and preparation assistant, not a lawyer or law firm.",
    "Do not provide final legal advice, win/loss probabilities, guaranteed outcomes, fabricated stories, or tactical coaching to mislead police/courts.",
    "For criminal, arrest, bail, violence, kidnapping, drugs/NDPS, sexual offences, weapons, terror, organized crime, or urgent court matters, recommend immediate consultation with an enrolled/licensed advocate.",
    "Allowed: general legal information, rights awareness, process overview, factual complaint/missing-report formats, documents to preserve, and neutral questions to ask an advocate.",
    "Disallowed: hiding/destroying/altering/fabricating evidence, evading arrest, intimidating/influencing witnesses illegally, false alibis, false statements, hiding people/drugs/weapons/money/phones/locations/chats, bribery, hacking, forged documents, or obstruction of justice.",
    "For outcome/probability questions, give only general factors and a checklist for advocate discussion. Do not claim certainty.",
    "Answer directly without repeating a generic disclaimer in every response. Add a short, contextual caution or advocate recommendation only when urgency, legal risk, uncertainty, or missing facts make it useful. The product UI displays the general AI notice persistently.",
  ].join(" ");
}

function mergeCounts(target: RedactionCounts, source: RedactionCounts) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

export function prepareMessagesForExternalAi(
  messages: ExternalAiMessage[],
  provider: string,
  options: { skipContentBlock?: boolean } = {},
) {
  if (!isProviderAllowedInSafeMode(provider)) {
    throw new AiSafetyBlockError("PROVIDER_NOT_ALLOWED", safeBlockedReply("PROVIDER_NOT_ALLOWED"));
  }

  const userSuppliedContent = messages
    .filter((message) => message.role !== "system")
    .map((message) => message.content)
    .join("\n");
  if (!options.skipContentBlock && detectConfidentialGovernmentData(userSuppliedContent)) {
    console.warn("[AI Safety] confidential-data block", { provider });
    throw new AiSafetyBlockError("CONFIDENTIAL_DATA_BLOCKED", safeBlockedReply("CONFIDENTIAL_DATA_BLOCKED"));
  }
  if (!options.skipContentBlock && detectIllegalConductRequest(userSuppliedContent)) {
    console.warn("[AI Safety] illegal-conduct block", { provider });
    throw new AiSafetyBlockError("ILLEGAL_CONDUCT_BLOCKED", safeBlockedReply("ILLEGAL_CONDUCT_BLOCKED"));
  }
  if (detectPrivateSystemExtraction(userSuppliedContent)) {
    console.warn("[AI Safety] private-system extraction block", { provider, category: "internal_data" });
    throw new AiSafetyBlockError("INTERNAL_DATA_BLOCKED", safeBlockedReply("INTERNAL_DATA_BLOCKED"));
  }

  const redactionCounts: RedactionCounts = {};
  const sanitizedMessages = messages.map((message) => {
    const redacted = env.aiSafeMode ? redactSensitiveText(message.content) : { text: message.content, counts: {} };
    mergeCounts(redactionCounts, redacted.counts);
    return { ...message, content: redacted.text };
  });

  if (env.aiSafeMode && Object.keys(redactionCounts).length > 0) {
    console.info("[AI Safety] prompt redacted", { provider, redactionCounts });
  }

  return { messages: sanitizedMessages, redactionCounts };
}

export function appendLegalDisclaimer(reply: string) {
  return reply.trim();
}
