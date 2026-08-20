import type { LegalToolDecision } from "./legalIntent.service";

export type LegalAgentState =
  | "interpreting_request"
  | "requesting_clarification"
  | "planning"
  | "retrieving_case_context"
  | "reviewing_document"
  | "searching_official_sources"
  | "validating_citations"
  | "drafting"
  | "awaiting_confirmation"
  | "responding"
  | "failed_safely";

export type LegalAgentToolName =
  | "chat_context"
  | "case_context"
  | "document_context"
  | "document_comparison"
  | "legal_knowledge"
  | "official_web_search"
  | "citation_validation"
  | "timeline_creation"
  | "checklist_creation"
  | "legal_drafting";

export type LegalAgentPlan = {
  state: LegalAgentState;
  publicStatus: string;
  canProceed: boolean;
  requiresConfirmation: boolean;
  highRisk: boolean;
  clarificationQuestions: string[];
  toolSummaries: LegalAgentToolName[];
};

type AgentContext = {
  caseId?: unknown;
  selectedDocumentId?: unknown;
  documentId?: unknown;
  documentText?: unknown;
  documents?: unknown;
  sourcesConflict?: unknown;
  language?: unknown;
};

function localized(language: unknown, english: string, hinglish: string, hindi: string) {
  return language === "hi" ? hindi : language === "hinglish" ? hinglish : english;
}

function hasDocumentContext(context: AgentContext) {
  if (typeof context.selectedDocumentId === "string" && context.selectedDocumentId.trim().length > 0) return true;
  if (typeof context.documentText === "string" && context.documentText.trim().length > 0) return true;
  return Array.isArray(context.documents) && context.documents.length > 0;
}

function statusFor(decision: LegalToolDecision, language: unknown) {
  if (decision.intent === "current_legal_research") {
    return localized(language, "Official sources checked", "Official sources check ho gaye", "आधिकारिक स्रोतों की जाँच पूरी हुई");
  }
  if (decision.intent === "document_analysis") {
    return localized(language, "Document reviewed", "Document review ho gaya", "दस्तावेज़ की समीक्षा पूरी हुई");
  }
  if (decision.intent === "case_assistance") {
    return localized(language, "Case context reviewed", "Case context review ho gaya", "मामले के संदर्भ की समीक्षा पूरी हुई");
  }
  if (decision.intent === "drafting") {
    return localized(language, "Structured draft prepared", "Structured draft taiyar hai", "संरचित मसौदा तैयार है");
  }
  if (decision.intent === "timeline") {
    return localized(language, "Case timeline organized", "Case timeline organize ho gayi", "मामले की समयरेखा व्यवस्थित है");
  }
  if (decision.intent === "checklist") {
    return localized(language, "Focused checklist prepared", "Focused checklist taiyar hai", "केंद्रित जाँच सूची तैयार है");
  }
  return localized(language, "Legal information prepared", "Legal information taiyar hai", "कानूनी जानकारी तैयार है");
}

export function buildLegalAgentPlan(input: {
  message: string;
  decision: LegalToolDecision;
  context?: AgentContext;
}): LegalAgentPlan {
  const context = input.context ?? {};
  const language = context.language;
  const base: LegalAgentPlan = {
    state: input.decision.agentState,
    publicStatus: statusFor(input.decision, language),
    canProceed: true,
    requiresConfirmation: false,
    highRisk: input.decision.intent === "urgent_safety",
    clarificationQuestions: [],
    toolSummaries: [],
  };

  if (input.decision.intent === "document_analysis" && !hasDocumentContext(context)) {
    return {
      ...base,
      state: "requesting_clarification",
      canProceed: false,
      publicStatus: localized(language, "Document needed", "Document chahiye", "दस्तावेज़ आवश्यक है"),
      clarificationQuestions: [localized(
        language,
        "Please attach or select the document you want me to review.",
        "Jis document ka review chahiye, use attach ya select karein.",
        "जिस दस्तावेज़ की समीक्षा चाहिए, उसे संलग्न या चुनें।",
      )],
    };
  }

  if (["case_assistance", "timeline", "checklist"].includes(input.decision.intent) && typeof context.caseId !== "string") {
    return {
      ...base,
      state: "requesting_clarification",
      canProceed: false,
      publicStatus: localized(language, "Case context needed", "Case context chahiye", "मामले का संदर्भ आवश्यक है"),
      clarificationQuestions: [localized(
        language,
        "Please select a case workspace, or share the key facts you want me to use.",
        "Case workspace select karein, ya woh key facts batayein jo use karne hain.",
        "कृपया मामला कार्यक्षेत्र चुनें, या वे मुख्य तथ्य बताएँ जिनका उपयोग करना है।",
      )],
    };
  }

  if (input.decision.intent === "drafting" && input.message.trim().split(/\s+/).length < 10) {
    return {
      ...base,
      state: "requesting_clarification",
      canProceed: false,
      publicStatus: localized(language, "More facts needed", "Kuch aur facts chahiye", "कुछ और तथ्य आवश्यक हैं"),
      clarificationQuestions: [localized(
        language,
        "Before drafting, please share the parties, key facts, desired outcome, and any deadline.",
        "Draft banane se pehle parties, key facts, desired outcome aur deadline batayein.",
        "मसौदा तैयार करने से पहले पक्षकार, मुख्य तथ्य, वांछित परिणाम और समय-सीमा बताएँ।",
      )],
    };
  }

  if (input.decision.intent === "unsupported_or_sensitive") {
    return {
      ...base,
      state: "requesting_clarification",
      canProceed: false,
      publicStatus: localized(language, "Clarifying the request", "Request clear kar raha hoon", "अनुरोध स्पष्ट किया जा रहा है"),
      clarificationQuestions: [localized(
        language,
        "Please describe the legal-information goal and the facts you want help organizing.",
        "Legal-information goal aur organize karne wale facts thoda clearly batayein.",
        "कृपया कानूनी जानकारी का उद्देश्य और व्यवस्थित किए जाने वाले तथ्य स्पष्ट करें।",
      )],
    };
  }

  if (context.sourcesConflict === true) {
    base.state = "validating_citations";
    base.publicStatus = localized(language, "Source dates compared", "Source dates compare ho gayi", "स्रोतों की तिथियों की तुलना पूरी हुई");
    base.toolSummaries.push("citation_validation");
  }
  if (input.decision.intent === "chat_memory_question") base.toolSummaries.push("chat_context");
  if (input.decision.retrieveCaseContext) base.toolSummaries.push("case_context");
  if (input.decision.retrieveDocumentContext) base.toolSummaries.push("document_context");
  if (input.decision.intent === "document_analysis" && /\b(?:compare|difference|versus|vs)\b/i.test(input.message)) {
    base.toolSummaries.push("document_comparison");
  }
  if (input.decision.automaticWeb) base.toolSummaries.push("official_web_search");
  if (input.decision.retrieveGlobalKnowledge) base.toolSummaries.push("legal_knowledge");
  if (input.decision.intent === "timeline") base.toolSummaries.push("timeline_creation");
  if (input.decision.intent === "checklist") base.toolSummaries.push("checklist_creation");
  if (input.decision.intent === "drafting") base.toolSummaries.push("legal_drafting");
  return base;
}
