import assert from "node:assert/strict";

import { getPolicyPageContent, policyPageIds } from "./policyContent";
import { appLanguages } from "./i18n";

let assertions = 0;
for (const page of policyPageIds) {
  const english = getPolicyPageContent(page, "en");
  assert.ok(english.title.trim(), `English ${page} needs a title`);
  assert.ok(english.summary.trim(), `English ${page} needs a summary`);
  assert.ok(english.sections.length > 0, `English ${page} needs sections`);
  assertions += 3;

  for (const language of appLanguages) {
    const localized = getPolicyPageContent(page, language);
    assert.ok(localized.title.trim(), `${language} ${page} needs a title`);
    assert.ok(localized.summary.trim(), `${language} ${page} needs a summary`);
    assert.equal(localized.sections.length, english.sections.length, `${language} ${page} must retain each policy section`);
    assertions += 3;

    localized.sections.forEach((section, index) => {
      assert.ok(section.heading.trim(), `${language} ${page} section ${index} needs a heading`);
      assert.ok((section.paragraphs?.length ?? 0) + (section.items?.length ?? 0) > 0, `${language} ${page} section ${index} needs content`);
      assertions += 2;
    });
  }
}

for (const language of ["hi", "hinglish"] as const) {
  for (const page of policyPageIds) {
    assert.notEqual(getPolicyPageContent(page, language).summary, getPolicyPageContent(page, "en").summary, `${language} ${page} must not silently fall back to the English policy summary`);
    assert.notEqual(getPolicyPageContent(page, language).title, getPolicyPageContent(page, "en").title, `${language} ${page} must not silently fall back to the English policy title`);
    assertions += 2;
  }
}

console.info(`Policy localization contract: PASS ${assertions}/${assertions}`);
