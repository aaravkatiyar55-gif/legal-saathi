import assert from "node:assert/strict";

import { getMenuFocusIndex } from "./menuKeyboardNavigation";

const menuItems = [
  { disabled: false },
  { disabled: false },
  { disabled: true },
  { disabled: false },
] as const;

assert.equal(getMenuFocusIndex(menuItems, 0, "ArrowDown"), 1);
assert.equal(getMenuFocusIndex(menuItems, 1, "ArrowDown"), 3);
assert.equal(getMenuFocusIndex(menuItems, 3, "ArrowDown"), 0);
assert.equal(getMenuFocusIndex(menuItems, 0, "ArrowUp"), 3);
assert.equal(getMenuFocusIndex(menuItems, 3, "Home"), 0);
assert.equal(getMenuFocusIndex(menuItems, 0, "End"), 3);
assert.equal(getMenuFocusIndex(menuItems, -1, "ArrowUp"), 3);
assert.equal(getMenuFocusIndex(menuItems, 0, "Enter"), null);

console.info("Menu keyboard navigation: PASS 8/8");
