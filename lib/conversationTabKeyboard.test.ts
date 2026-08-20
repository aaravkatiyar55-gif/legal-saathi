import assert from "node:assert/strict";

import { getConversationTabNextView } from "./conversationTabKeyboard";

assert.equal(getConversationTabNextView("active", "ArrowRight"), "archived");
assert.equal(getConversationTabNextView("active", "ArrowDown"), "archived");
assert.equal(getConversationTabNextView("archived", "ArrowRight"), "active");
assert.equal(getConversationTabNextView("archived", "ArrowDown"), "active");
assert.equal(getConversationTabNextView("archived", "ArrowLeft"), "active");
assert.equal(getConversationTabNextView("archived", "ArrowUp"), "active");
assert.equal(getConversationTabNextView("active", "ArrowLeft"), "archived");
assert.equal(getConversationTabNextView("active", "ArrowUp"), "archived");
assert.equal(getConversationTabNextView("archived", "Home"), "active");
assert.equal(getConversationTabNextView("active", "End"), "archived");
assert.equal(getConversationTabNextView("active", "Enter"), null);

console.info("Conversation tab keyboard navigation: PASS 11/11");
