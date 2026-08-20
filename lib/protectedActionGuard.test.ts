import assert from "node:assert/strict";
import test from "node:test";

import { decideProtectedAction } from "./protectedActionGuard";

test("signed-out protected actions request sign-in", () => {
  assert.equal(decideProtectedAction(false, false), "sign_in");
  assert.equal(decideProtectedAction(false, true), "sign_in");
});

test("signed-in users without current consent must accept terms", () => {
  assert.equal(decideProtectedAction(true, false), "accept_terms");
});

test("only a signed-in user with current consent may run the action", () => {
  assert.equal(decideProtectedAction(true, true), "run");
});
