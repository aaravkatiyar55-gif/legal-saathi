import { env } from "../../config/env";
import { embedText } from "./embeddings.service";
import { searchLocalHybridStore } from "./localVectorStore.service";
import { searchSupabaseHybrid } from "./supabaseVectorStore.service";
import { RagSearchResult } from "./rag.types";

function normalizedTopK(topK?: number) {
  const configured = Number.isFinite(env.ragTopK) && env.ragTopK > 0 ? env.ragTopK : 5;
  return Math.min(Math.max(topK ?? configured, 1), 10);
}

const retrievalStopWords = new Set([
  "a", "about", "act", "an", "and", "are", "as", "at", "be", "do", "does", "for", "from", "has", "have",
  "how", "in", "india", "indian", "is", "it", "law", "legal", "of", "on", "or", "that", "the", "their",
  "this", "to", "under", "was", "were", "what", "when", "where", "which", "who", "with", "your",
  "hai", "hain", "hota", "hoti", "ka", "ke", "ki", "ko", "kya", "mein", "se",
  "और", "अधिनियम", "आप", "इस", "का", "के", "की", "क्या", "को", "में", "यह", "है", "हैं",
]);

function meaningfulTokens(value: string) {
  return new Set(
    (value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
      .filter((token) => !retrievalStopWords.has(token)),
  );
}

export function hasGlobalRetrievalAnchor(query: string, result: RagSearchResult) {
  const queryTokens = meaningfulTokens(query);
  const sourceTokens = meaningfulTokens([
    result.metadata.sourceTitle,
    result.metadata.topic ?? "",
    result.metadata.heading ?? "",
    result.text,
  ].join(" "));
  const hasLexicalAnchor = Array.from(queryTokens).some((token) => sourceTokens.has(token));
  const strongSemanticMatch = Number(result.vectorScore ?? 0) >= 0.42;
  return queryTokens.size > 0 && (hasLexicalAnchor || strongSemanticMatch);
}

export async function retrieveLegalKnowledge(query: string, topK?: number): Promise<RagSearchResult[]> {
  return retrieveRagChunks({ scope: "global", query, topK });
}

function applyRetrievalPolicy(results: RagSearchResult[], topK: number, language?: "en" | "hi" | "hinglish") {
  const sourceCounts = new Map<string, number>();
  let contextCharacters = 0;
  const final: RagSearchResult[] = [];
  for (const result of results.sort((a, b) => b.score - a.score)) {
    if (result.metadata.superseded || result.metadata.deletedAt) continue;
    if (language && result.metadata.scope === "global" && result.metadata.language !== language && result.metadata.language !== "en") continue;
    const sourceKey = result.metadata.scope === "private"
      ? `${result.metadata.ownerKey}:${result.metadata.documentId}`
      : result.metadata.sourceId;
    const count = sourceCounts.get(sourceKey) ?? 0;
    if (count >= env.ragMaxChunksPerSource) continue;
    if (contextCharacters + result.text.length > env.ragContextCharacters && final.length > 0) continue;
    final.push(result);
    sourceCounts.set(sourceKey, count + 1);
    contextCharacters += result.text.length;
    if (final.length >= topK) break;
  }
  return final;
}

export async function retrieveRagChunks(input: {
  scope: "global" | "private";
  query: string;
  topK?: number;
  ownerKey?: string;
  caseId?: string;
  documentId?: string;
  language?: "en" | "hi" | "hinglish";
}): Promise<RagSearchResult[]> {
  if (!env.ragEnabled) return [];
  const cleanQuery = input.query.replace(/\u0000/g, " ").trim().slice(0, 5_000);
  if (!cleanQuery) return [];
  if (input.scope === "private" && (!input.ownerKey || !input.caseId)) return [];
  const queryEmbedding = await embedText(cleanQuery, "RETRIEVAL_QUERY");
  const candidateLimit = Math.max(normalizedTopK(input.topK), env.ragRerankTopN);
  const options = {
    scope: input.scope,
    queryText: cleanQuery,
    topK: candidateLimit,
    threshold: env.ragRelevanceThreshold,
    ownerKey: input.ownerKey,
    caseId: input.caseId,
    documentId: input.documentId,
  } as const;
  const candidates = env.ragVectorBackend === "supabase"
    ? await searchSupabaseHybrid({ ...options, queryEmbedding })
    : env.ragVectorBackend === "local" && env.nodeEnv !== "production"
      ? await searchLocalHybridStore(queryEmbedding, options)
      : [];
  const relevantCandidates = input.scope === "global"
    ? candidates.filter((result) => hasGlobalRetrievalAnchor(cleanQuery, result))
    : candidates;
  return applyRetrievalPolicy(relevantCandidates, normalizedTopK(input.topK), input.language);
}
