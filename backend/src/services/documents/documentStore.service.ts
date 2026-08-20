import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import type { DocumentExtractionResult } from "./documentProcessing.service";
import {
  addGcsDocumentAnnotation,
  deleteGcsDocument,
  listGcsDocumentsForCase,
  readGcsDocument,
  readGcsDocumentAsset,
  storeGcsCaseQuestion,
  storeGcsDocument,
  updateGcsDocumentCategory,
  updateGcsDocumentCase,
} from "./gcsDocumentStore.service";
import type {
  StoredDocumentCategory,
  StoredDocumentCategorySource,
} from "./documentCategory.service";
import { classifyDocumentCategory, isStoredDocumentCategory } from "./documentCategory.service";

export class DocumentStoreError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 500) {
    super(message);
  }
}

export type StoredDocumentMetadata = DocumentExtractionResult & {
  id: string;
  ownerKey: string;
  caseId?: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  storedAt: string;
  retentionExpiresAt: string;
  assetFileName: string;
  serverStorageKey: string;
  category: StoredDocumentCategory;
  categorySource: StoredDocumentCategorySource;
  annotations: StoredDocumentAnnotation[];
};

export type StoredDocumentAnnotation = {
  id: string;
  documentId: string;
  selectedText: string;
  comment: string;
  createdAt: number;
};

type StoredQuestion = {
  id: string;
  ownerKey: string;
  caseId: string;
  documentId?: string;
  scope: "document" | "case";
  text: string;
  createdAt: string;
  retentionExpiresAt: string;
  sourceDocumentIds: string[];
  retrievedDocumentIds: string[];
};

const safeIdPattern = /^[A-Za-z0-9_-]{8,120}$/;

function ensureDevelopmentStorage() {
  if (env.nodeEnv === "production" || env.documentStorageBackend !== "local") {
    throw new DocumentStoreError(
      "DOCUMENT_STORAGE_NOT_CONFIGURED",
      "Document storage needs an approved tenant-aware production backend.",
      503,
    );
  }
}

function assertSafeId(value: string, label: string) {
  if (!safeIdPattern.test(value)) throw new DocumentStoreError("INVALID_RESOURCE_ID", `A valid ${label} is required.`, 400);
  return value;
}

function ownerKey(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

function storageRoot() {
  return path.resolve(process.cwd(), env.documentStorageDir);
}

function ownerRoot(email: string) {
  return path.join(storageRoot(), ownerKey(email));
}

function ensureWithin(parent: string, target: string) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DocumentStoreError("UNSAFE_STORAGE_PATH", "The requested storage path is invalid.", 400);
  }
  return target;
}

async function ensureOwnerDirectories(email: string) {
  ensureDevelopmentStorage();
  const root = ownerRoot(email);
  await Promise.all([
    fs.mkdir(path.join(root, "assets"), { recursive: true }),
    fs.mkdir(path.join(root, "metadata"), { recursive: true }),
    fs.mkdir(path.join(root, "questions"), { recursive: true }),
  ]);
  return root;
}

async function writeJson(filePath: string, payload: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, filePath);
}

function metadataPath(email: string, documentId: string) {
  const root = ownerRoot(email);
  return ensureWithin(root, path.join(root, "metadata", `${assertSafeId(documentId, "document identifier")}.json`));
}

function normalizeStoredMetadata(value: StoredDocumentMetadata) {
  const annotations = Array.isArray(value.annotations)
    ? value.annotations.filter((annotation) =>
        annotation
        && safeIdPattern.test(String(annotation.id))
        && annotation.documentId === value.id
        && typeof annotation.selectedText === "string"
        && annotation.selectedText.length > 0
        && annotation.selectedText.length <= 2_000
        && typeof annotation.comment === "string"
        && annotation.comment.length > 0
        && annotation.comment.length <= 2_000
        && Number.isSafeInteger(annotation.createdAt)
        && annotation.createdAt > 0
      ).slice(-100)
    : [];
  if (isStoredDocumentCategory(value.category)) {
    return {
      ...value,
      annotations,
      categorySource: value.categorySource === "manual" || value.categorySource === "rule" || value.categorySource === "ai"
        ? value.categorySource
        : "none",
    } satisfies StoredDocumentMetadata;
  }
  const classification = classifyDocumentCategory({
    fileName: value.name,
    mimeType: value.mimeType,
    extractedText: value.extractedText,
  });
  return {
    ...value,
    ...classification,
    annotations,
  } satisfies StoredDocumentMetadata;
}

