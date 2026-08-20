import fs from "fs/promises";
import path from "path";
import { env } from "../../config/env";
import { EmbeddedRagChunk, RagSearchResult } from "./rag.types";

type LocalVectorStoreFile = {
  version: 2;
  generatedAt: string;
  chunks: EmbeddedRagChunk[];
};

type LocalSearchOptions = {
  scope: "global" | "private";
  topK: number;
  queryText: string;
  threshold?: number;
  ownerKey?: string;
  caseId?: string;
  documentId?: string;
};

const queues = new Map<string, Promise<void>>();

export function resolveLocalVectorStorePath(scope: "global" | "private" = "global") {
  const configured = scope === "private" ? env.ragPrivateStorePath : env.ragGlobalStorePath;
  const cwd = process.cwd();

  if (path.isAbsolute(configured)) return configured;
  return path.resolve(cwd, configured);
}

function tokenize(value: string) {
  const stopWords = new Set(["and", "are", "for", "from", "has", "have", "into", "its", "of", "on", "or", "that", "the", "their", "this", "to", "was", "were", "with", "your"]);
  return (value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((token) => !stopWords.has(token));
}

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < length; index++) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }

  if (!aMagnitude || !bMagnitude) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

async function readStore(scope: "global" | "private") {
  const storePath = resolveLocalVectorStorePath(scope);
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalVectorStoreFile>;
    return { version: 2 as const, generatedAt: String(parsed.generatedAt ?? ""), chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 2 as const, generatedAt: "", chunks: [] };
    throw error;
  }
}

async function writeStore(scope: "global" | "private", chunks: EmbeddedRagChunk[], keepPrevious = false) {
  const storePath = resolveLocalVectorStorePath(scope);
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const payload: LocalVectorStoreFile = {
    version: 2,
    generatedAt: new Date().toISOString(),
    chunks,
  };
  if (keepPrevious) {
    await fs.copyFile(storePath, `${storePath}.previous`).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, storePath);
  return storePath;
}

function serializeStoreMutation<T>(scope: "global" | "private", task: () => Promise<T>) {
  const key = resolveLocalVectorStorePath(scope);
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  queues.set(key, run.then(() => undefined, () => undefined));
  return run;
}

export async function saveLocalVectorStore(chunks: EmbeddedRagChunk[]) {
  return serializeStoreMutation("global", () => writeStore("global", chunks.filter((chunk) => chunk.metadata.scope === "global"), true));
}

export async function loadLocalVectorStore(scope: "global" | "private" = "global") {
  return (await readStore(scope)).chunks;
}

export async function upsertLocalPrivateDocumentChunks(input: {
  ownerKey: string;
  caseId: string;
  documentId: string;
  chunks: EmbeddedRagChunk[];
}) {
  return serializeStoreMutation("private", async () => {
    const store = await readStore("private");
    const retained = store.chunks.filter((chunk) => !(
      chunk.metadata.ownerKey === input.ownerKey
      && chunk.metadata.caseId === input.caseId
      && chunk.metadata.documentId === input.documentId
    ));
    return writeStore("private", [...retained, ...input.chunks], false);
  });
}

export async function deleteLocalPrivateDocumentChunks(ownerKey: string, documentId: string) {
  return serializeStoreMutation("private", async () => {
    const store = await readStore("private");
    const deletedAt = new Date().toISOString();
    const chunks = store.chunks.map((chunk) => chunk.metadata.ownerKey === ownerKey && chunk.metadata.documentId === documentId
      ? { ...chunk, metadata: { ...chunk.metadata, deletedAt } }
      : chunk);
    await writeStore("private", chunks, false);
    return chunks.some((chunk) => chunk.metadata.ownerKey === ownerKey && chunk.metadata.documentId === documentId && chunk.metadata.deletedAt === deletedAt);
  });
}

export async function searchLocalHybridStore(queryEmbedding: number[], options: LocalSearchOptions): Promise<RagSearchResult[]> {
  const store = await readStore(options.scope);
  const queryTokens = Array.from(new Set(tokenize(options.queryText)));
  const candidates = store.chunks.filter((chunk) => {
    if (chunk.metadata.scope !== options.scope || chunk.metadata.superseded || chunk.metadata.deletedAt) return false;
    if (options.scope === "private") {
      if (!options.ownerKey || chunk.metadata.ownerKey !== options.ownerKey) return false;
      if (options.caseId && chunk.metadata.caseId !== options.caseId) return false;
      if (options.documentId && chunk.metadata.documentId !== options.documentId) return false;
    }
    return true;
  });
  const scored = candidates.map((chunk) => {
    const documentTokens = tokenize(`${chunk.metadata.sourceTitle} ${chunk.metadata.heading ?? ""} ${chunk.text}`);
    const tokenSet = new Set(documentTokens);
    const keywordScore = queryTokens.length > 0 ? queryTokens.filter((token) => tokenSet.has(token)).length / queryTokens.length : 0;
    return { chunk, vectorScore: cosineSimilarity(queryEmbedding, chunk.embedding), keywordScore };
  });
  const vectorRank = new Map(scored.filter((item) => item.vectorScore > 0).sort((a, b) => b.vectorScore - a.vectorScore).map((item, index) => [item.chunk.id, index + 1]));
  const keywordRank = new Map(scored.filter((item) => item.keywordScore > 0).sort((a, b) => b.keywordScore - a.keywordScore).map((item, index) => [item.chunk.id, index + 1]));
  return scored
    .map(({ chunk, vectorScore, keywordScore }) => {
      const reciprocalRank = (vectorRank.has(chunk.id) ? 1 / (60 + vectorRank.get(chunk.id)!) : 0)
        + (keywordRank.has(chunk.id) ? 1 / (60 + keywordRank.get(chunk.id)!) : 0);
      const trustWeight = chunk.metadata.trustTier === 1 ? 0.08 : chunk.metadata.trustTier === 2 ? 0.05 : 0.01;
      const score = Math.min(1, reciprocalRank * 6 + vectorScore * 0.45 + keywordScore * 0.25 + trustWeight);
      return { id: chunk.id, text: chunk.text, metadata: chunk.metadata, score, vectorScore, keywordScore };
    })
    .filter((result) => (
      options.scope === "private"
        ? result.keywordScore! > 0 || result.vectorScore! >= 0.18
        : result.keywordScore! > 0 || result.vectorScore! >= 0.2
    ) && result.score >= (options.threshold ?? env.ragRelevanceThreshold))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(options.topK, 20)));
}

export async function searchLocalVectorStore(queryEmbedding: number[], topK: number): Promise<RagSearchResult[]> {
  return searchLocalHybridStore(queryEmbedding, { scope: "global", topK, queryText: "", threshold: 0 });
}
