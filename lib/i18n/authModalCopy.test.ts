import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { authModalCopy, authModalCopyKeys } from "./authModalCopy";
import { translateUiText } from ".";

for (const language of ["en", "hi", "hinglish"] as const) {
  for (const key of authModalCopyKeys) {
    assert.ok(authModalCopy(language, key).trim(), `${language} auth copy must provide ${key}`);
  }
}

for (const language of ["hi", "hinglish"] as const) {
  for (const key of [
    "closeAria",
    "initialTitle",
    "initialDescription",
    "signInFirst",
    "supabaseUnavailable",
    "continueWithGoogle",
    "continueWithEmail",
    "continueWithPassword",
  ] as const) {
    assert.notEqual(
      authModalCopy(language, key),
      authModalCopy("en", key),
      `${language} must not fall back to English for visible auth copy: ${key}`,
    );
  }
}

for (const language of ["hi", "hinglish"] as const) {
  for (const message of [
    "Secure email authentication is not configured on this environment.",
    "Enter a valid email address.",
    "The verification code is invalid or expired.",
    "The email or password is incorrect.",
    "Google sign-in could not be verified.",
    "Google sign-in is not enabled by the identity provider on this environment.",
    "A verified email address is required.",
    "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.",
    "The passwords do not match.",
    "Enter the code from your authenticator app.",
    "The authenticator code is invalid or expired.",
    "This secure sign-in step expired. Start again.",
    "Too many sign-in attempts. Please wait and try again.",
    "Too many verification emails were requested. Please wait before trying again.",
    "The verification-email sender could not authenticate.",
    "The verification-email provider is temporarily unavailable.",
    "The verification email could not be sent. Please try again after checking the email provider.",
    "Sign in first to continue.",
    "The authentication service is temporarily unavailable.",
    "Legal Saathi could not reach the authentication service.",
    "Google sign-in was cancelled. You can try again when ready.",
  ]) {
    assert.notEqual(
      translateUiText(message, language),
      message,
      `${language} must translate the runtime sign-in state: ${message}`,
    );
  }
}

const authModalSource = readFileSync(path.join(process.cwd(), "components", "AuthModal.tsx"), "utf8");
const pageSource = readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf8");
assert.match(authModalSource, /authModalCopy/, "AuthModal must use its typed localized copy catalog");
assert.match(authModalSource, /language: AppLanguage/, "AuthModal must receive the selected application language");
assert.match(pageSource, /<AuthModal[\s\S]*?language=\{language\}/, "the app shell must pass the active language into AuthModal");

console.info(`Auth modal localized copy: PASS ${authModalCopyKeys.length * 3 + 61}/${authModalCopyKeys.length * 3 + 61}`);
