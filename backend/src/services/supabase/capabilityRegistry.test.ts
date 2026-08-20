import assert from "node:assert/strict";
import { evaluateSupabaseCapabilityRegistry, type SupabaseCapabilityRegistryInput } from "./capabilityRegistry.service";

const base: SupabaseCapabilityRegistryInput = {
  declaredPlan: "unknown",
  planVerified: false,
  authConfigured: true,
  authReachable: true,
  mfaConfigured: true,
  customSmtpConfigured: false,
  databaseConfigured: true,
  databaseReachable: true,
  consentStoreReachable: false,
  storageReachable: false,
  privateDocumentBucketConfigured: false,
  realtimeVerified: false,
  sessionControlsConfigured: false,
  logDrainConfigured: false,
  pitrConfigured: false,
  rlsVerified: false,
  storagePoliciesVerified: false,
  restoreRunbookConfigured: true,
};

const unknown = evaluateSupabaseCapabilityRegistry(base);
assert.equal(unknown.platform.paidPlanActive, false);
assert.equal(unknown.capabilities.authAvailable, true);
assert.equal(unknown.capabilities.totpMfaAvailable, true);
assert.equal(unknown.capabilities.dailyBackupsExpectedByPlan, false);
assert.equal(unknown.capabilities.consentStoreAvailable, false);
assert.equal(unknown.states.consentStore, "not_configured");
assert.equal(unknown.states.dailyBackups, "not_verified");
assert.equal(unknown.states.pitr, "optional_add_on");
assert.equal(unknown.states.customSmtp, "not_configured");

const unverifiedPro = evaluateSupabaseCapabilityRegistry({ ...base, declaredPlan: "pro" });
assert.equal(unverifiedPro.platform.paidPlanActive, false);
assert.equal(unverifiedPro.capabilities.dailyBackupsExpectedByPlan, false);
assert.equal(unverifiedPro.states.logRetention, "not_verified");

const verifiedFree = evaluateSupabaseCapabilityRegistry({ ...base, declaredPlan: "free", planVerified: true });
assert.equal(verifiedFree.platform.paidPlanActive, false);
assert.equal(verifiedFree.states.dailyBackups, "not_included");
assert.equal(verifiedFree.states.logRetention, "not_included");
assert.equal(verifiedFree.capabilities.pitrConfigured, false);

const verifiedPro = evaluateSupabaseCapabilityRegistry({
  ...base,
  declaredPlan: "pro",
  planVerified: true,
  customSmtpConfigured: true,
  consentStoreReachable: true,
  storageReachable: true,
  privateDocumentBucketConfigured: true,
  realtimeVerified: true,
  sessionControlsConfigured: true,
  logDrainConfigured: true,
  rlsVerified: true,
  storagePoliciesVerified: true,
});
assert.equal(verifiedPro.platform.paidPlanActive, true);
assert.equal(verifiedPro.capabilities.dailyBackupsExpectedByPlan, true);
assert.equal(verifiedPro.capabilities.logRetentionExpectedByPlan, true);
assert.equal(verifiedPro.capabilities.pitrConfigured, false);
assert.equal(verifiedPro.capabilities.consentStoreAvailable, true);
assert.equal(verifiedPro.states.pitr, "optional_add_on");
assert.equal(verifiedPro.states.storagePolicies, "configured");

const unreachable = evaluateSupabaseCapabilityRegistry({
  ...base,
  authReachable: false,
  databaseReachable: false,
});
assert.equal(unreachable.capabilities.authAvailable, false);
assert.equal(unreachable.states.auth, "not_verified");
assert.equal(unreachable.capabilities.databaseAvailable, false);
assert.equal(unreachable.states.database, "not_verified");

const serialized = JSON.stringify(verifiedPro);
assert.equal(/key|secret|token|url|credential/i.test(serialized), false);

console.log("Supabase capability truthfulness: PASS (Free, unverified Pro, verified Pro, add-on, and live-probe states)");
