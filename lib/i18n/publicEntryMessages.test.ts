import assert from "node:assert/strict";

import {
  publicEntryMessage,
  publicEntryMessageKeys,
} from "./publicEntryMessages";

assert.equal(publicEntryMessageKeys.length, 14, "The public entry screen should keep a deliberate, reviewable copy inventory.");

for (const language of ["en", "hi", "hinglish"] as const) {
  for (const key of publicEntryMessageKeys) {
    const message = publicEntryMessage(language, key);
    assert.ok(message.trim().length > 0, `${language} message ${key} must not be empty.`);
  }
}

for (const key of publicEntryMessageKeys) {
  assert.notEqual(publicEntryMessage("hi", key), publicEntryMessage("en", key), `${key} needs Hindi product copy.`);
  assert.notEqual(publicEntryMessage("hinglish", key), publicEntryMessage("en", key), `${key} needs Hinglish product copy.`);
}

process.stdout.write(`Public entry message contract passed: ${publicEntryMessageKeys.length * 5 + 1}/${publicEntryMessageKeys.length * 5 + 1}\n`);
