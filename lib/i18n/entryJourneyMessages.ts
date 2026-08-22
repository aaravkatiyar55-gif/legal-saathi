import type { AppLanguage } from "./types";

type MessageValues = Record<string, string | number>;

const english = {
  "preparation.kicker": "A small first step",
  "preparation.heading": "Make your next legal conversation clearer",
  "preparation.intro": "Pick a familiar situation, then take a minute to organise the facts before you enter the workspace.",
  "preparation.scenarioPicker": "Choose a preparation scenario",
  "preparation.scenarioLabel": "A useful question to prepare",
  "preparation.adaptationNote": "You can adapt this in your own words after choosing a workspace path.",
  "preparation.checklistTitle": "90-second preparation check",
  "preparation.checklistNote": "Nothing is saved here. This is only a private way to get organised.",
  "preparation.progress": "{completed} of {total} preparation checks noted",
  "preparation.consumer.title": "A consumer purchase went wrong",
  "preparation.consumer.summary": "A product or service did not match what was promised.",
  "preparation.consumer.question": "What proof and dates should I collect before I explore a consumer complaint?",
  "preparation.tenancy.title": "A rental issue is escalating",
  "preparation.tenancy.summary": "A tenant or landlord needs a clear, factual record before the next conversation.",
  "preparation.tenancy.question": "How can I organise a rental disagreement before I speak with the other side or an advocate?",
  "preparation.workplace.title": "A workplace payment is delayed",
  "preparation.workplace.summary": "Salary, notice, or employment terms need a timeline before any next step.",
  "preparation.workplace.question": "What details should I put in order before I ask about a delayed salary or employment issue?",
  "preparation.agreement.title": "An agreement needs a closer look",
  "preparation.agreement.summary": "A document can be prepared for a focused clause, risk, and question review.",
  "preparation.agreement.question": "What should I identify before I ask for a plain-language review of an agreement?",
  "preparation.check.one": "I can describe what happened in date order.",
  "preparation.check.two": "I know which records I may be allowed to share.",
  "preparation.check.three": "I can name the outcome or question I need help preparing for.",
  "clarity.kicker": "Quick legal-literacy sprint",
  "clarity.heading": "Spot the detail that makes a question stronger",
  "clarity.intro": "Three fictional prompts. Nothing you select is saved or sent.",
  "clarity.scenario": "Fictional scenario",
  "clarity.choose": "Choose the more careful answer",
  "clarity.context": "Needs context",
  "clarity.record": "Build a clearer record",
  "clarity.screenshot.statement": "A screenshot is always enough proof.",
  "clarity.screenshot.feedback": "Not always. The date, source, full conversation, and how it was obtained can matter too.",
  "clarity.promise.statement": "A spoken promise can never matter.",
  "clarity.promise.feedback": "Not always. Keep the exact words, who was present, and any follow-up messages in one place before asking for guidance.",
  "clarity.timeline.statement": "A short date-by-date timeline can make a legal question clearer.",
  "clarity.timeline.feedback": "Yes. A simple factual timeline often helps you explain the issue without sharing more personal information than needed.",
  "journey.kicker": "A continuous case journey",
  "journey.heading": "From first explanation to an advocate-ready brief",
  "journey.intro": "Legal Saathi keeps the work around one matter connected instead of ending at a single chat reply.",
  "journey.intake.title": "Explain the situation",
  "journey.intake.description": "Start in plain language. Guided intake asks only for facts that affect the next step.",
  "journey.record.title": "Build the case record",
  "journey.record.description": "Keep dates, parties, questions, and documents you choose to save in one case workspace.",
  "journey.gaps.title": "Find the gaps",
  "journey.gaps.description": "Review missing information, contradictions, evidence to collect, and questions for the other side.",
  "journey.sources.title": "Check the source trail",
  "journey.sources.description": "Separate your facts, document findings, and AI-prepared material before relying on legal information.",
  "journey.handoff.title": "Prepare the handoff",
  "journey.handoff.description": "Create an editable case brief for a qualified advocate; nothing is filed or sent automatically.",
  "journey.guardrails": "Trust boundaries",
  "journey.guardrail.editable": "Your facts stay editable",
  "journey.guardrail.traceable": "Sources remain traceable",
  "journey.guardrail.review": "Professional review stays in the loop",
} as const;

export type EntryJourneyMessageKey = keyof typeof english;
type EntryJourneyCatalog = Record<EntryJourneyMessageKey, string>;

