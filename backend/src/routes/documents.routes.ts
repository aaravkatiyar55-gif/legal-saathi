import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { requireActiveOnlineAccount } from "../middleware/accountAccess.middleware";
import { getVerifiedUser } from "../middleware/identity.middleware";
import { extractDocumentText } from "../services/documents/documentProcessing.service";
import {
  addStoredDocumentAnnotation,
  deleteStoredDocument,
  DocumentStoreError,
  listStoredDocumentsForCase,
  readStoredDocument,
  readStoredDocumentAsset,
  storeDocument,
  updateStoredDocumentCategory,
  updateStoredDocumentCase,
} from "../services/documents/documentStore.service";
import { getCaseWithMemory } from "../services/legal/casePersistence.service";
import { documentUploadRateLimit } from "../middleware/rateLimit.middleware";
import { rejectDuplicateRequest } from "../middleware/idempotency.middleware";
import { env } from "../config/env";
import { deletePrivateDocumentIndex, indexPrivateDocument } from "../services/rag/privateRag.service";
import { requireCurrentTermsConsent } from "../middleware/consent.middleware";
import {
  classifyDocumentCategory,
  isStoredDocumentCategory,
} from "../services/documents/documentCategory.service";
import { readSupportedImageDimensions } from "../services/documents/imageDimensions.service";

export const documentRoutes = Router();

