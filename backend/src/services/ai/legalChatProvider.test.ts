import assert from "node:assert/strict";
import { env } from "../../config/env";
import {
  legalAgentAnswerInstruction,
  guardUngroundedLegalClaims,
  legalSathiLanguageInstruction,
  OpenRouterApiError,
  shouldRequestProviderJsonMode,
  type LegalChatResponse,
} from "./openRouterProvider";
import { MeshApiError } from "./meshProvider";
import { ProviderExecutionError, runApprovedLegalChat } from "./legalChatProvider.service";
import {
  providerStatusSnapshot,
  publicProviderAvailability,
  recordProviderFailure,
  recordProviderSuccess,
  resetProviderHealthForTests,
} from "./providerHealth.service";
import type { ResolvedModelRequest } from "./modelRouting.service";
import type { RagContext } from "../rag/rag.service";

const success: LegalChatResponse = { reply: "ok", suggestedNextActions: [], canCreateCase: false };
const ragContext: RagContext = {
  enabled: false,
  scope: "global",
  results: [],
  grounding: { status: "disabled", scope: "global", confidence: 0, citations: [] },
};
const autoModel: ResolvedModelRequest = {
  selectedClass: "auto",
  resolvedClass: "fast",
  provider: "openrouter",
  providerModelId: "synthetic/fast",
  thinkingMode: "standard",
  speed: "1x",
  maxOutputTokens: 800,
  compatibilityFallback: false,
};
const baseInput = {
  messages: [{ role: "user" as const, content: "synthetic hello" }],
  context: { language: "en" },
  resolvedModel: autoModel,
  ragContext,
};

