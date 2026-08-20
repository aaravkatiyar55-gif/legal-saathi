import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appErrorProvider = readFileSync(resolve(process.cwd(), "components/AppErrorProvider.tsx"), "utf8");
const routeErrorBoundary = readFileSync(resolve(process.cwd(), "app/error.tsx"), "utf8");

assert.match(
  appErrorProvider,
  /\{incident\.retry && \(\s*<button[^>]*onClick=\{\(\) => \{/, 
  "The global error dialog must show a retry control only when it has an actual retry action.",
);
assert.match(
  routeErrorBoundary,
  /retry:\s*reset/,
  "A route error must provide its reset function to the safe error dialog.",
);

console.info("Safe error recovery actions: PASS 2/2");
