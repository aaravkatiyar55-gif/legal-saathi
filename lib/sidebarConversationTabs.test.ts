import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "components/Sidebar.tsx"), "utf8");

assert.match(source, /getConversationTabNextView/, "Sidebar must use the shared tab-key helper.");
assert.match(source, /aria-controls="sidebar-active-conversations-panel"/, "Active tab must identify its panel.");
assert.match(source, /aria-controls="sidebar-archived-conversations-panel"/, "Archived tab must identify its panel.");
assert.match(source, /onKeyDown=\{handleConversationTabKeyDown\}/, "Conversation tabs must support standard arrow-key navigation.");
assert.match(source, /role="tabpanel"/, "Conversation results must expose a matching tab panel.");

console.info("Sidebar conversation tab contract: PASS 5/5");
