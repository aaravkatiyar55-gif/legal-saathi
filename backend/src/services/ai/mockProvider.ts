import {
  appendLegalDisclaimer,
  detectConfidentialGovernmentData,
  detectIllegalConductRequest,
  safeBlockedReply,
} from "./aiSafety.service";
import { buildRagContextForQuery, getRagSourceTitles } from "../rag/rag.service";

const mockModeNotice =
  "Mock mode is active, so no external AI model has analysed the facts in this request.";

export async function mockAiResponse(prompt: string) {
  return {
    provider: "mock",
    answer: appendLegalDisclaimer(
      `${mockModeNotice} The backend received ${prompt.length} characters and is ready for provider configuration.`,
    ),
  };
}

export async function runMockLegalPreparationChat({
  messages,
}: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.content.trim();

  const userContent = messages
    .filter(message => message.role === "user")
    .map(message => message.content)
    .join("\n");
  const blockedReason = detectConfidentialGovernmentData(userContent)
    ? "CONFIDENTIAL_DATA_BLOCKED"
    : detectIllegalConductRequest(userContent)
      ? "ILLEGAL_CONDUCT_BLOCKED"
      : null;
  if (blockedReason) {
    return {
      reply: appendLegalDisclaimer(safeBlockedReply(blockedReason)),
      suggestedNextActions: [
        "Preserve truthful records and evidence.",
        "Ask for lawful process information or rights awareness.",
        "Consult a licensed advocate for urgent or high-risk matters.",
      ],
      canCreateCase: false,
      sources: [],
      provider: "mock" as const,
    };
  }

  const ragContext = await buildRagContextForQuery(latestUserMessage ?? "");
  const sources = getRagSourceTitles(ragContext);
  const sourceLine = sources.length
    ? `Local legal-knowledge matches: ${sources.join(", ")}.`
    : "The local legal-knowledge index did not return a matching source.";

  return {
    reply: appendLegalDisclaimer(
      [
        mockModeNotice,
        sourceLine,
        "Configure an approved backend AI provider to receive a substantive legal-preparation response. Your conversation and document context have not been sent to an external model.",
      ].join("\n\n"),
    ),
    suggestedNextActions: [
      "Add the important dates and the outcome you want.",
      "Keep the relevant notices, agreements, receipts, and correspondence together.",
      "Configure the approved AI provider before relying on generated analysis.",
    ],
    canCreateCase: messages.length > 0,
    sources,
    provider: "mock" as const,
  };
}
