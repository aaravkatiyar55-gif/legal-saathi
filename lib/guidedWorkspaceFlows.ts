import type { AppLanguage } from "./i18n/types";

export type GuidedWorkspaceFlowId =
  | "legal_question"
  | "analyse_document"
  | "research_current_law"
  | "review_agreement"
  | "draft_legal_document"
  | "prepare_case"
  | "compare_documents";

type GuidedWorkspacePrompt = Readonly<Record<AppLanguage, string>>;

export type GuidedWorkspaceFlow = {
  id: GuidedWorkspaceFlowId;
  label: string;
  description: string;
  prompt?: string;
  promptByLanguage?: GuidedWorkspacePrompt;
  requestUpload?: boolean;
  requestWeb?: boolean;
  openCaseForm?: boolean;
};

export const GUIDED_WORKSPACE_FLOWS: readonly GuidedWorkspaceFlow[] = [
  {
    id: "legal_question",
    label: "Ask a legal question",
    description: "Start with the facts, jurisdiction, and outcome you need.",
    prompt: "I need help understanding this legal situation: ",
    promptByLanguage: {
      en: "I need help understanding this legal situation: ",
      hi: "मुझे इस कानूनी स्थिति को समझने में मदद चाहिए: ",
      hinglish: "Mujhe is legal situation ko samajhne mein help chahiye: ",
    },
  },
  {
    id: "analyse_document",
    label: "Analyse a document",
    description: "Attach one document and ask what it means for your situation.",
    prompt: "Analyse the document I am attaching. Explain the important points, risks, and questions I should clarify.",
    promptByLanguage: {
      en: "Analyse the document I am attaching. Explain the important points, risks, and questions I should clarify.",
      hi: "संलग्न दस्तावेज़ का विश्लेषण करें। महत्वपूर्ण बिंदु, जोखिम और जिन प्रश्नों को मुझे स्पष्ट करना चाहिए, वे बताएं।",
      hinglish: "Jo document main attach kar raha/rahi hoon uska analysis kijiye. Important points, risks aur jin questions ko mujhe clarify karna chahiye woh batayein.",
    },
    requestUpload: true,
  },
  {
    id: "research_current_law",
    label: "Research current law",
    description: "Prepare a current-law question for review before it is sent.",
    prompt: "Research the current law on this issue. Prefer official sources, distinguish source-backed facts from analysis, and identify anything that needs verification: ",
    promptByLanguage: {
      en: "Research the current law on this issue. Prefer official sources, distinguish source-backed facts from analysis, and identify anything that needs verification: ",
      hi: "इस मुद्दे पर वर्तमान कानून पर शोध करने में मदद करें। आधिकारिक स्रोतों को प्राथमिकता दें, स्रोत-आधारित तथ्यों और विश्लेषण को अलग बताएं, और ऐसी हर बात पहचानें जिसकी पुष्टि जरूरी है: ",
      hinglish: "Is issue ke current law par research mein help karein. Official sources ko preference dein, source-backed facts aur analysis ko alag rakhein, aur jis baat ko verify karna zaroori ho use pehchanein: ",
    },
    requestWeb: true,
  },
  {
    id: "review_agreement",
    label: "Review an agreement",
    description: "Attach an agreement for a focused clause and risk review.",
    prompt: "Review the agreement I am attaching. Identify obligations, risks, missing protections, and questions for a qualified advocate.",
    promptByLanguage: {
      en: "Review the agreement I am attaching. Identify obligations, risks, missing protections, and questions for a qualified advocate.",
      hi: "मेरे द्वारा संलग्न समझौते की समीक्षा करें। दायित्व, जोखिम, अनुपस्थित सुरक्षा और योग्य अधिवक्ता से पूछने योग्य प्रश्न पहचानें।",
      hinglish: "Jo agreement main attach kar raha/rahi hoon usko review kijiye. Obligations, risks, missing protections aur qualified advocate se poochhne wale questions identify kijiye.",
    },
    requestUpload: true,
  },
  {
    id: "draft_legal_document",
    label: "Draft a legal document",
    description: "Prepare an editable draft from your facts; nothing is sent or filed automatically.",
    prompt: "Help me prepare an editable legal draft. First identify the document type, known facts, missing facts, and assumptions: ",
    promptByLanguage: {
      en: "Help me prepare an editable legal draft. First identify the document type, known facts, missing facts, and assumptions: ",
      hi: "मेरे तथ्यों से संपादन योग्य कानूनी मसौदा तैयार करने में मदद करें। पहले दस्तावेज़ का प्रकार, ज्ञात तथ्य, अनुपस्थित तथ्य और मान्यताएँ बताएं: ",
      hinglish: "Mere facts se editable legal draft prepare karne mein help kijiye. Pehle document type, known facts, missing facts aur assumptions identify kijiye: ",
    },
  },
  {
    id: "prepare_case",
    label: "Prepare a case",
    description: "Open the existing protected Case Workspace intake.",
    openCaseForm: true,
  },
  {
    id: "compare_documents",
    label: "Compare documents",
    description: "Attach the first document, then add the second in Case Workspace before asking for a comparison.",
    prompt: "I need to compare two documents. I will attach the first document now, then add the second in Case Workspace before asking for the comparison.",
    promptByLanguage: {
      en: "I need to compare two documents. I will attach the first document now, then add the second in Case Workspace before asking for the comparison.",
      hi: "मुझे दो दस्तावेज़ों की तुलना करनी है। मैं पहला दस्तावेज़ अभी संलग्न करूँगा/करूँगी, फिर तुलना पूछने से पहले केस वर्कस्पेस में दूसरा दस्तावेज़ जोड़ूँगा/जोड़ूँगी।",
      hinglish: "Mujhe do documents compare karne hain. Main pehla document ab attach karunga/karungi, phir comparison poochhne se pehle Case Workspace mein doosra document add karunga/karungi.",
    },
    requestUpload: true,
  },
] as const;

export function getGuidedWorkspaceFlow(id: GuidedWorkspaceFlowId) {
  return GUIDED_WORKSPACE_FLOWS.find((flow) => flow.id === id);
}

export function getGuidedWorkspacePrompt(flow: GuidedWorkspaceFlow, language: AppLanguage) {
  return flow.promptByLanguage?.[language] ?? flow.prompt;
}
