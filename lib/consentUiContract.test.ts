import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/ConsentModal.tsx", import.meta.url), "utf8");

test("mandatory consent uses exactly one unchecked checkbox contract", () => {
  assert.equal((source.match(/type="checkbox"/g) ?? []).length, 1);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /Accept and continue/);
  assert.match(source, /Refuse and log out/);
});

test("full policy remains explicitly discoverable", () => {
  assert.match(source, /View more/);
  assert.match(source, /getBackendConsentDocument/);
  assert.match(source, /Terms and Conditions/);
  assert.match(source, /Privacy Policy/);
});