const hi: EntryJourneyCatalog = {
  "preparation.kicker": "एक छोटा पहला कदम",
  "preparation.heading": "अपनी अगली कानूनी बातचीत को और स्पष्ट बनाएं",
  "preparation.intro": "एक परिचित स्थिति चुनें, फिर कार्यक्षेत्र में जाने से पहले तथ्यों को व्यवस्थित करने के लिए एक मिनट लें।",
  "preparation.scenarioPicker": "तैयारी की स्थिति चुनें",
  "preparation.scenarioLabel": "तैयार करने के लिए उपयोगी सवाल",
  "preparation.adaptationNote": "कार्यस्थल का रास्ता चुनने के बाद आप इसे अपने शब्दों में ढाल सकते हैं।",
  "preparation.checklistTitle": "90 सेकंड की तैयारी जांच",
  "preparation.checklistNote": "यहां कुछ भी सहेजा नहीं जाता। यह केवल निजी तौर पर व्यवस्थित होने का तरीका है।",
  "preparation.progress": "{total} में से {completed} तैयारी जांच दर्ज",
  "preparation.consumer.title": "उपभोक्ता खरीद में समस्या आई",
  "preparation.consumer.summary": "उत्पाद या सेवा वादे के अनुरूप नहीं थी।",
  "preparation.consumer.question": "उपभोक्ता शिकायत पर विचार करने से पहले मुझे कौन-से प्रमाण और तारीखें इकट्ठा करनी चाहिए?",
  "preparation.tenancy.title": "किराये का मामला बढ़ रहा है",
  "preparation.tenancy.summary": "अगली बातचीत से पहले किरायेदार या मकान मालिक को साफ, तथ्यात्मक रिकॉर्ड चाहिए।",
  "preparation.tenancy.question": "दूसरे पक्ष या अधिवक्ता से बात करने से पहले मैं किराये के विवाद को कैसे व्यवस्थित कर सकता/सकती हूं?",
  "preparation.workplace.title": "कार्यस्थल का भुगतान देर से है",
  "preparation.workplace.summary": "अगले कदम से पहले वेतन, नोटिस या रोजगार की शर्तों की समय-रेखा जरूरी है।",
  "preparation.workplace.question": "देरी से वेतन या रोजगार के मुद्दे पर पूछने से पहले मुझे कौन-सी जानकारी क्रम में रखनी चाहिए?",
  "preparation.agreement.title": "एक समझौते को ध्यान से देखने की जरूरत है",
  "preparation.agreement.summary": "किसी दस्तावेज़ को खास धाराओं, जोखिम और सवालों की समीक्षा के लिए तैयार किया जा सकता है।",
  "preparation.agreement.question": "किसी समझौते की सरल भाषा में समीक्षा मांगने से पहले मुझे क्या पहचानना चाहिए?",
  "preparation.check.one": "मैं बता सकता/सकती हूं कि क्या हुआ, तारीख के क्रम में।",
  "preparation.check.two": "मुझे पता है कि किन रिकॉर्ड को साझा करने की अनुमति हो सकती है।",
  "preparation.check.three": "मैं उस नतीजे या सवाल का नाम बता सकता/सकती हूं जिसके लिए तैयारी में मदद चाहिए।",
  "clarity.kicker": "कानूनी समझ का छोटा अभ्यास",
  "clarity.heading": "उस जानकारी को पहचानें जो आपके सवाल को बेहतर बनाती है",
  "clarity.intro": "तीन काल्पनिक प्रश्न। आपका कोई चयन सहेजा या भेजा नहीं जाता।",
  "clarity.scenario": "काल्पनिक स्थिति",
  "clarity.choose": "ज़्यादा सावधान उत्तर चुनें",
  "clarity.context": "और संदर्भ चाहिए",
  "clarity.record": "और स्पष्ट रिकॉर्ड बनाएं",
  "clarity.screenshot.statement": "स्क्रीनशॉट हमेशा पर्याप्त सबूत होता है।",
  "clarity.screenshot.feedback": "हमेशा नहीं। तारीख, स्रोत, पूरी बातचीत और यह कैसे मिला—ये बातें भी महत्वपूर्ण हो सकती हैं।",
  "clarity.promise.statement": "मौखिक वादा कभी महत्वपूर्ण नहीं हो सकता।",
  "clarity.promise.feedback": "हमेशा नहीं। सलाह मांगने से पहले सटीक शब्द, वहां मौजूद लोग और बाद के संदेश एक जगह रखें।",
  "clarity.timeline.statement": "तारीख के क्रम में छोटी समय-रेखा कानूनी सवाल को अधिक स्पष्ट बना सकती है।",
  "clarity.timeline.feedback": "हां। साधारण तथ्यात्मक समय-रेखा अक्सर जरूरत से ज्यादा निजी जानकारी साझा किए बिना मुद्दा समझाने में मदद करती है।",
  "journey.kicker": "एक सतत केस यात्रा",
  "journey.heading": "पहली जानकारी से अधिवक्ता के लिए तैयार केस ब्रीफ तक",
  "journey.intro": "Legal Saathi एक ही चैट उत्तर पर रुकने के बजाय पूरे मामले की तैयारी को आपस में जोड़े रखता है।",
  "journey.intake.title": "स्थिति समझाएँ",
  "journey.intake.description": "सरल भाषा में शुरू करें। निर्देशित इंटेक केवल वही तथ्य पूछता है जो अगले कदम को प्रभावित करते हैं।",
  "journey.record.title": "केस रिकॉर्ड तैयार करें",
  "journey.record.description": "तारीखें, पक्ष, सवाल और आपके चुने हुए दस्तावेज़ एक केस वर्कस्पेस में रखें।",
  "journey.gaps.title": "कमियाँ पहचानें",
  "journey.gaps.description": "गुम जानकारी, विरोधाभास, जुटाए जाने वाले प्रमाण और दूसरे पक्ष से पूछे जाने वाले सवालों की समीक्षा करें।",
  "journey.sources.title": "स्रोत क्रम जाँचें",
  "journey.sources.description": "कानूनी जानकारी पर भरोसा करने से पहले अपने तथ्य, दस्तावेज़ निष्कर्ष और AI द्वारा तैयार सामग्री को अलग-अलग जाँचें।",
  "journey.handoff.title": "अधिवक्ता के लिए तैयारी करें",
  "journey.handoff.description": "योग्य अधिवक्ता के लिए संपादन योग्य केस ब्रीफ बनाएँ; कुछ भी अपने-आप दायर या भेजा नहीं जाता।",
  "journey.guardrails": "विश्वास की सीमाएँ",
  "journey.guardrail.editable": "आपके तथ्य संपादन योग्य रहते हैं",
  "journey.guardrail.traceable": "स्रोतों का पता बना रहता है",
  "journey.guardrail.review": "पेशेवर समीक्षा प्रक्रिया में बनी रहती है",
};

