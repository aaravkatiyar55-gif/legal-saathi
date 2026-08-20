import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatSettingsModalCopy, settingsModalCopy, settingsModalCopyKeys, type SettingsModalCopyKey } from "./settingsModalCopy";
import { appLanguages } from "./types";

for (const language of appLanguages) {
  for (const key of settingsModalCopyKeys) {
    assert.ok(settingsModalCopy(language, key as SettingsModalCopyKey).trim(), `${language} must provide ${key}`);
  }
}

for (const key of ["tab.profile", "title.settings", "action.close", "data.clearHistory", "legal.primaryJurisdiction"] as const) {
  assert.notEqual(settingsModalCopy("hi", key), settingsModalCopy("en", key), `Hindi must localize ${key}`);
  assert.notEqual(settingsModalCopy("hinglish", key), settingsModalCopy("en", key), `Hinglish must localize ${key}`);
}

assert.equal(formatSettingsModalCopy("hi", "usage.remainingWithTotal", { remaining: 7, total: 10 }), "7 / 10 शेष");
assert.equal(formatSettingsModalCopy("hinglish", "billing.currentPlan", { plan: "Synthetic" }), "Current plan: Synthetic");

const source = readFileSync(new URL("../../components/SettingsModal.tsx", import.meta.url), "utf8");
assert.match(source, /settingsModalCopy/);
assert.match(source, /copy\("tab\.profile"\)/);
assert.doesNotMatch(source, />Settings<|>Profile & Account<|>Privacy & Security<|>Clear Chat History</);

console.info(`Settings modal localized copy: PASS ${settingsModalCopyKeys.length * appLanguages.length + 11}/${settingsModalCopyKeys.length * appLanguages.length + 11}`);
