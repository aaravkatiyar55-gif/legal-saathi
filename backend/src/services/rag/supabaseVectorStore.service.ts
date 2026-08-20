import { getSupabaseClient } from "../supabase/supabaseClient";
import { EmbeddedRagChunk, RagMetadata, RagSearchResult } from "./rag.types";

export class RagVectorStoreUnavailableError extends Error {
  constructor() {
    super("Production retrieval storage is unavailable.");
  }
}

function client() {
  const value = getSupabaseClient();
  if (!value) throw new RagVectorStoreUnavailableError();
  return value;
}

function globalRow(chunk: EmbeddedRagChunk) {
  return {
    id: chunk.id,
    source_id: chunk.metadata.sourceId,
    source_title: chunk.metadata.sourceTitle,
    source_url: chunk.metadata.sourceUrl ?? null,
    issuing_authority: chunk.metadata.issuingAuthority,
    jurisdiction: chunk.metadata.jurisdiction,
    document_type: chunk.metadata.documentType,
    act_name: chunk.metadata.actName ?? null,
    legal_section: chunk.metadata.legalSection ?? null,
    publication_date: chunk.metadata.publicationDate ?? null,
    effective_date: chunk.metadata.effectiveDate ?? null,
    retrieval_date: chunk.metadata.retrievalDate,
    language: chunk.metadata.language,
    checksum: chunk.metadata.checksum,
    source_version: chunk.metadata.version,
    citation_label: chunk.metadata.citationLabel,
    superseded: chunk.metadata.superseded,
    trust_tier: chunk.metadata.trustTier,
    topic: chunk.metadata.topic ?? null,
    heading: chunk.metadata.heading ?? null,
    chunk_index: chunk.metadata.chunkIndex,
    content: chunk.text,
    embedding: chunk.embedding,
  };
}

export async function upsertSupabaseGlobalChunks(chunks: EmbeddedRagChunk[]) {
  if (chunks.length === 0) return;
  const sources = Array.from(new Map(chunks.map((chunk) => [`${chunk.metadata.sourceId}:${chunk.metadata.version}`, {
    id: chunk.metadata.sourceId,
    source_version: chunk.metadata.version,
    title: chunk.metadata.sourceTitle,
    source_url: chunk.metadata.sourceUrl ?? null,
    issuing_authority: chunk.metadata.issuingAuthority,
    jurisdiction: chunk.metadata.jurisdiction,
    document_type: chunk.metadata.documentType,
    language: chunk.metadata.language,
    checksum: chunk.metadata.checksum,
    citation_label: chunk.metadata.citationLabel,
    trust_tier: chunk.metadata.trustTier,
    publication_date: chunk.metadata.publicationDate ?? null,
    effective_date: chunk.metadata.effectiveDate ?? null,
    retrieval_date: chunk.metadata.retrievalDate,
    superseded: chunk.metadata.superseded,
    metadata: { topic: chunk.metadata.topic ?? null },
  }])).values());
  const sourceResult = await client().from("legal_sathi_rag_sources").upsert(sources, { onConflict: "id,source_version" });
  if (sourceResult.error) throw new RagVectorStoreUnavailableError();
  const result = await client().from("legal_sathi_global_rag_chunks").upsert(chunks.map(globalRow), { onConflict: "id" });
  if (result.error) throw new RagVectorStoreUnavailableError();
}

export async function upsertSupabasePrivateDocumentChunks(chunks: EmbeddedRagChunk[]) {
  if (chunks.length === 0) return;
  const rows = chunks.map((chunk) => ({
    id: chunk.id,
    owner_key: chunk.metadata.ownerKey,
    case_id: chunk.metadata.caseId,
    document_id: chunk.metadata.documentId,
    source_title: chunk.metadata.sourceTitle,
    mime_type: chunk.metadata.documentType,
    language: chunk.metadata.language,
    checksum: chunk.metadata.checksum,
    source_version: chunk.metadata.version,
    page_number: chunk.metadata.page ?? null,
    heading: chunk.metadata.heading ?? null,
    chunk_index: chunk.metadata.chunkIndex,
    content: chunk.text,
    embedding: chunk.embedding,
    deleted_at: chunk.metadata.deletedAt ?? null,
  }));
  const result = await client().from("legal_sathi_private_rag_chunks").upsert(rows, { onConflict: "id" });
  if (result.error) throw new RagVectorStoreUnavailableError();
}

