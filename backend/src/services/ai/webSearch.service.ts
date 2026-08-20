import { isIP } from "node:net";
import { env } from "../../config/env";
import {
  AiSafetyBlockError,
  detectConfidentialGovernmentData,
  detectIllegalConductRequest,
  redactSensitiveText,
  safeBlockedReply,
} from "./aiSafety.service";
import {
  getOpenRouterConfiguredKeyCount,
  OpenRouterApiError,
  OpenRouterExecutionProfile,
  runOpenRouterLegalWebSearch,
} from "./openRouterProvider";

export type LegalWebSource = {
  title: string;
  url: string;
  excerpt: string;
  authority: string;
  retrievedAt: string;
};
export type LegalWebSearchResult = {
  sources: LegalWebSource[];
  attempted: boolean;
  performed: boolean;
  succeeded: boolean;
  chargeable: boolean;
  summary?: string;
  reason?: "not_configured" | "timeout" | "provider_unavailable" | "no_reliable_result";
};

export type LegalWebSourceOnlyFallback = {
  message: "Live sources were found, but AI synthesis is temporarily unavailable.";
  sources: LegalWebSource[];
  retrievedAt: string;
};

type WebSearchDependencies = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  openRouterSearchImpl?: typeof runOpenRouterLegalWebSearch;
};

type ProviderSource = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  excerpt?: unknown;
  score?: unknown;
};

const SOURCE_ONLY_FALLBACK_MESSAGE = "Live sources were found, but AI synthesis is temporarily unavailable." as const;
const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;
const MAX_RETURNED_SOURCES = 4;
const MAX_SOURCE_EXCERPT_CHARS = 220;
const DEFAULT_SEARCH_TIMEOUT_MS = 12_000;

export const OFFICIAL_INDIAN_LEGAL_DOMAINS = [
  "indiacode.nic.in",
  "legislative.gov.in",
  "sci.gov.in",
  "main.sci.gov.in",
  "ecourts.gov.in",
  "hcservices.ecourts.gov.in",
  "nalsa.gov.in",
  "doj.gov.in",
  "mha.gov.in",
  "cybercrime.gov.in",
  "consumerhelpline.gov.in",
  "ncdrc.nic.in",
  "rbi.org.in",
  "sebi.gov.in",
  "labour.gov.in",
  "epfindia.gov.in",
  "delhihighcourt.nic.in",
  "bombayhighcourt.nic.in",
  "allahabadhighcourt.in",
  "highcourtchd.gov.in",
  "ecommitteesci.gov.in",
  "gov.in",
  "nic.in",
] as const;

function hasValue(value: string) {
  return Boolean(value.trim()) && !value.includes("PASTE_") && value !== "replace_later";
}

export function getWebSearchStatus() {
  const provider = env.webSearchProvider;
  const configured =
    (provider === "tavily" && hasValue(env.tavilyApiKey)) ||
    (provider === "openrouter" && getOpenRouterConfiguredKeyCount() > 0 && [env.modelAutoId, env.modelFastId, env.modelFlashId, env.modelProId, env.modelUltraId].some(hasValue)) ||
    (provider === "serpapi" && hasValue(env.serpApiKey)) ||
    (provider === "brave" && hasValue(env.braveSearchApiKey));
  return { provider, configured };
}

function emptyResult(reason?: LegalWebSearchResult["reason"], attempted = false, performed = false): LegalWebSearchResult {
  return { sources: [], attempted, performed, succeeded: false, chargeable: false, reason };
}

export function prepareWebQuery(query: string) {
  if (detectConfidentialGovernmentData(query)) {
    throw new AiSafetyBlockError("CONFIDENTIAL_DATA_BLOCKED", safeBlockedReply("CONFIDENTIAL_DATA_BLOCKED"));
  }
  if (detectIllegalConductRequest(query)) {
    throw new AiSafetyBlockError("ILLEGAL_CONDUCT_BLOCKED", safeBlockedReply("ILLEGAL_CONDUCT_BLOCKED"));
  }
  const redacted = redactSensitiveText(query);
  if (Object.keys(redacted.counts).length > 0) {
    console.info("[Web search] query redacted", { categories: Object.keys(redacted.counts).sort(), count: Object.values(redacted.counts).reduce((sum, value) => sum + value, 0) });
  }
  const normalized = redacted.text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const topicRules: Array<[RegExp, string]> = [
    [/consumer|refund|defective|ncdrc|consumer commission/, "consumer complaint and Consumer Protection Act procedure"],
    [/cyber|online fraud|upi fraud|phishing|cybercrime/, "cybercrime complaint and online fraud reporting procedure"],
    [/rent|tenant|landlord|lease|rental/, "tenancy rent agreement and landlord tenant procedure"],
    [/fir|police complaint|criminal complaint/, "FIR and police complaint procedure"],
    [/bail|arrest|custody/, "bail arrest and criminal court procedure"],
    [/cheque|check bounce|section 138|negotiable instruments/, "cheque bounce and Negotiable Instruments Act procedure"],
    [/employment|salary|workplace|labour|termination/, "employment labour and workplace rights procedure"],
    [/domestic violence|marriage|divorce|maintenance|custody|family/, "family law domestic violence maintenance and custody procedure"],
    [/missing person|missing report/, "missing person report and police procedure"],
    [/property|land|registry|possession/, "property land registration and possession procedure"],
    [/company|sebi|share|investment/, "company securities and investor grievance procedure"],
  ];
  const topics = topicRules.filter(([pattern]) => pattern.test(normalized)).map(([, topic]) => topic).slice(0, 2);
  const freshness = /current|latest|recent|today|amend|deadline|portal|202[4-9]/.test(normalized)
    ? " current effective official guidance"
    : "";
  return `India ${topics.length > 0 ? topics.join(" and ") : "general legal information and procedure"}${freshness} official sources`.slice(0, 320);
}

