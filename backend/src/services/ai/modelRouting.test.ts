import { strict as assert } from "node:assert";
import { env } from "../../config/env";
import { buildOpenRouterRequestBody } from "./openRouterProvider";
import { configuredPublicModelClasses, ModelRoutingError, resolveModelRequest } from "./modelRouting.service";
import { setOpenRouterCatalogForTests } from "./openRouterCatalog.service";

function main() {
  assert.ok(env.aiProviderAttemptTimeoutMs >= 3_000 && env.aiProviderAttemptTimeoutMs <= 12_000);
  assert.ok(env.aiRequestDeadlineMs >= 15_000 && env.aiRequestDeadlineMs <= 34_000);
  assert.ok(env.aiRequestDeadlineMs < 38_000, "backend deadline must remain below the BFF proxy deadline");
  const original = {
    aiProvider: env.aiProvider,
    nodeEnv: env.nodeEnv,
    mockMode: env.mockMode,
    openRouterApiKeys: [...env.openRouterApiKeys],
    openRouterFreeOnly: env.openRouterFreeOnly,
    aiSafeMode: env.aiSafeMode,
    modelAutoId: env.modelAutoId,
    modelFastId: env.modelFastId,
    modelFlashId: env.modelFlashId,
    modelProId: env.modelProId,
    modelUltraId: env.modelUltraId,
    openRouterPaidFallbackEnabled: env.openRouterPaidFallbackEnabled,
    openRouterPaidFallbackModel: env.openRouterPaidFallbackModel,
    openRouterPaidFallbackMonthlyCapInr: env.openRouterPaidFallbackMonthlyCapInr,
    reasoningModelClasses: [...env.reasoningModelClasses],
  };
  Object.assign(env, {
    aiProvider: "openrouter",
    nodeEnv: "development",
    mockMode: false,
    openRouterApiKeys: ["synthetic"],
    openRouterFreeOnly: false,
    modelAutoId: "",
    modelFastId: "test/fast",
    modelFlashId: "test/flash",
    modelProId: "test/pro",
    modelUltraId: "test/ultra",
    openRouterPaidFallbackEnabled: true,
    openRouterPaidFallbackModel: "test/paid-fallback",
    openRouterPaidFallbackMonthlyCapInr: 300,
    reasoningModelClasses: ["pro", "ultra"],
  });
  setOpenRouterCatalogForTests([
    { id: "test/fast", zeroCost: true },
    { id: "test/flash", zeroCost: true },
    { id: "test/pro", zeroCost: true, supportsReasoning: true },
    { id: "test/ultra", zeroCost: true, supportsReasoning: true },
    { id: "test/paid-fallback", zeroCost: false, supportsZdr: true },
  ]);
  try {
    const simple = resolveModelRequest({ selectedModel: "auto", planId: "free", promptCharacters: 50, contextCharacters: 0, webEnabled: false });
    assert.equal(simple.resolvedClass, "fast");
    assert.equal(simple.providerModelId, "test/fast");
    assert.equal(simple.paidFallbackModelId, "test/paid-fallback");
    env.openRouterPaidFallbackMonthlyCapInr = 0;
    assert.equal(
      resolveModelRequest({ selectedModel: "auto", planId: "free", promptCharacters: 50, contextCharacters: 0, webEnabled: false }).paidFallbackModelId,
      undefined,
      "paid fallback stays disabled without an explicit bounded monthly cap",
    );
    env.openRouterPaidFallbackMonthlyCapInr = 300;
    const contextHeavy = resolveModelRequest({ selectedModel: "auto", planId: "plus", promptCharacters: 1_000, contextCharacters: 12_000, webEnabled: false, speed: "2x" });
    assert.equal(contextHeavy.resolvedClass, "pro");
    assert.equal(contextHeavy.thinkingMode, "default");
    assert.equal(contextHeavy.speed, "2x");
    const explicit = resolveModelRequest({ selectedModel: "pro", planId: "plus", promptCharacters: 20, contextCharacters: 0, webEnabled: false, thinkingMode: "extended", speed: "1.5x" });
    assert.equal(explicit.thinkingMode, "extended");
    const body = buildOpenRouterRequestBody({
      modelId: explicit.providerModelId,
      messages: [{ role: "user", content: "Synthetic contract test" }],
      maxTokens: 2_000,
      executionProfile: explicit,
    }) as Record<string, unknown>;
    assert.equal(body.model, "test/pro");
    assert.equal((body.provider as { sort?: string }).sort, "throughput");
    assert.equal((body.reasoning as { effort?: string }).effort, "high");
    assert.equal(body.max_tokens, explicit.maxOutputTokens);
    assert.equal((body.reasoning as { effort?: string }).effort, "high");

    const standardPro = resolveModelRequest({ selectedModel: "pro", planId: "pro", promptCharacters: 20, contextCharacters: 0, webEnabled: false, thinkingMode: "standard", speed: "1x" });
    const standardProBody = buildOpenRouterRequestBody({ modelId: standardPro.providerModelId, messages: [{ role: "user", content: "Synthetic standard reasoning test" }], maxTokens: 2_000, executionProfile: standardPro }) as Record<string, unknown>;
    assert.equal((standardProBody.reasoning as { effort?: string }).effort, "medium");

    const defaultPro = resolveModelRequest({ selectedModel: "pro", planId: "pro", promptCharacters: 20, contextCharacters: 0, webEnabled: false, thinkingMode: "default", speed: "1x" });
    const defaultProBody = buildOpenRouterRequestBody({ modelId: defaultPro.providerModelId, messages: [{ role: "user", content: "Synthetic provider-default test" }], maxTokens: 2_000, executionProfile: defaultPro }) as Record<string, unknown>;
    assert.equal("reasoning" in defaultProBody, false);

    const ultra = resolveModelRequest({ selectedModel: "ultra", planId: "pro", promptCharacters: 20, contextCharacters: 0, webEnabled: false, thinkingMode: "extended", speed: "2x" });
    const ultraBody = buildOpenRouterRequestBody({ modelId: ultra.providerModelId, messages: [{ role: "user", content: "Synthetic ultra reasoning test" }], maxTokens: 3_000, executionProfile: ultra }) as Record<string, unknown>;
    assert.equal(ultraBody.model, "test/ultra");
    assert.equal((ultraBody.reasoning as { effort?: string }).effort, "xhigh");
    assert.equal((ultraBody.provider as { sort?: string }).sort, "throughput");
    assert.notEqual(ultraBody.max_tokens, standardProBody.max_tokens);

    const webProfiles = [
      resolveModelRequest({ selectedModel: "auto", planId: "plus", promptCharacters: 20, contextCharacters: 0, webEnabled: true }),
      resolveModelRequest({ selectedModel: "fast", planId: "free", promptCharacters: 20, contextCharacters: 0, webEnabled: false }),
      resolveModelRequest({ selectedModel: "flash", planId: "free", promptCharacters: 20, contextCharacters: 0, webEnabled: false }),
      standardPro,
      ultra,
    ];
    for (const profile of webProfiles) {
      const webBody = buildOpenRouterRequestBody({
        modelId: profile.providerModelId,
        messages: [{ role: "user", content: "Synthetic official-source search" }],
        maxTokens: 800,
        executionProfile: profile,
        webSearch: { allowedDomains: ["indiacode.nic.in"], maxResults: 3, maxCharacters: 800 },
      }) as { tools?: Array<{ type?: string; parameters?: { allowed_domains?: string[] } }> };
      assert.equal(webBody.tools?.[0]?.type, "openrouter:web_search");
      assert.deepEqual(webBody.tools?.[0]?.parameters?.allowed_domains, ["indiacode.nic.in"]);
    }

    assert.throws(
      () => resolveModelRequest({ selectedModel: "ultra", planId: "plus", promptCharacters: 20, contextCharacters: 0, webEnabled: false }),
      (error: unknown) => error instanceof ModelRoutingError && error.code === "MODEL_PLAN_LOCKED",
    );
    assert.throws(
      () => resolveModelRequest({ selectedModel: "ultra", planId: "plus", promptCharacters: 20, contextCharacters: 0, webEnabled: false }),
      (error: unknown) => error instanceof ModelRoutingError && error.code === "MODEL_PLAN_LOCKED",
    );
    env.modelProId = "";
    assert.throws(
      () => resolveModelRequest({ selectedModel: "pro", planId: "pro", promptCharacters: 20, contextCharacters: 0, webEnabled: false }),
      (error: unknown) => error instanceof ModelRoutingError && error.code === "MODEL_NOT_CONFIGURED",
    );

    Object.assign(env, {
      openRouterFreeOnly: true,
      modelAutoId: "openrouter/free",
    });
    setOpenRouterCatalogForTests([
      { id: "fixture/transient-free-model:free", zeroCost: true },
    ]);
    const freeRouterAuto = resolveModelRequest({
      selectedModel: "auto",
      planId: "pro",
      promptCharacters: 20,
      contextCharacters: 0,
      webEnabled: false,
    });
    assert.equal(freeRouterAuto.providerModelId, "fixture/transient-free-model:free");
    assert.equal(freeRouterAuto.resolvedClass, "auto");
    assert.equal(freeRouterAuto.compatibilityFallback, true);

    Object.assign(env, {
      aiSafeMode: true,
      modelFastId: "",
      modelFlashId: "",
      modelProId: "",
      modelUltraId: "",
    });
    setOpenRouterCatalogForTests([
      { id: "fixture/privacy-eligible-free:free", contextLength: 262_144, zeroCost: true, supportsReasoning: true, supportsTools: true, supportsZdr: true },
      { id: "fixture/not-zdr:free", contextLength: 1_000_000, zeroCost: true, supportsReasoning: true, supportsTools: true, supportsZdr: false },
    ]);
    assert.deepEqual(configuredPublicModelClasses(), ["auto"]);
    for (const selectedModel of ["fast", "flash", "pro", "ultra"] as const) {
      assert.throws(
        () => resolveModelRequest({
          selectedModel,
          planId: selectedModel === "ultra" ? "pro" : selectedModel === "pro" ? "plus" : "free",
          promptCharacters: 40,
          contextCharacters: 0,
          webEnabled: false,
        }),
        (error: unknown) => error instanceof ModelRoutingError && error.code === "MODEL_NOT_CONFIGURED",
      );
    }
  } finally {
    Object.assign(env, original);
  }
  console.log("Model entitlement, routing, reasoning, and speed capture: PASS");
}

main();
