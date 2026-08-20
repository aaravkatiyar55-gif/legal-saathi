export type RagScope = "global" | "private";
export type RagLanguage = "en" | "hi" | "hinglish";
export type RagTrustTier = 1 | 2 | 3;

export type RagMetadata = {
  scope: RagScope;
  sourceId: string;
  sourceTitle: string;
  sourceUrl?: string;
  sourcePath?: string;
  issuingAuthority: string;
  jurisdiction: string;
  documentType: string;
  actName?: string;
  legalSection?: string;
  publicationDate?: string;
  effectiveDate?: string;
  retrievalDate: string;
  language: RagLanguage;
  checksum: string;
  version: string;
  citationLabel: string;
  superseded: boolean;
  trustTier: RagTrustTier;
  topic?: string;
  chunkIndex: number;
  heading?: string;
  ownerKey?: string;
  caseId?: string;
  documentId?: string;
  page?: number;
  deletedAt?: string | null;
};

export type RagChunk = {
  id: string;
  text: string;
  metadata: RagMetadata;
};

export type EmbeddedRagChunk = RagChunk & {
  embedding: number[];
};

export type RagSearchResult = RagChunk & {
  score: number;
  vectorScore?: number;
  keywordScore?: number;
};

export type RagIngestResult = {
  sourceCount: number;
  chunkCount: number;
  storePath: string;
  skippedSourceCount?: number;
  versionedSourceCount?: number;
};

export type LoadedKnowledgeDocument = {
  id: string;
  title: string;
  topic?: string;
  path: string;
  content: string;
  metadata: Omit<RagMetadata, "scope" | "sourceId" | "sourceTitle" | "sourcePath" | "chunkIndex" | "heading">;
};

export type RagCitation = {
  sourceId: string;
  title: string;
  url?: string;
  authority: string;
  jurisdiction: string;
  label: string;
  date?: string;
  documentId?: string;
  page?: number;
};

export type RagGroundingStatus = "grounded" | "insufficient" | "disabled" | "unavailable";

export type RagGrounding = {
  status: RagGroundingStatus;
  scope: "global" | "private" | "combined";
  citations: RagCitation[];
  confidence: number;
  warning?: string;
};