function isOfficialDomain(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return OFFICIAL_INDIAN_LEGAL_DOMAINS.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

function safeSourceUrl(value: unknown) {
  try {
    const parsed = new URL(String(value ?? ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return "";
    if (isIP(hostname) === 4) {
      const octets = hostname.split(".").map(Number);
      const privateRange =
        octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
        (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) || octets[0] >= 224;
      if (privateRange) return "";
    }
    if (isIP(hostname) === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:") || hostname.startsWith("::ffff:"))) return "";
    if (!isOfficialDomain(hostname)) return "";
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString().slice(0, 1_000);
  } catch {
    return "";
  }
}

function sanitizeDisplayText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeSourceExcerpt(value: unknown) {
  const normalized = sanitizeDisplayText(value, 1_200)
    .replace(/\s*\|\s*/g, " · ")
    .replace(/(?:^|\s*·\s*)(?:short title|long title|hindi title|enactment date|type|ministry|department)\s*:\s*(?:·\s*)?/gi, " · ")
    .replace(/\s*·\s*\.\s*·\s*/g, " · ")
    .replace(/(?:\s*·\s*){2,}/g, " · ")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();
  if (normalized.length <= MAX_SOURCE_EXCERPT_CHARS) return normalized;
  const candidate = normalized.slice(0, MAX_SOURCE_EXCERPT_CHARS - 1);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary >= 140 ? boundary : candidate.length).trimEnd()}…`;
}

function getAuthority(url: string) {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "indiacode.nic.in" || hostname.endsWith(".indiacode.nic.in")) return "India Code";
  if (hostname === "legislative.gov.in" || hostname.endsWith(".legislative.gov.in")) return "Legislative Department";
  if (hostname === "sci.gov.in" || hostname === "main.sci.gov.in" || hostname.endsWith(".sci.gov.in")) return "Supreme Court of India";
  if (hostname.includes("highcourt") || hostname.endsWith(".ecourts.gov.in")) return "Indian Judiciary";
  if (hostname === "rbi.org.in" || hostname.endsWith(".rbi.org.in")) return "Reserve Bank of India";
  if (hostname === "sebi.gov.in" || hostname.endsWith(".sebi.gov.in")) return "Securities and Exchange Board of India";
  if (hostname.endsWith(".gov.in") || hostname === "gov.in") return "Government of India";
  if (hostname.endsWith(".nic.in") || hostname === "nic.in") return "Government authority";
  return hostname;
}

function officialTrustScore(url: string) {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "indiacode.nic.in" || hostname === "legislative.gov.in") return 500;
  if (
    hostname === "sci.gov.in"
    || hostname === "main.sci.gov.in"
    || hostname.includes("highcourt")
    || hostname.endsWith(".ecourts.gov.in")
  ) return 450;
  if (hostname === "doj.gov.in" || hostname === "nalsa.gov.in" || hostname.endsWith(".judiciary.gov.in")) return 400;
  if (["rbi.org.in", "sebi.gov.in", "ncdrc.nic.in"].includes(hostname)) return 350;
  if (hostname.endsWith(".gov.in") || hostname.endsWith(".nic.in")) return 300;
  return 250;
}

function canonicalSourceKey(url: string) {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  parsed.pathname = parsed.pathname.replace(/\/$/, "") || "/";
  if (parsed.hostname === "indiacode.nic.in" || parsed.hostname.endsWith(".indiacode.nic.in")) {
    if (/^\/handle\/[^/]+\/[^/]+$/i.test(parsed.pathname)) {
      parsed.search = "";
    } else {
      for (const key of [...parsed.searchParams.keys()]) {
        const normalizedKey = key.replace(/^amp;/i, "");
        if (/^(locale|view(?:_type)?|view_|sam_handle)$/i.test(normalizedKey)) parsed.searchParams.delete(key);
      }
    }
  }
  parsed.searchParams.sort();
  return `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
}

function normalizeProviderSources(items: ProviderSource[], retrievedAt: string): LegalWebSource[] {
  const seen = new Set<string>();
  return items
    .map((item, index) => {
      const url = safeSourceUrl(item.url);
      const title = sanitizeDisplayText(item.title, 200);
      const excerpt = sanitizeSourceExcerpt(item.content ?? item.excerpt);
      const providerScore = typeof item.score === "number" && Number.isFinite(item.score)
        ? Math.max(0, Math.min(1, item.score))
        : 0;
      return { url, title, excerpt, providerScore, index };
    })
    .filter((item) => item.url && item.title)
    .sort((left, right) => {
      const trustDifference = officialTrustScore(right.url) - officialTrustScore(left.url);
      if (trustDifference !== 0) return trustDifference;
      const providerDifference = right.providerScore - left.providerScore;
      return providerDifference !== 0 ? providerDifference : left.index - right.index;
    })
    .filter((item) => {
      const canonical = canonicalSourceKey(item.url);
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    })
    .slice(0, MAX_RETURNED_SOURCES)
    .map(({ url, title, excerpt }) => ({ title, url, excerpt, authority: getAuthority(url), retrievedAt }));
}

export function createLegalWebSourceOnlyFallback(result: LegalWebSearchResult): LegalWebSourceOnlyFallback | null {
  if (!result.succeeded || !result.chargeable || result.sources.length === 0) return null;
  return {
    message: SOURCE_ONLY_FALLBACK_MESSAGE,
    sources: result.sources,
    retrievedAt: result.sources[0].retrievedAt,
  };
}

function defaultOpenRouterProfile(): OpenRouterExecutionProfile | null {
  const slots: Array<{ id: string; resolvedClass: OpenRouterExecutionProfile["resolvedClass"] }> = [
    { id: env.modelFlashId, resolvedClass: "flash" },
    { id: env.modelAutoId, resolvedClass: "auto" },
    { id: env.modelFastId, resolvedClass: "fast" },
    { id: env.modelProId, resolvedClass: "pro" },
    { id: env.modelUltraId, resolvedClass: "ultra" },
  ];
  const selected = slots.find((slot) => hasValue(slot.id));
  return selected ? {
    providerModelId: selected.id,
    resolvedClass: selected.resolvedClass,
    thinkingMode: "default",
    speed: "1x",
    maxOutputTokens: 650,
  } : null;
}

export async function searchLegalWebWithStatus(
  query: string,
  executionProfile?: OpenRouterExecutionProfile,
  dependencies: WebSearchDependencies = {},
): Promise<LegalWebSearchResult> {
  const status = getWebSearchStatus();
  if (!status.configured) return emptyResult("not_configured");
  const safeQuery = prepareWebQuery(query);
  if (!safeQuery) return emptyResult();
  const retrievedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  if (status.provider === "openrouter") {
    const profile = executionProfile ?? defaultOpenRouterProfile();
    if (!profile) return emptyResult("not_configured");
    try {
      const openRouterSearch = dependencies.openRouterSearchImpl ?? runOpenRouterLegalWebSearch;
      const result = await openRouterSearch({
        query: safeQuery,
        allowedDomains: [...OFFICIAL_INDIAN_LEGAL_DOMAINS],
        executionProfile: profile,
      });
      const sources = normalizeProviderSources(result.citations, retrievedAt);
      const performed = result.webSearchRequests > 0;
      const succeeded = performed && sources.length > 0;
      return {
        sources,
        attempted: true,
        performed,
        succeeded,
        chargeable: succeeded,
        summary: result.summary,
        reason: performed && !succeeded ? "no_reliable_result" : undefined,
      };
    } catch (error) {
      const timeout = (error instanceof OpenRouterApiError && (error.status === 408 || error.status === 504))
        || (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"));
      return emptyResult(timeout ? "timeout" : "provider_unavailable", true);
    }
  }

  if (status.provider !== "tavily") return emptyResult("not_configured");
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.tavilyApiKey}` },
      body: JSON.stringify({
        query: safeQuery,
        topic: "general",
        search_depth: "basic",
        max_results: 8,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_domains: [...OFFICIAL_INDIAN_LEGAL_DOMAINS],
      }),
      signal: AbortSignal.timeout(dependencies.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    return emptyResult(timeout ? "timeout" : "provider_unavailable", true);
  }
  if (!response.ok) return emptyResult("provider_unavailable", true);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PROVIDER_RESPONSE_BYTES) return emptyResult("provider_unavailable", true);
  const responseText = await response.text();
  if (responseText.length > MAX_PROVIDER_RESPONSE_BYTES) return emptyResult("provider_unavailable", true);
  let payload: { results?: ProviderSource[] };
  try {
    payload = JSON.parse(responseText) as typeof payload;
  } catch {
    return emptyResult("provider_unavailable", true);
  }
  const sources = normalizeProviderSources(Array.isArray(payload.results) ? payload.results : [], retrievedAt);
  const succeeded = sources.length > 0;
  return {
    sources,
    attempted: true,
    performed: true,
    succeeded,
    chargeable: succeeded,
    reason: succeeded ? undefined : "no_reliable_result",
  };
}

export async function searchLegalWeb(query: string, executionProfile?: OpenRouterExecutionProfile): Promise<LegalWebSource[]> {
  return (await searchLegalWebWithStatus(query, executionProfile)).sources;
}
