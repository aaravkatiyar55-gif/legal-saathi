import type { PolicySection } from "@/components/PublicPolicyPage";
import type { AppLanguage } from "@/lib/i18n";

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

export const policyPageIds = ["privacy", "terms", "disclaimer", "refunds", "support", "export", "deletion"] as const;
export type PolicyPageId = (typeof policyPageIds)[number];

export type PolicyPageContent = {
  title: string;
  summary: string;
  sections: PolicySection[];
};

type PolicyCatalog = Record<PolicyPageId, PolicyPageContent>;

const englishPolicyCatalog: PolicyCatalog = {
  privacy: { title: "Privacy Notice", summary: "How Legal Saathi handles account, case, document, AI, usage, and payment information.", sections: privacySections },
  terms: { title: "Terms of Use", summary: "Rules for using Legal Saathi lawfully and understanding the limits of AI-assisted legal preparation.", sections: termsSections },
  disclaimer: { title: "Legal Information Disclaimer", summary: "Legal Saathi is an information and preparation tool, not a substitute for a licensed advocate.", sections: disclaimerSections },
  refunds: { title: "Refund and Cancellation Policy", summary: "How cancelled, failed, verified, refunded, and disputed payments affect access and units.", sections: refundSections },
  support: { title: "Support", summary: "Safe ways to request technical help without sharing confidential legal or account information.", sections: supportSections },
  export: { title: "Data Export Request", summary: "Download an owner-scoped JSON export after signing in.", sections: exportSections },
  deletion: { title: "Account Deletion Request", summary: "Submit a verified request for deletion or anonymization review.", sections: deletionSections },
};

