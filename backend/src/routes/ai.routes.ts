import { Router } from "express";
import { createHmac } from "node:crypto";
import { quotaMiddleware, requireModelEntitlement, reserveWebSearchQuota, type WebSearchQuotaReservation } from "../middleware/quota.middleware";
import { requireAdminAccess } from "../middleware/adminAccess.middleware";
import { env, shouldUseMockProvider } from "../config/env";
import {
  BluesMindsApiError,
  isBluesMindsConfigured,
  testBluesMindsConnection,
} from "../services/ai/bluesMindsProvider";
import {
  isOpenRouterConfigured,
  OpenRouterApiError,
  summarizeCaseIntake,
  testOpenRouterConnection,
  getOpenRouterKeyStats,
} from "../services/ai/openRouterProvider";
import {
  getMeshConfigStatus,
  isMeshConfigured,
  MeshApiError,
  MeshConfigurationError,
  testMeshConnection,
} from "../services/ai/meshProvider";
import { requireActiveOnlineAccount } from "../middleware/accountAccess.middleware";
import {
  AiSafetyBlockError,
  detectConfidentialGovernmentData,
  detectIllegalConductRequest,
  legalInformationDisclaimer,
  safeBlockedReply,
} from "../services/ai/aiSafety.service";
import { getWebSearchStatus, searchLegalWebWithStatus } from "../services/ai/webSearch.service";
import { z } from "zod";
import { rejectDuplicateRequest } from "../middleware/idempotency.middleware";
import { requireCurrentTermsConsent } from "../middleware/consent.middleware";
import { currentPlanIdFromState } from "../services/billing/planState.service";
import { estimateRequestUnits, PRODUCT_PLANS, type ProductModelClass } from "../config/productPolicy";
import { ModelRoutingError, resolveModelRequest, type ResolvedModelRequest } from "../services/ai/modelRouting.service";
import {
  CreditLedgerUnavailableError,
  finalizeRequestUnits,
  InsufficientUnitsError,
  refundRequestUnits,
  reserveRequestUnits,
} from "../services/billing/creditLedger.service";
import { getVerifiedUser } from "../middleware/identity.middleware";
import { buildRagContextForQuery } from "../services/rag/rag.service";
import { ProviderExecutionError, runApprovedLegalChat } from "../services/ai/legalChatProvider.service";
import { providerStatusSnapshot } from "../services/ai/providerHealth.service";
import { ensureOpenRouterModelCatalog, getOpenRouterCatalogStatus } from "../services/ai/openRouterCatalog.service";
import { classifyLegalRequest, isLanguageSelectorRequest, resolveLegalResponseLanguage } from "../services/ai/legalIntent.service";
import { founderReply, isFounderPersonalDetailRequest, isFounderQuestion, languageSelectorReply } from "../services/ai/productIdentity.service";
import { buildLegalAgentPlan } from "../services/ai/legalAgent.service";
import type { RagContext } from "../services/rag/rag.service";
import { chatOwnerKey, getChatStore } from "../services/chats/chatStore.service";
import {
  formatConversationMemoryForPrompt,
  mergeRecentConversationMessages,
} from "../services/chats/conversationMemory.service";
import { getCaseWithMemory } from "../services/legal/casePersistence.service";
import { readCompletedAiRequestReceipt, saveCompletedAiRequestReceipt } from "../services/ai/aiRequestReceipt.service";
import {
  decideAiRequestDisconnectAction,
  resolveAiRequestRecovery,
} from "../services/ai/aiRequestRecovery.service";

export const aiRoutes = Router();

const activeLegalChatRequests = new Map<string, { ownerEmail: string; requestFingerprint: string; controller: AbortController }>();

function activeLegalChatRequestKey(ownerEmail: string, requestId: string) {
  return `${ownerEmail.toLowerCase()}\n${requestId}`;
}

function sendRequestIdReuseMismatch(response: import("express").Response, requestId: string) {
  response.status(409).json({
    ok: false,
    error: "REQUEST_ID_REUSE_MISMATCH",
    message: "This request reference belongs to different content. Start a fresh request to protect your previous result.",
    requestId,
  });
}

function usageRequestFingerprint(value: unknown) {
  return createHmac("sha256", env.sessionSecret).update(JSON.stringify(value)).digest("hex");
}

function requireDevelopmentDiagnostics(_request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) {
  if (env.nodeEnv === "production") {
    response.status(404).json({ ok: false, error: "NOT_FOUND", message: "This route is not available." });
    return;
  }
  next();
}

// This endpoint exposes capability booleans only, so the signed-out shell can
// render an accurate Web state without triggering an authentication error.
aiRoutes.get("/web-status", (_request, response) => {
  response.json({ ok: true, ...getWebSearchStatus() });
});

aiRoutes.get("/legal-chat/:requestId/result", requireActiveOnlineAccount, requireCurrentTermsConsent, async (request, response) => {
  const requestId = String(request.params.requestId ?? "");
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) {
    response.status(400).json({ ok: false, error: "INVALID_REQUEST_ID", message: "A valid request reference is required." });
    return;
  }
  const identity = getVerifiedUser(response);
  const isActive = activeLegalChatRequests.has(activeLegalChatRequestKey(identity.email, requestId));
  try {
    const receipt = isActive ? null : await readCompletedAiRequestReceipt(chatOwnerKey(identity), requestId);
    const recovery = resolveAiRequestRecovery({ isActive, completedReceipt: receipt });
    if (recovery.status === "completed") {
      response.json({ ok: true, requestId, status: "completed", result: recovery.payload });
      return;
    }
    response.json({ ok: true, requestId, status: recovery.status });
  } catch {
    response.status(503).json({ ok: false, error: "REQUEST_RECOVERY_UNAVAILABLE", message: "Completed-response recovery is temporarily unavailable.", requestId });
  }
});

