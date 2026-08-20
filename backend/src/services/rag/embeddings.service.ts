import crypto from "crypto";
import { GoogleAuth } from "google-auth-library";
import { env } from "../../config/env";

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
const googleAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function hashTokenToIndex(token: string) {
  const digest = crypto.createHash("sha256").update(token).digest();
  return digest.readUInt32BE(0) % env.ragEmbeddingDimensions;
}

export function createMockEmbedding(value: string) {
  const vector = new Array<number>(env.ragEmbeddingDimensions).fill(0);
  const tokens = tokenize(value);

  for (const [position, token] of tokens.entries()) {
    vector[hashTokenToIndex(token)] += 1;
    const bigram = `${token}:${tokens[position + 1] ?? ""}`;
    vector[hashTokenToIndex(bigram)] += 0.35;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (magnitude === 0) return vector;
  return vector.map((item) => item / magnitude);
}

function validVector(value: unknown) {
  return Array.isArray(value)
    && value.length === env.ragEmbeddingDimensions
    && value.every((item) => Number.isFinite(Number(item)));
}

async function createVertexEmbedding(value: string, task: EmbeddingTask) {
  if (!env.vertexAiProjectId.trim() || !env.vertexAiLocation.trim() || env.embeddingsModel !== "gemini-embedding-001") {
    throw new Error("VERTEX_EMBEDDINGS_NOT_CONFIGURED");
  }
  const token = await googleAuth.getAccessToken();
  if (!token) throw new Error("VERTEX_SERVICE_IDENTITY_UNAVAILABLE");
  const endpoint = `https://${env.vertexAiLocation}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(env.vertexAiProjectId)}/locations/${encodeURIComponent(env.vertexAiLocation)}/publishers/google/models/${encodeURIComponent(env.embeddingsModel)}:predict`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      instances: [{ content: value.slice(0, 20_000), task_type: task }],
      parameters: { outputDimensionality: env.ragEmbeddingDimensions },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("VERTEX_EMBEDDING_REQUEST_FAILED");
  const payload = await response.json() as {
    predictions?: Array<{ embeddings?: { values?: number[] } | number[] }>;
  };
  const raw = payload.predictions?.[0]?.embeddings;
  const vector = Array.isArray(raw) ? raw : raw?.values;
  if (!validVector(vector)) throw new Error("VERTEX_EMBEDDING_RESPONSE_INVALID");
  return vector!.map(Number);
}

export async function embedText(value: string, task: EmbeddingTask = "RETRIEVAL_QUERY") {
  const normalized = value.replace(/\u0000/g, " ").trim().slice(0, 20_000);
  if (!normalized) return new Array<number>(env.ragEmbeddingDimensions).fill(0);
  if (env.embeddingsProvider === "vertex") return createVertexEmbedding(normalized, task);
  if (env.embeddingsProvider === "mock" || env.embeddingsProvider === "local") return createMockEmbedding(normalized);
  throw new Error("EMBEDDINGS_PROVIDER_NOT_CONFIGURED");
}