const hindiPolicyCatalog: PolicyCatalog = {
  privacy: {
    title: "गोपनीयता सूचना", summary: "Legal Saathi खाता, केस, दस्तावेज़, AI, उपयोग और भुगतान जानकारी को कैसे संभालता है।",
    sections: [
      { heading: "हम क्या संसाधित करते हैं", items: ["सत्यापित खाता और सत्र की जानकारी", "वे केस विवरण और दस्तावेज़ जिन्हें आप भेजना चुनते हैं", "उपयोग, योजना, भुगतान-ऑर्डर, सहमति और सुरक्षा-घटना का मेटाडेटा", "AI सक्षम होने पर अनुमोदित AI प्रदाता को भेजे गए साफ़ किए गए प्रॉम्प्ट और सीमित संदर्भ"] },
      { heading: "बाहरी प्रोसेसर", paragraphs: ["Google साइन-इन सत्यापित कर सकता है, Razorpay चेकआउट संसाधित कर सकता है, Supabase खाते तक सीमित ऐप रिकॉर्ड रख सकता है, अनुमोदित AI प्रदाता साफ़ किए गए प्रॉम्प्ट संसाधित कर सकते हैं और OCR सेवाएँ दस्तावेज़ से टेक्स्ट निकाल सकती हैं। प्रदाता का उपयोग वातावरण कॉन्फ़िगरेशन पर निर्भर करता है।"] },
      { heading: "संवेदनशील जानकारी", paragraphs: ["Aadhaar, PAN, पासवर्ड, बैंक क्रेडेंशियल, पूरा पता, सीलबंद रिकॉर्ड, गोपनीय सरकारी सामग्री या निजी दस्तावेज़ तब तक न भेजें जब तक किसी वैध और आवश्यक कार्यप्रवाह में उनकी साफ़ आवश्यकता न हो।"] },
      { heading: "डेटा रखने की अवधि और अधिकार", paragraphs: ["डेवलपमेंट स्टोर अस्थायी होते हैं। प्रोडक्शन में डेटा रखना अनुमोदित नीति और लागू कानून के अनुसार होना चाहिए। आप एक्सपोर्ट या डिलीशन रिव्यू का अनुरोध कर सकते हैं; कानूनन आवश्यक भुगतान और सुरक्षा रिकॉर्ड तुरंत मिटाने के बजाय रखे या अनाम किए जा सकते हैं।"] },
    ],
  },
  terms: {
    title: "उपयोग की शर्तें", summary: "Legal Saathi का वैध उपयोग करने और AI-सहायित कानूनी तैयारी की सीमाएँ समझने के नियम।",
    sections: [
      { heading: "सेवा का दायरा", paragraphs: ["Legal Saathi सामान्य कानूनी जानकारी, संगठन और तैयारी में सहायता देता है। यह लॉ फर्म नहीं है, आपका प्रतिनिधित्व नहीं करता और लाइसेंस प्राप्त अधिवक्ता का विकल्प नहीं है।"] },
      { heading: "वैध उपयोग", items: ["सत्य जानकारी दें", "सबूत से छेड़छाड़, कानून से बचने, झूठे बयान, धमकी, रिश्वत, हिंसा या अन्य अवैध आचरण का अनुरोध न करें", "ऐसी सामग्री अपलोड न करें जिसे संसाधित करने का अधिकार आपको नहीं है"] },
      { heading: "AI की सीमाएँ", paragraphs: ["AI के उत्तर अधूरे, पुराने या गलत हो सकते हैं। कानूनी कार्रवाई से पहले महत्वपूर्ण दावों को वर्तमान आधिकारिक स्रोतों से जाँचें और योग्य पेशेवर सलाह लें।"] },
      { heading: "तत्काल मामले", paragraphs: ["गिरफ़्तारी, जमानत, हिंसा, आपराधिक आरोप, अदालत की समय-सीमा या आपात स्थिति में तुरंत लाइसेंस प्राप्त अधिवक्ता और उपयुक्त आपातकालीन या सार्वजनिक प्राधिकरण से संपर्क करें।"] },
    ],
  },
  disclaimer: {
    title: "कानूनी जानकारी अस्वीकरण", summary: "Legal Saathi जानकारी और तैयारी का उपकरण है, लाइसेंस प्राप्त अधिवक्ता का विकल्प नहीं।",
    sections: [
      { heading: "कानूनी सलाह नहीं", paragraphs: ["आउटपुट शैक्षिक और तैयारी के लिए हैं। इससे अधिवक्ता-ग्राहक संबंध नहीं बनता।"] },
      { heading: "परिणाम की कोई गारंटी नहीं", paragraphs: ["Legal Saathi जीत, जमानत, समझौते, अदालत के परिणाम, समय-सीमा या कानूनी रणनीति का अनुमान या गारंटी नहीं देता।"] },
      { heading: "वर्तमान कानून जाँचें", paragraphs: ["कानून, नियम, निर्णय, पोर्टल, फीस और प्रक्रियाएँ बदलती रहती हैं। उद्धरण और प्राप्त सामग्री को प्राधिकरण, तारीख, क्षेत्राधिकार और वर्तमान वैधता के लिए जाँचना चाहिए।"] },
    ],
  },
  refunds: {
    title: "रिफंड और रद्दीकरण नीति", summary: "रद्द, असफल, सत्यापित, रिफंड और विवादित भुगतान एक्सेस और यूनिट्स को कैसे प्रभावित करते हैं।",
    sections: [
      { heading: "रद्द या असफल चेकआउट", paragraphs: ["रद्द या असफल Razorpay चेकआउट कोई योजना या टॉप-अप नहीं देता। बैकएंड हस्ताक्षर सत्यापन और idempotent भुगतान फाइनलाइज़ेशन के बाद ही एक्सेस बदलता है।"] },
      { heading: "रिफंड समीक्षा", paragraphs: ["रिफंड की पात्रता खरीदे गए उत्पाद, उपयोग, भुगतान स्थिति और लागू कानून पर निर्भर करती है। ट्रांज़ैक्शन रेफरेंस के साथ सपोर्ट से संपर्क करें। कार्ड विवरण, OTP, पासवर्ड या भुगतान रहस्य कभी ईमेल न करें।"] },
      { heading: "रिफंड के बाद क्रेडिट", paragraphs: ["रिफंड से यूनिट बैलेंस नकारात्मक नहीं हो सकता। उपयोग किए गए या विवादित क्रेडिट के लिए एडमिनिस्ट्रेटर मिलान समीक्षा आवश्यक हो सकती है।"] },
    ],
  },
  support: {
    title: "सहायता", summary: "गोपनीय कानूनी या खाता जानकारी साझा किए बिना तकनीकी सहायता माँगने के सुरक्षित तरीके।",
    sections: [
      { heading: "उत्पाद सहायता", paragraphs: ["feature नाम, सुरक्षित error message, request reference और browser version के साथ inceptionaistudios@gmail.com पर ईमेल करें। निजी कानूनी दस्तावेज़ या रहस्य संलग्न न करें।"] },
      { heading: "कानूनी आपात स्थिति", paragraphs: ["सहायता आपातकालीन या कानूनी प्रतिनिधित्व नहीं दे सकती। स्थिति के अनुसार किसी नामांकित अधिवक्ता, पुलिस, कोर्ट रजिस्ट्री, आपात सेवा या संबंधित प्राधिकरण से संपर्क करें।"] },
    ],
  },
  export: {
    title: "डेटा एक्सपोर्ट अनुरोध", summary: "साइन इन करने के बाद खाते-तक-सीमित JSON एक्सपोर्ट डाउनलोड करें।",
    sections: [
      { heading: "खाता-सीमित एक्सपोर्ट", paragraphs: ["साइन-इन उपयोगकर्ता अपने सत्यापित खाते से जुड़े प्रोफ़ाइल, योजना, उपयोग-लेज़र और केस रिकॉर्ड का अनुरोध कर सकते हैं। मूल अपलोड की गई फाइलें अलग से संभाली जाती हैं और JSON एक्सपोर्ट में शामिल नहीं होतीं।"] },
      { heading: "सुरक्षा", paragraphs: ["एक्सपोर्ट को सुरक्षित रखें। इसमें निजी केस जानकारी हो सकती है। इसे सार्वजनिक चैट, issue tracker या support message में साझा न करें।"] },
    ],
  },
  deletion: {
    title: "खाता हटाने का अनुरोध", summary: "डिलीशन या anonymization समीक्षा के लिए सत्यापित अनुरोध भेजें।",
    sections: [
      { heading: "सत्यापित अनुरोध", paragraphs: ["साइन-इन उपयोगकर्ता लंबित डिलीशन अनुरोध बना सकते हैं। अनुरोध की समीक्षा स्वामित्व, सुरक्षा, धोखाधड़ी-रोकथाम, भुगतान-रखरखाव और कानूनी दायित्वों के विरुद्ध की जाती है।"] },
      { heading: "डिलीशन का अर्थ", paragraphs: ["पात्र केस और दस्तावेज़ डेटा को सत्यापन के बाद हटाया या अनाम किया जाना चाहिए। जिन रिकॉर्ड को रखना आवश्यक है वे सीमित और प्रतिबंधित रहते हैं; जहाँ तुरंत हटाना सही नहीं होगा वहाँ इंटरफ़ेस तत्काल डिलीशन का दावा नहीं करता।"] },
    ],
  },
};

