import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appCopy, formatAppCopy, type AppCopyKey } from "./appCopy";
import { appLanguages } from "./types";

const sidebarKeys = [
  "sidebar.collapse",
  "sidebar.primaryNavigation",
  "sidebar.newChat",
  "sidebar.caseWorkspaces",
  "sidebar.pastConversations",
  "sidebar.searchConversations",
  "sidebar.conversationView",
  "sidebar.active",
  "sidebar.archived",
  "sidebar.movedToTrash",
  "sidebar.restoreConversation",
  "sidebar.noPastConversations",
  "sidebar.restore",
  "sidebar.openConversation",
  "sidebar.pinConversation",
  "sidebar.unpinConversation",
  "sidebar.renameConversation",
  "sidebar.archiveConversation",
  "sidebar.unarchiveConversation",
  "sidebar.deleteConversation",
  "sidebar.viewUsageDetails",
  "sidebar.units",
  "sidebar.included",
  "sidebar.topUpUnits",
  "sidebar.settings",
  "sidebar.upgrade",
  "sidebar.topUp",
  "sidebar.help",
  "plan.checking",
  "plan.free",
  "plan.current",
  "plan.viewUpgrade",
] as const;

for (const language of appLanguages) {
  for (const key of sidebarKeys) {
    assert.ok(appCopy(language, key as AppCopyKey).trim(), `${language} must provide ${key}`);
  }
}

assert.equal(
  formatAppCopy("hi", "sidebar.movedToTrash" as AppCopyKey, { conversation: "Synthetic chat" }).includes("Synthetic chat"),
  true,
  "a user-created conversation name must stay verbatim inside the Hindi status message",
);
assert.equal(
  formatAppCopy("hinglish", "sidebar.openConversation" as AppCopyKey, { conversation: "Synthetic chat" }).includes("Synthetic chat"),
  true,
  "a user-created conversation name must stay verbatim inside the Hinglish accessible label",
);

const sidebar = readFileSync(resolve(process.cwd(), "components", "Sidebar.tsx"), "utf8");
const planHeader = readFileSync(resolve(process.cwd(), "components", "PlanHeaderControl.tsx"), "utf8");

assert.match(sidebar, /sidebar\.newChat/, "the Sidebar must use typed copy for its primary entry action");
assert.match(sidebar, /sidebar\.openConversation/, "the Sidebar must use typed copy for user-content-safe accessible labels");
assert.match(planHeader, /plan\.viewUpgrade/, "the plan header must use typed copy for its upgrade control");

console.info(`Typed sidebar and plan copy: PASS ${sidebarKeys.length * appLanguages.length + 5}/${sidebarKeys.length * appLanguages.length + 5}`);