export async function softDeleteSupabasePrivateDocument(ownerKey: string, documentId: string) {
  const result = await client()
    .from("legal_sathi_private_rag_chunks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("owner_key", ownerKey)
    .eq("document_id", documentId)
    .is("deleted_at", null);
  if (result.error) throw new RagVectorStoreUnavailableError();
}

function parseMetadata(row: Record<string, unknown>, scope: "global" | "private"): RagMetadata {
  const raw = (row.metadata ?? {}) as Partial<RagMetadata>;
  return {
    scope,
    sourceId: String(raw.sourceId ?? row.source_id ?? row.document_id ?? "unknown"),
    sourceTitle: String(raw.sourceTitle ?? row.source_title ?? "Source"),
    sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : row.source_url ? String(row.source_url) : undefined,
    issuingAuthority: String(raw.issuingAuthority ?? row.issuing_authority ?? (scope === "private" ? "User document" : "Official source")),
    jurisdiction: String(raw.jurisdiction ?? row.jurisdiction ?? "India"),
    documentType: String(raw.documentType ?? row.document_type ?? row.mime_type ?? "document"),
    actName: raw.actName ?? (row.act_name ? String(row.act_name) : undefined),
    legalSection: raw.legalSection ?? (row.legal_section ? String(row.legal_section) : undefined),
    publicationDate: raw.publicationDate ?? (row.publication_date ? String(row.publication_date) : undefined),
    effectiveDate: raw.effectiveDate ?? (row.effective_date ? String(row.effective_date) : undefined),
    retrievalDate: String(raw.retrievalDate ?? row.retrieval_date ?? new Date().toISOString()),
    language: raw.language === "hi" || raw.language === "hinglish" ? raw.language : "en",
    checksum: String(raw.checksum ?? row.checksum ?? ""),
    version: String(raw.version ?? row.source_version ?? "1"),
    citationLabel: String(raw.citationLabel ?? row.citation_label ?? row.source_title ?? "Source"),
    superseded: Boolean(raw.superseded ?? row.superseded),
    trustTier: raw.trustTier === 1 || raw.trustTier === 3 ? raw.trustTier : 2,
    topic: raw.topic ?? (row.topic ? String(row.topic) : undefined),
    chunkIndex: Number(raw.chunkIndex ?? row.chunk_index ?? 0),
    heading: raw.heading ?? (row.heading ? String(row.heading) : undefined),
    ownerKey: raw.ownerKey ?? (row.owner_key ? String(row.owner_key) : undefined),
    caseId: raw.caseId ?? (row.case_id ? String(row.case_id) : undefined),
    documentId: raw.documentId ?? (row.document_id ? String(row.document_id) : undefined),
    page: Number(raw.page ?? row.page_number) || undefined,
    deletedAt: raw.deletedAt ?? (row.deleted_at ? String(row.deleted_at) : null),
  };
}

export async function searchSupabaseHybrid(input: {
  scope: "global" | "private";
  queryEmbedding: number[];
  queryText: string;
  topK: number;
  threshold: number;
  ownerKey?: string;
  caseId?: string;
  documentId?: string;
}) {
  const rpc = input.scope === "global" ? "legal_sathi_hybrid_search_global" : "legal_sathi_hybrid_search_private";
  const args = input.scope === "global" ? {
    p_query_embedding: input.queryEmbedding,
    p_query_text: input.queryText.slice(0, 2_000),
    p_limit: input.topK,
    p_threshold: input.threshold,
  } : {
    p_owner_key: input.ownerKey,
    p_case_id: input.caseId,
    p_document_id: input.documentId ?? null,
    p_query_embedding: input.queryEmbedding,
    p_query_text: input.queryText.slice(0, 2_000),
    p_limit: input.topK,
    p_threshold: input.threshold,
  };
  const result = await client().rpc(rpc, args);
  if (result.error || !Array.isArray(result.data)) throw new RagVectorStoreUnavailableError();
  return (result.data as Array<Record<string, unknown>>).map((row): RagSearchResult => ({
    id: String(row.id),
    text: String(row.content ?? "").slice(0, 4_000),
    metadata: parseMetadata(row, input.scope),
    score: Number(row.score ?? 0),
    vectorScore: Number(row.vector_score ?? 0),
    keywordScore: Number(row.keyword_score ?? 0),
  }));
}
