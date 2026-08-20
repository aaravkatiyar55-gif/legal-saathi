import assert from "node:assert/strict";

import { completeAuthenticatedHandoff, deriveCompletedAuthState } from "./authCompletion";
import type { SessionPayload } from "./backendApi";

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    provider: "supabase",
    csrfToken: "test-csrf",
    expiresAt: "2026-08-01T00:00:00.000Z",
    termsVersion: null,
    privacyVersion: null,
    consentVersion: null,
    consentedAt: null,
    requiredTermsVersion: "terms-v1",
    requiredPrivacyVersion: "privacy-v1",
    requiredConsentVersion: "consent-v1",
    acceptedCurrent: false,
    ...overrides,
  };
}

const unaccepted = deriveCompletedAuthState(session());
assert.equal(unaccepted.acceptedCurrent, false);
assert.deepEqual(unaccepted.requirements, {
  termsVersion: "terms-v1",
  privacyVersion: "privacy-v1",
  consentVersion: "consent-v1",
});

const accepted = deriveCompletedAuthState(session({ acceptedCurrent: true, adminEligible: true }));
assert.equal(accepted.acceptedCurrent, true);
assert.equal(accepted.adminEligible, true);

assert.throws(
  () => deriveCompletedAuthState(session({ requiredTermsVersion: "" })),
  /AUTH_SESSION_CONSENT_REQUIREMENTS_MISSING/,
);

async function runHandoffTests() {
  const successfulOrder: string[] = [];
  const successful = await completeAuthenticatedHandoff({
    loadWorkspace: async () => {
      successfulOrder.push("load");
      return { cases: 2 };
    },
    applyWorkspace: (workspace) => successfulOrder.push(`apply:${workspace.cases}`),
    clearWorkspace: () => successfulOrder.push("clear"),
    resumeAction: async () => { successfulOrder.push("resume"); },
  });
  assert.equal(successful.workspaceAvailable, true);
  assert.deepEqual(successfulOrder, ["load", "apply:2", "resume"]);

  const unavailableOrder: string[] = [];
  const unavailable = await completeAuthenticatedHandoff({
    loadWorkspace: async () => {
      unavailableOrder.push("load");
      throw new Error("WORKSPACE_UNAVAILABLE");
    },
    applyWorkspace: () => unavailableOrder.push("apply"),
    clearWorkspace: () => unavailableOrder.push("clear"),
    resumeAction: async () => { unavailableOrder.push("resume"); },
  });
  assert.equal(unavailable.workspaceAvailable, false);
  assert.deepEqual(unavailableOrder, ["load", "clear", "resume"]);
}

void runHandoffTests().then(() => {
  console.log("Legal Saathi completed-auth state tests passed.");
});
