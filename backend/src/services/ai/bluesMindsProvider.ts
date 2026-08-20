import { env } from "../../config/env";
import { isProviderAllowedInSafeMode, prepareMessagesForExternalAi, safeBlockedReply } from "./aiSafety.service";

const testPrompt = "Reply only with: Legal Saathi AI connected";
const chatCompletionsEndpoint = "/chat/completions";

type BluesMindsApiErrorOptions = {
  status?: number;
  statusText?: string;
  details: string;
};

export class BluesMindsApiError extends Error {
  provider = "bluesminds";
  model = env.bluesMindsModel;
  baseUrl = env.bluesMindsBaseUrl;
  endpoint = chatCompletionsEndpoint;
  status?: number;
  statusText?: string;
  details: string;

  constructor(options: BluesMindsApiErrorOptions) {
    super("BluesMinds API request failed");
    this.status = options.status;
    this.statusText = options.statusText;
    this.details = options.details;
  }
}

function hasValue(value: string) {
  return Boolean(value.trim()) && value !== "replace_later";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSecrets(value: string) {
  let redacted = value;
  const apiKey = env.bluesMindsApiKey.trim();

  if (apiKey && apiKey !== "replace_later") {
    redacted = redacted.replace(new RegExp(escapeRegExp(apiKey), "g"), "[REDACTED]");
  }

  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /(api[_-]?key|token|authorization|secret)(["'\s:=]+)(["']?)[A-Za-z0-9._~+/=-]{8,}/gi,
      "$1$2$3[REDACTED]",
    )
    .replace(/\b[A-Za-z0-9._~+/=-]{40,}\b/g, "[REDACTED]");
}

function safeDetails(value: string) {
  return redactSecrets(value).slice(0, 500);
}

export function isBluesMindsConfigured() {
  return (
    hasValue(env.bluesMindsBaseUrl) &&
    hasValue(env.bluesMindsApiKey) &&
    hasValue(env.bluesMindsModel)
  );
}

export async function bluesMindsProvider(prompt: string, options: { trustedInternalPrompt?: boolean } = {}) {
  if (!isBluesMindsConfigured()) {
    throw new Error("BluesMinds is not configured");
  }
  if (!isProviderAllowedInSafeMode("bluesminds")) {
    throw new BluesMindsApiError({
      details: safeBlockedReply("PROVIDER_NOT_ALLOWED"),
    });
  }

  // Every external provider must receive sanitized messages in AI_SAFE_MODE.
  // The only bypass is this fixed internal connectivity prompt, which contains no user data.
  const outgoingPrompt =
    options.trustedInternalPrompt && prompt === testPrompt
      ? prompt
      : prepareMessagesForExternalAi([{ role: "user", content: prompt }], "bluesminds").messages[0]?.content ?? "";

  let response: Response;

  try {
    response = await fetch(`${env.bluesMindsBaseUrl.replace(/\/$/, "")}${chatCompletionsEndpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.bluesMindsApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.bluesMindsModel,
        messages: [{ role: "user", content: outgoingPrompt }],
        temperature: 0,
        max_tokens: 32,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new BluesMindsApiError({
      details: safeDetails(error instanceof Error ? error.message : "Network request failed"),
    });
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw new BluesMindsApiError({
      status: response.status,
      statusText: response.statusText,
      details: safeDetails(responseText || response.statusText),
    });
  }

  const data = JSON.parse(responseText || "{}") as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    reply?: string;
  };

  return {
    provider: "bluesminds",
    model: env.bluesMindsModel,
    answer: data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? data.reply ?? "",
  };
}

export async function testBluesMindsConnection() {
  return bluesMindsProvider(testPrompt, { trustedInternalPrompt: true });
}
