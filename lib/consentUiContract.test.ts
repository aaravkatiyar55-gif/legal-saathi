import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/ConsentModal.tsx", import.meta.url), "utf8");

test("mandatory consent uses exactly one unchecked checkbox contract", () => {
  assert.equal((source.match(/type="checkbox"/g) ?? []).length, 1);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /copy\("consent\.acceptContinue"\)/);
  assert.match(source, /copy\("consent\.refuseLogout"\)/);
});

test("full policy remains explicitly discoverable", () => {
  assert.match(source, /copy\("consent\.viewMore"\)/);
  assert.match(source, /getBackendConsentDocument/);
  assert.match(source, /copy\("consent\.acceptStatement"\)/);
  assert.match(source, /data-no-i18n/);
});
