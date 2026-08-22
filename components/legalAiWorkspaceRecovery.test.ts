import assert from "node:assert/strict";
import { getWorkspaceChatFailureMessage } from "./LegalAiWorkspace";

assert.match(getWorkspaceChatFailureMessage("rate_limited", "en"), /AI service is busy/);
assert.match(getWorkspaceChatFailureMessage("rate_limited", "hinglish"), /AI service abhi busy/);
assert.match(getWorkspaceChatFailureMessage("rate_limited", "hi"), /AI सेवा अभी व्यस्त/u);
assert.match(getWorkspaceChatFailureMessage("provider_timeout", "en"), /did not finish in time/);
assert.equal(getWorkspaceChatFailureMessage("provider_unavailable", "en"), "");

process.stdout.write("LegalAiWorkspace chat recovery tests passed: 5/5\n");
