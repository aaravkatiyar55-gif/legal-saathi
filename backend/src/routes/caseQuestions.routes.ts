import { Router } from "express";
import { z } from "zod";
import { requireActiveOnlineAccount } from "../middleware/accountAccess.middleware";
import { requireCurrentTermsConsent } from "../middleware/consent.middleware";
import { getVerifiedUser } from "../middleware/identity.middleware";
import {
  DocumentStoreError,
  listStoredDocumentsForCase,
  readStoredDocument,
  storeCaseQuestion,
  type StoredDocumentMetadata,
} from "../services/documents/documentStore.service";
import { getCaseWithMemory } from "../services/legal/casePersistence.service";
import { rejectDuplicateRequest } from "../middleware/idempotency.middleware";
import { retrievePrivateCaseKnowledge } from "../services/rag/privateRag.service";

export const caseQuestionRoutes = Router();

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8,120}$/);
const questionSchema = z.object({
  questionId: idSchema,
  caseId: idSchema,
  scope: z.enum(["document", "case"]),
  documentId: idSchema.optional(),
  text: z.string().trim().min(1).max(5_000),
}).strict().superRefine((value, context) => {
  if (value.scope === "document" && !value.documentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["documentId"], message: "A document identifier is required." });
  }
});

function sendCaseQuestionError(response: import("express").Response, error: unknown) {
  const known = error instanceof DocumentStoreError ? error : null;
  response.status(known?.status ?? 500).json({
    ok: false,
    error: known?.code ?? "CASE_QUESTION_FAILED",
    message: known?.message ?? "The case question could not be prepared.",
    requestId: response.locals.requestId,
  });
}

caseQuestionRoutes.post("/", requireActiveOnlineAccount, requireCurrentTermsConsent, rejectDuplicateRequest, async (request, response) => {
  const parsed = questionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ ok: false, error: "INVALID_CASE_QUESTION", message: "A valid case question is required.", requestId: response.locals.requestId });
    return;
  }
  const ownerEmail = getVerifiedUser(response).email;
  try {
    const ownedCase = await getCaseWithMemory(parsed.data.caseId, ownerEmail, false);
    if (!ownedCase.case) {
      response.status(404).json({ ok: false, error: "CASE_NOT_FOUND", message: "The case folder was not found.", requestId: response.locals.requestId });
      return;
    }

    let documents: StoredDocumentMetadata[];
    if (parsed.data.scope === "document") {
      const document = await readStoredDocument(ownerEmail, parsed.data.documentId!);
      if (!document || document.caseId !== parsed.data.caseId) {
        response.status(404).json({ ok: false, error: "DOCUMENT_NOT_FOUND", message: "The selected case document was not found.", requestId: response.locals.requestId });
        return;
      }
      documents = [document];
    } else {
      documents = await listStoredDocumentsForCase(ownerEmail, parsed.data.caseId);
    }

    // An empty case has no private document corpus to embed or retrieve. Its
    // Case Agent answer can still use the persisted, owner-scoped conversation
    // memory, so do not let an optional RAG provider block that workflow.
    const retrievedChunks = documents.length > 0
      ? await retrievePrivateCaseKnowledge({
          ownerEmail,
          caseId: parsed.data.caseId,
          documentId: parsed.data.scope === "document" ? parsed.data.documentId : undefined,
          query: parsed.data.text,
          topK: 6,
        })
      : [];
    const retrievedDocumentIds = Array.from(new Set(retrievedChunks.map((item) => item.metadata.documentId).filter((value): value is string => Boolean(value))));
    await storeCaseQuestion(ownerEmail, {
      id: parsed.data.questionId,
      caseId: parsed.data.caseId,
      documentId: parsed.data.scope === "document" ? parsed.data.documentId : undefined,
      scope: parsed.data.scope,
      text: parsed.data.text,
      sourceDocumentIds: documents.map(document => document.id),
      retrievedDocumentIds,
    });
    response.status(201).json({
      ok: true,
      retrievedDocumentIds,
      retrievalMessage: retrievedDocumentIds.length
        ? "Relevant owned document chunks were retrieved with tenant and case scoping."
        : "Reliable supporting material was not found in the selected owned scope.",
      grounding: {
        status: retrievedChunks.length > 0 ? "grounded" : "insufficient",
        scope: "private",
        citations: retrievedChunks.map((item) => ({ documentId: item.metadata.documentId, title: item.metadata.sourceTitle, page: item.metadata.page })).slice(0, 6),
      },
    });
  } catch (error) {
    sendCaseQuestionError(response, error);
  }
});
