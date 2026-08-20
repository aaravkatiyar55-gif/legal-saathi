export const DOCUMENT_CATEGORIES = [
  "Pleadings",
  "Affidavits",
  "Notices",
  "Evidence",
  "Orders",
  "Contracts",
  "Correspondence",
  "Other",
] as const;

export type StoredDocumentCategory = typeof DOCUMENT_CATEGORIES[number];
export type StoredDocumentCategorySource = "none" | "rule" | "manual" | "ai";

type CategoryRule = {
  category: Exclude<StoredDocumentCategory, "Other">;
  keywords: string[];
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Affidavits",
    keywords: ["affidavit", "affirmation", "declaration", "sworn statement"],
  },
  {
    category: "Pleadings",
    keywords: ["plaint", "complaint", "petition", "pleading", "written statement", "counterclaim", "rejoinder"],
  },
  {
    category: "Notices",
    keywords: ["legal notice", "notice", "demand", "show cause", "intimation"],
  },
  {
    category: "Orders",
    keywords: ["court order", "judgment", "judgement", "decree", "ruling", "award"],
  },
  {
    category: "Contracts",
    keywords: ["contract", "agreement", "memorandum of understanding", "mou", "lease", "deed", "nda", "term sheet"],
  },
  {
    category: "Correspondence",
    keywords: ["email", "e-mail", "letter", "correspondence", "reply", "communication"],
  },
  {
    category: "Evidence",
    keywords: ["evidence", "exhibit", "invoice", "receipt", "screenshot", "photograph", "photo", "recording", "statement"],
  },
];

function searchableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isStoredDocumentCategory(value: unknown): value is StoredDocumentCategory {
  return DOCUMENT_CATEGORIES.includes(value as StoredDocumentCategory);
}

export function classifyDocumentCategory(input: {
  fileName: string;
  mimeType?: string;
  extractedText?: string;
}) {
  const fileName = searchableText(input.fileName);
  const extractedText = searchableText(input.extractedText ?? "").slice(0, 20_000);
  const combined = `${fileName} ${extractedText}`;
  const matchedRule = CATEGORY_RULES.find((rule) => (
    rule.keywords.some((keyword) => combined.includes(keyword))
  ));

  if (matchedRule) {
    return {
      category: matchedRule.category,
      categorySource: "rule" as const,
    };
  }

  if (input.mimeType?.startsWith("image/") || input.mimeType?.startsWith("video/")) {
    return {
      category: "Evidence" as const,
      categorySource: "rule" as const,
    };
  }

  return {
    category: "Other" as const,
    categorySource: "none" as const,
  };
}
