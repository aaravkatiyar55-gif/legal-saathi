import assert from "node:assert/strict";

import { BackendApiError, chatFailureMessage } from "./backendApi";
import { translateUiText } from "./i18n";

const providerRateLimit = new BackendApiError({
  code: "AI_PROVIDER_RATE_LIMITED",
  requestId: "chat-rate-limit-001",
  status: 429,
});

assert.equal(
  chatFailureMessage(providerRateLimit),
  providerRateLimit.message,
  "a known AI rate-limit response keeps its precise inline recovery message",
);

const unreachableProxy = new BackendApiError({
  code: "BACKEND_PROXY_UNAVAILABLE",
  requestId: "chat-proxy-001",
  status: 502,
});

assert.equal(
  unreachableProxy.presentation,
  "product",
  "a temporary secure-backend outage must remain in the chat recovery UI",
);

assert.match(
  chatFailureMessage(new Error("unexpected response shape")),
  /draft|question|try again/i,
  "an unexpected chat failure still gives a contextual recovery message instead of requiring the generic error modal",
);

for (const message of [
  unreachableProxy.message,
  chatFailureMessage(new Error("unexpected response shape")),
]) {
  assert.notEqual(
    translateUiText(message, "hi"),
    message,
    "Hindi chat recovery copy must not fall back to English",
  );
  assert.notEqual(
    translateUiText(message, "hinglish"),
    message,
    "Hinglish chat recovery copy must not fall back to English",
  );
}

console.info("Chat failure presentation: PASS 7/7");
