export type LegalRequestIntent =
  | "greeting"
  | "casual_conversation"
  | "capability_question"
  | "stable_legal_information"
  | "current_legal_research"
  | "document_analysis"
  | "case_assistance"
  | "timeline"
  | "checklist"
  | "drafting"
  | "follow_up"
  | "chat_memory_question"
  | "urgent_safety"
  | "unsupported_or_sensitive";

export type LegalToolDecision = {
  intent: LegalRequestIntent;
  confidence: "high" | "medium";
  automaticWeb: boolean;
  manualWebAllowed: boolean;
  retrieveGlobalKnowledge: boolean;
  retrieveCaseContext: boolean;
  retrieveDocumentContext: boolean;
  agentState:
    | "interpreting_request"
    | "requesting_clarification"
    | "planning"
    | "retrieving_case_context"
    | "reviewing_document"
    | "searching_official_sources"
    | "drafting"
    | "responding";
};

export type LegalResponseLanguage = "en" | "hi" | "hinglish";

function normalizeMessage(message: string) {
  return message
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveLegalResponseLanguage(message: string, selectedLanguage: unknown): LegalResponseLanguage {
  // The signed-in user's selector is the product-level response-language
  // contract. Prompt language alone must not silently change the interface or
  // cause a different response language on another account/session.
  void message;
  return selectedLanguage === "hi" || selectedLanguage === "hinglish" ? selectedLanguage : "en";
}

export function isLanguageSelectorRequest(message: string) {
  const normalized = normalizeMessage(message);
  return /\b(?:talk|reply|speak|respond)\s+(?:to me\s+)?in\s+(?:english|hindi|hinglish)\b/.test(normalized)
    || /\b(?:change|switch)\s+(?:the\s+)?language\b/.test(normalized)
    || /\b(?:mujhse|mere se)\s+(?:hindi|hinglish|english)\s+mein\s+(?:baat|bat|reply)\s+karo\b/.test(normalized)
    || /\blanguage\s+change\s+kar\s+do\b/.test(normalized)
    || /(?:भाषा|लैंग्वेज).*(?:बदल|चेंज)/u.test(message);
}

function hasAny(message: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

const GREETING_PATTERNS = [
  /^(?:h+e+l+o+|h+i+|h+e+y+|nam+aste|nam+ste|good (?:morning|afternoon|evening))\b/,
  /^(?:hello|hi|hey|namaste|namste) (?:bhai|yaar|ji|sir|maam|madam)\b/,
  /^(?:how are you|how is it going|what is up|what's up)(?:\s|$)/,
  /^(?:bhai )?(?:kya |kaisa |kaise )?(?:haal|hal)(?: chal)?(?: hai| h)?\b/,
  /^(?:kaise ho|kya haal hai|kya hal h|kya scene hai|bhai kya haal|bhai kya haal chal)\b/,
  /^(?:नमस्ते|नमस्कार|कैसे हो|आप कैसे हैं|क्या हाल है|सुप्रभात)(?:\s|$)/u,
];

const THANKS_PATTERNS = [
  /^(?:thanks?|thank you|shukriya|dhanyavaad|dhanyavad)(?: bhai| yaar| ji)?$/,
  /^(?:धन्यवाद|शुक्रिया)$/u,
];

const CAPABILITY_PATTERNS = [
  /\b(?:what can you do|how can you help|what do you do|your capabilities)\b/,
  /\b(?:kya kar sakte ho|kya help kar sakte ho|tum kya help|aap kya kar sakte hain)\b/,
  /(?:आप क्या कर सकते हैं|आप कैसे मदद कर सकते हैं)/u,
];

const CURRENT_RESEARCH_PATTERNS = [
  /\b(?:current|latest|recent|today|newest|this week|this month|as of now)\b/,
  /\b(?:amendment|notification|circular|gazette|effective date|court schedule|portal status|verify online)\b/,
  /\b(?:search the web|use web search|check online|find current|search official|latest judgment)\b/,
  /\b202[4-9]\b/,
  /(?:नवीनतम|ताज़ा|वर्तमान|हालिया|नया संशोधन|आज|ऑनलाइन जाँच|वेब खोज)/u,
  /\b(?:abhi ka|aaj ka|naya kanoon|latest kanoon|web pe|online check)\b/,
];

const DOCUMENT_PATTERNS = [
  /\b(?:uploaded|attached|this|the) (?:document|notice|agreement|contract|pdf|image|letter|file|clause)\b/,
  /\b(?:according to|based on|from|in) (?:the |my |these |those )?(?:uploaded |attached )?(?:documents?|records?|files?|spreadsheets?|workbooks?|evidence)\b/,
  /\b(?:uploaded|attached|these|those|my) (?:documents?|records?|files?|spreadsheets?|workbooks?|images?|screenshots?|videos?|evidence)\b/,
  /\b(?:summari[sz]e|review|compare|extract|explain|analyse|analyze) (?:this|the|my|these) (?:document|notice|agreement|contract|pdf|letter|file|clause)/,
  /\b(?:is|iss|yeh) (?:document|notice|agreement|contract|pdf|file) ko (?:summari[sz]e|review|explain|analyse|analyze)(?: karo| karein)?\b/,
  /\b(?:uploaded notice|attached notice|document ke|notice ka|agreement ko|contract ko|pdf ko)\b/,
  /(?:इस दस्तावेज़|इस नोटिस|इस अनुबंध|अपलोड किए गए दस्तावेज़|दस्तावेज़ का सार)/u,
];

const DRAFTING_PATTERNS = [
  /\b(?:draft|write|prepare|create) (?:a |an |my )?(?:legal notice|notice|complaint|application|agreement|affidavit|reply|response|petition|letter)\b/,
  /\b(?:notice|complaint|application|agreement|affidavit|reply) (?:ka )?(?:draft|likho|banao|taiyar karo)\b/,
  /(?:कानूनी नोटिस|शिकायत|आवेदन|हलफनामा).*(?:लिख|तैयार|बना)/u,
];

const URGENT_PATTERNS = [
  /\b(?:arrest|detained|police at my door|police custody|in custody|taken into custody|tonight|immediately|urgent|limitation expires|limitation deadline|deadline (?:is )?today)\b/,
  /\b(?:giraftar|giraftari|police aa gayi|aaj raat|turant|abhi police)\b/,
  /(?:गिरफ्तार|गिरफ़्तारी|हिरासत|आज रात|तुरंत|पुलिस मेरे घर)/u,
];

const STABLE_LEGAL_PATTERNS = [
  /\b(?:law|legal|rights?|act|rule|section|court|civil|criminal|bail|fir|consumer|tenant|landlord|divorce|maintenance|contract|limitation|procedure|salary|wages?|employer|employment|rent|rental|eviction|security deposit|property|cyber(?:crime)?|online fraud|fraud|harassment|custody|inheritance|domestic violence)\b/,
  /\b(?:kanoon|adhikar|dhara|jamaanat|zamanat|case|mukadma|complaint|kirayedar|makaan malik|maalik|talak|salary|tankhwa|naukri|employer|kiraya|deposit|property|zameen|cyber|online fraud|fraud|dhokha|custody|viraasat|virasat|gharailu hinsa)\b/,
  /(?:कानून|कानूनी|अधिकार|धारा|अधिनियम|नियम|न्यायालय|अदालत|जमानत|एफआईआर|उपभोक्ता|किरायेदार|मकान मालिक|तलाक|वेतन|तनख़्वाह|नौकरी|किराया|जमा राशि|संपत्ति|कस्टडी|अभिरक्षा|नोटिस|साइबर|ऑनलाइन धोखाधड़ी|धोखाधड़ी|हिरासत|विरासत|घरेलू हिंसा)/u,
  /(?:जमीन|ज़मीन|संपत्ति).*(?:कागज|कागज़|दस्तावेज़)|(?:कागज|कागज़|दस्तावेज़).*(?:जमीन|ज़मीन|संपत्ति)/u,
];

// People commonly describe a real legal situation without using legal words.
// Keep this deliberately bounded: it routes likely civil/consumer/family
// situations to safe information, while the dedicated safety checks still
// reject illegal conduct and sensitive government data before a provider call.
const PLAUSIBLE_LEGAL_SITUATION_PATTERNS = [
  /\b(?:seller|buyer|shop|order|service|delivery|payment|refund|money|paid|charged|loan|debt|neighbou?r|society|marriage|spouse|husband|wife|family|job|company|school|college|hospital|threat|fight|accident|damage|cheat(?:ed|ing)?|scam(?:med)?|reply(?:ing)?|harass(?:ed|ment)?|land|house|flat)\b/,
  /\b(?:paise|paisa|samaan|dukandaar|seller|buyer|order|delivery|payment|refund|udhaar|karz|padosi|society|shaadi|pati|patni|parivaar|naukri|company|dhamki|ladai|haadsa|nuksaan|dhokha|jawab nahi|zameen|ghar|flat)\b/,
  /(?:पैसे|पैसा|सामान|दुकानदार|विक्रेता|खरीदार|ऑर्डर|डिलीवरी|भुगतान|रिफंड|उधार|कर्ज़|पड़ोसी|सोसायटी|शादी|पति|पत्नी|परिवार|नौकरी|कंपनी|धमकी|लड़ाई|हादसा|नुकसान|धोखा|जवाब नहीं|ज़मीन|घर|फ्लैट)/u,
  // These everyday descriptions often omit words such as "law", "legal", or
  // "complaint", but still describe a bounded civil, family, employment, or
  // identity-related issue that can safely receive general legal information.
  /\b(?:advance|earnest money|booking amount|dues?|arrears?|boss|supervisor|child|minor|identity(?: theft| misuse)?|impersonat(?:e|ed|ion))\b/,
  /\b(?:advance|bayana|baki|bakaya|boss|supervisor|bacch[ae]|pehchan|identity|naam ka galat use)\b/,
  /(?:एडवांस|अग्रिम|बकाया|बॉस|बच्चे|पहचान|गलत इस्तेमाल)/u,
];

const CASE_PATTERNS = [
  /\b(?:my case|my matter|my dispute|my evidence|my timeline|my hearing|my bail options|case checklist|relief sought)\b/,
  /\b(?:mere case|meri case|mere matter|mera dispute|meri hearing|mere evidence|case ki timeline)\b/,
  /(?:मेरे मामले|मेरे केस|मेरी सुनवाई|मेरे सबूत|मेरी समयरेखा)/u,
];

const TIMELINE_PATTERNS = [
  /\b(?:create|make|prepare|build|organize) (?:a |my |the )?(?:case |legal |event )?(?:timeline|chronology)\b/,
  /\b(?:mere|meri|my) (?:case|matter) (?:ki |ka )?(?:timeline|chronology)(?: banao| taiyar karo)?\b/,
  /(?:मेरे|मेरी).*(?:समयरेखा|घटनाक्रम)/u,
];

const CHECKLIST_PATTERNS = [
  /\b(?:create|make|prepare|build) (?:a |my |the )?(?:case |legal |document )?checklist\b/,
  /\b(?:case|complaint|hearing|documents?) (?:ki |ka )?checklist(?: banao| taiyar karo)?\b/,
  /(?:मामले|शिकायत|सुनवाई|दस्तावेज़).*(?:जाँच सूची|चेकलिस्ट)/u,
];

const CHAT_MEMORY_PATTERNS = [
  /\b(?:what did i|what have i|what did we|earlier i|previously i|our conversation|this chat|chat history)\b/,
  /\b(?:maine pehle|humne pehle|pichli baat|pichli chat|is chat mein|pehle kya)\b/,
  /(?:मैंने पहले|हमने पहले|पिछली बातचीत|इस चैट में|पहले क्या)/u,
];

const FOLLOW_UP_PATTERNS = [
  /^(?:what about|and then|then what|explain more|continue|why|how so|what next)\b/,
  /^(?:aur|phir|uske baad|thoda aur|aage|kyun|kaise)\b/,
  /^(?:और|फिर|उसके बाद|आगे|क्यों|कैसे)(?:\s|$)/u,
];

function isShortGreeting(message: string) {
  const words = message.split(" ").filter(Boolean);
  if (words.length > 10) return false;
  return hasAny(message, GREETING_PATTERNS) || hasAny(message, THANKS_PATTERNS);
}

function decision(intent: LegalRequestIntent, confidence: LegalToolDecision["confidence"]): LegalToolDecision {
  if (intent === "greeting" || intent === "casual_conversation" || intent === "capability_question") {
    return {
      intent,
      confidence,
      automaticWeb: false,
      manualWebAllowed: false,
      retrieveGlobalKnowledge: false,
      retrieveCaseContext: false,
      retrieveDocumentContext: false,
      agentState: "responding",
    };
  }
  if (intent === "current_legal_research") {
    return { intent, confidence, automaticWeb: true, manualWebAllowed: true, retrieveGlobalKnowledge: true, retrieveCaseContext: false, retrieveDocumentContext: false, agentState: "searching_official_sources" };
  }
  if (intent === "document_analysis") {
    return { intent, confidence, automaticWeb: false, manualWebAllowed: false, retrieveGlobalKnowledge: false, retrieveCaseContext: false, retrieveDocumentContext: true, agentState: "reviewing_document" };
  }
  if (intent === "timeline" || intent === "checklist") {
    return { intent, confidence, automaticWeb: false, manualWebAllowed: false, retrieveGlobalKnowledge: false, retrieveCaseContext: true, retrieveDocumentContext: false, agentState: "planning" };
  }
  if (intent === "case_assistance") {
    return { intent, confidence, automaticWeb: false, manualWebAllowed: true, retrieveGlobalKnowledge: true, retrieveCaseContext: true, retrieveDocumentContext: false, agentState: "retrieving_case_context" };
  }
  if (intent === "chat_memory_question") {
    return { intent, confidence, automaticWeb: false, manualWebAllowed: false, retrieveGlobalKnowledge: false, retrieveCaseContext: false, retrieveDocumentContext: false, agentState: "interpreting_request" };
  }
  if (intent === "drafting") {
    return { intent, confidence, automaticWeb: false, manualWebAllowed: true, retrieveGlobalKnowledge: true, retrieveCaseContext: false, retrieveDocumentContext: false, agentState: "drafting" };
  }
  if (intent === "urgent_safety") {
    return { intent, confidence, automaticWeb: false, manualWebAllowed: true, retrieveGlobalKnowledge: true, retrieveCaseContext: true, retrieveDocumentContext: false, agentState: "requesting_clarification" };
  }
  if (intent === "stable_legal_information" || intent === "follow_up") {
    return { intent, confidence, automaticWeb: false, manualWebAllowed: true, retrieveGlobalKnowledge: true, retrieveCaseContext: false, retrieveDocumentContext: false, agentState: intent === "follow_up" ? "interpreting_request" : "responding" };
  }
  return { intent, confidence, automaticWeb: false, manualWebAllowed: false, retrieveGlobalKnowledge: false, retrieveCaseContext: false, retrieveDocumentContext: false, agentState: "requesting_clarification" };
}

export function classifyLegalRequest(
  message: string,
  options: { hasPriorConversation?: boolean; hasCaseContext?: boolean } = {},
): LegalToolDecision {
  const normalized = normalizeMessage(message);
  if (!normalized) return decision("unsupported_or_sensitive", "high");

  // Specific user goals win over leading salutations, e.g. "hello, what is Section 420?".
  if (hasAny(normalized, URGENT_PATTERNS)) return decision("urgent_safety", "high");
  if (hasAny(normalized, DOCUMENT_PATTERNS)) return decision("document_analysis", "high");
  if (hasAny(normalized, CURRENT_RESEARCH_PATTERNS) && hasAny(normalized, STABLE_LEGAL_PATTERNS.concat(CASE_PATTERNS))) {
    return decision("current_legal_research", "high");
  }
  if (hasAny(normalized, DRAFTING_PATTERNS)) return decision("drafting", "high");
  if (hasAny(normalized, TIMELINE_PATTERNS)) return decision("timeline", "high");
  if (hasAny(normalized, CHECKLIST_PATTERNS)) return decision("checklist", "high");
  if (options.hasPriorConversation && hasAny(normalized, CHAT_MEMORY_PATTERNS)) return decision("chat_memory_question", "high");
  if (hasAny(normalized, CASE_PATTERNS)) return decision("case_assistance", "high");
  if (hasAny(normalized, STABLE_LEGAL_PATTERNS)) return decision("stable_legal_information", "high");
  if (hasAny(normalized, PLAUSIBLE_LEGAL_SITUATION_PATTERNS)) return decision("stable_legal_information", "medium");
  if (hasAny(normalized, CAPABILITY_PATTERNS)) return decision("capability_question", "high");
  if (isShortGreeting(normalized)) return decision("greeting", "high");
  if (options.hasPriorConversation && hasAny(normalized, FOLLOW_UP_PATTERNS)) return decision("follow_up", "medium");
  if (normalized.split(" ").length <= 12 && /\b(?:friend|bro|bhai|yaar|mood|day|weather|joke)\b/.test(normalized)) {
    return decision("casual_conversation", "medium");
  }
  if (hasAny(normalized, CURRENT_RESEARCH_PATTERNS)) return decision("current_legal_research", "medium");
  if (options.hasCaseContext) return decision("case_assistance", "medium");
  return decision("unsupported_or_sensitive", "medium");
}
