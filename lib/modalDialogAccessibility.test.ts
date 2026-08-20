import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dialogComponents = [
  "components/ProductPricingModal.tsx",
  "components/HelpModal.tsx",
  "components/AppErrorProvider.tsx",
  "components/DictationControl.tsx",
  "components/CreateCaseModal.tsx",
  "components/SettingsModal.tsx",
  "components/AuthModal.tsx",
] as const;

for (const component of dialogComponents) {
  const source = readFileSync(resolve(component), "utf8");
  assert.equal(source.includes("getModalFocusCycleTargetInContainer"), true, `${component} must use the shared visible-focusable cycle helper`);
  assert.equal(source.includes("onKeyDown={handleDialogKeyDown}"), true, `${component} must handle Escape and Tab at its dialog boundary`);
  assert.equal(source.includes('role="dialog"'), true, `${component} must expose dialog semantics`);
  assert.equal(source.includes('aria-modal="true"'), true, `${component} must mark itself modal`);
}

const authModal = readFileSync(resolve("components/AuthModal.tsx"), "utf8");
assert.equal(authModal.includes("previouslyFocusedElementRef"), true, "AuthModal must retain its opener for focus restoration");
assert.equal(authModal.includes(".isConnected"), true, "AuthModal must restore focus only to a still-connected opener");

console.info(`Modal dialog accessibility contract: PASS ${dialogComponents.length} dialogs`);
