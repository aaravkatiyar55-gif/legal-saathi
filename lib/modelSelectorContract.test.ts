import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/RequestControls.tsx", import.meta.url), "utf8");
for (const model of ["auto", "fast", "flash", "pro", "ultra"]) {
  assert.match(source, new RegExp(`\\b${model}\\b`), `Missing ${model} from selector contract`);
}
assert.match(source, /aria-label=\{t\("Select AI model"\)\}/);
assert.match(source, /data-testid="ai-model-selector"/);
assert.match(source, /<select[\s\S]*?value=\{value\.model\}/);
assert.ok(!source.includes('const fallback = (["auto", "fast", "flash"]'), "Explicit selections must not silently fall back in the UI");
console.log("Model selector visibility and explicit-route contract: PASS");