const hinglish: EntryJourneyCatalog = {
  "preparation.kicker": "Ek chhota pehla step",
  "preparation.heading": "Apni agali legal conversation ko aur clear banayen",
  "preparation.intro": "Ek familiar situation choose karein, phir workspace mein jaane se pehle facts organise karne ke liye ek minute lein.",
  "preparation.scenarioPicker": "Preparation scenario choose karein",
  "preparation.scenarioLabel": "Prepare karne ke liye useful question",
  "preparation.adaptationNote": "Workspace path choose karne ke baad aap ise apne words mein adapt kar sakte hain.",
  "preparation.checklistTitle": "90-second taiyari check",
  "preparation.checklistNote": "Yahan kuch save nahi hota. Yeh sirf privately organised hone ka tareeqa hai.",
  "preparation.progress": "{total} mein se {completed} preparation checks noted",
  "preparation.consumer.title": "Consumer purchase mein problem aayi",
  "preparation.consumer.summary": "Product ya service promise ke hisaab se nahi thi.",
  "preparation.consumer.question": "Consumer complaint explore karne se pehle mujhe kaun-se proof aur dates collect karne chahiye?",
  "preparation.tenancy.title": "Rental issue badh raha hai",
  "preparation.tenancy.summary": "Next conversation se pehle tenant ya landlord ko clear, factual record chahiye.",
  "preparation.tenancy.question": "Doosri side ya advocate se baat karne se pehle main rental disagreement ko kaise organise karun?",
  "preparation.workplace.title": "Workplace payment late hai",
  "preparation.workplace.summary": "Next step se pehle salary, notice ya employment terms ki timeline chahiye.",
  "preparation.workplace.question": "Delayed salary ya employment issue par poochhne se pehle mujhe kaun-si details order mein rakhni chahiye?",
  "preparation.agreement.title": "Agreement ko dhyan se dekhna hai",
  "preparation.agreement.summary": "Document ko focused clause, risk aur question review ke liye prepare kiya ja sakta hai.",
  "preparation.agreement.question": "Agreement ki plain-language review maangne se pehle mujhe kya identify karna chahiye?",
  "preparation.check.one": "Main date order mein bata sakta/sakti hoon ki kya hua.",
  "preparation.check.two": "Mujhe pata hai ki kaun-se records share karne ki permission ho sakti hai.",
  "preparation.check.three": "Main outcome ya question bata sakta/sakti hoon jiske liye preparation help chahiye.",
  "clarity.kicker": "Quick kanooni-literacy sprint",
  "clarity.heading": "Woh detail spot karein jo aapke question ko stronger banati hai",
  "clarity.intro": "Teen fictional prompts. Aapka koi selection save ya send nahi hota.",
  "clarity.scenario": "Practice scenario",
  "clarity.choose": "Zyada careful answer choose karein",
  "clarity.context": "Context chahiye",
  "clarity.record": "Clearer record banayen",
  "clarity.screenshot.statement": "Screenshot hamesha enough proof hota hai.",
  "clarity.screenshot.feedback": "Hamesha nahi. Date, source, full conversation aur woh kaise mila, yeh bhi matter kar sakte hain.",
  "clarity.promise.statement": "Spoken promise kabhi matter nahi kar sakta.",
  "clarity.promise.feedback": "Hamesha nahi. Guidance maangne se pehle exact words, kaun present tha aur follow-up messages ek jagah rakhein.",
  "clarity.timeline.statement": "Short date-by-date timeline legal question ko clearer bana sakti hai.",
  "clarity.timeline.feedback": "Haan. Simple factual timeline often issue explain karne mein help karti hai bina zarurat se zyada personal information share kiye.",
  "journey.kicker": "Ek continuous case journey",
  "journey.heading": "Pehli explanation se advocate-ready brief tak",
  "journey.intro": "Legal Saathi ek chat reply par rukne ke bajay poore matter ki preparation ko connected rakhta hai.",
  "journey.intake.title": "Situation samjhayen",
  "journey.intake.description": "Simple language mein shuru karein. Guided intake sirf wahi facts poochta hai jo next step ko affect karte hain.",
  "journey.record.title": "Case record banayen",
  "journey.record.description": "Dates, parties, questions aur aapke choose kiye documents ko ek case workspace mein rakhein.",
  "journey.gaps.title": "Gaps pehchanen",
  "journey.gaps.description": "Missing information, contradictions, collect karne wale evidence aur doosri side ke questions review karein.",
  "journey.sources.title": "Source trail check karein",
  "journey.sources.description": "Legal information par rely karne se pehle apne facts, document findings aur AI-prepared material ko alag-alag check karein.",
  "journey.handoff.title": "Advocate handoff prepare karein",
  "journey.handoff.description": "Qualified advocate ke liye editable case brief banayen; kuch bhi automatically file ya send nahi hota.",
  "journey.guardrails": "Bharose ki limits",
  "journey.guardrail.editable": "Aapke facts editable rehte hain",
  "journey.guardrail.traceable": "Sources traceable rehte hain",
  "journey.guardrail.review": "Professional review process mein rehta hai",
};