aiRoutes.get("/admin/openrouter-key-status", requireAdminAccess, (_request, response) => {
  response.json({
    ok: true,
    ...getOpenRouterKeyStats(),
    catalog: getOpenRouterCatalogStatus(),
  });
});

aiRoutes.get("/admin/provider-status", requireAdminAccess, (_request, response) => {
  response.json({ ok: true, providers: providerStatusSnapshot() });
});


const legalIntakeDisclaimer = legalInformationDisclaimer;

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8,120}$/);
const requestConfigurationSchema = z.object({
  model: z.enum(["auto", "fast", "flash", "pro", "ultra"]),
  thinkingMode: z.enum(["default", "standard", "extended"]),
  speed: z.enum(["normal", "1.5x", "2x"]),
}).strict();
const contextDocumentSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).optional(),
  text: z.string().max(12_000),
}).strict();
const legalChatContextSchema = z.object({
  language: z.enum(["en", "hinglish", "hi"]).optional(),
  role: z.string().trim().max(50).optional(),
  requestConfiguration: requestConfigurationSchema.optional(),
  chatId: idSchema.optional(),
  documentId: idSchema.optional(),
  documentName: z.string().trim().max(200).optional(),
  documentMimeType: z.string().trim().max(120).optional(),
  documentText: z.string().max(30_000).optional(),
  attachedFileName: z.string().trim().max(200).optional(),
  webEnabled: z.boolean().optional(),
  termsAccepted: z.boolean().optional(),
  caseId: idSchema.optional(),
  caseName: z.string().trim().max(200).optional(),
  scope: z.enum(["document", "case"]).optional(),
  selectedDocumentId: idSchema.optional(),
  documents: z.array(contextDocumentSchema).max(5).optional(),
  contextSummary: z.string().trim().max(4_000).optional(),
}).strip();
const legalChatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8_000) }).strict()).min(1).max(50),
  context: legalChatContextSchema.optional(),
}).strict();

function formatCaseMemoryForPrompt(result: Awaited<ReturnType<typeof getCaseWithMemory>>) {
  if (!result.case) return "";
  const caseRecord = result.case as unknown as Record<string, unknown>;
  const memoryRecord = result.memory as unknown as Record<string, unknown> | null;
  const values = [
    `Case: ${String(caseRecord.title ?? "").slice(0, 200)}`,
    `Case type: ${String(caseRecord.case_type ?? "").slice(0, 120)}`,
    `User role: ${String(caseRecord.user_role ?? "").slice(0, 120)}`,
    `Summary: ${String(caseRecord.short_summary ?? "").slice(0, 2_000)}`,
    `Important facts: ${JSON.stringify(caseRecord.important_facts ?? []).slice(0, 2_000)}`,
    `Important dates: ${JSON.stringify(caseRecord.important_dates ?? []).slice(0, 1_000)}`,
    `Relief wanted: ${JSON.stringify(caseRecord.relief_wanted ?? []).slice(0, 1_000)}`,
    `Missing information: ${JSON.stringify(caseRecord.missing_information ?? []).slice(0, 1_000)}`,
    memoryRecord ? `Prepared memory: ${String(memoryRecord.current_summary ?? "").slice(0, 2_000)}` : "",
    memoryRecord ? `Structured facts: ${JSON.stringify(memoryRecord.facts_json ?? {}).slice(0, 2_000)}` : "",
    memoryRecord ? `Known contradictions: ${JSON.stringify(memoryRecord.contradictions_json ?? []).slice(0, 1_500)}` : "",
  ].filter((value) => value && !value.endsWith(": "));
  return [
    "Owner-scoped case memory (user-authored facts remain unverified):",
    ...values,
  ].join("\n").slice(0, 12_000);
}

function sendAiSafetyBlock(
  response: import("express").Response,
  error: AiSafetyBlockError,
  metadata: Record<string, unknown> = {},
) {
  response.status(error.code === "PROVIDER_NOT_ALLOWED" ? 503 : 422).json({
    ok: false,
    error: error.code,
    message: error.message,
    guidance:
      "Please remove sensitive/confidential details and ask only for lawful general legal information or advocate-preparation support.",
    disclaimer: legalInformationDisclaimer,
    ...metadata,
  });
}

aiRoutes.get("/test-bluesminds", requireDevelopmentDiagnostics, requireAdminAccess, async (_request, response) => {
  if (!isBluesMindsConfigured()) {
    response.json({
      ok: false,
      error: "BluesMinds is not configured",
    });
    return;
  }

  try {
    const result = await testBluesMindsConnection();
    response.json({
      ok: true,
      provider: "bluesminds",
      experimental: true,
      model: env.bluesMindsModel,
      reply: result.answer,
    });
  } catch (error) {
    const debugError =
      error instanceof BluesMindsApiError
        ? error
        : new BluesMindsApiError({ details: "Unexpected BluesMinds API request failure" });

    response.status(502).json({
      ok: false,
      provider: "bluesminds",
      experimental: true,
      model: debugError.model,
      baseUrl: debugError.baseUrl,
      endpoint: debugError.endpoint,
      status: debugError.status,
      statusText: debugError.statusText,
      error: "BluesMinds API request failed",
      details: debugError.details,
    });
  }
});

