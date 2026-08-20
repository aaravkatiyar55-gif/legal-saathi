import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { appCopy, type AppCopyKey } from "./appCopy";

const consentKeys = [
  "consent.closeReview",
  "consent.yourConsent",
  "consent.termsPrivacy",
  "consent.summary",
  "consent.hideDetails",
  "consent.viewMore",
  "consent.policyLoadFailure",
  "consent.loadingPolicy",
  "consent.versionEffective",
  "consent.versionSummary",
  "consent.acceptStatement",
  "consent.selectAcceptance",
  "consent.historyTitle",
  "consent.historyUnavailable",
  "consent.noHistory",
  "consent.currentAcceptance",
  "consent.previousAcceptance",
  "consent.close",
  "consent.saving",
  "consent.acceptContinue",
  "consent.refuseLogout",
  "consent.acceptanceRequired",
  "consent.policyNotReady",
  "consent.recordFailure",
  "consent.signOutFailure",
] as const satisfies readonly AppCopyKey[];

let assertions = 0;
for (const language of ["en", "hi", "hinglish"] as const) {
  for (const key of consentKeys) {
    assert.ok(appCopy(language, key).trim(), `${language} must provide ${key}`);
    assertions += 1;
  }
}

for (const language of ["hi", "hinglish"] as const) {
  for (const key of consentKeys) {
    assert.notEqual(appCopy(language, key), appCopy("en", key), `${language} consent UI must not silently fall back to English for ${key}`);
    assertions += 1;
  }
}

const consentModal = readFileSync(new URL("../../components/ConsentModal.tsx", import.meta.url), "utf8");
assert.match(consentModal, /useCallback/, "the locale copy helper must stay stable while an open consent modal is fetching policy data");
assertions += 1;
assert.match(consentModal, /data-no-i18n/, "backend-provided policy text must not be silently rewritten by the DOM translator");
assertions += 1;
assert.match(
  consentModal,
  /id="consent-description"[\s\S]*data-no-i18n=\{Boolean\(policy\?\.summary\)\}/,
  "a backend-provided policy summary must preserve its original legal wording instead of being silently rewritten by the DOM translator",
);
assertions += 1;
assert.match(consentModal, /formatAppCopy\(language, "consent\.versionSummary"/, "consent version labels must use typed interpolation");
assertions += 1;
assert.match(consentModal, /translateUiText\(safeInlineBackendMessage/, "safe backend consent messages must use the active UI language when a catalog translation exists");
assertions += 1;

console.info(`Consent modal localization: PASS ${assertions}/${assertions}`);
