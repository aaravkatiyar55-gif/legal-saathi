import { env } from "./env";
import { isMeshConfigured } from "../services/ai/meshProvider";
import { isOpenRouterConfigured } from "../services/ai/openRouterProvider";
import { isSupabaseConfigured } from "../services/supabase/supabaseClient";

function configured(value: string) {
  const normalized = value.trim();
  return Boolean(normalized && !/^(?:PASTE_|CHANGE_ME|replace_later)/i.test(normalized));
}

function validProductionOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function selectedAiConfigured() {
  return env.aiProvider === "mesh" ? isMeshConfigured() : env.aiProvider === "openrouter" ? isOpenRouterConfigured() : false;
}

export function inspectEnvironment() {
  const fatal = new Set<string>();
  const warnings = new Set<string>();
  if (env.nodeEnv === "production") {
    if (!configured(env.googleClientId)) fatal.add("GOOGLE_CLIENT_ID");
    if (!configured(env.sessionSecret) || env.sessionSecret.trim().length < 32) fatal.add("SESSION_SECRET");
    if (!configured(env.supabaseUrl)) fatal.add("SUPABASE_URL");
    if (!configured(env.supabaseServiceRoleKey)) fatal.add("SUPABASE_SERVICE_ROLE_KEY");
    if (!configured(env.supabasePublishableKey)) fatal.add("SUPABASE_PUBLISHABLE_KEY");
    if (env.mockMode) fatal.add("MOCK_MODE");
    if (!env.aiSafeMode) fatal.add("AI_SAFE_MODE");
    if (!selectedAiConfigured()) {
      if (env.aiProvider === "mesh") {
        fatal.add("MESH_API_KEY");
        fatal.add("MESH_API_BASE_URL");
        fatal.add("MESH_MODEL_ID");
      } else {
        fatal.add("OPENROUTER_API_KEY");
        fatal.add("OPENROUTER_MODEL");
      }
    }
    const providerAllowlist = new Set(env.aiProviderAllowlist.split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
    if (!providerAllowlist.has(env.aiProvider)) fatal.add("AI_PROVIDER_ALLOWLIST");
    if (!process.env.ALLOWED_ORIGINS?.trim() || env.allowedOrigins.length === 0 || env.allowedOrigins.some(origin => !validProductionOrigin(origin))) fatal.add("ALLOWED_ORIGINS");
    if (env.allowInsecureDevAuth) fatal.add("ALLOW_INSECURE_DEV_AUTH");
    if (env.localCasesFallback) fatal.add("LOCAL_CASES_FALLBACK");
    if (env.localPaymentTestMode) fatal.add("LOCAL_PAYMENT_TEST_MODE");
    if (!configured(env.adminSessionSecret) || env.adminSessionSecret.trim().length < 32) fatal.add("ADMIN_SESSION_SECRET");

    if (env.sessionStoreBackend !== "supabase") fatal.add("SESSION_STORE_BACKEND");
    if (!isSupabaseConfigured()) {
      fatal.add("SUPABASE_URL");
      fatal.add("SUPABASE_SERVICE_ROLE_KEY");
    }
    if (env.productLedgerBackend !== "supabase") fatal.add("PRODUCT_LEDGER_BACKEND");
    if (env.documentStorageBackend !== "gcs") fatal.add("DOCUMENT_STORAGE_BACKEND");
    if (!configured(env.gcsDocumentBucket)) fatal.add("GCS_DOCUMENT_BUCKET");
    if (!env.documentMalwareScanEnabled) fatal.add("DOCUMENT_MALWARE_SCAN_ENABLED");
    if (env.incidentStoreBackend !== "supabase") fatal.add("INCIDENT_STORE_BACKEND");
    if (env.chatStoreBackend !== "supabase") fatal.add("CHAT_STORE_BACKEND");
    if (env.ragEnabled) {
      if (env.ragVectorBackend !== "supabase") fatal.add("RAG_VECTOR_BACKEND");
      if (env.embeddingsProvider !== "vertex") fatal.add("EMBEDDINGS_PROVIDER");
      if (!configured(env.vertexAiProjectId)) fatal.add("VERTEX_AI_PROJECT_ID");
      if (!configured(env.vertexAiLocation)) fatal.add("VERTEX_AI_LOCATION");
      if (env.embeddingsModel !== "gemini-embedding-001") fatal.add("VERTEX_EMBEDDING_MODEL");
      if (env.ragEmbeddingDimensions !== 768) fatal.add("RAG_EMBEDDING_DIMENSIONS");
    }
  }

  if (!configured(env.razorpayKeyId) || !configured(env.razorpayKeySecret)) warnings.add("RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET");
  if (env.webSearchProvider === "tavily" && !configured(env.tavilyApiKey)) warnings.add("TAVILY_API_KEY");
  if (!env.webSearchProvider) warnings.add("WEB_SEARCH_PROVIDER");
  return { fatal: [...fatal].sort(), warnings: [...warnings].sort() };
}

export class EnvironmentValidationError extends Error {
  constructor(public readonly names: string[]) {
    super("Production security configuration is incomplete");
  }
}

export function assertEnvironmentReady() {
  const result = inspectEnvironment();
  if (env.nodeEnv === "production" && result.fatal.length > 0) throw new EnvironmentValidationError(result.fatal);
  return result;
}
