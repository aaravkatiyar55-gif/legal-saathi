import assert from "node:assert/strict";
import {
  legalChatUpstreamTimeoutMs,
  legalChatWarmupTimeoutMs,
  shouldWakeBackendForAuth,
  shouldWakeBackendForLegalChat,
} from "./legalSathiProxyPolicy";

assert.equal(shouldWakeBackendForAuth("POST", "/auth/email/start"), true);
assert.equal(shouldWakeBackendForAuth("GET", "/auth/config"), false);
assert.equal(shouldWakeBackendForAuth("POST", "/ai/legal-chat"), false);

assert.equal(shouldWakeBackendForLegalChat("POST", "/ai/legal-chat"), true);
assert.equal(shouldWakeBackendForLegalChat("GET", "/ai/legal-chat"), false);
assert.equal(shouldWakeBackendForLegalChat("POST", "/ai/legal-chat/request-123/cancel"), false);
assert.equal(shouldWakeBackendForLegalChat("POST", "/chats"), false);
assert.ok(legalChatWarmupTimeoutMs + legalChatUpstreamTimeoutMs < 45_000, "the chat warm-up plus upstream budget must stay below the browser deadline");

console.log("Legal Saathi BFF warm-up policy: PASS 8/8");
