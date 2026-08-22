import assert from "node:assert/strict";

import {
  sidebarMessage,
  sidebarMessageKeys,
} from "./sidebarMessages";

assert.equal(sidebarMessageKeys.length, 30, "Sidebar should expose exactly 30 typed message keys.");

for (const language of ["en", "hi", "hinglish"] as const) {
  for (const key of sidebarMessageKeys) {
    const message = sidebarMessage(language, key);
    assert.ok(message.trim().length > 0, `${language} sidebar message ${key} must not be empty.`);
  }
}

const brandKey = "sidebar.brand.subtitle" as const;
for (const key of sidebarMessageKeys) {
  if (key === brandKey) continue;
  assert.notEqual(sidebarMessage("hi", key), sidebarMessage("en", key), `${key} needs Hindi sidebar copy.`);
}

// Keys where Hinglish intentionally keeps the English term (brand, widely-used English UI terms)
const hinglishSameAsEnglish = new Set<string>([
  brandKey,
  "sidebar.conversations.active",
  "sidebar.conversations.archived",
  "sidebar.usage.included",
  "sidebar.usage.units",
  "sidebar.usage.topUpUnits",
  "sidebar.nav.caseWorkspaces",
  "sidebar.footer.settings",
]);

for (const key of sidebarMessageKeys) {
  if (hinglishSameAsEnglish.has(key)) continue;
  assert.notEqual(sidebarMessage("hinglish", key), sidebarMessage("en", key), `${key} needs Hinglish sidebar copy.`);
}

const totalChecks = sidebarMessageKeys.length * 3 + (sidebarMessageKeys.length - 1) + (sidebarMessageKeys.length - hinglishSameAsEnglish.size) + 1;
process.stdout.write(`Sidebar message contract passed: ${totalChecks}/${totalChecks}\n`);
