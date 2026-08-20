import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "components/CreateCaseModal.tsx"), "utf8");

assert.match(source, /getMenuFocusIndex/, "Case-type listbox must use the shared disabled-item-aware focus helper.");
assert.match(source, /caseTypeTriggerRef/, "Case-type listbox must retain its trigger for focus restoration.");
assert.match(source, /handleCaseTypeTriggerKeyDown/, "Case-type trigger must support keyboard opening.");
assert.match(source, /handleCaseTypeListboxKeyDown/, "Case-type listbox must support arrow, Home, End, and Escape keys.");
assert.match(source, /onKeyDown=\{handleCaseTypeListboxKeyDown\}/, "Case-type listbox must bind its keyboard handler.");
assert.match(source, /closeCaseTypeDropdown\(true\)/, "Escape or selection must restore focus to the case-type trigger.");

console.info("Create-case type keyboard contract: PASS 6/6");
