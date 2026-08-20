import assert from "node:assert/strict";
import { env } from "../../config/env";
import { getOpenRouterModelAvailabilitySnapshot, refreshOpenRouterModelCatalog, setOpenRouterCatalogForTests } from "./openRouterCatalog.service";

async function main() {
  const original = {
    keys: [...env.openRouterApiKeys],
    freeOnly: env.openRouterFreeOnly,
    safeMode: env.aiSafeMode,
    auto: env.modelAutoId,
    fast: env.modelFastId,
    flash: env.modelFlashId,
    pro: env.modelProId,
    ultra: env.modelUltraId,
  };
  Object.assign(env, {
    openRouterApiKeys: ["synthetic"],
    openRouterFreeOnly: true,
    aiSafeMode: true,
    modelAutoId: "openrouter/free",
    modelFastId: "fixture/fast:free",
    modelFlashId: "fixture/paid",
    modelProId: "fixture/pro:free",
    modelUltraId: "",
  });
  try {
    setOpenRouterCatalogForTests([
      { id: "fixture/fast:free", zeroCost: true },
      { id: "fixture/paid", zeroCost: false },
      { id: "fixture/pro:free", zeroCost: true, supportsReasoning: true },
    ]);
    const availability = getOpenRouterModelAvailabilitySnapshot();
    assert.equal(availability.auto.state, "available");
    assert.equal(availability.fast.state, "available");
    assert.equal(availability.flash.state, "free_model_unavailable");
    assert.equal(availability.pro.state, "available");
    assert.equal(availability.pro.supportsReasoning, true);
    assert.equal(availability.ultra.state, "model_configuration_required");

    const catalogResponse = new Response(JSON.stringify({ data: [{
      id: "fixture/catalog:free",
      pricing: { prompt: "0", completion: "0", request: "0" },
      supported_parameters: ["max_tokens", "reasoning"],
    }] }), { status: 200, headers: { "content-type": "application/json" } });
    const zdrResponse = new Response(JSON.stringify({ data: [{ model_id: "fixture/catalog:free" }] }), { status: 200, headers: { "content-type": "application/json" } });
    const status = await refreshOpenRouterModelCatalog(async (url) => String(url).includes("endpoints/zdr") ? zdrResponse.clone() : catalogResponse.clone());
    assert.equal(status.ready, true);
    assert.equal(status.zeroCostModelCount, 1);

    const staleSafeStatus = await refreshOpenRouterModelCatalog(async () => new Response("unavailable", { status: 503 }));
    assert.equal(staleSafeStatus.ready, true);
    assert.equal(staleSafeStatus.zeroCostModelCount, 1);

    env.modelFastId = "fixture/non-zdr:free";
    setOpenRouterCatalogForTests([{ id: "fixture/non-zdr:free", zeroCost: true, supportsZdr: false }]);
    assert.equal(getOpenRouterModelAvailabilitySnapshot().fast.state, "free_model_unavailable");

    env.modelAutoId = "openrouter/free";
    setOpenRouterCatalogForTests([
      { id: "openrouter/free", zeroCost: true, supportsZdr: false },
      { id: "fixture/zdr-route:free", zeroCost: true, supportsZdr: true },
    ]);
    assert.equal(getOpenRouterModelAvailabilitySnapshot().auto.state, "available");
  } finally {
    Object.assign(env, {
      openRouterApiKeys: original.keys,
      openRouterFreeOnly: original.freeOnly,
      aiSafeMode: original.safeMode,
      modelAutoId: original.auto,
      modelFastId: original.fast,
      modelFlashId: original.flash,
      modelProId: original.pro,
      modelUltraId: original.ultra,
    });
  }
  console.log("OpenRouter zero-cost/ZDR catalog validation, free-router recovery, stale-safe recovery, and model availability states: PASS 12/12");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "OpenRouter catalog test failed");
  process.exitCode = 1;
});
