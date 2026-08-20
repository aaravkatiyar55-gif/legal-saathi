import type { LegalResponseLanguage } from "./legalIntent.service";

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function isFounderQuestion(message: string) {
  const value = normalize(message);
  return /\b(?:who\s+(?:founded|created|made|built)|founder\s+(?:of\s+)?legal saathi|who\s+is\s+(?:the\s+)?founder)\b/.test(value)
    || /\blegal saathi\s+(?:kisne|kaun(?:\s+ne)?|kiske dwara)\s+(?:banaya|create kiya)\b/.test(value)
    || /(?:लीगल साथी).*(?:किसने|कौन).*?(?:बनाया|बनाई)/u.test(message);
}

export function isFounderPersonalDetailRequest(message: string) {
  const value = normalize(message);
  return /\b(?:founder|aarav kumar katiyar|creator)\b/.test(value)
    && /\b(?:age|address|school|bio(?:graphy)?|qualification|funding|contact|phone|email|social|instagram|linkedin|achievement)\b/.test(value);
}

export function founderReply(language: LegalResponseLanguage, personalDetail = false) {
  if (personalDetail) {
    if (language === "hi") return "मेरे पास साझा करने के लिए और व्यक्तिगत जानकारी नहीं है। कृपया अपनी कानूनी समस्या बताइए, मैं उसमें आपकी सहायता करूंगा।";
    if (language === "hinglish") return "Mere paas share karne ke liye aur personal information nahi hai. Aap apni legal problem batayiye, main usmein help karunga.";
    return "I don't have more personal information to share. Please tell me your legal problem, and I'll help you with that.";
  }
  if (language === "hi") return "Legal Saathi को Aarav Kumar Katiyar ने बनाया है।";
  if (language === "hinglish") return "Legal Saathi ko Aarav Kumar Katiyar ne banaya hai.";
  return "Legal Saathi was created by Aarav Kumar Katiyar.";
}

export function languageSelectorReply(language: LegalResponseLanguage) {
  if (language === "hi") return "ऊपर दिए गए भाषा चयनकर्ता से Hindi, English या Hinglish चुन लीजिए। भाषा बदलते ही मैं आपसे उसी भाषा में बात करूंगा।";
  if (language === "hinglish") return "Upar diye gaye language selector se Hindi, English ya Hinglish choose kar lijiye. Language change hote hi main aapse usi language mein baat karunga.";
  return "Use the language selector at the top to choose English, Hindi, or Hinglish. I will reply in the selected language once it changes.";
}
