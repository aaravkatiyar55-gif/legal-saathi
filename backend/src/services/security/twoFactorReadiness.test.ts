import assert from "node:assert/strict";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  evaluateTwoFactorReadiness,
  hashRecoveryCode,
  twoFactorOwnerKey,
} from "./twoFactorReadiness.service";

const key = Buffer.alloc(32, 7).toString("base64");
const blocked = evaluateTwoFactorReadiness({ storeBackend: "local", encryptionKey: "", databaseConfigured: false, loginChallengeImplemented: false });
assert.equal(blocked.configured, false);
assert.ok(blocked.missingVariables.includes("TOTP_STORE_BACKEND"));
assert.ok(blocked.missingVariables.includes("TOTP_ENCRYPTION_KEY"));
assert.ok(blocked.blockers.includes("LOGIN_CHALLENGE_INTEGRATION"));

const secret = "SYNTHETIC-TOTP-SECRET";
const encrypted = encryptTotpSecret(secret, key);
assert.ok(!encrypted.includes(secret));
assert.equal(decryptTotpSecret(encrypted, key), secret);
assert.throws(() => decryptTotpSecret(encrypted, Buffer.alloc(32, 8).toString("base64")));

const ownerA = twoFactorOwnerKey("user-a@example.test");
const ownerB = twoFactorOwnerKey("user-b@example.test");
assert.notEqual(ownerA, ownerB);
assert.equal(hashRecoveryCode(ownerA, "RECOVERY-ONE", key), hashRecoveryCode(ownerA, "RECOVERY-ONE", key));
assert.notEqual(hashRecoveryCode(ownerA, "RECOVERY-ONE", key), hashRecoveryCode(ownerB, "RECOVERY-ONE", key));

console.log("Fail-closed TOTP readiness, encrypted-secret adapter primitives, recovery-code hashing, and owner isolation: PASS");

