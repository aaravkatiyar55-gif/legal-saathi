import { strict as assert } from "node:assert";
import { rewriteBackendCookiePath, splitCombinedSetCookieHeader } from "./cookiePath";

const pending = "legal_sathi_auth_pending=sealed; Path=/auth; HttpOnly; SameSite=None; Domain=legal-saathi-backend-m97l.onrender.com";
const rewritten = rewriteBackendCookiePath(pending);
assert.match(rewritten, /Path=\/(?:;|$)/i);
assert.doesNotMatch(rewritten, /Path=\/auth(?:;|$)/i);
assert.doesNotMatch(rewritten, /Domain=/i);
assert.match(rewritten, /SameSite=Lax/i);

const appSession = "legal_sathi_session=sealed; Path=/; HttpOnly; SameSite=Lax";
assert.match(rewriteBackendCookiePath(appSession), /Path=\/(?:;|$)/i);

const combined = "legal_sathi_session=one; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, legal_sathi_auth_pending=two; Path=/auth";
assert.equal(splitCombinedSetCookieHeader(combined).length, 2);

console.log("BFF auth-cookie normalization: PASS 6/6");
