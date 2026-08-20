import assert from "node:assert/strict";
import { LEGAL_CASE_JOURNEY_STEPS } from "../components/LegalCaseJourney";
import { languageTag, translateUiText, type AppLanguage } from "./i18n";

const journeyCopy = [
  "A continuous case journey",
  "From first explanation to an advocate-ready brief",
  "Legal Saathi keeps the work around one matter connected instead of ending at a single chat reply.",
  ...LEGAL_CASE_JOURNEY_STEPS.flatMap((step) => [step.title, step.description]),
  "Trust boundaries",
  "Your facts stay editable",
  "Sources remain traceable",
  "Professional review stays in the loop",
  "Review before relying",
  "User-provided details may be incomplete or unverified.",
  "Document findings should be checked against the cited page or source.",
  "AI-prepared structure needs review by a qualified advocate before legal action.",
];

assert.equal(LEGAL_CASE_JOURNEY_STEPS.length, 5, "The public case journey should stay focused on five reviewable stages.");
assert.equal(new Set(LEGAL_CASE_JOURNEY_STEPS.map((step) => step.id)).size, LEGAL_CASE_JOURNEY_STEPS.length);
assert.deepEqual(
  (["en", "hi", "hinglish"] as const satisfies AppLanguage[]).map(languageTag),
  ["en", "hi", "hi-Latn"],
  "Document language tags must distinguish Hindi and Romanized Hindi for assistive technology.",
);

let checks = 3;
for (const language of ["hi", "hinglish"] as const satisfies AppLanguage[]) {
  for (const copy of journeyCopy) {
    const translated = translateUiText(copy, language);
    assert.notEqual(translated, copy, `${language} must localize: ${copy}`);
    assert.ok(translated.trim().length > 0, `${language} translation must not be empty: ${copy}`);
    checks += 2;
  }
}

process.stdout.write(`Legal case journey contract passed: ${checks}/${checks}\n`);
