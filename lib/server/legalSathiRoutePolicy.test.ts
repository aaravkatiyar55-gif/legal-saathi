import assert from "node:assert/strict";

import { matchLegalSathiProxyRule } from "./legalSathiRoutePolicy";

const publicSessionRoutes = [
  ["GET", "/auth/pending"],
  ["GET", "/profile/consent/document"],
  ["GET", "/profile/consent/history"],
  ["GET", "/admin/session/readiness"],
  ["POST", "/admin/credential/setup"],
  ["POST", "/admin/session"],
] as const;

for (const [method, path] of publicSessionRoutes) {
  const rule = matchLegalSathiProxyRule(path, method);
  assert.ok(rule, `${method} ${path} must be forwarded`);
  assert.equal(rule.forwardAuthorization, undefined, `${path} must use the HttpOnly app session, not a browser admin bearer`);
}

const protectedAdminRoutes = [
  ["GET", "/admin/session/status"],
  ["GET", "/admin/consents"],
  ["GET", "/admin/consents/export"],
  ["POST", "/admin/users/person%40example.com/hide"],
  ["POST", "/admin/users/person%40example.com/restore"],
] as const;

for (const [method, path] of protectedAdminRoutes) {
  const rule = matchLegalSathiProxyRule(path, method);
  assert.ok(rule, `${method} ${path} must be forwarded`);
  assert.equal(rule.forwardAuthorization, true, `${path} must forward the short-lived admin authorization`);
}

const recoveryRoute = matchLegalSathiProxyRule("/ai/legal-chat/request_recovery-123/result", "GET");
assert.ok(recoveryRoute, "completed AI-response recovery must be forwarded through the same-origin BFF");
assert.equal(recoveryRoute.forwardAuthorization, undefined, "recovery must use the HttpOnly app session, not a browser admin bearer");

assert.equal(matchLegalSathiProxyRule("/profile/consent/document", "POST"), undefined);
assert.equal(matchLegalSathiProxyRule("/auth/pending", "POST"), undefined);
assert.equal(matchLegalSathiProxyRule("/admin/credential/setup", "GET"), undefined);
assert.equal(matchLegalSathiProxyRule("/admin/unknown", "GET"), undefined);
assert.equal(matchLegalSathiProxyRule("/ai/legal-chat/request_recovery-123/result", "POST"), undefined);

console.log("Legal Saathi BFF route policy tests passed.");
