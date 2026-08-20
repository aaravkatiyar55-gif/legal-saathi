import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";
import type { StoredDocumentAnnotation, StoredDocumentMetadata } from "./documentStore.service";
import {
  isStoredDocumentCategory,
  type StoredDocumentCategory,
  type StoredDocumentCategorySource,
} from "./documentCategory.service";

function configuredCredentialsFile() {
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (explicit) return explicit;

  // Render secret files can be mounted at the service root or /etc/secrets.
  // Prefer an explicitly configured path, and never read or log the file.
  return [
    path.join(process.cwd(), "google-service-account.json"),
    "/etc/secrets/google-service-account.json",
  ].find(existsSync);
}

const credentialsFile = configuredCredentialsFile();
const storage = credentialsFile ? new Storage({ keyFilename: credentialsFile }) : new Storage();

function ownerKey(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

function resources() {
  if (!env.gcsDocumentBucket) throw new Error("DOCUMENT_STORAGE_NOT_CONFIGURED");
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("DOCUMENT_STORAGE_NOT_CONFIGURED");
  return { bucket: storage.bucket(env.gcsDocumentBucket), supabase };
}

function fromRow(row: Record<string, unknown>): StoredDocumentMetadata {
  return {
    id: String(row.id), ownerKey: String(row.owner_key), caseId: row.case_id ? String(row.case_id) : undefined,
    name: String(row.name), mimeType: String(row.mime_type), size: Number(row.size), uploadedAt: Number(row.uploaded_at),
    storedAt: String(row.stored_at), retentionExpiresAt: String(row.retention_expires_at), assetFileName: String(row.asset_file_name),
    serverStorageKey: String(row.storage_key), extractionStatus: row.extraction_status as StoredDocumentMetadata["extractionStatus"],
    extractionMessage: row.extraction_message ? String(row.extraction_message) : undefined,
    extractedText: row.extracted_text ? String(row.extracted_text) : undefined,
    category: isStoredDocumentCategory(row.category) ? row.category : "Other",
    categorySource: row.category_source === "manual" || row.category_source === "rule" || row.category_source === "ai"
      ? row.category_source
      : "none",
    annotations: [],
  };
}

function annotationsObjectName(metadata: StoredDocumentMetadata) {
  return `documents/${metadata.ownerKey}/${metadata.id}/annotations.json`;
}

async function readGcsDocumentAnnotations(metadata: StoredDocumentMetadata): Promise<StoredDocumentAnnotation[]> {
  try {
    const { bucket } = resources();
    const [buffer] = await bucket.file(annotationsObjectName(metadata)).download();
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((annotation): annotation is StoredDocumentAnnotation =>
      Boolean(annotation)
      && typeof annotation.id === "string"
      && annotation.documentId === metadata.id
      && typeof annotation.selectedText === "string"
      && typeof annotation.comment === "string"
      && Number.isSafeInteger(annotation.createdAt)
    ).slice(-100);
  } catch {
    return [];
  }
}

export async function storeGcsDocument(input: {
  id: string; ownerEmail: string; caseId?: string; name: string; mimeType: string; size: number; uploadedAt: number;
  buffer: Buffer; extraction: Pick<StoredDocumentMetadata, "extractedText" | "extractionStatus" | "extractionMessage">;
  category: StoredDocumentCategory; categorySource: StoredDocumentCategorySource;
}) {
  if (!env.documentMalwareScanEnabled) throw new Error("DOCUMENT_MALWARE_SCAN_REQUIRED");
  const { bucket, supabase } = resources();
  const key = ownerKey(input.ownerEmail);
  const extension = /^\.[a-z0-9]{1,10}$/.test(path.extname(input.name).toLowerCase()) ? path.extname(input.name).toLowerCase() : "";
  const objectName = `documents/${key}/${input.id}/${randomUUID()}${extension}`;
  await bucket.file(objectName).save(input.buffer, {
    resumable: false,
    contentType: input.mimeType,
    validation: "crc32c",
    metadata: {
      cacheControl: "private, no-store",
      metadata: {
        ownerKey: key,
        documentId: input.id,
        caseId: input.caseId ?? "",
        category: input.category,
        categorySource: input.categorySource,
      },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  const now = new Date();
  const metadata: StoredDocumentMetadata = {
    id: input.id, ownerKey: key, caseId: input.caseId, name: input.name, mimeType: input.mimeType, size: input.size,
    uploadedAt: input.uploadedAt, storedAt: now.toISOString(), retentionExpiresAt: new Date(now.getTime() + env.documentRetentionDays * 86_400_000).toISOString(),
    assetFileName: objectName.split("/").at(-1) || input.id, serverStorageKey: objectName,
    category: input.category, categorySource: input.categorySource, annotations: [], ...input.extraction,
  };
  // Document IDs are immutable. An insert-only write prevents a caller who
  // learns another tenant's ID from replacing that tenant's metadata through
  // the service-role connection.
  const { error } = await supabase.from("legal_sathi_documents").insert({
    id: metadata.id, owner_key: metadata.ownerKey, case_id: metadata.caseId ?? null, name: metadata.name, mime_type: metadata.mimeType,
    size: metadata.size, uploaded_at: metadata.uploadedAt, stored_at: metadata.storedAt, retention_expires_at: metadata.retentionExpiresAt,
    asset_file_name: metadata.assetFileName, storage_key: metadata.serverStorageKey, extraction_status: metadata.extractionStatus,
    extraction_message: metadata.extractionMessage ?? null, extracted_text: metadata.extractedText ?? null, deleted_at: null,
  });
  if (error) {
    await bucket.file(objectName).delete({ ignoreNotFound: true }).catch(() => undefined);
    throw new Error("DOCUMENT_METADATA_WRITE_FAILED");
  }
  return metadata;
}

async function withObjectCategory(metadata: StoredDocumentMetadata) {
  let categorized = metadata;
  try {
    const { bucket } = resources();
    const [objectMetadata] = await bucket.file(metadata.serverStorageKey).getMetadata();
    const custom = objectMetadata.metadata ?? {};
    categorized = {
      ...metadata,
      category: isStoredDocumentCategory(custom.category) ? custom.category : metadata.category,
      categorySource: custom.categorySource === "manual" || custom.categorySource === "rule" || custom.categorySource === "ai"
        ? custom.categorySource
        : metadata.categorySource,
    } satisfies StoredDocumentMetadata;
  } catch {
    categorized = metadata;
  }
  return {
    ...categorized,
    annotations: await readGcsDocumentAnnotations(categorized),
  } satisfies StoredDocumentMetadata;
}

export async function readGcsDocument(ownerEmail: string, documentId: string) {
  const { supabase } = resources();
  const { data, error } = await supabase.from("legal_sathi_documents").select("*").eq("id", documentId).eq("owner_key", ownerKey(ownerEmail)).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("DOCUMENT_METADATA_READ_FAILED");
  return data ? withObjectCategory(fromRow(data as Record<string, unknown>)) : null;
}

export async function readGcsDocumentAsset(ownerEmail: string, documentId: string) {
  const metadata = await readGcsDocument(ownerEmail, documentId);
  if (!metadata) return null;
  const { bucket } = resources();
  const [buffer] = await bucket.file(metadata.serverStorageKey).download();
  if (buffer.length > 25 * 1024 * 1024) throw new Error("DOCUMENT_TOO_LARGE");
  return { metadata, buffer };
}

export async function listGcsDocumentsForCase(ownerEmail: string, caseId: string) {
  const { supabase } = resources();
  const { data, error } = await supabase.from("legal_sathi_documents").select("*").eq("owner_key", ownerKey(ownerEmail)).eq("case_id", caseId).is("deleted_at", null).limit(100);
  if (error) throw new Error("DOCUMENT_METADATA_READ_FAILED");
  return Promise.all((data ?? []).map((row) => withObjectCategory(fromRow(row as Record<string, unknown>))));
}

export async function updateGcsDocumentCategory(
  ownerEmail: string,
  documentId: string,
  category: StoredDocumentCategory,
  categorySource: StoredDocumentCategorySource,
) {
  const metadata = await readGcsDocument(ownerEmail, documentId);
  if (!metadata) return null;
  const { bucket } = resources();
  const file = bucket.file(metadata.serverStorageKey);
  const [objectMetadata] = await file.getMetadata();
  await file.setMetadata({
    metadata: {
      ...(objectMetadata.metadata ?? {}),
      category,
      categorySource,
    },
  });
  return {
    ...metadata,
    category,
    categorySource,
  } satisfies StoredDocumentMetadata;
}

export async function updateGcsDocumentCase(
  ownerEmail: string,
  documentId: string,
  caseId: string,
) {
  const metadata = await readGcsDocument(ownerEmail, documentId);
  if (!metadata) return null;
  const { bucket, supabase } = resources();
  const { data, error } = await supabase
    .from("legal_sathi_documents")
    .update({ case_id: caseId })
    .eq("id", documentId)
    .eq("owner_key", ownerKey(ownerEmail))
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("DOCUMENT_METADATA_WRITE_FAILED");
  if (!data) return null;
  const file = bucket.file(metadata.serverStorageKey);
  const [objectMetadata] = await file.getMetadata();
  await file.setMetadata({
    metadata: {
      ...(objectMetadata.metadata ?? {}),
      caseId,
    },
  });
  return {
    ...metadata,
    caseId,
  } satisfies StoredDocumentMetadata;
}

export async function addGcsDocumentAnnotation(
  ownerEmail: string,
  documentId: string,
  annotation: StoredDocumentAnnotation,
) {
  const metadata = await readGcsDocument(ownerEmail, documentId);
  if (!metadata) return null;
  if (metadata.annotations.some((item) => item.id === annotation.id)) return metadata;
  const annotations = [...metadata.annotations, annotation].slice(-100);
  const { bucket } = resources();
  await bucket.file(annotationsObjectName(metadata)).save(
    Buffer.from(JSON.stringify(annotations), "utf8"),
    {
      resumable: false,
      contentType: "application/json",
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          ownerKey: metadata.ownerKey,
          documentId: metadata.id,
        },
      },
    },
  );
  return {
    ...metadata,
    annotations,
  } satisfies StoredDocumentMetadata;
}

export async function deleteGcsDocument(ownerEmail: string, documentId: string) {
  const metadata = await readGcsDocument(ownerEmail, documentId);
  if (!metadata) return false;
  const { bucket, supabase } = resources();
  const { error } = await supabase.from("legal_sathi_documents").update({ deleted_at: new Date().toISOString() }).eq("id", documentId).eq("owner_key", ownerKey(ownerEmail));
  if (error) throw new Error("DOCUMENT_DELETE_FAILED");
  await bucket.file(metadata.serverStorageKey).delete({ ignoreNotFound: true });
  await bucket.file(annotationsObjectName(metadata)).delete({ ignoreNotFound: true });
  return true;
}

export async function storeGcsCaseQuestion(ownerEmail: string, input: Record<string, unknown>) {
  const { supabase } = resources();
  const { error } = await supabase.from("legal_sathi_case_questions").insert({
    id: input.id,
    case_id: input.caseId,
    document_id: input.documentId ?? null,
    scope: input.scope,
    text: input.text,
    source_document_ids: input.sourceDocumentIds ?? [],
    retrieved_document_ids: input.retrievedDocumentIds ?? [],
    created_at: input.created_at,
    retention_expires_at: input.retention_expires_at,
    owner_key: ownerKey(ownerEmail),
  });
  if (error) throw new Error("CASE_QUESTION_STORE_FAILED");
}
