import dotenv from "dotenv";
import path from "path";
import { parseOpenRouterApiKeys } from "./openRouterKeys";

// Resolve backend/.env independently of the shell's current directory.
// Hosted environment variables still take precedence because override stays false.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function readBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function readPaidFallbackMonthlyCap(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 300 ? parsed : 0;
}

function readSupabasePlatformPlan(value: string | undefined): "unknown" | "free" | "pro" | "team" | "enterprise" {
  const normalized = value?.trim().toLowerCase();
  return normalized === "free"
    || normalized === "pro"
    || normalized === "team"
    || normalized === "enterprise"
    ? normalized
    : "unknown";
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const deploymentEnv = (process.env.DEPLOYMENT_ENV ?? (nodeEnv === "production" ? "production" : "development")).trim().toLowerCase();
const openRouterApiKeys = parseOpenRouterApiKeys(process.env);
const openRouterFreeOnly = readBoolean(process.env.OPENROUTER_FREE_ONLY, true);

const developmentOrigins = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
];

function readOrigins(value: string | undefined) {
  const configuredOrigins = value
    ? value.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...(nodeEnv === "production" ? [] : developmentOrigins), ...configuredOrigins]));
}

export const env = {
  nodeEnv,
  deploymentEnv,
  port: Number(process.env.PORT ?? 8000),
  mockMode: readBoolean(process.env.MOCK_MODE, nodeEnv !== "production"),
  allowedOrigins: readOrigins(process.env.ALLOWED_ORIGINS),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
  supabasePlatformPlan: readSupabasePlatformPlan(process.env.SUPABASE_PLATFORM_PLAN),
  supabasePlatformPlanVerified: readBoolean(process.env.SUPABASE_PLATFORM_PLAN_VERIFIED, false),
  supabaseCustomSmtpConfigured: readBoolean(process.env.SUPABASE_CUSTOM_SMTP_CONFIGURED, false),
  supabasePrivateDocumentBucket: process.env.SUPABASE_PRIVATE_DOCUMENT_BUCKET ?? "",
  supabaseRealtimeVerified: readBoolean(process.env.SUPABASE_REALTIME_VERIFIED, false),
  supabaseSessionControlsConfigured: readBoolean(process.env.SUPABASE_SESSION_CONTROLS_CONFIGURED, false),
  supabaseLogDrainConfigured: readBoolean(process.env.SUPABASE_LOG_DRAIN_CONFIGURED, false),
  supabasePitrConfigured: readBoolean(process.env.SUPABASE_PITR_CONFIGURED, false),
  supabaseRlsVerified: readBoolean(process.env.SUPABASE_RLS_VERIFIED, false),
  supabaseStoragePoliciesVerified: readBoolean(process.env.SUPABASE_STORAGE_POLICIES_VERIFIED, false),
  supabaseRestoreRunbookConfigured: readBoolean(process.env.SUPABASE_RESTORE_RUNBOOK_CONFIGURED, false),
  openRouterApiKeys,
  openRouterApiKey: openRouterApiKeys[0] ?? "",
  openRouterApiKey2: openRouterApiKeys[1] ?? "",
  openRouterApiKey3: openRouterApiKeys[2] ?? "",
  openRouterFreeOnly,
  openRouterModel: openRouterFreeOnly ? "openrouter/free" : process.env.OPENROUTER_MODEL ?? "",
  openRouterPaidFallbackEnabled: readBoolean(process.env.OPENROUTER_PAID_FALLBACK_ENABLED, false),
  openRouterPaidFallbackModel: process.env.OPENROUTER_PAID_FALLBACK_MODEL ?? "",
  // Source can only enforce the declared bound. The owner must separately
  // configure the same hard cap in the provider dashboard before enabling it.
  openRouterPaidFallbackMonthlyCapInr: readPaidFallbackMonthlyCap(process.env.OPENROUTER_PAID_FALLBACK_MONTHLY_CAP_INR),
  aiProviderAttemptTimeoutMs: readBoundedInteger(process.env.AI_PROVIDER_ATTEMPT_TIMEOUT_MS, 10_000, 3_000, 12_000),
  aiRequestDeadlineMs: readBoundedInteger(process.env.AI_REQUEST_DEADLINE_MS, 30_000, 15_000, 34_000),
  aiProviderKeyAttempts: readBoundedInteger(process.env.AI_PROVIDER_KEY_ATTEMPTS, 1, 1, 2),
  aiRequestReceiptEnabled: readBoolean(process.env.AI_REQUEST_RECEIPT_ENABLED, false),
  aiRequestReceiptBackend: (process.env.AI_REQUEST_RECEIPT_BACKEND ?? (nodeEnv === "production" ? "supabase" : "local")).trim().toLowerCase(),
  aiRequestReceiptPath: process.env.AI_REQUEST_RECEIPT_PATH ?? ".local/ai-request-receipts.json",
  aiRequestReceiptTtlSeconds: readBoundedInteger(process.env.AI_REQUEST_RECEIPT_TTL_SECONDS, 900, 60, 3_600),
  modelAutoId: openRouterFreeOnly ? "openrouter/free" : process.env.MODEL_AUTO_ID ?? "",
  modelFastId: process.env.MODEL_FAST_ID ?? "",
  modelFlashId: process.env.MODEL_FLASH_ID ?? "",
  modelProId: process.env.MODEL_PRO_ID ?? "",
  modelUltraId: process.env.MODEL_ULTRA_ID ?? "",
  reasoningModelClasses: (process.env.MODEL_REASONING_CLASSES ?? "pro,ultra").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
  aiProvider: (process.env.AI_PROVIDER ?? "openrouter").trim().toLowerCase(),
  meshApiKey: process.env.MESH_API_KEY ?? "",
  meshApiBaseUrl: process.env.MESH_API_BASE_URL ?? "",
  meshModelId: process.env.MESH_MODEL_ID ?? "",
  bluesMindsBaseUrl: process.env.BLUESMINDS_BASE_URL ?? "",
  bluesMindsApiKey: process.env.BLUESMINDS_API_KEY ?? "",
  bluesMindsModel: process.env.BLUESMINDS_MODEL ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  razorpayCurrency: process.env.RAZORPAY_CURRENCY ?? "INR",
  razorpayMode: (process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? "test" : process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "live" : "unknown") as "test" | "live" | "unknown",
  zenmuxBaseUrl: process.env.ZENMUX_BASE_URL ?? "https://zenmux.ai/api/v1",
  zenmuxApiKey: process.env.ZENMUX_API_KEY ?? "",
  zenmuxModel: process.env.ZENMUX_MODEL ?? "z-ai/glm-5.2-free",
  // SECURITY: ADMIN_PIN must be a strong secret set via environment variable only.
  // The value here is empty — if not set in env, admin routes are disabled.
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET ?? "",
  // The public Google Web Client ID can be supplied under either name. The
  // private client secret is deliberately not read or exposed by the browser flow.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  // Kept separate from admin credentials. This signs browser session cookies.
  sessionSecret: process.env.SESSION_SECRET ?? "",
  sessionStoreBackend: (process.env.SESSION_STORE_BACKEND ?? "local").trim().toLowerCase(),
  totpStoreBackend: (process.env.TOTP_STORE_BACKEND ?? "disabled").trim().toLowerCase(),
  totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY ?? "",
  allowInsecureDevAuth: readBoolean(process.env.ALLOW_INSECURE_DEV_AUTH, false),
  aiSafeMode: readBoolean(process.env.AI_SAFE_MODE, false),
  // Comma-separated backend-only provider allowlist for safe mode, for example: openrouter.
  // Production should use providers with no-training / zero-data-retention / enterprise privacy terms where possible.
  aiProviderAllowlist: process.env.AI_PROVIDER_ALLOWLIST ?? "",
  ragEnabled: readBoolean(process.env.RAG_ENABLED, true),
  ragVectorBackend: process.env.RAG_VECTOR_BACKEND ?? "local",
  ragTopK: Math.max(1, Math.min(20, Number(process.env.RAG_TOP_K ?? process.env.RAG_RETRIEVAL_TOP_K ?? 6) || 6)),
  ragRerankTopN: Math.max(1, Math.min(40, Number(process.env.RAG_RERANK_TOP_N ?? 12) || 12)),
  ragRelevanceThreshold: Math.max(0, Math.min(1, Number(process.env.RAG_RELEVANCE_THRESHOLD ?? 0.16) || 0.16)),
  ragContextCharacters: Math.max(2_000, Math.min(40_000, Number(process.env.RAG_CONTEXT_CHARACTERS ?? 12_000) || 12_000)),
  ragMaxChunksPerSource: Math.max(1, Math.min(5, Number(process.env.RAG_MAX_CHUNKS_PER_SOURCE ?? 2) || 2)),
  ragLocalStorePath: process.env.RAG_LOCAL_STORE_PATH ?? ".rag/local-vector-store.json",
  ragGlobalStorePath: process.env.RAG_GLOBAL_STORE_PATH ?? process.env.RAG_LOCAL_STORE_PATH ?? ".rag/global-index.json",
  ragPrivateStorePath: process.env.RAG_PRIVATE_STORE_PATH ?? ".rag/private-index.json",
  embeddingsProvider: process.env.EMBEDDINGS_PROVIDER ?? "mock",
  embeddingsModel: process.env.EMBEDDINGS_MODEL ?? process.env.VERTEX_EMBEDDING_MODEL ?? "gemini-embedding-001",
  ragEmbeddingDimensions: Math.max(128, Math.min(3_072, Number(process.env.RAG_EMBEDDING_DIMENSIONS ?? 768) || 768)),
  vertexAiProjectId: process.env.VERTEX_AI_PROJECT_ID ?? "",
  vertexAiLocation: process.env.VERTEX_AI_LOCATION ?? "us-central1",
  webSearchProvider: (process.env.WEB_SEARCH_PROVIDER ?? "").trim().toLowerCase(),
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  serpApiKey: process.env.SERPAPI_API_KEY ?? "",
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY ?? "",
  localCasesFallback: nodeEnv !== "production" && readBoolean(process.env.LOCAL_CASES_FALLBACK, true),
  localPaymentTestMode: nodeEnv !== "production" && readBoolean(process.env.LOCAL_PAYMENT_TEST_MODE, true),
  productLedgerBackend: (process.env.PRODUCT_LEDGER_BACKEND ?? (nodeEnv === "production" ? "supabase" : "local")).trim().toLowerCase(),
  productLedgerPath: process.env.PRODUCT_LEDGER_PATH ?? ".local/product-ledger.json",
  topUpTestMode: readBoolean(process.env.TOPUP_TEST_MODE, false),
  topUpCommercialApproved: readBoolean(process.env.TOPUP_COMMERCIAL_APPROVED, false),
  documentStorageBackend: (process.env.DOCUMENT_STORAGE_BACKEND ?? "local").trim().toLowerCase(),
  documentStorageDir: process.env.DOCUMENT_STORAGE_DIR ?? ".local/documents",
  gcsDocumentBucket: process.env.GCS_DOCUMENT_BUCKET ?? "",
  documentMalwareScanEnabled: readBoolean(process.env.DOCUMENT_MALWARE_SCAN_ENABLED, false),
  incidentStoreBackend: (process.env.INCIDENT_STORE_BACKEND ?? (nodeEnv === "production" ? "supabase" : "local")).trim().toLowerCase(),
  incidentStorePath: process.env.INCIDENT_STORE_PATH ?? ".local/incidents.json",
  chatStoreBackend: (process.env.CHAT_STORE_BACKEND ?? (nodeEnv === "production" ? "supabase" : "local")).trim().toLowerCase(),
  chatStorePath: process.env.CHAT_STORE_PATH ?? ".local/chats.json",
  documentRetentionDays: Math.max(1, Math.min(365, Number(process.env.DOCUMENT_RETENTION_DAYS ?? 30) || 30)),
  ocrLanguagePath: process.env.LEGAL_SATHI_OCR_LANG_PATH ?? "",
  ocrLanguage: process.env.LEGAL_SATHI_OCR_LANGUAGE ?? "eng",
};

export function shouldUseMockProvider() {
  // Mock responses must be an explicit operator choice. Missing credentials
  // produce a setup-required error instead of silently pretending AI worked.
  return env.mockMode;
}
