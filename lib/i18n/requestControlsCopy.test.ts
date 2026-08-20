import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appCopy, formatAppCopy, type AppCopyKey } from "./appCopy";
import { appLanguages } from "./types";

const requestControlKeys = [
  "request.model",
  "request.thinking",
  "request.speed",
  "request.default",
  "request.standard",
  "request.extended",
  "request.selectModel",
  "request.selectThinking",
  "request.selectSpeed",
  "request.reasoningPlanRequirement",
  "request.chooseReasoningDepth",
  "request.lock.upgrade",
  "request.lock.freeUnavailable",
  "request.lock.providerTemporary",
  "request.lock.configuration",
  "request.lock.providerBalance",
  "request.lock.rateLimited",
  "request.lock.providerUnavailable",
  "request.chat",
  "request.quotaStatus",
  "request.estimatedCost",
  "request.unit",
  "request.units",
  "request.flashCost",
  "request.extendedThinkingCost",
  "request.speedCost",
  "request.webCost",
  "request.modelDescription.auto",
  "request.modelDescription.fast",
  "request.modelDescription.flash",
  "request.modelDescription.pro",
  "request.modelDescription.ultra",
] as const;

for (const language of appLanguages) {
  for (const key of requestControlKeys) {
    assert.ok(appCopy(language, key as AppCopyKey).trim(), `${language} must provide ${key}`);
  }
}

assert.match(
  formatAppCopy("hi", "request.estimatedCost" as AppCopyKey, { units: 2, unitLabel: appCopy("hi", "request.units" as AppCopyKey) }),
  /2/,
  "estimated-cost copy must retain the numeric unit count",
);
assert.match(
  formatAppCopy("hinglish", "request.quotaStatus" as AppCopyKey, { remaining: 3, limit: 10, label: "chat", resetTime: "10:30" }),
  /10:30/,
  "quota-status copy must retain the user-relevant reset time",
);

const requestControls = readFileSync(resolve(process.cwd(), "components", "RequestControls.tsx"), "utf8");
assert.match(requestControls, /request\.model/, "RequestControls must use typed copy for its visible model label");
assert.match(requestControls, /request\.estimatedCost/, "RequestControls must use typed interpolation for cost feedback");

console.info(`Typed request-control copy: PASS ${requestControlKeys.length * appLanguages.length + 4}/${requestControlKeys.length * appLanguages.length + 4}`);
