import { createHash } from "node:crypto";
import { env } from "../../config/env";
import { embedText } from "./embeddings.service";
import { deleteLocalPrivateDocumentChunks, upsertLocalPrivateDocumentChunks } from "./localVectorStore.service";
import { retrieveRagChunks } from "./retrieval.service";
import { EmbeddedRagChunk } from "./rag.types";
import { softDeleteSupabasePrivateDocument, upsertSupabasePrivateDocumentChunks } from "./supabaseVectorStore.service";

const privateChunkSize = 1_000;
const privateOverlap = 150;

export function privateRagOwnerKey(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

function privateChunks(input: {
  ownerKey: string;
  caseId: string;
  documentId: string;
  name: string;
  mimeType: string;
  text: string;
}) {
  const normalized = input.text.replace(/\u0000/g, " ").replace(/\r\n/g, "\n").trim().slice(0, 200_000);
  const checksum = createHash("sha256").update(normalized, "utf8").digest("hex");
  const chunks: Array<Omit<EmbeddedRagChunk, "embedding">> = [];
  const pages = normalized.includes("\f") ? normalized.split("\f") : [normalized];
  let chunkIndex = 0;
  for (const [pageIndex, pageText] of pages.entries()) {
    const page = pageText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    let start = 0;
    while (start < page.length) {
      let end = Math.min(page.length, start + privateChunkSize);
      if (end < page.length) {
        const sentence = Math.max(page.lastIndexOf(". ", end), page.lastIndexOf("\n", end));
        if (sentence > start + 550) end = sentence + 1;
      }
      const text = page.slice(start, end).trim();
      if (text) {
        chunks.push({
          id: `private:${input.ownerKey.slice(0, 16)}:${input.documentId}:${checksum.slice(0, 12)}:${chunkIndex}`,
          text,
          metadata: {
            scope: "private",
            sourceId: input.documentId,
            sourceTitle: input.name.slice(0, 180),
            issuingAuthority: "User-provided document",
            jurisdiction: "User-provided facts",
            documentType: input.mimeType.slice(0, 120),
            retrievalDate: new Date().toISOString(),
            language: "en",
            checksum,
            version: checksum.slice(0, 16),
            citationLabel: input.name.slice(0, 180),
            superseded: false,
            trustTier: 3,
            chunkIndex,
            ownerKey: input.ownerKey,
            caseId: input.caseId,
            documentId: input.documentId,
            page: pages.length > 1 ? pageIndex + 1 : undefined,
            deletedAt: null,
          },
        });
        chunkIndex++;
      }
      if (end >= page.length) break;
      start = Math.max(0, end - privateOverlap);
    }
  }
  return chunks;
}

export async function indexPrivateDocument(input: {
  ownerEmail: string;
  caseId: string;
  documentId: string;
  name: string;
  mimeType: string;
  extractedText: string;
}) {
  if (!env.ragEnabled || !input.extractedText.trim()) return { indexed: false, chunkCount: 0 };
  const ownerKey = privateRagOwnerKey(input.ownerEmail);
  const baseChunks = privateChunks({ ...input, ownerKey, text: input.extractedText });
  const chunks: EmbeddedRagChunk[] = [];
  for (const chunk of baseChunks) {
    chunks.push({ ...chunk, embedding: await embedText(`${chunk.metadata.sourceTitle}\n${chunk.text}`, "RETRIEVAL_DOCUMENT") });
  }
  if (env.ragVectorBackend === "supabase") {
    await upsertSupabasePrivateDocumentChunks(chunks);
  } else if (env.ragVectorBackend === "local" && env.nodeEnv !== "production") {
    await upsertLocalPrivateDocumentChunks({ ownerKey, caseId: input.caseId, documentId: input.documentId, chunks });
  } else {
    throw new Error("PRIVATE_RAG_STORAGE_NOT_CONFIGURED");
  }
  return { indexed: true, chunkCount: chunks.length };
}

export async function deletePrivateDocumentIndex(ownerEmail: string, documentId: string) {
  const ownerKey = privateRagOwnerKey(ownerEmail);
  if (env.ragVectorBackend === "supabase") {
    await softDeleteSupabasePrivateDocument(ownerKey, documentId);
    return true;
  }
  if (env.ragVectorBackend === "local" && env.nodeEnv !== "production") {
    return deleteLocalPrivateDocumentChunks(ownerKey, documentId);
  }
  return false;
}

export function retrievePrivateCaseKnowledge(input: {
  ownerEmail: string;
  caseId: string;
  documentId?: string;
  query: string;
  topK?: number;
}) {
  return retrieveRagChunks({
    scope: "private",
    ownerKey: privateRagOwnerKey(input.ownerEmail),
    caseId: input.caseId,
    documentId: input.documentId,
    query: input.query,
    topK: input.topK,
  });
}