aiRoutes.get("/test-openrouter", requireDevelopmentDiagnostics, requireAdminAccess, async (_request, response) => {
  if (!isOpenRouterConfigured()) {
    response.status(503).json({
      ok: false,
      error: "AI_PROVIDER_NOT_CONFIGURED",
      message: "The selected AI provider is not configured.",
    });
    return;
  }

  try {
    const result = await testOpenRouterConnection();
    response.json({
      ok: true,
      provider: "openrouter",
      model: env.openRouterModel,
      reply: result.answer,
    });
  } catch (error) {
    if (error instanceof AiSafetyBlockError) {
      sendAiSafetyBlock(response, error);
      return;
    }

    const debugError =
      error instanceof OpenRouterApiError
        ? error
        : new OpenRouterApiError({ details: "Unexpected OpenRouter API request failure" });

    response.status(502).json({
      ok: false,
      provider: "openrouter",
      model: debugError.model,
      status: debugError.status,
      statusText: debugError.statusText,
      error: "OpenRouter API request failed",
      details: debugError.details,
    });
  }
});

aiRoutes.get("/test-mesh", requireDevelopmentDiagnostics, requireAdminAccess, async (_request, response) => {
  const config = getMeshConfigStatus();
  if (!isMeshConfigured()) {
    response.json({
      ok: false,
      provider: "mesh",
      configured: false,
      liveTest: false,
      modelPresent: config.modelId,
      env: config,
      error: "Mesh is not configured",
    });
    return;
  }

  try {
    const result = await testMeshConnection();
    response.json({
      ok: true,
      provider: "mesh",
      configured: true,
      liveTest: true,
      model: env.meshModelId,
      modelPresent: Boolean(env.meshModelId.trim()),
      reply: result.answer,
    });
  } catch (error) {
    if (error instanceof AiSafetyBlockError) {
      sendAiSafetyBlock(response, error);
      return;
    }
    if (error instanceof MeshConfigurationError) {
      response.status(503).json({
        ok: false,
        provider: "mesh",
        configured: false,
        liveTest: false,
        error: error.message,
      });
      return;
    }
    if (error instanceof MeshApiError) {
      response.status(502).json({
        ok: false,
        provider: "mesh",
        configured: true,
        liveTest: false,
        model: env.meshModelId,
        modelPresent: Boolean(env.meshModelId.trim()),
        status: error.status,
        statusText: error.statusText,
        error: error.message,
        details: error.details,
      });
      return;
    }
    response.status(502).json({
      ok: false,
      provider: "mesh",
      configured: true,
      liveTest: false,
      error: "Mesh provider test failed",
    });
  }
});

aiRoutes.post("/case-intake-summary", requireActiveOnlineAccount, requireCurrentTermsConsent, rejectDuplicateRequest, quotaMiddleware, async (request, response) => {
  const caseText = typeof request.body?.caseText === "string" ? request.body.caseText.trim() : "";
  const language = request.body?.language;

  if (!caseText) {
    response.status(400).json({
      ok: false,
      error: "caseText is required",
    });
    return;
  }
  if (caseText.length > 20000) {
    response.status(400).json({ ok: false, error: "caseText must be 20,000 characters or fewer" });
    return;
  }

  if (env.aiProvider === "mesh") {
    response.status(501).json({
      ok: false,
      provider: "mesh",
      error: "Mesh provider is scaffolded but case intake is not implemented until the official Mesh API contract is added.",
    });
    return;
  }

  if (!isOpenRouterConfigured()) {
    response.json({
      ok: false,
      error: "OpenRouter is not configured",
    });
    return;
  }

  try {
    const summary = await summarizeCaseIntake(caseText, language);
    response.json({
      ok: true,
      summary,
      disclaimer: legalIntakeDisclaimer,
    });
  } catch (error) {
    if (error instanceof AiSafetyBlockError) {
      sendAiSafetyBlock(response, error);
      return;
    }

    const debugError =
      error instanceof OpenRouterApiError
        ? error
        : new OpenRouterApiError({ details: "Unexpected OpenRouter case intake summary failure" });

    response.status(502).json({
      ok: false,
      provider: "openrouter",
      model: debugError.model,
      status: debugError.status,
      statusText: debugError.statusText,
      error: "OpenRouter API request failed",
      details: debugError.details,
    });
  }
});

