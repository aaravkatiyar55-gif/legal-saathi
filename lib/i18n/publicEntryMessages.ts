import type { AppLanguage } from "./types";

type PublicEntryMessageValues = Record<string, string | number>;

const english = {
  "brand.byline": "A product by Inception AI Studios",
  "entry.heading": "Choose the path that fits your legal situation.",
  "entry.language": "Language",
  "entry.professional.aria": "Continue as a legal professional",
  "entry.professional.title": "I'm a Legal Professional",
  "entry.professional.description": "Organise your preparation and questions before speaking with a client, court, or colleague.",
  "entry.public.aria": "Continue as someone seeking legal help",
  "entry.public.title": "I Need Legal Help",
  "entry.public.description": "Start with general legal information and prepare questions for a qualified advocate.",
  "entry.boundary": "Legal Saathi provides general legal information, not legal representation. Do not share passwords, bank details, or highly sensitive identity information.",
  "entry.urgent": "For immediate danger or urgent legal action, contact official emergency help or a qualified legal professional.",
  "entry.links": "Legal information links",
  "entry.terms": "Terms",
  "entry.privacy": "Privacy",
} as const;

type PublicEntryMessageKey = keyof typeof english;
type PublicEntryCatalog = Record<PublicEntryMessageKey, string>;

const catalogs: Record<AppLanguage, PublicEntryCatalog> = {
  en: english,
  hi: {
    "brand.byline": "इंसेप्शन एआई स्टूडियोज़ का एक प्रोडक्ट",
    "entry.heading": "अपनी कानूनी स्थिति के अनुसार रास्ता चुनें।",
    "entry.language": "भाषा",
    "entry.professional.aria": "कानूनी पेशेवर के रूप में आगे बढ़ें",
    "entry.professional.title": "मैं कानूनी पेशेवर हूँ",
    "entry.professional.description": "क्लाइंट, अदालत या सहकर्मी से बात करने से पहले अपनी तैयारी और प्रश्न व्यवस्थित करें।",
    "entry.public.aria": "कानूनी सहायता लेने वाले व्यक्ति के रूप में आगे बढ़ें",
    "entry.public.title": "मुझे कानूनी सहायता चाहिए",
    "entry.public.description": "सामान्य कानूनी जानकारी से शुरू करें और योग्य अधिवक्ता के लिए अपने प्रश्न तैयार करें।",
    "entry.boundary": "लीगल साथी सामान्य कानूनी जानकारी देता है, कानूनी प्रतिनिधित्व नहीं। पासवर्ड, बैंक विवरण या अत्यधिक संवेदनशील पहचान जानकारी साझा न करें।",
    "entry.urgent": "तत्काल खतरे या जरूरी कानूनी कार्रवाई के लिए आधिकारिक आपातकालीन सहायता या योग्य कानूनी पेशेवर से संपर्क करें।",
    "entry.links": "कानूनी जानकारी के लिंक",
    "entry.terms": "नियम",
    "entry.privacy": "गोपनीयता",
  },
  hinglish: {
    "brand.byline": "Inception AI Studios ka product",
    "entry.heading": "Apni legal situation ke hisaab se raasta choose karein.",
    "entry.language": "Bhasha",
    "entry.professional.aria": "Legal professional ke roop mein continue karein",
    "entry.professional.title": "Main Legal Professional Hoon",
    "entry.professional.description": "Client, court, ya colleague se baat karne se pehle apni preparation aur questions organise karein.",
    "entry.public.aria": "Legal help lene wale vyakti ke roop mein continue karein",
    "entry.public.title": "Mujhe Legal Help Chahiye",
    "entry.public.description": "General legal information se shuru karein aur qualified advocate ke liye apne questions prepare karein.",
    "entry.boundary": "Legal Saathi general legal information deta hai, legal representation nahi. Password, bank details, ya bahut sensitive identity information share na karein.",
    "entry.urgent": "Immediate danger ya urgent legal action ke liye official emergency help ya qualified legal professional se contact karein.",
    "entry.links": "Legal information ke links",
    "entry.terms": "Rules",
    "entry.privacy": "Privacy aur data",
  },
};

export type { PublicEntryMessageKey };

export function publicEntryMessage(
  language: AppLanguage,
  key: PublicEntryMessageKey,
  values: PublicEntryMessageValues = {},
) {
  return catalogs[language][key].replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
}

export const publicEntryMessageKeys = Object.freeze(Object.keys(english) as PublicEntryMessageKey[]);