const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;
const MAX_OCR_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const safeIdPattern = /^[A-Za-z0-9_-]{8,120}$/;
const annotationSchema = z.object({
  id: z.string().regex(safeIdPattern),
  documentId: z.string().regex(safeIdPattern),
  selectedText: z.string().trim().min(1).max(2_000),
  comment: z.string().trim().min(1).max(2_000),
  createdAt: z.number().int().positive(),
}).strict();
const allowedMimeByExtension = new Map<string, Set<string>>([
  [".pdf", new Set(["application/pdf"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".doc", new Set(["application/msword", "application/octet-stream"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".xls", new Set(["application/vnd.ms-excel", "application/octet-stream"])],
  [".txt", new Set(["text/plain"])],
  [".md", new Set(["text/markdown", "text/plain"])],
  [".csv", new Set(["text/csv", "text/plain", "application/vnd.ms-excel"])],
  [".json", new Set(["application/json", "text/plain"])],
  [".rtf", new Set(["application/rtf", "text/rtf", "text/plain"])],
  [".png", new Set(["image/png"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".webp", new Set(["image/webp"])],
  [".mp4", new Set(["video/mp4"])],
  [".m4v", new Set(["video/mp4", "video/x-m4v"])],
  [".mov", new Set(["video/quicktime"])],
  [".webm", new Set(["video/webm"])],
  [".avi", new Set(["video/x-msvideo", "video/avi"])],
  [".mpeg", new Set(["video/mpeg"])],
  [".mpg", new Set(["video/mpeg"])],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE, files: 1, fields: 3, fieldNameSize: 100, fieldSize: 500 },
});

function singleDocumentUpload(request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) {
  upload.single("file")(request, response, (error) => {
    if (!error) {
      next();
      return;
    }
    const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    response.status(tooLarge ? 413 : 400).json({
      ok: false,
      error: tooLarge ? "DOCUMENT_TOO_LARGE" : "INVALID_DOCUMENT_UPLOAD",
      message: tooLarge ? "Files must be 25 MB or smaller." : "Send one document as multipart form data.",
      requestId: response.locals.requestId,
    });
  });
}

function hasExpectedSignature(extension: string, buffer: Buffer) {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === ".jpg" || extension === ".jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === ".webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (extension === ".docx" || extension === ".xlsx") return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (extension === ".doc" || extension === ".xls") {
    return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  if (extension === ".mp4" || extension === ".m4v" || extension === ".mov") {
    return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (extension === ".webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (extension === ".avi") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "AVI ";
  if (extension === ".mpeg" || extension === ".mpg") {
    const signature = buffer.subarray(0, 4);
    return signature.equals(Buffer.from([0x00, 0x00, 0x01, 0xba])) || signature.equals(Buffer.from([0x00, 0x00, 0x01, 0xb3]));
  }
  return !buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function validateUpload(file: Express.Multer.File) {
  if (!file.originalname || file.originalname.length > 180 || /[\\/\u0000\r\n]/.test(file.originalname) || file.originalname.includes("..")) return false;
  const extension = path.extname(file.originalname).toLowerCase();
  const allowedMimeTypes = allowedMimeByExtension.get(extension);
  if (!allowedMimeTypes?.has(file.mimetype) || !hasExpectedSignature(extension, file.buffer)) return false;
  if (file.mimetype.startsWith("image/")) {
    if (file.size > MAX_OCR_IMAGE_SIZE) return false;
    try {
      const dimensions = readSupportedImageDimensions(file.buffer);
      if (!dimensions) return false;
      const width = dimensions.width ?? 0;
      const height = dimensions.height ?? 0;
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function verifyCaseOwnership(caseId: string, ownerEmail: string) {
  if (!safeIdPattern.test(caseId)) return false;
  const caseRecord = await getCaseWithMemory(caseId, ownerEmail, false);
  return Boolean(caseRecord.case);
}

function sendDocumentError(response: import("express").Response, error: unknown) {
  const known = error instanceof DocumentStoreError ? error : null;
  response.status(known?.status ?? 500).json({
    ok: false,
    error: known?.code ?? "DOCUMENT_REQUEST_FAILED",
    message: known?.message ?? "The document request could not be completed.",
    requestId: response.locals.requestId,
  });
}

documentRoutes.post("/process", documentUploadRateLimit, requireActiveOnlineAccount, requireCurrentTermsConsent, rejectDuplicateRequest, singleDocumentUpload, async (request, response) => {
  if (env.nodeEnv === "production" && !env.documentMalwareScanEnabled) {
    response.status(503).json({ ok: false, error: "DOCUMENT_MALWARE_SCAN_REQUIRED", message: "Production document uploads are disabled until malware scanning is configured.", requestId: response.locals.requestId });
    return;
  }
  const documentId = String(request.body?.documentId ?? "");
  const caseId = String(request.body?.caseId ?? "").trim() || undefined;
  const file = request.file;
  if (!safeIdPattern.test(documentId) || !file) {
    response.status(400).json({ ok: false, error: "INVALID_DOCUMENT_UPLOAD", message: "A valid document identifier and file are required.", requestId: response.locals.requestId });
    return;
  }
  if (!validateUpload(file)) {
    response.status(415).json({ ok: false, error: "UNSUPPORTED_DOCUMENT", message: "Upload a genuine PDF, Word, spreadsheet, text, image, or supported video file with a safe filename.", requestId: response.locals.requestId });
    return;
  }

  const ownerEmail = getVerifiedUser(response).email;
  try {
    if (caseId && !(await verifyCaseOwnership(caseId, ownerEmail))) {
      response.status(404).json({ ok: false, error: "CASE_NOT_FOUND", message: "The case folder was not found.", requestId: response.locals.requestId });
      return;
    }
    const extraction = await extractDocumentText({ buffer: file.buffer, fileName: file.originalname, mimeType: file.mimetype });
    const manualCategory = isStoredDocumentCategory(request.body?.category) ? request.body.category : null;
    const classification = manualCategory
      ? { category: manualCategory, categorySource: "manual" as const }
      : classifyDocumentCategory({
          fileName: file.originalname,
          mimeType: file.mimetype,
          extractedText: extraction.extractedText,
        });
    const metadata = await storeDocument({
      id: documentId,
      ownerEmail,
      caseId,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: Date.now(),
      buffer: file.buffer,
      extraction,
      category: classification.category,
      categorySource: classification.categorySource,
    });
    const ragIndex = caseId && extraction.extractedText
      ? await indexPrivateDocument({
          ownerEmail,
          caseId,
          documentId,
          name: file.originalname,
          mimeType: file.mimetype,
          extractedText: extraction.extractedText,
        })
      : { indexed: false, chunkCount: 0 };
    response.status(201).json({
      ok: true,
      contentAvailable: true,
      extractedText: metadata.extractedText,
      extractionStatus: metadata.extractionStatus,
      extractionMessage: metadata.extractionMessage,
      category: metadata.category,
      categorySource: metadata.categorySource,
      ragIndex: { indexed: ragIndex.indexed, chunkCount: ragIndex.chunkCount },
    });
  } catch (error) {
    sendDocumentError(response, error);
  }
});

documentRoutes.get("/", requireActiveOnlineAccount, requireCurrentTermsConsent, async (request, response) => {
  const caseId = typeof request.query.caseId === "string" ? request.query.caseId.trim() : "";
  const ownerEmail = getVerifiedUser(response).email;
  if (!safeIdPattern.test(caseId)) {
    response.status(400).json({ ok: false, error: "INVALID_CASE_ID", message: "Choose a valid case folder.", requestId: response.locals.requestId });
    return;
  }
  try {
    if (!(await verifyCaseOwnership(caseId, ownerEmail))) {
      response.status(404).json({ ok: false, error: "CASE_NOT_FOUND", message: "The case folder was not found.", requestId: response.locals.requestId });
      return;
    }
    const documents = await listStoredDocumentsForCase(ownerEmail, caseId);
    response.json({
      ok: true,
      documents: documents.map((document) => ({
        id: document.id,
        caseId: document.caseId,
        name: document.name,
        mimeType: document.mimeType,
        size: document.size,
        uploadedAt: document.uploadedAt,
        extractedText: document.extractedText,
        extractionStatus: document.extractionStatus,
        extractionMessage: document.extractionMessage,
        category: document.category,
        categorySource: document.categorySource,
        annotations: document.annotations,
        contentAvailable: true,
      })),
      requestId: response.locals.requestId,
    });
  } catch (error) {
    sendDocumentError(response, error);
  }
});

documentRoutes.patch("/:documentId/case", requireActiveOnlineAccount, requireCurrentTermsConsent, async (request, response) => {
  const caseId = String(request.body?.caseId ?? "");
  const ownerEmail = getVerifiedUser(response).email;
  if (!safeIdPattern.test(caseId)) {
    response.status(400).json({
      ok: false,
      error: "INVALID_CASE_ID",
      message: "Choose a valid case folder.",
      requestId: response.locals.requestId,
    });
    return;
  }
  try {
    if (!(await verifyCaseOwnership(caseId, ownerEmail))) {
      response.status(404).json({ ok: false, error: "CASE_NOT_FOUND", message: "The case folder was not found.", requestId: response.locals.requestId });
      return;
    }
    const existing = await readStoredDocument(ownerEmail, String(request.params.documentId));
    if (!existing) {
      response.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND", message: "The document was not found.", requestId: response.locals.requestId });
      return;
    }
    const updated = await updateStoredDocumentCase(ownerEmail, existing.id, caseId);
    if (!updated) {
      response.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND", message: "The document was not found.", requestId: response.locals.requestId });
      return;
    }
    if (updated.extractedText) {
      await indexPrivateDocument({
        ownerEmail,
        caseId,
        documentId: updated.id,
        name: updated.name,
        mimeType: updated.mimeType,
        extractedText: updated.extractedText,
      });
    }
    response.json({
      ok: true,
      document: {
        id: updated.id,
        caseId: updated.caseId,
        category: updated.category,
        categorySource: updated.categorySource,
      },
      requestId: response.locals.requestId,
    });
  } catch (error) {
    sendDocumentError(response, error);
  }
});

documentRoutes.patch("/:documentId/category", requireActiveOnlineAccount, requireCurrentTermsConsent, async (request, response) => {
  const category = request.body?.category;
  if (!isStoredDocumentCategory(category)) {
    response.status(400).json({
      ok: false,
      error: "INVALID_DOCUMENT_CATEGORY",
      message: "Choose a valid case document folder.",
      requestId: response.locals.requestId,
    });
    return;
  }
  try {
    const updated = await updateStoredDocumentCategory(
      getVerifiedUser(response).email,
      String(request.params.documentId),
      category,
      "manual",
    );
    if (!updated) {
      response.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND", message: "The document was not found.", requestId: response.locals.requestId });
      return;
    }
    response.json({
      ok: true,
      document: {
        id: updated.id,
        category: updated.category,
        categorySource: updated.categorySource,
      },
      requestId: response.locals.requestId,
    });
  } catch (error) {
    sendDocumentError(response, error);
  }
});

documentRoutes.patch("/:documentId/annotations", requireActiveOnlineAccount, requireCurrentTermsConsent, async (request, response) => {
  const documentId = String(request.params.documentId ?? "");
  const parsed = annotationSchema.safeParse(request.body);
  if (!safeIdPattern.test(documentId) || !parsed.success || parsed.data.documentId !== documentId) {
    response.status(400).json({
      ok: false,
      error: "INVALID_DOCUMENT_ANNOTATION",
      message: "Select document text and add a valid comment.",
      requestId: response.locals.requestId,
    });
    return;
  }
  try {
    const updated = await addStoredDocumentAnnotation(
      getVerifiedUser(response).email,
      documentId,
      parsed.data,
    );
    if (!updated) {
      response.status(404).json({
        ok: false,
        error: "DOCUMENT_NOT_FOUND",
        message: "The document was not found.",
        requestId: response.locals.requestId,
      });
      return;
    }
    response.json({
      ok: true,
      annotation: parsed.data,
      annotationCount: updated.annotations.length,
      requestId: response.locals.requestId,
    });
  } catch (error) {
    sendDocumentError(response, error);
  }
});

documentRoutes.get("/:documentId/content", requireActiveOnlineAccount, requireCurrentTermsConsent, async (request, response) => {
  try {
    const stored = await readStoredDocumentAsset(getVerifiedUser(response).email, String(request.params.documentId));
    if (!stored) {
      response.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND", message: "The document was not found.", requestId: response.locals.requestId });
      return;
    }
    response.setHeader("Content-Type", stored.metadata.mimeType);
    response.setHeader("Content-Length", stored.buffer.length);
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(stored.metadata.name)}`);
    response.setHeader("Cache-Control", "private, no-store");
    response.send(stored.buffer);
  } catch (error) {
    sendDocumentError(response, error);
  }
});

documentRoutes.delete("/:documentId", requireActiveOnlineAccount, requireCurrentTermsConsent, async (request, response) => {
  try {
    const ownerEmail = getVerifiedUser(response).email;
    const documentId = String(request.params.documentId);
    const existing = await readStoredDocument(ownerEmail, documentId);
    if (!existing) {
      response.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND", message: "The document was not found.", requestId: response.locals.requestId });
      return;
    }
    await deletePrivateDocumentIndex(ownerEmail, documentId);
    const deleted = await deleteStoredDocument(ownerEmail, documentId);
    if (!deleted) {
      response.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND", message: "The document was not found.", requestId: response.locals.requestId });
      return;
    }
    response.json({ ok: true, deletedDocumentId: documentId });
  } catch (error) {
    sendDocumentError(response, error);
  }
});
