import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caseCreationCopy, caseCreationCopyKeys, formatCaseCreationCopy, type CaseCreationCopyKey } from "./caseCreationCopy";
import { appLanguages } from "./types";

for (const language of appLanguages) {
  for (const key of caseCreationCopyKeys) {
    assert.ok(caseCreationCopy(language, key as CaseCreationCopyKey).trim(), `${language} must provide ${key}`);
  }
}

for (const key of ["title.create", "field.caseName", "action.browseFiles", "limit.title", "upload.warning"] as const) {
  assert.notEqual(caseCreationCopy("hi", key), caseCreationCopy("en", key), `Hindi must localize ${key}`);
  assert.notEqual(caseCreationCopy("hinglish", key), caseCreationCopy("en", key), `Hinglish must localize ${key}`);
}

assert.equal(formatCaseCreationCopy("hi", "action.nextAddFile", { }), "आगे: फ़ाइल जोड़ें");
assert.equal(formatCaseCreationCopy("hinglish", "placeholder.caseName", {}), "e.g. Sharma v. Verma");

const modalSource = readFileSync(new URL("../../components/CreateCaseModal.tsx", import.meta.url), "utf8");
const uploadSource = readFileSync(new URL("../../components/DocumentUpload.tsx", import.meta.url), "utf8");

assert.match(modalSource, /language:\s*AppLanguage/);
assert.match(modalSource, /caseCreationCopy/);
assert.match(modalSource, /role="listbox"/);
assert.match(modalSource, /role="option"/);
assert.doesNotMatch(modalSource, />Case-folder limit reached<|>Create New Case<|>Case Name \*</);
assert.match(uploadSource, /caseCreationCopy/);
assert.match(uploadSource, /<button[\s\S]*document-upload/);
assert.doesNotMatch(uploadSource, /aria-label="Choose a case document"|>Browse Files<|Warning: AI analysis/);

console.info(`Case creation localized/accessibility contract: PASS ${caseCreationCopyKeys.length * appLanguages.length + 13}/${caseCreationCopyKeys.length * appLanguages.length + 13}`);