const catalogs: Record<AppLanguage, EntryJourneyCatalog> = { en: english, hi, hinglish };

export const entryJourneyMessageKeys = Object.freeze(Object.keys(english) as EntryJourneyMessageKey[]);

export function entryJourneyMessage(language: AppLanguage, key: EntryJourneyMessageKey, values: MessageValues = {}) {
  return catalogs[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

export function preparationProgressMessage(language: AppLanguage, completed: number, total: number) {
  return entryJourneyMessage(language, "preparation.progress", { completed, total });
}

type PreparationScenarioId = "consumer" | "tenancy" | "workplace" | "agreement";
type ClarityChallengeId = "screenshot" | "promise" | "timeline";
type CaseJourneyStepId = "intake" | "record" | "gaps" | "sources" | "handoff";

export function preparationScenarioMessage(language: AppLanguage, scenario: PreparationScenarioId) {
  return {
    title: entryJourneyMessage(language, `preparation.${scenario}.title` as EntryJourneyMessageKey),
    summary: entryJourneyMessage(language, `preparation.${scenario}.summary` as EntryJourneyMessageKey),
    question: entryJourneyMessage(language, `preparation.${scenario}.question` as EntryJourneyMessageKey),
  };
}

export function preparationChecklistMessage(language: AppLanguage, index: number) {
  const keys = ["preparation.check.one", "preparation.check.two", "preparation.check.three"] as const;
  return entryJourneyMessage(language, keys[index] ?? "preparation.check.one");
}

export function clarityChallengeMessage(language: AppLanguage, challenge: ClarityChallengeId) {
  return {
    statement: entryJourneyMessage(language, `clarity.${challenge}.statement` as EntryJourneyMessageKey),
    feedback: entryJourneyMessage(language, `clarity.${challenge}.feedback` as EntryJourneyMessageKey),
  };
}

export function caseJourneyStepMessage(language: AppLanguage, step: CaseJourneyStepId) {
  return {
    title: entryJourneyMessage(language, `journey.${step}.title` as EntryJourneyMessageKey),
    description: entryJourneyMessage(language, `journey.${step}.description` as EntryJourneyMessageKey),
  };
}
