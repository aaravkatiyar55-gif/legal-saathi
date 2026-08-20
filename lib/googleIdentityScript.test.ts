import assert from "node:assert/strict";
import {
  configureGoogleIdentity,
  createGoogleIdentityNonce,
  googleIdentityInitializationOptions,
  hashGoogleIdentityNonce,
  shouldReplaceGoogleIdentityScript,
  type GoogleIdApi,
} from "./googleIdentityScript";

async function main() {
  assert.equal(shouldReplaceGoogleIdentityScript("failed", false), true);
  assert.equal(shouldReplaceGoogleIdentityScript("loaded", false), true);
  assert.equal(shouldReplaceGoogleIdentityScript("loaded", true), false);
  assert.equal(shouldReplaceGoogleIdentityScript("loading", false), false);
  assert.equal(shouldReplaceGoogleIdentityScript("", false), false);
  assert.equal(googleIdentityInitializationOptions.use_fedcm_for_button, true);
  assert.equal(googleIdentityInitializationOptions.button_auto_select, false);
  assert.equal("use_fedcm_for_prompt" in googleIdentityInitializationOptions, false);

  const generated = await createGoogleIdentityNonce();
  assert.match(generated.rawNonce, /^[A-Za-z0-9_-]{43}$/);
  assert.match(generated.hashedNonce, /^[a-f0-9]{64}$/);
  assert.equal(await hashGoogleIdentityNonce(generated.rawNonce), generated.hashedNonce);

  const initialized: Array<Parameters<GoogleIdApi["initialize"]>[0]> = [];
  const fakeApi = {
    initialize(config: Parameters<GoogleIdApi["initialize"]>[0]) { initialized.push(config); },
    renderButton() {},
  } as GoogleIdApi;

  const firstNonce = {
    rawNonce: "a".repeat(43),
    hashedNonce: await hashGoogleIdentityNonce("a".repeat(43)),
  };
  const secondNonce = {
    rawNonce: "b".repeat(43),
    hashedNonce: await hashGoogleIdentityNonce("b".repeat(43)),
  };
  const received: string[] = [];

  assert.equal(configureGoogleIdentity(
    fakeApi,
    "client.apps.googleusercontent.com",
    firstNonce,
    (credential, rawNonce) => received.push(`first:${credential}:${rawNonce}`),
  ), true);
  assert.equal(initialized[0]?.nonce, firstNonce.hashedNonce);

  assert.equal(configureGoogleIdentity(
    fakeApi,
    "client.apps.googleusercontent.com",
    firstNonce,
    (credential, rawNonce) => received.push(`current:${credential}:${rawNonce}`),
  ), false);
  initialized[0]?.callback({ credential: "redacted-first-credential" });
  initialized[0]?.callback({ credential: "redacted-duplicate-credential" });
  assert.deepEqual(received, [`current:redacted-first-credential:${firstNonce.rawNonce}`]);

  assert.equal(configureGoogleIdentity(
    fakeApi,
    "client.apps.googleusercontent.com",
    secondNonce,
    (credential, rawNonce) => received.push(`rotated:${credential}:${rawNonce}`),
  ), true);
  assert.equal(initialized[1]?.nonce, secondNonce.hashedNonce);
  initialized[0]?.callback({ credential: "redacted-stale-credential" });
  initialized[1]?.callback({ credential: "redacted-current-credential" });
  assert.deepEqual(received, [
    `current:redacted-first-credential:${firstNonce.rawNonce}`,
    `rotated:redacted-current-credential:${secondNonce.rawNonce}`,
  ]);

  console.log("Google identity hashed/raw nonce pairing, one-time callback, and stale-attempt rejection: PASS");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Google identity nonce test failed");
  process.exitCode = 1;
});
