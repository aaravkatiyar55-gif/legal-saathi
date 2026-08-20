import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { canRefreshAiRequestStatus, getAiRequestAvailability, getAiSubmitAction } from "./aiRequestAvailability";
import { translateUiText } from "./i18n";

assert.equal(
  getAiRequestAvailability({ auto: "rate_limited", explicit: "available" }, "auto").available,
  false,
  "an explicitly rate-limited Auto provider must not receive a new request",
);
assert.equal(
  getAiRequestAvailability({ auto: "available", explicit: "payment_required" }, "pro").available,
  false,
  "an explicit model with no provider budget must not receive a new request",
);
assert.equal(
  getAiRequestAvailability({ auto: "available", explicit: "unavailable" }, "fast").available,
  false,
  "an explicitly unavailable provider must fail before the user loses another attempt",
);
assert.equal(
  getAiRequestAvailability({ auto: "unknown", explicit: "unknown" }, "auto").available,
  false,
  "an unconfirmed loading state must not send a legal request before the provider check completes",
);
assert.equal(
  getAiRequestAvailability(undefined, "auto").available,
  false,
  "the first render before plan status arrives must remain fail-closed",
);
assert.equal(
  getAiRequestAvailability({ auto: "unknown", explicit: "unknown" }, "auto").state,
  "checking",
  "an unconfirmed provider state must distinguish checking from a real outage",
);

assert.equal(
  canRefreshAiRequestStatus({
    availability: getAiRequestAvailability({ auto: "unknown", explicit: "unknown" }, "auto"),
    planStateError: "",
    planStateLoading: false,
  }),
  true,
  "a provider state that remains unknown after loading must offer a safe manual refresh",
);
assert.equal(
  canRefreshAiRequestStatus({
    availability: getAiRequestAvailability({ auto: "unknown", explicit: "unknown" }, "auto"),
    planStateError: "",
    planStateLoading: true,
  }),
  false,
  "a refresh control must stay hidden while the current status request is still loading",
);
assert.equal(
  canRefreshAiRequestStatus({
    availability: getAiRequestAvailability({ auto: "available", explicit: "available" }, "auto"),
    planStateError: "Plan state could not be refreshed.",
    planStateLoading: false,
  }),
  true,
  "a failed plan-state refresh must offer a retry even when the last provider state was available",
);
assert.equal(
  canRefreshAiRequestStatus({
    availability: getAiRequestAvailability({ auto: "unavailable", explicit: "available" }, "auto"),
    planStateError: "",
    planStateLoading: false,
  }),
  false,
  "a confirmed provider outage must retain its bounded wait guidance instead of encouraging rapid retries",
);

assert.equal(
  getAiSubmitAction(false),
  "sign_in",
  "a guest may draft a question, but the visible action must describe the required secure sign-in step",
);
assert.equal(
  getAiSubmitAction(true),
  "send",
  "an authenticated user must retain the normal send action once provider availability is known",
);

for (const language of ["hi", "hinglish"] as const) {
  for (const message of [
    getAiRequestAvailability({ auto: "rate_limited", explicit: "available" }, "auto").message,
    getAiRequestAvailability({ auto: "available", explicit: "payment_required" }, "pro").message,
    getAiRequestAvailability({ auto: "available", explicit: "unavailable" }, "fast").message,
    getAiRequestAvailability({ auto: "unknown", explicit: "unknown" }, "auto").message,
  ]) {
    assert.ok(message, "a blocked request must explain why it cannot be sent");
    assert.notEqual(translateUiText(message, language), message, `${language} must translate blocked AI request feedback`);
  }
}

for (const component of ["LegalAiWorkspace.tsx", "AnalysisPage.tsx"]) {
  const source = readFileSync(path.join(process.cwd(), "components", component), "utf8");
  assert.match(source, /getAiRequestAvailability/, `${component} must block an explicitly unavailable provider before sending`);
  assert.match(source, /canRefreshAiRequestStatus/, `${component} must offer a recovery path when the provider status remains unknown`);
}

const workspace = readFileSync(path.join(process.cwd(), "components", "LegalAiWorkspace.tsx"), "utf8");
const analysis = readFileSync(path.join(process.cwd(), "components", "AnalysisPage.tsx"), "utf8");
assert.match(
  workspace,
  /workspace\.guestSignInRequired/,
  "the guest composer must explain that a draft is not sent before secure sign-in",
);
assert.match(
  workspace,
  /workspace\.continueSecureSignIn/,
  "the guest submit label must describe the secure sign-in action instead of promising a sent request",
);
assert.match(
  workspace,
  /disabled=\{isSubmitting \|\| isAiRequestBlocked\}/,
  "the first-use send control must not invite an authenticated user to submit while the selected AI service is unavailable",
);
assert.match(
  analysis,
  /disabled=\{isAiRequestBlocked \|\| \(!inputText\.trim\(\) && !attachedFile\)\}/,
  "the ongoing-chat send control must not invite a user to submit while the selected AI service is unavailable",
);

console.info("AI request availability: PASS 26/26");