async function main() {
resetProviderHealthForTests();
let openRouterCalls = 0;
let meshCalls = 0;
await assert.rejects(
  runApprovedLegalChat(baseInput, {
  openrouter: async () => {
    openRouterCalls += 1;
    throw new OpenRouterApiError({ status: 402, statusText: "Payment Required", details: "synthetic" });
  },
  mesh: async () => {
    meshCalls += 1;
    return success;
  },
}, ["openrouter"], { useMockProvider: false }),
  (error: unknown) => error instanceof ProviderExecutionError && error.code === "AI_PROVIDER_PAYMENT_REQUIRED",
);
assert.equal(openRouterCalls, 1);
assert.equal(meshCalls, 0, "Auto requests must not silently send legal content to a second provider");

const paidFallbackModel = { ...autoModel, paidFallbackModelId: "synthetic/paid" };
const attemptedModelIds: string[] = [];
const paidFallback = await runApprovedLegalChat({ ...baseInput, resolvedModel: paidFallbackModel }, {
  openrouter: async ({ resolvedModel }) => {
    attemptedModelIds.push(resolvedModel.providerModelId);
    if (resolvedModel.providerModelId === autoModel.providerModelId) {
      throw new OpenRouterApiError({ status: 503, statusText: "Unavailable", details: "synthetic" });
    }
    return success;
  },
  mesh: async () => success,
}, ["openrouter"], { useMockProvider: false });
assert.equal(paidFallback.provider, "openrouter");
assert.equal(paidFallback.usedPaidFallback, true);
assert.deepEqual(attemptedModelIds, [autoModel.providerModelId, "synthetic/paid"]);

// Once the request-wide deadline has fired, a second provider attempt cannot
// complete within the caller's budget. It must not start a paid fallback.
const expiredDeadline = new AbortController();
const deadlineAttemptedModelIds: string[] = [];
await assert.rejects(
  runApprovedLegalChat({ ...baseInput, signal: expiredDeadline.signal, resolvedModel: paidFallbackModel }, {
    openrouter: async ({ resolvedModel }) => {
      deadlineAttemptedModelIds.push(resolvedModel.providerModelId);
      if (resolvedModel.providerModelId === autoModel.providerModelId) {
        expiredDeadline.abort();
        throw new DOMException("synthetic deadline", "TimeoutError");
      }
      return success;
    },
    mesh: async () => success,
  }, ["openrouter"], { useMockProvider: false }),
  (error: unknown) => error instanceof ProviderExecutionError && error.code === "AI_PROVIDER_TIMEOUT",
);
assert.deepEqual(deadlineAttemptedModelIds, [autoModel.providerModelId], "an expired request deadline must prevent paid fallback");

openRouterCalls = 0;
meshCalls = 0;
await assert.rejects(
  runApprovedLegalChat({ ...baseInput, resolvedModel: { ...autoModel, selectedClass: "fast" } }, {
    openrouter: async () => {
      openRouterCalls += 1;
      throw new OpenRouterApiError({ status: 503, statusText: "Unavailable", details: "synthetic" });
    },
    mesh: async () => {
      meshCalls += 1;
      return success;
    },
  }, ["openrouter", "mesh"], { useMockProvider: false }),
  ProviderExecutionError,
);
assert.equal(openRouterCalls, 1);
assert.equal(meshCalls, 0);

openRouterCalls = 0;
meshCalls = 0;
const pinnedExplicit = await runApprovedLegalChat({ ...baseInput, resolvedModel: { ...autoModel, selectedClass: "fast" } }, {
  openrouter: async () => {
    openRouterCalls += 1;
    return success;
  },
  mesh: async () => {
    meshCalls += 1;
    return success;
  },
}, ["mesh", "openrouter"], { useMockProvider: false });
assert.equal(pinnedExplicit.provider, "openrouter");
assert.equal(openRouterCalls, 1);
assert.equal(meshCalls, 0);

await assert.rejects(
  runApprovedLegalChat(baseInput, {
    openrouter: async () => { throw new OpenRouterApiError({ status: 402, statusText: "Payment Required", details: "synthetic" }); },
    mesh: async () => { throw new MeshApiError({ status: 402, statusText: "Payment Required", details: "synthetic" }); },
  }, ["openrouter", "mesh"], { useMockProvider: false }),
  (error: unknown) => error instanceof ProviderExecutionError && error.code === "AI_PROVIDER_PAYMENT_REQUIRED" && error.status === 503,
);

const paymentSnapshot = providerStatusSnapshot();
assert.equal(paymentSnapshot.find((item) => item.provider === "openrouter")?.availability, "payment_required");
assert.equal(paymentSnapshot.find((item) => item.provider === "mesh")?.availability, "payment_required");
assert.ok(paymentSnapshot.every((item) => !Object.prototype.hasOwnProperty.call(item, "details")));

await assert.rejects(
  runApprovedLegalChat(baseInput, {
    openrouter: async () => { throw new OpenRouterApiError({ status: 401, statusText: "Unauthorized", details: "synthetic" }); },
    mesh: async () => { throw new MeshApiError({ status: 401, statusText: "Unauthorized", details: "synthetic" }); },
  }, ["openrouter", "mesh"], { useMockProvider: false }),
  (error: unknown) => error instanceof ProviderExecutionError && error.code === "AI_PROVIDER_AUTHENTICATION_FAILED" && error.status === 503,
);

const authenticationSnapshot = providerStatusSnapshot();
assert.equal(authenticationSnapshot.find((item) => item.provider === "openrouter")?.availability, "unavailable");
assert.equal(authenticationSnapshot.find((item) => item.provider === "mesh")?.availability, "unavailable");
assert.ok(authenticationSnapshot.every((item) => !Object.prototype.hasOwnProperty.call(item, "details")));
assert.match(legalSathiLanguageInstruction("en"), /English/);
assert.match(legalSathiLanguageInstruction("hinglish"), /Hinglish.*Roman/);
assert.match(legalSathiLanguageInstruction("hi"), /Devanagari/);
assert.match(legalSathiLanguageInstruction("hinglish"), /official Act names/);
assert.match(legalSathiLanguageInstruction("hi"), /never invent a translated official title/);
const qualityInstruction = legalAgentAnswerInstruction();
assert.match(qualityInstruction, /Answer the user's actual question directly/);
assert.match(qualityInstruction, /practical next steps/);
assert.match(qualityInstruction, /complete user-facing answer/);
assert.match(qualityInstruction, /Silently check every material legal claim/);
assert.match(qualityInstruction, /exact sections, punishments, deadlines/);
assert.match(qualityInstruction, /verified instead of guessing/);
assert.match(qualityInstruction, /naturally and grammatically/);
const ungroundedAnswer = guardUngroundedLegalClaims(
  "POCSO protects children.\nThere is no strict time limit for a complaint.\nCollect the relevant facts.",
  "insufficient",
  "en",
);
assert.doesNotMatch(ungroundedAnswer, /no strict time limit/i);
assert.match(ungroundedAnswer, /official source/);
assert.match(ungroundedAnswer, /Collect the relevant facts/);
assert.match(
  guardUngroundedLegalClaims("Section 19 describes reporting.", "grounded", "en"),
  /Section 19/,
);
assert.doesNotMatch(
  guardUngroundedLegalClaims(
    "यह सामान्य परिचय है।\nशिकायत दर्ज करने के लिए कोई समय सीमा (limitation period) नहीं है।\nतथ्य सुरक्षित रखें।",
    "insufficient",
    "hi",
  ),
  /कोई समय सीमा/u,
);
const normalizedHindiOfficialName = guardUngroundedLegalClaims(
  "पॉक्सो अधिनियम का पूरा नाम 'बालों से सुरक्षा अधिनियम' (Protection of Children from Sexual Offences Act, 2012) है।",
  "insufficient",
  "hi",
);
assert.doesNotMatch(normalizedHindiOfficialName, /बालों से सुरक्षा/u);
assert.match(normalizedHindiOfficialName, /Protection of Children from Sexual Offences Act, 2012/u);
const originalFreeOnly = env.openRouterFreeOnly;
try {
  env.openRouterFreeOnly = true;
  assert.equal(shouldRequestProviderJsonMode({ ...autoModel, resolvedClass: "auto" }), false);
  assert.equal(shouldRequestProviderJsonMode({ ...autoModel, resolvedClass: "pro" }), true);
  env.openRouterFreeOnly = false;
  assert.equal(shouldRequestProviderJsonMode({ ...autoModel, resolvedClass: "auto" }), true);
} finally {
  env.openRouterFreeOnly = originalFreeOnly;
}

const originalProviderConfiguration = {
  aiProvider: env.aiProvider,
  aiProviderAllowlist: env.aiProviderAllowlist,
  openRouterApiKeys: env.openRouterApiKeys,
  modelAutoId: env.modelAutoId,
  openRouterModel: env.openRouterModel,
  meshApiKey: env.meshApiKey,
  meshApiBaseUrl: env.meshApiBaseUrl,
  meshModelId: env.meshModelId,
};
try {
  env.aiProvider = "openrouter";
  env.aiProviderAllowlist = "openrouter,mesh";
  env.openRouterApiKeys = ["synthetic-openrouter-key"];
  env.modelAutoId = "openrouter/free";
  env.openRouterModel = "openrouter/free";
  env.meshApiKey = "synthetic-mesh-key";
  env.meshApiBaseUrl = "https://mesh.example.invalid";
  env.meshModelId = "synthetic-mesh-model";
  resetProviderHealthForTests();
  recordProviderFailure("openrouter", 503);
  recordProviderSuccess("mesh");

  const openRouterPrimary = publicProviderAvailability();
  assert.equal(openRouterPrimary.auto, "unavailable", "availability must not advertise a secondary processor that legal chat will not use");
  assert.equal(openRouterPrimary.explicit, "unavailable");

  env.aiProvider = "mesh";
  const meshPrimary = publicProviderAvailability();
  assert.equal(meshPrimary.auto, "available", "availability should follow the configured primary processor");
  assert.equal(meshPrimary.explicit, "available");

  env.aiProvider = "openrouter";
  env.openRouterApiKeys = [];
  env.modelAutoId = "";
  env.openRouterModel = "";
  resetProviderHealthForTests();
  recordProviderSuccess("mesh");
  const unconfiguredPrimary = publicProviderAvailability();
  assert.equal(unconfiguredPrimary.auto, "unavailable", "auto availability must preserve its public API contract when the primary processor is not configured");
  assert.equal(unconfiguredPrimary.explicit, "not_configured");
} finally {
  env.aiProvider = originalProviderConfiguration.aiProvider;
  env.aiProviderAllowlist = originalProviderConfiguration.aiProviderAllowlist;
  env.openRouterApiKeys = originalProviderConfiguration.openRouterApiKeys;
  env.modelAutoId = originalProviderConfiguration.modelAutoId;
  env.openRouterModel = originalProviderConfiguration.openRouterModel;
  env.meshApiKey = originalProviderConfiguration.meshApiKey;
  env.meshApiBaseUrl = originalProviderConfiguration.meshApiBaseUrl;
  env.meshModelId = originalProviderConfiguration.meshModelId;
  resetProviderHealthForTests();
}

console.log("Approved same-provider fallback, explicit-model pinning, payment classification, safe health, and English/Hinglish/Hindi instructions: PASS");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provider orchestration test failed");
  process.exitCode = 1;
});
