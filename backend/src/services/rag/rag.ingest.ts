import { chunkKnowledgeDocument } from "./chunking.service";
import { embedText } from "./embeddings.service";
import { loadLegalKnowledgeDocuments } from "./legalKnowledge.loader";
import { saveLocalVectorStore } from "./localVectorStore.service";
import { EmbeddedRagChunk, RagIngestResult } from "./rag.types";
import { env } from "../../config/env";
import { upsertSupabaseGlobalChunks } from "./supabaseVectorStore.service";

export async function ingestLegalKnowledge(): Promise<RagIngestResult> {
  const documents = await loadLegalKnowledgeDocuments();
  const embeddedChunks: EmbeddedRagChunk[] = [];

  for (const document of documents) {
    const chunks = chunkKnowledgeDocument(document);
    for (const chunk of chunks) {
      embeddedChunks.push({
        ...chunk,
        embedding: await embedText(`${chunk.metadata.sourceTitle}\n${chunk.text}`, "RETRIEVAL_DOCUMENT"),
      });
    }
  }

  const storePath = env.ragVectorBackend === "supabase"
    ? (await upsertSupabaseGlobalChunks(embeddedChunks), "supabase:legal_sathi_global_rag_chunks")
    : env.ragVectorBackend === "local" && env.nodeEnv !== "production"
      ? await saveLocalVectorStore(embeddedChunks)
      : (() => { throw new Error("RAG_VECTOR_BACKEND_NOT_CONFIGURED"); })();
  return {
    sourceCount: documents.length,
    chunkCount: embeddedChunks.length,
    storePath,
    skippedSourceCount: 0,
    versionedSourceCount: documents.length,
  };
}

if (require.main === module) {
  ingestLegalKnowledge()
    .then((result) => {
      console.log(`[RAG] Ingested ${result.chunkCount} chunks from ${result.sourceCount} sources.`);
      console.log("[RAG] Local store written: true");
    })
    .catch((error) => {
      console.error("[RAG] Ingestion failed", { category: error instanceof Error ? error.name : "unknown_error" });
      process.exitCode = 1;
    });
}
