import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "components/AttachmentMenu.tsx"), "utf8");

assert.match(source, /useId/, "AttachmentMenu must create a unique menu id for the trigger relationship.");
assert.match(source, /aria-controls=\{open \? menuId : undefined\}/, "Attachment trigger must name its visible menu.");
assert.match(source, /onKeyDown=\{handleMenuKeyDown\}/, "Attachment menu must handle menu keyboard navigation at its boundary.");
assert.match(source, /closeMenu\(true\)/, "Escape must restore focus to the attachment trigger.");
assert.match(source, /getMenuFocusIndex/, "Attachment menu must use the shared disabled-item-aware focus helper.");

console.info("Attachment menu keyboard contract: PASS 5/5");
