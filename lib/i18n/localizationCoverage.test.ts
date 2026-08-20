import assert from "node:assert/strict";

import { hi } from "./hi";
import { hinglish } from "./hinglish";
import { appCopy, appCopyKeys } from "./appCopy";
import { getPolicyPageContent, policyPageIds } from "../policyContent";

// These are high-traffic app-owned labels that still use the established UI
// dictionary while the rest of the UI moves to typed keys. A missing entry is
// a regression: English must not silently appear in the Hindi/Hinglish flow.
const coreUiStrings = [
  "New Chat",
  "Case Workspaces",
  "Past Conversations",
  "Settings",
  "Upgrade",
  "Help & FAQ",
  "Upload document",
  "Ask a question",
  "Send",
  "Cancel",
  "Save",
  "Delete",
  "Current Plan",
  "Profile & Account",
  "Privacy & Security",
  "Continue with Google",
  "Terms & Safety",
  "This is general legal information, not legal advice.",
  "Do not enter confidential details.",
  "Sign out",
  "Log in",
  "Web search",
  "Model",
  "Thinking",
  "Speed",
  "Select thinking mode",
  "Upgrade required",
  "Free model currently unavailable",
  "Provider temporarily unavailable",
  "Model configuration required",
  "Rate limited",
  "Copy answer",
  "Regenerate answer",
  "Edit message",
  "Stop generation",
  "Earlier messages are retained as a private conversation memory summary.",
  "Search conversations",
  "Move to trash",
  "Try again",
  "No cases yet",
  "No documents yet",
  "Ask a follow-up legal question",
  "Send follow-up message",
  "Payment was not completed. No access was granted.",
  "Payment verified. Your access has been updated by the backend.",
  "Razorpay Checkout could not be loaded. Confirm backend Razorpay keys and try again.",
  "Legal Saathi provides AI-assisted legal information and may make mistakes. Verify important decisions, documents, and deadlines.",
  "Continue as a legal professional",
  "Continue as someone seeking legal help",
  "Guided legal workflows",
  "Checking plan...",
  "Checking whether the selected AI service is ready. Please wait a moment.",
  "We couldn't confirm the AI service status. Refresh and try again.",
  "Refresh status",
  "Check previous response",
  "Start a new request",
] as const;

let assertions = 0;
for (const source of coreUiStrings) {
  assert.ok(Object.hasOwn(hi, source), `Hindi catalog is missing core UI copy: ${source}`);
  assert.ok(Object.hasOwn(hinglish, source), `Hinglish catalog is missing core UI copy: ${source}`);
  assertions += 2;
}

for (const source of ["Case Workspaces", "Log in"] as const) {
  assert.notEqual(hinglish[source], source, `Hinglish catalog must not leave public UI copy in English: ${source}`);
  assertions += 1;
}

for (const language of ["en", "hi", "hinglish"] as const) {
  for (const key of appCopyKeys) {
    assert.ok(appCopy(language, key).trim(), `${language} typed copy must provide ${key}`);
    assertions += 1;
  }
  for (const page of policyPageIds) {
    const content = getPolicyPageContent(page, language);
    assert.ok(content.title.trim() && content.summary.trim() && content.sections.length > 0, `${language} ${page} policy content must be complete`);
    assertions += 1;
  }
}

console.info(`Localization coverage: PASS ${assertions}/${assertions}`);
