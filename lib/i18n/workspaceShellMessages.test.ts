import assert from "node:assert/strict";

import {
  workspaceShellMessage,
  workspaceShellMessageKeys,
} from "./workspaceShellMessages";

assert.equal(workspaceShellMessageKeys.length, 4, "The main workspace shell should keep a small, explicit copy inventory.");

for (const language of ["en", "hi", "hinglish"] as const) {
  for (const key of workspaceShellMessageKeys) {
    const message = workspaceShellMessage(language, key);
    assert.ok(message.trim().length > 0, `${language} shell message ${key} must not be empty.`);
  }
}

for (const key of workspaceShellMessageKeys) {
  assert.notEqual(workspaceShellMessage("hi", key), workspaceShellMessage("en", key), `${key} needs Hindi workspace copy.`);
  assert.notEqual(workspaceShellMessage("hinglish", key), workspaceShellMessage("en", key), `${key} needs Hinglish workspace copy.`);
}

process.stdout.write(`Workspace shell message contract passed: ${workspaceShellMessageKeys.length * 5 + 1}/${workspaceShellMessageKeys.length * 5 + 1}\n`);
