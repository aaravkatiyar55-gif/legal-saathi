import assert from "node:assert/strict";
import { buildProxyUpstreamUrl, maxProxyQueryLength } from "./proxyUrl";

assert.equal(
  buildProxyUpstreamUrl("http://127.0.0.1:8000", "/documents", "?caseId=case_12345678"),
  "http://127.0.0.1:8000/documents?caseId=case_12345678",
);
assert.equal(
  buildProxyUpstreamUrl("http://127.0.0.1:8000/", "/chats", "?limit=50&q=synthetic%20chat"),
  "http://127.0.0.1:8000/chats?limit=50&q=synthetic%20chat",
);
assert.equal(buildProxyUpstreamUrl("http://127.0.0.1:8000", "/health", ""), "http://127.0.0.1:8000/health");
assert.equal(buildProxyUpstreamUrl("http://127.0.0.1:8000", "/documents", `?q=${"x".repeat(maxProxyQueryLength)}`), null);

console.log("Same-origin BFF query forwarding and bounds: PASS 4/4");
