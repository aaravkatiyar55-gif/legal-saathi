import assert from "node:assert/strict";

import {
  caseJourneyStepMessage,
  clarityChallengeMessage,
  entryJourneyMessage,
  entryJourneyMessageKeys,
  preparationChecklistMessage,
  preparationProgressMessage,
  preparationScenarioMessage,
} from "./entryJourneyMessages";

for (const language of ["en", "hi", "hinglish"] as const) {
  for (const key of entryJourneyMessageKeys) {
    const message = entryJourneyMessage(language, key, { completed: 1, total: 3 });
    assert.ok(message.trim().length > 0, `${language} needs a non-empty entry journey message for ${key}.`);
    assert.ok(!message.includes("{completed}"), `${language} should interpolate completed values for ${key}.`);
    assert.ok(!message.includes("{total}"), `${language} should interpolate total values for ${key}.`);
  }
}

assert.equal(preparationProgressMessage("en", 2, 3), "2 of 3 preparation checks noted");
assert.equal(preparationProgressMessage("hi", 2, 3), "3 में से 2 तैयारी जांच दर्ज");
assert.equal(preparationProgressMessage("hinglish", 2, 3), "3 mein se 2 preparation checks noted");

for (const language of ["en", "hi", "hinglish"] as const) {
  for (const scenario of ["consumer", "tenancy", "workplace", "agreement"] as const) {
    const copy = preparationScenarioMessage(language, scenario);
    assert.ok(copy.title && copy.summary && copy.question, `${language} needs all preparation scenario fields for ${scenario}.`);
  }

  for (const index of [0, 1, 2]) {
    assert.ok(preparationChecklistMessage(language, index).trim(), `${language} needs preparation checklist item ${index}.`);
  }

  for (const challenge of ["screenshot", "promise", "timeline"] as const) {
    const copy = clarityChallengeMessage(language, challenge);
    assert.ok(copy.statement && copy.feedback, `${language} needs clarity challenge copy for ${challenge}.`);
  }

  for (const step of ["intake", "record", "gaps", "sources", "handoff"] as const) {
    const copy = caseJourneyStepMessage(language, step);
    assert.ok(copy.title && copy.description, `${language} needs journey copy for ${step}.`);
  }
}

process.stdout.write(`Entry journey message contract passed: ${entryJourneyMessageKeys.length * 3 + 43}/${entryJourneyMessageKeys.length * 3 + 43}\n`);
