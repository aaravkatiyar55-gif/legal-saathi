import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appCopy, type AppCopyKey } from "./appCopy";
import { appLanguages } from "./types";

const conversationKeys = [
  "conversation.ariaLabel",
  "conversation.citationsAriaLabel",
  "conversation.copyAnswer",
  "conversation.regenerateAnswer",
  "conversation.editMessage",
] as const;

const progressKeys = [
  "progress.analyzingDocument",
  "progress.readingInput",
  "progress.identifyingLegalContext",
  "progress.preparingAiResponse",
  "progress.openingConversation",
] as const;

for (const language of appLanguages) {
  for (const key of [...conversationKeys, ...progressKeys]) {
    assert.ok(appCopy(language, key as AppCopyKey).trim(), `${language} must provide ${key}`);
  }
}

const analysisPage = readFileSync(resolve(process.cwd(), "components", "AnalysisPage.tsx"), "utf8");
const progressOverlay = readFileSync(resolve(process.cwd(), "components", "ProgressOverlay.tsx"), "utf8");
for (const key of conversationKeys) {
  assert.match(analysisPage, new RegExp(key.replace(".", "\\.")), `AnalysisPage must use typed copy for ${key}`);
}
for (const key of progressKeys.slice(1)) {
  assert.match(analysisPage, new RegExp(key.replace(".", "\\.")), `AnalysisPage must use typed copy for ${key}`);
}
assert.match(progressOverlay, /appCopy\(language, "progress\.analyzingDocument"\)/, "ProgressOverlay must localize its heading through typed copy");

const assertionCount = (conversationKeys.length + progressKeys.length) * appLanguages.length
  + conversationKeys.length
  + progressKeys.length
  + 1;
console.info(`Typed conversation and progress copy: PASS ${assertionCount}/${assertionCount}`);
