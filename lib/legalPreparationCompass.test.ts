import assert from "node:assert/strict";

import {
  LEGAL_PREPARATION_PROMPTS,
  LEGAL_PREPARATION_CHECKLIST,
  getPreparationProgressLabel,
} from "../components/LegalPreparationCompass";
import { translateUiText } from "./i18n";

assert.equal(LEGAL_PREPARATION_PROMPTS.length, 4, "The preparation compass should stay focused on four everyday legal starting points.");
assert.equal(new Set(LEGAL_PREPARATION_PROMPTS.map((prompt) => prompt.id)).size, LEGAL_PREPARATION_PROMPTS.length);
assert.equal(LEGAL_PREPARATION_CHECKLIST.length, 3, "The preparation checklist should fit a quick first-use pass.");
assert.equal(getPreparationProgressLabel(0), "0 of 3 preparation checks noted");
assert.equal(getPreparationProgressLabel(2), "2 of 3 preparation checks noted");
assert.equal(getPreparationProgressLabel(3), "3 of 3 preparation checks noted");

const localizableCopy = [
  "A small first step",
  "Make your next legal conversation clearer",
  "Pick a familiar situation, then take a minute to organise the facts before you enter the workspace.",
  "Choose a preparation scenario",
  "A useful question to prepare",
  "90-second preparation check",
  "Nothing is saved here. This is only a private way to get organised.",
  ...LEGAL_PREPARATION_PROMPTS.flatMap((prompt) => [prompt.title, prompt.summary, prompt.prompt]),
  ...LEGAL_PREPARATION_CHECKLIST,
  ...[0, 1, 2, 3].map(getPreparationProgressLabel),
];

for (const language of ["hi", "hinglish"] as const) {
  for (const copy of localizableCopy) {
    assert.notEqual(translateUiText(copy, language), copy, `${language} must localize preparation copy: ${copy}`);
  }
}

process.stdout.write(`Legal preparation compass contract passed: ${7 + localizableCopy.length * 2}/${7 + localizableCopy.length * 2}\n`);
