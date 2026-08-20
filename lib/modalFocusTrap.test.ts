import assert from "node:assert/strict";

import { getModalFocusCycleTarget } from "./modalFocusTrap";

const first = { id: "first" };
const middle = { id: "middle" };
const last = { id: "last" };
const focusable = [first, middle, last] as const;

assert.equal(
  getModalFocusCycleTarget(focusable, last, false),
  first,
  "Tab from the final modal control must wrap to the first control",
);
assert.equal(
  getModalFocusCycleTarget(focusable, first, true),
  last,
  "Shift+Tab from the first modal control must wrap to the final control",
);
assert.equal(
  getModalFocusCycleTarget(focusable, middle, false),
  null,
  "Tab from an interior control must keep the browser's normal in-modal order",
);
assert.equal(
  getModalFocusCycleTarget(focusable, null, false),
  null,
  "A missing active control must not force focus unexpectedly",
);
assert.equal(
  getModalFocusCycleTarget([], null, false),
  null,
  "An empty modal must not attempt to focus an absent control",
);

console.info("Modal focus-cycle contract: PASS 5/5");
