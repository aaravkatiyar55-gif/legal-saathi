import assert from "node:assert/strict";
import {
  CASE_UPLOAD_ACCEPT,
  CASE_UPLOAD_EXTENSIONS,
  supportsCaseUploadName,
} from "./caseUploadPolicy";

for (const fileName of [
  "notice.pdf",
  "brief.docx",
  "legacy.doc",
  "evidence.xlsx",
  "register.xls",
  "notes.txt",
  "folder.csv",
  "screenshot.png",
  "recording.mp4",
  "hearing.webm",
]) {
  assert.equal(supportsCaseUploadName(fileName), true, `${fileName} should be supported`);
}

assert.equal(supportsCaseUploadName("malware.exe"), false);
assert.equal(supportsCaseUploadName("no-extension"), false);
assert.equal(new Set(CASE_UPLOAD_EXTENSIONS).size, CASE_UPLOAD_EXTENSIONS.length);
assert.match(CASE_UPLOAD_ACCEPT, /\.xlsx/);
assert.match(CASE_UPLOAD_ACCEPT, /\.mp4/);

console.log(`Case upload policy: PASS (${CASE_UPLOAD_EXTENSIONS.length} extensions)`);
