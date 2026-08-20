import assert from "node:assert/strict";
import { appCopy, appCopyKeys, appLanguageFromDocumentLanguage, appLanguageFromSearch, documentLanguageFor, formatAppCopy, publicLanguageHref, type AppCopyKey } from "./appCopy";
import { appLanguages } from "./types";

for (const language of appLanguages) {
  for (const key of appCopyKeys) {
    assert.ok(appCopy(language, key as AppCopyKey).trim(), `${language} must provide ${key}`);
  }
}

assert.equal(documentLanguageFor("en"), "en");
assert.equal(documentLanguageFor("hi"), "hi");
assert.equal(documentLanguageFor("hinglish"), "hi-Latn");
assert.equal(appLanguageFromDocumentLanguage("hi-Latn"), "hinglish", "a root error fallback must preserve Hinglish from its semantic document language");
assert.equal(appLanguageFromDocumentLanguage("hi"), "hi");
assert.equal(appLanguageFromDocumentLanguage("en"), "en");
assert.equal(appLanguageFromSearch("?lang=hinglish"), "hinglish");
assert.equal(appLanguageFromSearch("lang=hi"), "hi");
assert.equal(appLanguageFromSearch("?lang=unknown"), null, "unrecognized public locale values must be ignored");
assert.equal(publicLanguageHref("/terms", "hinglish"), "/terms?lang=hinglish");
assert.equal(publicLanguageHref("/terms?from=help#summary", "hi"), "/terms?from=help&lang=hi#summary");
assert.equal(formatAppCopy("hi", "chat.moveToTrashConfirm", { conversation: "Synthetic" }), "“Synthetic” को ट्रैश में भेजें?");
assert.equal(formatAppCopy("hinglish", "case.moveToTrashConfirm", { caseName: "Synthetic" }).includes("Synthetic"), true);
assert.equal(formatAppCopy("en", "chat.moveToTrashConfirm", {}).includes("{conversation}"), true, "unknown interpolation placeholders remain explicit");

const hinglishKeysThatMustNotFallBackToEnglish: AppCopyKey[] = [
  "sidebar.caseWorkspaces",
  "sidebar.active",
  "sidebar.archived",
  "sidebar.included",
  "sidebar.topUpUnits",
  "plan.free",
  "plan.current",
  "request.thinking",
  "request.speed",
  "request.estimatedCost",
];

const englishBaselineCopy: Readonly<Partial<Record<AppCopyKey, string>>> = {
  "sidebar.caseWorkspaces": "Case Workspaces",
  "sidebar.active": "Active",
  "sidebar.archived": "Archived",
  "sidebar.included": "included",
  "sidebar.topUpUnits": "top-up units",
  "plan.free": "Free",
  "plan.current": "Current plan: {planName}",
  "request.thinking": "Thinking",
  "request.speed": "Speed",
  "request.estimatedCost": "Estimated cost: {units} {unitLabel}.",
};

for (const [key, expected] of Object.entries(englishBaselineCopy) as Array<[AppCopyKey, string]>) {
  assert.equal(appCopy("en", key), expected, `English catalog must keep its original product wording for ${key}`);
}

for (const key of hinglishKeysThatMustNotFallBackToEnglish) {
  assert.notEqual(appCopy("hinglish", key), appCopy("en", key), `Hinglish public UI copy must not silently fall back to English for ${key}`);
}

// Hinglish naturally uses a small set of product, plan, and technical terms.
// Any other exact English fallback must be reviewed deliberately instead of
// appearing because a catalog entry was forgotten.
const intentionallySharedHinglishTerms: AppCopyKey[] = [
  "sidebar.units",
  "sidebar.settings",
  "request.default",
  "request.standard",
  "request.extended",
  "request.chat",
  "request.unit",
  "request.units",
];
const unexpectedHinglishEnglishFallbacks = appCopyKeys.filter((key) => {
  return appCopy("hinglish", key) === appCopy("en", key) && !intentionallySharedHinglishTerms.includes(key);
});
assert.deepEqual(unexpectedHinglishEnglishFallbacks, [], "Every non-shared Hinglish app-copy key must have an intentional localized value");

const assertionCount = appCopyKeys.length * appLanguages.length
  + 7
  + 5
  + Object.keys(englishBaselineCopy).length
  + hinglishKeysThatMustNotFallBackToEnglish.length;
console.info(`Typed app copy contract: PASS ${assertionCount}/${assertionCount}`);