const hinglishPolicyCatalog: PolicyCatalog = {
  privacy: {
    title: "Privacy ki jaankari", summary: "Legal Saathi account, case, document, AI, usage aur payment information ko kaise handle karta hai.",
    sections: [
      { heading: "Hum kya process karte hain", items: ["Verified account aur session information", "Case details aur documents jo aap submit karna choose karte hain", "Usage, plan, payment-order, consent aur security-event metadata", "AI enabled hone par approved AI provider ko bheje gaye sanitized prompts aur bounded context"] },
      { heading: "External processors", paragraphs: ["Google sign-in verify kar sakta hai, Razorpay checkout process kar sakta hai, Supabase account-scoped app records store kar sakta hai, approved AI providers sanitized prompts process kar sakte hain aur OCR services documents se text extract kar sakti hain. Provider ka use environment configuration par depend karta hai."] },
      { heading: "Sensitive information", paragraphs: ["Aadhaar, PAN, passwords, bank credentials, full address, sealed records, confidential government material ya private documents tab tak submit mat karein jab tak kisi lawful aur necessary workflow mein unki clear zaroorat na ho."] },
      { heading: "Retention aur rights", paragraphs: ["Development stores temporary hote hain. Production retention approved policy aur applicable law ke hisaab se hona chahiye. Aap export ya deletion review request kar sakte hain; law ke liye zaroori payment aur security records ko turant erase karne ke bajay retain ya anonymize kiya ja sakta hai."] },
    ],
  },
  terms: {
    title: "Istemaal ki shartein", summary: "Legal Saathi ko lawfully use karne aur AI-assisted legal preparation ki limits samajhne ke rules.",
    sections: [
      { heading: "Service scope", paragraphs: ["Legal Saathi general legal information, organization aur preparation support deta hai. Yeh law firm nahi hai, aapko represent nahi karta aur licensed advocate ka replacement nahi hai."] },
      { heading: "Lawful use", items: ["Sachchi information dein", "Evidence tampering, evasion, false statements, intimidation, bribery, violence ya kisi bhi illegal conduct ka request mat karein", "Aisi material upload mat karein jise process karne ka authority aapke paas nahi hai"] },
      { heading: "AI limitations", paragraphs: ["AI outputs incomplete, outdated ya wrong ho sakte hain. Legal action se pehle important claims ko current official sources se check karein aur qualified professional advice lein."] },
      { heading: "Urgent matters", paragraphs: ["Arrest, bail, violence, criminal allegations, court deadline ya emergency mein turant licensed advocate aur appropriate emergency ya public authority se contact karein."] },
    ],
  },
  disclaimer: {
    title: "Kanooni jaankari ka disclaimer", summary: "Legal Saathi information aur preparation tool hai, licensed advocate ka replacement nahi.",
    sections: [
      { heading: "Legal advice nahi", paragraphs: ["Outputs educational aur preparation ke liye hain. Isse advocate-client relationship create nahi hota."] },
      { heading: "Outcome ki guarantee nahi", paragraphs: ["Legal Saathi win, bail, settlement, court outcome, timeline ya legal strategy predict ya guarantee nahi karta."] },
      { heading: "Current law verify karein", paragraphs: ["Laws, rules, judgments, portals, fees aur procedures change hote rehte hain. Citations aur retrieved material ko authority, date, jurisdiction aur continuing validity ke liye check karna chahiye."] },
    ],
  },
  refunds: {
    title: "Refund aur cancel karne ki policy", summary: "Cancelled, failed, verified, refunded aur disputed payments access aur units ko kaise affect karte hain.",
    sections: [
      { heading: "Cancelled ya failed checkout", paragraphs: ["Cancelled ya failed Razorpay checkout koi plan ya top-up grant nahi karta. Backend signature verification aur idempotent payment finalization ke baad hi access change hota hai."] },
      { heading: "Refund review", paragraphs: ["Refund eligibility purchased product, consumption, payment state aur applicable law par depend karti hai. Transaction reference ke saath support se contact karein. Card details, OTPs, passwords ya payment secrets kabhi email mat karein."] },
      { heading: "Refund ke baad credits", paragraphs: ["Refund negative unit balance create nahi kar sakta. Consumed ya disputed credits ko administrator reconciliation review ki zaroorat ho sakti hai."] },
    ],
  },
  support: {
    title: "Madad", summary: "Confidential legal ya account information share kiye bina technical help maangne ke safe tareeqe.",
    sections: [
      { heading: "Product support", paragraphs: ["Feature name, safe error message, request reference aur browser version ke saath inceptionaistudios@gmail.com par email karein. Private legal documents ya secrets attach mat karein."] },
      { heading: "Legal emergencies", paragraphs: ["Support emergency ya legal representation provide nahi kar sakta. Situation ke hisaab se enrolled advocate, police, court registry, emergency service ya relevant authority se contact karein."] },
    ],
  },
  export: {
    title: "Apna data export karein", summary: "Sign in ke baad owner-scoped JSON export download karein.",
    sections: [
      { heading: "Owner-scoped export", paragraphs: ["Signed-in users apne verified account se linked profile, plan, usage-ledger aur case records request kar sakte hain. Raw uploaded files alag handle hoti hain aur JSON export mein embed nahi hoti."] },
      { heading: "Safety", paragraphs: ["Export ko securely store karein. Isme private case information ho sakti hai. Isse public chats, issue trackers ya support messages mein share mat karein."] },
    ],
  },
  deletion: {
    title: "Account delete request", summary: "Deletion ya anonymization review ke liye verified request submit karein.",
    sections: [
      { heading: "Verified request", paragraphs: ["Signed-in user pending deletion request create kar sakte hain. Request ownership, security, fraud-prevention, payment-retention aur legal obligations ke against review hoti hai."] },
      { heading: "Deletion ka matlab", paragraphs: ["Eligible case aur document data ko verification ke baad delete ya anonymize kiya jana chahiye. Jo records retain karne zaroori hain woh restricted aur minimized rahenge; jahan immediate deletion accurate nahi hoga, interface aisa claim nahi karta."] },
    ],
  },
};

const policyCatalogs: Record<AppLanguage, PolicyCatalog> = {
  en: englishPolicyCatalog,
  hi: hindiPolicyCatalog,
  hinglish: hinglishPolicyCatalog,
};

export function getPolicyPageContent(page: PolicyPageId, language: AppLanguage): PolicyPageContent {
  return policyCatalogs[language][page];
}
