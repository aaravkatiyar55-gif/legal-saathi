import type { AppLanguage } from "@/lib/i18n";

export type HowItWorksStep = {
  title: string;
  description: string;
};

export type HowItWorksContent = {
  kicker: string;
  title: string;
  summary: string;
  stepsHeading: string;
  steps: readonly HowItWorksStep[];
  publicHeading: string;
  publicItems: readonly string[];
  accountHeading: string;
  accountItems: readonly string[];
  exampleHeading: string;
  example: string;
  urgentHeading: string;
  urgentNotice: string;
  navigationAria: string;
};

const content: Record<AppLanguage, HowItWorksContent> = {
  en: {
    kicker: "A clear first-use guide",
    title: "How Legal Saathi works",
    summary: "Legal Saathi helps people prepare clearer legal-information questions and safer next steps. It is not a law firm, does not represent anyone, and does not take legal action for a user.",
    stepsHeading: "Start in four clear steps",
    steps: [
      { title: "Choose your starting point", description: "Pick “I Need Legal Help” for general information or “I’m a Legal Professional” for a preparation-focused workspace. Both paths keep the same legal-information boundary." },
      { title: "Choose the language you understand", description: "Use English, Hindi, or Hinglish for Legal Saathi’s interface. Your own messages, official Act names, court names, citations, and links remain unchanged." },
      { title: "Describe the issue safely", description: "Start with general facts and the outcome you want to understand. Do not enter passwords, bank or card details, Aadhaar or PAN numbers, or confidential material." },
      { title: "Verify before acting", description: "Use the output for general information and preparation. Check time-sensitive law with current official sources and a qualified advocate before making a legal decision." },
    ],
    publicHeading: "What you can explore before an account",
    publicItems: [
      "Both role-selection journeys and the legal-information boundary.",
      "English, Hindi, and Hinglish product-language controls.",
      "Privacy, terms, disclaimer, support, and visible availability explanations.",
    ],
    accountHeading: "What may need sign-in and verified service configuration",
    accountItems: [
      "Saved chats and private workspace history.",
      "Provider-assisted responses, current-law sources, and citations.",
      "Document or case storage, plan features, and payments.",
    ],
    exampleHeading: "A safe fictional example",
    example: "“My landlord has not returned a security deposit. What records should I collect before speaking with a qualified advocate?”",
    urgentHeading: "Urgent situations",
    urgentNotice: "For immediate danger, arrest, bail, violence, a court deadline, or another urgent legal situation, contact an appropriate emergency service, court authority, or qualified advocate directly.",
    navigationAria: "Public Legal Saathi navigation",
  },
  hi: {
    kicker: "पहली बार इस्तेमाल करने की स्पष्ट गाइड",
    title: "Legal Saathi कैसे काम करता है",
    summary: "Legal Saathi लोगों को कानूनी जानकारी के सवाल साफ़ तरीके से तैयार करने और सुरक्षित अगले कदम समझने में मदद करता है। यह लॉ फर्म नहीं है, किसी का प्रतिनिधित्व नहीं करता और उपयोगकर्ता की ओर से कानूनी कार्रवाई नहीं करता।",
    stepsHeading: "चार स्पष्ट चरणों में शुरुआत करें",
    steps: [
      { title: "सही शुरुआत चुनें", description: "सामान्य जानकारी के लिए “मुझे कानूनी मदद चाहिए” या तैयारी-केंद्रित कार्यक्षेत्र के लिए “मैं कानूनी पेशेवर हूँ” चुनें। दोनों रास्तों में कानूनी-जानकारी की वही सीमा रहती है।" },
      { title: "समझ की भाषा चुनें", description: "Legal Saathi के इंटरफ़ेस के लिए English, Hindi या Hinglish चुनें। आपके संदेश, आधिकारिक अधिनियम के नाम, अदालतों के नाम, उद्धरण और लिंक बदले नहीं जाते।" },
      { title: "मुद्दा सुरक्षित तरीके से बताएं", description: "सामान्य तथ्यों और जिस परिणाम को आप समझना चाहते हैं उससे शुरुआत करें। पासवर्ड, बैंक या कार्ड विवरण, Aadhaar या PAN नंबर, या गोपनीय सामग्री न लिखें।" },
      { title: "कार्रवाई से पहले जाँचें", description: "आउटपुट को सामान्य जानकारी और तैयारी के लिए इस्तेमाल करें। कानूनी निर्णय से पहले समय-संवेदनशील कानून को मौजूदा आधिकारिक स्रोतों और योग्य अधिवक्ता से जाँचें।" },
    ],
    publicHeading: "बिना खाते के क्या देख सकते हैं",
    publicItems: [
      "दोनों रोल-सेलेक्शन रास्ते और कानूनी-जानकारी की सीमा।",
      "English, Hindi और Hinglish के उत्पाद-भाषा नियंत्रण।",
      "गोपनीयता, नियम, अस्वीकरण, सहायता और दिखने वाले उपलब्धता कारण।",
    ],
    accountHeading: "किन चीज़ों के लिए साइन इन और सत्यापित सेवा कॉन्फ़िगरेशन चाहिए हो सकता है",
    accountItems: [
      "सहेजी गई चैट और निजी कार्यक्षेत्र इतिहास।",
      "प्रदाता-सहायित उत्तर, मौजूदा-कानून स्रोत और उद्धरण।",
      "दस्तावेज़ या केस स्टोरेज, योजना सुविधाएँ और भुगतान।",
    ],
    exampleHeading: "एक सुरक्षित काल्पनिक उदाहरण",
    example: "“मेरे मकान-मालिक ने सिक्योरिटी डिपॉज़िट वापस नहीं किया है। योग्य अधिवक्ता से बात करने से पहले मुझे कौन से रिकॉर्ड इकट्ठा करने चाहिए?”",
    urgentHeading: "तत्काल स्थिति",
    urgentNotice: "तुरंत खतरा, गिरफ़्तारी, ज़मानत, हिंसा, कोर्ट की समय-सीमा या किसी और तत्काल कानूनी स्थिति में सीधे उचित आपात सेवा, कोर्ट प्राधिकरण या योग्य अधिवक्ता से संपर्क करें।",
    navigationAria: "Legal Saathi की सार्वजनिक नेविगेशन",
  },
  hinglish: {
    kicker: "Pehli baar use karne ki clear guide",
    title: "Legal Saathi kaise kaam karta hai",
    summary: "Legal Saathi logon ko legal-information questions saaf tareeqe se prepare karne aur safer next steps samajhne mein help karta hai. Yeh law firm nahi hai, kisi ko represent nahi karta aur user ki taraf se legal action nahi leta.",
    stepsHeading: "Chaar clear steps mein shuru karein",
    steps: [
      { title: "Sahi starting point choose karein", description: "General information ke liye “I Need Legal Help” ya preparation-focused workspace ke liye “I’m a Legal Professional” choose karein. Dono paths mein legal-information boundary same rehti hai." },
      { title: "Apni samajh ki bhasha choose karein", description: "Legal Saathi ke interface ke liye English, Hindi ya Hinglish use karein. Aapke messages, official Act names, court names, citations aur links change nahi hote." },
      { title: "Issue ko safely batayein", description: "General facts aur jis outcome ko aap samajhna chahte hain usse shuru karein. Passwords, bank ya card details, Aadhaar ya PAN numbers, ya confidential material mat likhein." },
      { title: "Action se pehle verify karein", description: "Output ko general information aur preparation ke liye use karein. Legal decision se pehle time-sensitive law ko current official sources aur qualified advocate ke saath verify karein." },
    ],
    publicHeading: "Account ke bina kya explore kar sakte hain",
    publicItems: [
      "Dono role-selection journeys aur legal-information boundary.",
      "English, Hindi aur Hinglish product-language controls.",
      "Privacy, terms, disclaimer, support aur visible availability reasons.",
    ],
    accountHeading: "Kya cheezein sign-in aur verified service configuration maang sakti hain",
    accountItems: [
      "Saved chats aur private workspace history.",
      "Provider-assisted answers, current-law sources aur citations.",
      "Document ya case storage, plan features aur payments.",
    ],
    exampleHeading: "Ek safe fictional example",
    example: "“Mere landlord ne security deposit wapas nahi kiya hai. Qualified advocate se baat karne se pehle mujhe kaun se records collect karne chahiye?”",
    urgentHeading: "Urgent situations",
    urgentNotice: "Immediate danger, arrest, bail, violence, court deadline ya kisi aur urgent legal situation mein directly appropriate emergency service, court authority ya qualified advocate se contact karein.",
    navigationAria: "Legal Saathi ki public navigation",
  },
};

export function getHowItWorksContent(language: AppLanguage) {
  return content[language];
}