aiRoutes.post("/legal-chat", requireActiveOnlineAccount, requireCurrentTermsConsent, requireModelEntitlement, async (request, response) => {
  const requestId = String(response.locals.requestId);
  const parsedRequest = legalChatRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ ok: false, error: "INVALID_LEGAL_CHAT_REQUEST", message: "Send valid, bounded legal chat messages and settings.", requestId });
    return;
  }
  const requestFingerprint = usageRequestFingerprint(parsedRequest.data);
  const requestController = new AbortController();
  const requestDeadline = AbortSignal.timeout(env.aiRequestDeadlineMs);
  const requestSignal = AbortSignal.any([requestController.signal, requestDeadline]);
  let messages = parsedRequest.data.messages;
  const context = parsedRequest.data.context ?? {};
  // The backend session consent middleware is authoritative. This client flag
  // keeps the explicit warning visible in the current UI flow.
  if (context.termsAccepted !== true) {
    response.status(400).json({
      ok: false,
      error: "TERMS_CONSENT_REQUIRED",
      message: "Accept the Terms & Safety notice before sending a legal AI request.",
      requestId,
    });
    return;
  }

  const identity = getVerifiedUser(response);
  const requestStartedAt = Date.now();
  const activeRequestKey = activeLegalChatRequestKey(identity.email, requestId);
  try {
    const receipt = await readCompletedAiRequestReceipt(chatOwnerKey(identity), requestId);
    if (receipt) {
      if (receipt.requestFingerprint !== requestFingerprint) {
        sendRequestIdReuseMismatch(response, requestId);
        return;
      }
      response.json(receipt.payload);
      return;
    }
  } catch {
    console.warn("[AI Chat] completed-response recovery unavailable", { requestId, category: "ai_response_recovery_unavailable" });
  }
  const activeRequest = activeLegalChatRequests.get(activeRequestKey);
  if (activeRequest) {
    if (activeRequest.requestFingerprint !== requestFingerprint) {
      sendRequestIdReuseMismatch(response, requestId);
      return;
    }
    response.status(409).json({
      ok: false,
      error: "REQUEST_IN_PROGRESS",
      message: "This request is still processing. Legal Saathi is recovering the previous response; please wait briefly before retrying.",
      requestId,
    });
    return;
  }
  let serverContextSummary = context.contextSummary ?? "";
  if (context.chatId) {
    try {
      const storedChat = await getChatStore().get(chatOwnerKey(identity), context.chatId);
      const sameCase = storedChat && (storedChat.caseId ?? null) === (context.caseId ?? null);
      if (storedChat && sameCase) {
        messages = mergeRecentConversationMessages(storedChat.messages, messages, 12);
        serverContextSummary = formatConversationMemoryForPrompt(storedChat.memoryState);
      }
    } catch {
      console.warn("[AI Chat] durable conversation memory unavailable", { requestId, category: "chat_memory_unavailable" });
    }
  }
  let caseMemory = "";
  if (context.caseId) {
    try {
      caseMemory = formatCaseMemoryForPrompt(await getCaseWithMemory(context.caseId, identity.email, false));
    } catch {
      console.warn("[AI Chat] case memory unavailable", { requestId, category: "case_memory_unavailable" });
    }
  }
  const effectiveContext = {
    ...context,
    contextSummary: serverContextSummary,
    caseMemory: caseMemory || undefined,
  };
  const latestUserMessage = [...messages].reverse().find((message) => message?.role === "user")?.content ?? "";
  const requestConfiguration = context.requestConfiguration ?? { model: "auto", thinkingMode: "default", speed: "normal" };
  const requestedModelClass = String(requestConfiguration.model ?? "auto");
  const blockedCode = detectConfidentialGovernmentData(latestUserMessage)
    ? "CONFIDENTIAL_DATA_BLOCKED"
    : detectIllegalConductRequest(latestUserMessage)
      ? "ILLEGAL_CONDUCT_BLOCKED"
      : null;
  if (blockedCode) {
    sendAiSafetyBlock(response, new AiSafetyBlockError(blockedCode, safeBlockedReply(blockedCode)), {
      requestId,
      requestedModelClass,
      resolvedModelClass: null,
      webUsed: false,
      ragUsed: false,
    });
    return;
  }
  const planId = currentPlanIdFromState(response.locals.planState);
  const webStatus = getWebSearchStatus();
  const toolDecision = classifyLegalRequest(latestUserMessage, {
    hasPriorConversation: messages.length > 1,
    hasCaseContext: Boolean(context.caseId),
  });
  const responseLanguage = resolveLegalResponseLanguage(latestUserMessage, context.language);
  effectiveContext.language = responseLanguage;
  const productIdentityReply = isFounderQuestion(latestUserMessage)
    ? founderReply(responseLanguage, isFounderPersonalDetailRequest(latestUserMessage))
    : isLanguageSelectorRequest(latestUserMessage)
      ? languageSelectorReply(responseLanguage)
      : null;
  if (productIdentityReply) {
    response.status(200).json({
      ok: true,
      requestId,
      requestedModelClass,
      resolvedModelClass: requestedModelClass,
      webUsed: false,
      ragUsed: false,
      intent: "capability_question",
      agentState: "responding",
      provider: "product",
      reply: productIdentityReply,
      suggestedNextActions: [],
      canCreateCase: false,
      sources: [],
      model: { selected: requestedModelClass, resolved: requestedModelClass, thinking: requestConfiguration.thinkingMode, speed: requestConfiguration.speed },
      web: { requested: false, automatic: false, configured: getWebSearchStatus().configured, attempted: false, performed: false, succeeded: false, sources: [] },
      grounding: { status: "disabled", scope: "global", confidence: 0, citations: [] },
      disclaimer: legalIntakeDisclaimer,
    });
    return;
  }
  const agentPlan = buildLegalAgentPlan({ message: latestUserMessage, decision: toolDecision, context: effectiveContext });
  const rawManualWebRequested = context.webEnabled === true;
  const manualWebRequested = rawManualWebRequested && toolDecision.manualWebAllowed;
  const automaticWebRequested = !rawManualWebRequested
    && PRODUCT_PLANS[planId].allowsWeb
    && webStatus.configured
    && toolDecision.automaticWeb;
  const webEnabled = manualWebRequested || automaticWebRequested;
  const providerIndependentWeb = webEnabled && webStatus.provider === "tavily" && webStatus.configured;
  if (manualWebRequested && !PRODUCT_PLANS[planId].allowsWeb) {
    response.status(403).json({ ok: false, error: "WEB_PLAN_LOCKED", message: "Web search is not included in the active plan.", requestId });
    return;
  }
  if (manualWebRequested && !webStatus.configured) {
    response.status(503).json({ ok: false, error: "WEB_SEARCH_UNAVAILABLE", message: "Web search is not configured right now.", requestId });
    return;
  }

  if (!agentPlan.canProceed) {
    response.json({
      ok: true,
      requestId,
      requestedModelClass,
      resolvedModelClass: requestedModelClass,
      webUsed: false,
      ragUsed: false,
      intent: toolDecision.intent,
      agentState: agentPlan.state,
      agent: agentPlan,
      provider: "agent",
      reply: agentPlan.clarificationQuestions[0],
      suggestedNextActions: agentPlan.clarificationQuestions.slice(1),
      canCreateCase: false,
      sources: [],
      model: { selected: requestedModelClass, resolved: requestedModelClass, thinking: requestConfiguration.thinkingMode, speed: requestConfiguration.speed },
      web: { requested: false, automatic: false, configured: webStatus.configured, attempted: false, performed: false, succeeded: false, sources: [] },
      grounding: { status: "disabled", scope: "global", confidence: 0, citations: [] },
      disclaimer: legalIntakeDisclaimer,
    });
    return;
  }
  let chatQuotaAllowed = false;
  await quotaMiddleware(request, response, () => {
    chatQuotaAllowed = true;
  });
  if (!chatQuotaAllowed) return;
  if (!shouldUseMockProvider() && env.aiProvider !== "mesh" && !isOpenRouterConfigured() && !providerIndependentWeb) {
    response.status(503).json({
      ok: false,
      error: "AI_PROVIDER_NOT_CONFIGURED",
      message: "The selected AI provider is not configured.",
      requestId,
    });
    return;
  }
  const contextCharacters = Math.min(40_000,
    String(effectiveContext.documentText ?? "").length
      + String(effectiveContext.contextSummary ?? "").length
      + String(effectiveContext.caseMemory ?? "").length
      + (Array.isArray(effectiveContext.documents) ? effectiveContext.documents.reduce((total, item) => total + String(item.text ?? "").length, 0) : 0),
  );
  let reservationCreated = false;
  let resolvedModel: ResolvedModelRequest | null = null;
  let modelResolutionError: ModelRoutingError | null = null;
  let failureStage = "model_resolution";
  let ragUsed = false;
  let webUsed = false;
  let webSources: any[] = [];
  let webQuotaReservation: Extract<WebSearchQuotaReservation, { allowed: true }> | null = null;
  activeLegalChatRequests.set(activeRequestKey, { ownerEmail: identity.email.toLowerCase(), requestFingerprint, controller: requestController });
  response.once("close", () => {
    const disconnectAction = decideAiRequestDisconnectAction({
      responseFinished: response.writableFinished,
      receiptRecoveryEnabled: env.aiRequestReceiptEnabled,
    });
    if (disconnectAction === "abort") requestController.abort();
  });
  try {
    if (env.aiProvider === "openrouter" && env.openRouterApiKeys.length > 0) {
      await ensureOpenRouterModelCatalog();
    }
    try {
      resolvedModel = resolveModelRequest({
        selectedModel: requestConfiguration.model,
        thinkingMode: requestConfiguration.thinkingMode,
        speed: requestConfiguration.speed,
        planId,
        promptCharacters: latestUserMessage.length,
        contextCharacters,
        webEnabled,
      });
    } catch (error) {
      if (!(error instanceof ModelRoutingError) || error.code === "MODEL_PLAN_LOCKED" || !providerIndependentWeb) throw error;
      modelResolutionError = error;
    }
    const selectedModelForEstimate = (resolvedModel?.selectedClass ?? requestConfiguration.model) as ProductModelClass;
    const estimated = estimateRequestUnits({
      model: selectedModelForEstimate,
      thinkingMode: resolvedModel?.thinkingMode ?? requestConfiguration.thinkingMode,
      speed: resolvedModel?.speed ?? requestConfiguration.speed,
      webEnabled,
      contextCharacters,
    });
    if (webEnabled) {
      const quota = await reserveWebSearchQuota(request, response, { automatic: automaticWebRequested });
      if (!quota.allowed) {
        response.status(quota.status).json({
          ok: false,
          error: quota.error,
          message: quota.message,
          requestId,
          resetAt: quota.resetAt,
        });
        return;
      }
      webQuotaReservation = quota;
    }
    failureStage = "unit_reservation";
    const unitReservation = await reserveRequestUnits({
      email: identity.email,
      bootstrapTier: response.locals.userProfile?.tier ?? planId,
      estimatedUnits: modelResolutionError ? estimated.webUnits : estimated.totalUnits,
      metadata: {
        requestId,
        requestFingerprint,
        selectedModel: selectedModelForEstimate,
        resolvedModel: resolvedModel?.resolvedClass ?? selectedModelForEstimate,
        thinkingMode: resolvedModel?.thinkingMode ?? "default",
        speed: resolvedModel?.speed ?? "1x",
        webEnabled,
        contextUsed: contextCharacters > 0,
        contextCharacters,
      },
    });
    if (unitReservation.idempotent) {
      await webQuotaReservation?.settle(false);
      webQuotaReservation = null;
      activeLegalChatRequests.delete(activeRequestKey);
      try {
        const receipt = await readCompletedAiRequestReceipt(chatOwnerKey(identity), requestId);
        if (receipt) {
          if (receipt.requestFingerprint !== requestFingerprint) {
            sendRequestIdReuseMismatch(response, requestId);
            return;
          }
          response.json(receipt.payload);
          return;
        }
      } catch {
        console.warn("[AI Chat] completed-response recovery unavailable", { requestId, category: "ai_response_recovery_unavailable" });
      }
      response.status(409).json({
        ok: false,
        error: "REQUEST_ALREADY_PROCESSED",
        message: "This request reference was already processed. Start a fresh request if you intend to ask again.",
        requestId,
        requestedModelClass,
        resolvedModelClass: resolvedModel?.resolvedClass ?? "unavailable",
        webUsed: false,
        ragUsed: false,
      });
      return;
    }
    reservationCreated = true;
    failureStage = "rag_retrieval";
    const shouldRetrieve = resolvedModel !== null && (toolDecision.retrieveGlobalKnowledge
      || (toolDecision.retrieveCaseContext && Boolean(context.caseId))
      || (toolDecision.retrieveDocumentContext && Boolean(context.selectedDocumentId)));
    const ragContext: RagContext = shouldRetrieve
      ? await buildRagContextForQuery(latestUserMessage, {
          ownerEmail: identity.email,
          caseId: toolDecision.retrieveCaseContext || toolDecision.retrieveDocumentContext ? context.caseId : undefined,
          documentId: toolDecision.retrieveDocumentContext ? context.selectedDocumentId : undefined,
          language: responseLanguage,
        })
      : { enabled: false, scope: "global", results: [], grounding: { status: "disabled", scope: "global", citations: [], confidence: 0 } };
    ragUsed = ragContext.grounding.status === "grounded" && ragContext.grounding.citations.length > 0;
    failureStage = "web_search";
    const webResult = webEnabled
      ? await searchLegalWebWithStatus(latestUserMessage.slice(0, 800), resolvedModel ?? undefined)
      : { sources: [], attempted: false, performed: false, succeeded: false, chargeable: false, reason: undefined };
    webUsed = webResult.performed;
    webSources = webResult.sources;
    await webQuotaReservation?.settle(webResult.chargeable === true);
    webQuotaReservation = null;
    if (modelResolutionError) {
      if (!webResult.succeeded || !webResult.chargeable || webSources.length === 0) throw modelResolutionError;
      const finalized = await finalizeRequestUnits({ email: identity.email, requestId, actualUnits: estimated.webUnits });
      reservationCreated = false;
      activeLegalChatRequests.delete(activeRequestKey);
      response.status(200).json({
        ok: true,
        requestId,
        requestedModelClass,
        resolvedModelClass: "unavailable",
        webUsed: true,
        ragUsed: false,
        intent: toolDecision.intent,
        agentState: toolDecision.agentState,
        agent: agentPlan,
        provider: "fallback",
        reply: "Live sources were found, but AI synthesis is temporarily unavailable.",
        suggestedNextActions: [],
        canCreateCase: false,
        sources: webSources.map((source) => source.title),
        model: {
          selected: selectedModelForEstimate,
          resolved: "unavailable",
          thinking: "not_applied",
          speed: "not_applied",
        },
        units: {
          charged: estimated.webUnits,
          estimated: estimated.webUnits,
          remaining: finalized.account.includedUnitsRemaining + finalized.account.purchasedUnitsRemaining,
        },
        web: {
          requested: manualWebRequested,
          suppressedForIntent: rawManualWebRequested && !manualWebRequested,
          automatic: automaticWebRequested,
          configured: true,
          attempted: webResult.attempted,
          performed: webResult.performed,
          succeeded: webResult.succeeded,
          sources: webSources,
        },
        grounding: { status: "disabled", scope: "global", confidence: 0, citations: [] },
        disclaimer: legalIntakeDisclaimer,
      });
      return;
    }
    if (!resolvedModel) {
      throw new ModelRoutingError("MODEL_TEMPORARILY_UNAVAILABLE", "The selected model could not be resolved.");
    }
    if (toolDecision.intent === "current_legal_research" && !webResult.succeeded) {
      ragContext.grounding.warning = "Current-law freshness could not be verified with a live official source. Check the latest official material before relying on this answer.";
    }
    failureStage = "provider_request";
    const providerResult = await runApprovedLegalChat({
      messages,
      context: {
        ...effectiveContext,
        webSources,
        intent: toolDecision.intent,
        agentState: toolDecision.agentState,
      },
      resolvedModel,
      ragContext,
      signal: requestSignal,
    });
    if (providerResult.usedPaidFallback) {
      console.info("[AI Chat] paid fallback completed", {
        requestId,
        category: "ai_paid_fallback_completed",
        phase: "provider_request",
        latencyMs: Date.now() - requestStartedAt,
        provider: providerResult.provider,
        modelClass: providerResult.resolvedModelClass,
      });
    }
    const chat = providerResult.chat;
    const actual = estimateRequestUnits({
      model: resolvedModel.selectedClass,
      thinkingMode: resolvedModel.thinkingMode,
      speed: resolvedModel.speed,
      webEnabled: webResult.chargeable === true,
      contextCharacters,
    });
    failureStage = "unit_finalization";
    const finalized = await finalizeRequestUnits({ email: identity.email, requestId, actualUnits: actual.totalUnits });
    reservationCreated = false;
    activeLegalChatRequests.delete(activeRequestKey);
    const completedResponse = {
      ok: true,
      requestId,
      requestedModelClass,
      resolvedModelClass: providerResult.resolvedModelClass,
      webUsed,
      ragUsed,
      intent: toolDecision.intent,
      agentState: toolDecision.agentState,
      agent: agentPlan,
      provider: providerResult.provider,
      reply: chat.reply.trim(),
      suggestedNextActions: chat.suggestedNextActions,
      canCreateCase: chat.canCreateCase,
      sources: [
        ...("sources" in chat && Array.isArray(chat.sources) ? chat.sources : []),
        ...webSources.map((source) => source.title),
      ],
      model: {
        selected: resolvedModel.selectedClass,
        resolved: providerResult.resolvedModelClass,
        thinking: resolvedModel.thinkingMode,
        speed: resolvedModel.speed,
      },
      units: {
        charged: actual.totalUnits,
        estimated: estimated.totalUnits,
        remaining: finalized.account.includedUnitsRemaining + finalized.account.purchasedUnitsRemaining,
      },
      web: {
        requested: manualWebRequested,
        suppressedForIntent: rawManualWebRequested && !manualWebRequested,
        automatic: automaticWebRequested,
        configured: webStatus.configured,
        attempted: webResult.attempted,
        performed: webResult.performed,
        succeeded: webResult.succeeded,
        message: webEnabled && !webResult.succeeded
          ? webResult.reason === "timeout"
            ? "Live search took too long. Your request was not charged for the incomplete Web search."
            : webResult.reason === "not_configured"
              ? "Live web search is not configured on this environment."
              : webResult.reason === "no_reliable_result"
                ? "I could not find sufficiently reliable current official sources for this request."
                : "Live web search was unavailable. Your request continued without incomplete Web-search charges."
          : undefined,
        sources: webSources,
      },
      grounding: "grounding" in chat ? chat.grounding : ragContext.grounding,
      disclaimer: legalIntakeDisclaimer,
    };
    try {
      await saveCompletedAiRequestReceipt({
        ownerKey: chatOwnerKey(identity),
        requestId,
        requestFingerprint,
        payload: completedResponse,
      });
    } catch {
      console.warn("[AI Chat] completed-response recovery write unavailable", {
        requestId,
        category: "ai_response_recovery_write_unavailable",
      });
    }
    console.info("[AI Chat] response completed", {
      requestId,
      category: "ai_response_completed",
      phase: "finalized",
      latencyMs: Date.now() - requestStartedAt,
      provider: providerResult.provider,
      modelClass: providerResult.resolvedModelClass,
    });
    if (!response.destroyed && !response.headersSent) response.json(completedResponse);
  } catch (error) {
    activeLegalChatRequests.delete(activeRequestKey);
    await webQuotaReservation?.settle(false).catch(() => {
      console.warn("[Usage] Web quota refund failed", { requestId, category: "web_quota_refund_failure" });
    });
    if (requestController.signal.aborted) {
      if (reservationCreated) {
        await refundRequestUnits({ email: identity.email, requestId, outcome: "provider_failure" }).catch(() => undefined);
        reservationCreated = false;
      }
      if (!response.headersSent && !response.destroyed) {
        response.status(409).json({ ok: false, error: "REQUEST_CANCELLED", message: "Generation was stopped.", requestId });
      }
      return;
    }
    let sourceOnlySettlement: Awaited<ReturnType<typeof finalizeRequestUnits>> | null = null;
    let sourceOnlyChargedUnits = 0;
    if (reservationCreated && failureStage === "provider_request" && webSources.length > 0) {
      const webUnits = estimateRequestUnits({ model: resolvedModel?.selectedClass ?? "auto", webEnabled: true }).webUnits;
      sourceOnlySettlement = await finalizeRequestUnits({ email: identity.email, requestId, actualUnits: webUnits }).catch(() => null);
      sourceOnlyChargedUnits = sourceOnlySettlement ? webUnits : 0;
      reservationCreated = sourceOnlySettlement === null;
    }
    if (reservationCreated) {
      await refundRequestUnits({ email: identity.email, requestId, outcome: "provider_failure" }).catch(() => undefined);
      reservationCreated = false;
    }
    if (error instanceof ModelRoutingError) {
      response.status(error.code === "MODEL_PLAN_LOCKED" ? 403 : 503).json({ ok: false, error: error.code, message: error.message, requestId, requestedModelClass, resolvedModelClass: resolvedModel?.resolvedClass ?? null, webUsed, ragUsed });
      return;
    }
    if (error instanceof InsufficientUnitsError) {
      response.status(402).json({ ok: false, error: "INSUFFICIENT_UNITS", message: error.message, requestId, requestedModelClass, resolvedModelClass: resolvedModel?.resolvedClass ?? null, webUsed, ragUsed, requiredUnits: error.requiredUnits, availableUnits: error.availableUnits });
      return;
    }
    if (error instanceof CreditLedgerUnavailableError) {
      response.status(503).json({ ok: false, error: "UNIT_LEDGER_UNAVAILABLE", message: "Unit enforcement is temporarily unavailable.", requestId, requestedModelClass, resolvedModelClass: resolvedModel?.resolvedClass ?? null, webUsed, ragUsed });
      return;
    }
    if (error instanceof AiSafetyBlockError) {
      sendAiSafetyBlock(response, error, { requestId, requestedModelClass, resolvedModelClass: resolvedModel?.resolvedClass ?? null, webUsed, ragUsed });
      return;
    }
    if (error instanceof ProviderExecutionError) {
      const safeProviderMessage = error.code === "AI_PROVIDER_TIMEOUT"
        ? "The AI response took too long and ended safely. Please try again."
        : error.code === "AI_PROVIDER_RATE_LIMITED"
          ? "The AI service is busy. Please wait briefly before trying again."
          : error.code === "AI_PROVIDER_PAYMENT_REQUIRED"
            ? "The configured AI provider budget is unavailable for this request."
            : error.code === "AI_PROVIDER_UNAVAILABLE"
              ? "The selected AI model is temporarily unavailable. Please try again later."
              : "The AI service could not complete this request safely. Please try again.";
      console.warn("[AI Chat] approved providers could not complete request", {
        requestId,
        code: error.code,
        stage: failureStage,
        plan: planId,
        requestedModelClass,
        resolvedModelClass: resolvedModel?.resolvedClass ?? null,
        attemptedProviderCount: error.attemptedProviders.length,
        webUsed,
        ragUsed,
      });
      if (sourceOnlySettlement && webUsed && typeof webSources !== "undefined" && webSources.length > 0) {
        response.status(200).json({
          ok: true,
          requestId,
          requestedModelClass,
          resolvedModelClass: resolvedModel?.resolvedClass ?? "auto",
          webUsed,
          ragUsed,
          intent: toolDecision.intent,
          agentState: toolDecision.agentState,
          provider: "fallback",
          reply: "Live sources were found, but AI synthesis is temporarily unavailable.",
          suggestedNextActions: [],
          canCreateCase: false,
          sources: webSources.map((source) => source.title),
          model: {
            selected: resolvedModel?.selectedClass ?? "auto",
            resolved: resolvedModel?.resolvedClass ?? "auto",
            thinking: resolvedModel?.thinkingMode ?? "default",
            speed: resolvedModel?.speed ?? "normal",
          },
          units: {
            charged: sourceOnlyChargedUnits,
            estimated: sourceOnlyChargedUnits,
            remaining: sourceOnlySettlement.account.includedUnitsRemaining + sourceOnlySettlement.account.purchasedUnitsRemaining,
          },
          web: {
            requested: manualWebRequested,
            suppressedForIntent: rawManualWebRequested && !manualWebRequested,
            automatic: automaticWebRequested,
            configured: true,
            attempted: true,
            performed: true,
            succeeded: true,
            sources: webSources,
          },
          disclaimer: legalIntakeDisclaimer,
        });
        return;
      }
      response.status(error.status).json({
        ok: false,
        error: error.code,
        message: `${safeProviderMessage} Reference: ${requestId}`,
        requestId,
        requestedModelClass,
        resolvedModelClass: resolvedModel?.resolvedClass ?? null,
        webUsed,
        ragUsed,
        intent: String(toolDecision.intent),
        agentState: "failed_safely",
      });
      return;
    }

    const debugError =
      error instanceof MeshApiError
        ? error
        : error instanceof OpenRouterApiError
        ? error
        : new OpenRouterApiError({ details: "Unexpected OpenRouter legal chat failure" });
    const providerStatus = debugError.status;
    const providerErrorCode = providerStatus === 402
      ? "AI_PROVIDER_PAYMENT_REQUIRED"
      : providerStatus === 408 || providerStatus === 504
        ? "AI_PROVIDER_TIMEOUT"
        : providerStatus === 429
          ? "AI_PROVIDER_RATE_LIMITED"
          : providerStatus === 404 || (providerStatus !== undefined && providerStatus >= 500)
            ? "AI_PROVIDER_UNAVAILABLE"
            : "AI_PROVIDER_ERROR";
    const status = providerErrorCode === "AI_PROVIDER_PAYMENT_REQUIRED" ? 503
      : providerErrorCode === "AI_PROVIDER_RATE_LIMITED" ? 429
        : 502;
    console.warn("[AI Chat] request failed", {
      requestId,
      code: providerErrorCode,
      stage: failureStage,
      status: providerStatus ?? null,
      plan: planId,
      requestedModelClass,
      resolvedModelClass: resolvedModel?.resolvedClass ?? null,
      provider: error instanceof MeshApiError ? "mesh" : "openrouter",
          webUsed,
          ragUsed,
          intent: toolDecision.intent,
          agentState: toolDecision.agentState,
    });
    if (sourceOnlySettlement && webUsed && typeof webSources !== "undefined" && webSources.length > 0) {
      response.status(200).json({
        ok: true,
        requestId,
        requestedModelClass,
        resolvedModelClass: resolvedModel?.resolvedClass ?? "auto",
        webUsed,
        ragUsed,
        provider: "fallback",
        reply: "Live sources were found, but AI synthesis is temporarily unavailable.",
        suggestedNextActions: [],
        canCreateCase: false,
        sources: webSources.map((source) => source.title),
        model: {
          selected: resolvedModel?.selectedClass ?? "auto",
          resolved: resolvedModel?.resolvedClass ?? "auto",
          thinking: resolvedModel?.thinkingMode ?? "default",
          speed: resolvedModel?.speed ?? "normal",
        },
        units: {
          charged: sourceOnlyChargedUnits,
          estimated: sourceOnlyChargedUnits,
          remaining: sourceOnlySettlement.account.includedUnitsRemaining + sourceOnlySettlement.account.purchasedUnitsRemaining,
        },
        web: {
            requested: manualWebRequested,
            suppressedForIntent: rawManualWebRequested && !manualWebRequested,
          automatic: automaticWebRequested,
          configured: true,
          attempted: true,
          performed: true,
          succeeded: true,
          sources: webSources,
        },
        disclaimer: legalIntakeDisclaimer,
      });
      return;
    }
    response.status(status).json({
      ok: false,
      error: providerErrorCode,
      message: `Legal Saathi could not complete this request because the AI service is unavailable. Reference: ${requestId}`,
      requestId,
      requestedModelClass,
      resolvedModelClass: resolvedModel?.resolvedClass ?? null,
      webUsed,
      ragUsed,
    });
  }
});

aiRoutes.post("/legal-chat/:requestId/cancel", requireActiveOnlineAccount, requireCurrentTermsConsent, (request, response) => {
  const requestId = String(request.params.requestId ?? "");
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) {
    response.status(400).json({ ok: false, error: "INVALID_REQUEST_ID", message: "A valid request reference is required." });
    return;
  }
  const identity = getVerifiedUser(response);
  const active = activeLegalChatRequests.get(activeLegalChatRequestKey(identity.email, requestId));
  if (!active || active.ownerEmail !== identity.email.toLowerCase()) {
    response.status(404).json({ ok: false, error: "ACTIVE_REQUEST_NOT_FOUND", message: "That active request is no longer available." });
    return;
  }
  active.controller.abort();
  response.json({ ok: true, requestId, status: "cancelled" });
});
