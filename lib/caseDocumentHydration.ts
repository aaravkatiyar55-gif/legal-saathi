import type { BackendCaseDocument } from "@/lib/backendApi";
import type { CaseData } from "@/lib/types";

export type CaseDocumentLoadResult = {
  caseId: string;
  documents: BackendCaseDocument[];
  failed: boolean;
};

export function hydrateCaseDocuments(cases: CaseData[], results: CaseDocumentLoadResult[]) {
  const resultByCase = new Map(results.map((result) => [result.caseId, result]));
  const seenDocuments = new Set<string>();
  const documents: BackendCaseDocument[] = [];

  const hydratedCases = cases.map((caseItem) => {
    const result = resultByCase.get(caseItem.id);
    if (!result || result.failed) {
      return { ...caseItem, documentIds: [], documentLoadStatus: "failed" as const };
    }

    const documentIds: string[] = [];
    for (const document of result.documents) {
      if (document.caseId !== caseItem.id) continue;
      const key = `${caseItem.id}:${document.id}`;
      if (seenDocuments.has(key)) continue;
      seenDocuments.add(key);
      documentIds.push(document.id);
      documents.push(document);
    }

    return {
      ...caseItem,
      documentIds,
      documentLoadStatus: documentIds.length > 0 ? "available" as const : "empty" as const,
    };
  });

  return { cases: hydratedCases, documents };
}