export async function readStoredDocument(email: string, documentId: string): Promise<StoredDocumentMetadata | null> {
  if (env.documentStorageBackend === "gcs") return readGcsDocument(email, documentId);
  ensureDevelopmentStorage();
  try {
    const parsed = JSON.parse(await fs.readFile(metadataPath(email, documentId), "utf8")) as StoredDocumentMetadata;
    if (parsed.ownerKey !== ownerKey(email) || parsed.id !== documentId) return null;
    return normalizeStoredMetadata(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function storeDocument(input: {
  id: string;
  ownerEmail: string;
  caseId?: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  buffer: Buffer;
  extraction: DocumentExtractionResult;
  category: StoredDocumentCategory;
  categorySource: StoredDocumentCategorySource;
}) {
  const id = assertSafeId(input.id, "document identifier");
  if (input.caseId) assertSafeId(input.caseId, "case identifier");
  if (env.documentStorageBackend === "gcs") return storeGcsDocument({ ...input, id });
  const root = await ensureOwnerDirectories(input.ownerEmail);
  const extension = path.extname(input.name).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
  const assetFileName = `${id}${safeExtension}`;
  const assetPath = ensureWithin(root, path.join(root, "assets", assetFileName));
  const previous = await readStoredDocument(input.ownerEmail, id);
  if (previous && previous.assetFileName !== assetFileName) {
    await fs.unlink(ensureWithin(root, path.join(root, "assets", previous.assetFileName))).catch(() => undefined);
  }
  await fs.writeFile(assetPath, input.buffer, { flag: "w" });
  const now = new Date();
  const metadata: StoredDocumentMetadata = {
    id,
    ownerKey: ownerKey(input.ownerEmail),
    caseId: input.caseId,
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    uploadedAt: input.uploadedAt,
    storedAt: now.toISOString(),
    retentionExpiresAt: new Date(now.getTime() + env.documentRetentionDays * 86_400_000).toISOString(),
    assetFileName,
    serverStorageKey: `document:${id}`,
    category: input.category,
    categorySource: input.categorySource,
    annotations: [],
    ...input.extraction,
  };
  await writeJson(metadataPath(input.ownerEmail, id), metadata);
  return metadata;
}

export async function readStoredDocumentAsset(email: string, documentId: string) {
  if (env.documentStorageBackend === "gcs") return readGcsDocumentAsset(email, documentId);
  const metadata = await readStoredDocument(email, documentId);
  if (!metadata) return null;
  const root = ownerRoot(email);
  const assetPath = ensureWithin(root, path.join(root, "assets", metadata.assetFileName));
  return { metadata, buffer: await fs.readFile(assetPath) };
}

export async function listStoredDocumentsForCase(email: string, caseId: string) {
  assertSafeId(caseId, "case identifier");
  if (env.documentStorageBackend === "gcs") return listGcsDocumentsForCase(email, caseId);
  await ensureOwnerDirectories(email);
  const directory = path.join(ownerRoot(email), "metadata");
  const documents: StoredDocumentMetadata[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(directory, entry.name), "utf8")) as StoredDocumentMetadata;
      if (parsed.ownerKey === ownerKey(email) && parsed.caseId === caseId) documents.push(normalizeStoredMetadata(parsed));
    } catch {
      // Ignore an unreadable isolated metadata record; never expose its contents.
    }
  }
  return documents.slice(0, 100);
}

export async function updateStoredDocumentCategory(
  email: string,
  documentId: string,
  category: StoredDocumentCategory,
  categorySource: StoredDocumentCategorySource = "manual",
) {
  if (env.documentStorageBackend === "gcs") {
    return updateGcsDocumentCategory(email, documentId, category, categorySource);
  }
  const metadata = await readStoredDocument(email, documentId);
  if (!metadata) return null;
  const updated: StoredDocumentMetadata = {
    ...metadata,
    category,
    categorySource,
  };
  await writeJson(metadataPath(email, documentId), updated);
  return updated;
}

export async function addStoredDocumentAnnotation(
  email: string,
  documentId: string,
  annotation: StoredDocumentAnnotation,
) {
  if (env.documentStorageBackend === "gcs") {
    return addGcsDocumentAnnotation(email, documentId, annotation);
  }
  const metadata = await readStoredDocument(email, documentId);
  if (!metadata) return null;
  if (metadata.annotations.some((item) => item.id === annotation.id)) return metadata;
  const updated: StoredDocumentMetadata = {
    ...metadata,
    annotations: [...metadata.annotations, annotation].slice(-100),
  };
  await writeJson(metadataPath(email, documentId), updated);
  return updated;
}

export async function updateStoredDocumentCase(
  email: string,
  documentId: string,
  caseId: string,
) {
  assertSafeId(caseId, "case identifier");
  if (env.documentStorageBackend === "gcs") {
    return updateGcsDocumentCase(email, documentId, caseId);
  }
  const metadata = await readStoredDocument(email, documentId);
  if (!metadata) return null;
  const updated: StoredDocumentMetadata = {
    ...metadata,
    caseId,
  };
  await writeJson(metadataPath(email, documentId), updated);
  return updated;
}

export async function deleteStoredDocument(email: string, documentId: string) {
  if (env.documentStorageBackend === "gcs") return deleteGcsDocument(email, documentId);
  const metadata = await readStoredDocument(email, documentId);
  if (!metadata) return false;
  const root = ownerRoot(email);
  await Promise.all([
    fs.unlink(ensureWithin(root, path.join(root, "assets", metadata.assetFileName))).catch(() => undefined),
    fs.unlink(metadataPath(email, documentId)).catch(() => undefined),
  ]);
  return true;
}

export async function storeCaseQuestion(email: string, input: Omit<StoredQuestion, "ownerKey" | "createdAt" | "retentionExpiresAt">) {
  const id = assertSafeId(input.id, "question identifier");
  assertSafeId(input.caseId, "case identifier");
  if (input.documentId) assertSafeId(input.documentId, "document identifier");
  if (env.documentStorageBackend === "gcs") {
    const now = new Date();
    await storeGcsCaseQuestion(email, { ...input, id, created_at: now.toISOString(), retention_expires_at: new Date(now.getTime() + env.documentRetentionDays * 86_400_000).toISOString() });
    return;
  }
  const root = await ensureOwnerDirectories(email);
  const now = new Date();
  const record: StoredQuestion = {
    ...input,
    id,
    ownerKey: ownerKey(email),
    createdAt: now.toISOString(),
    retentionExpiresAt: new Date(now.getTime() + env.documentRetentionDays * 86_400_000).toISOString(),
  };
  await writeJson(ensureWithin(root, path.join(root, "questions", `${id}.json`)), record);
}
