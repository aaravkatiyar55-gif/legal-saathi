import assert from "node:assert/strict";

import {
  LEGAL_CLARITY_CHALLENGES,
  getClaritySprintFeedback,
} from "../components/LegalClaritySprint";
import { translateUiText } from "./i18n";

assert.equal(LEGAL_CLARITY_CHALLENGES.length, 3, "The legal-literacy sprint should stay short enough for a first visit.");
assert.equal(new Set(LEGAL_CLARITY_CHALLENGES.map((challenge) => challenge.id)).size, LEGAL_CLARITY_CHALLENGES.length);

for (const challenge of LEGAL_CLARITY_CHALLENGES) {
  const correctFeedback = getClaritySprintFeedback(challenge.id, challenge.correctChoice);
  assert.equal(correctFeedback.isCorrect, true, `${challenge.id} should recognise its evidence-aware answer.`);

  const otherChoice = challenge.correctChoice === "context" ? "record" : "context";
  const incorrectFeedback = getClaritySprintFeedback(challenge.id, otherChoice);
  assert.equal(incorrectFeedback.isCorrect, false, `${challenge.id} should explain why context matters.`);
}

assert.throws(() => getClaritySprintFeedback("unknown", "context"), /Unknown legal clarity challenge/);

const localizableCopy = [
  "Quick legal-literacy sprint",
  "Spot the detail that makes a question stronger",
  "Three fictional prompts. Nothing you select is saved or sent.",
  "Fictional scenario",
  "Choose the more careful answer",
  "Needs context",
  "Build a clearer record",
  ...LEGAL_CLARITY_CHALLENGES.flatMap((challenge) => [challenge.statement, challenge.feedback]),
];

for (const language of ["hi", "hinglish"] as const) {
  for (const copy of localizableCopy) {
    assert.notEqual(translateUiText(copy, language), copy, `${language} must localize legal-literacy copy: ${copy}`);
  }
}

process.stdout.write(`Legal clarity sprint contract passed: ${8 + localizableCopy.length * 2}/${8 + localizableCopy.length * 2}\n`);
