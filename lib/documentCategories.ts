import type { DocumentCategory, DocumentCategorySource } from "@/lib/types";

export const LEGAL_DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "Pleadings",
  "Affidavits",
  "Notices",
  "Evidence",
  "Orders",
  "Contracts",
  "Correspondence",
  "Other"
];

type CategoryRule = {
  category: DocumentCategory;
  keywords: string[];
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Affidavits",
    keywords: ["affidavit", "affirmation", "declaration", "sworn statement"]
  },
  {
    category: "Pleadings",
    keywords: ["plaint", "complaint", "petition", "pleading", "written statement", "counterclaim", "rejoinder"]
  },
  {
    category: "Notices",
    keywords: ["notice", "demand", "show cause", "intimation"]
  },
  {
    category: "Orders",
    keywords: ["order", "judgment", "judgement", "decree", "ruling", "award"]
  },
  {
    category: "Contracts",
    keywords: ["contract", "agreement", "mou", "memorandum", "lease", "deed", "nda", "term sheet"]
  },
  {
    category: "Correspondence",
    keywords: ["email", "e-mail", "letter", "correspondence", "reply", "communication"]
  },
  {
    category: "Evidence",
    keywords: ["evidence", "exhibit", "invoice", "receipt", "screenshot", "photograph", "photo", "record", "statement"]
  }
];

const normaliseName = (fileName: string) => fileName.toLowerCase().replace(/[_-]+/g, " ");

export const suggestDocumentCategory = (fileName: string, mimeType?: string): DocumentCategory => {
  const name = normaliseName(fileName);
  const nameMatch = CATEGORY_RULES.find(rule => rule.keywords.some(keyword => name.includes(keyword)));

  if (nameMatch) return nameMatch.category;
  if (mimeType?.startsWith("image/") || mimeType?.startsWith("video/")) return "Evidence";

  return "Other";
};

export const getCategorySourceLabel = (source?: DocumentCategorySource) => {
  if (source === "manual") return "Manually sorted";
  if (source === "rule") return "Auto-sorted";
  if (source === "ai") return "AI suggestion accepted";
  return "Not sorted yet";
};
