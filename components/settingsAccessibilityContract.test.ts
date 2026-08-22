import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

async function run() {
  const source = await readFile(fileURLToPath(new URL("./SettingsModal.tsx", import.meta.url)), "utf8");

  assert.match(source, /className="settings-theme-choice" type="button" aria-pressed=/, "Theme choices must remain keyboard-operable buttons.");
  assert.match(source, /className="settings-color-swatch"\s+type="button"/, "Color choices must remain keyboard-operable buttons.");
  assert.match(source, /htmlFor="settings-display-name"/, "Display-name label must be associated with its input.");
  assert.match(source, /id="settings-display-name"/, "Display-name input must retain its stable label target.");
  assert.match(source, /htmlFor="settings-nickname"/, "Nickname label must be associated with its input.");
  assert.match(source, /htmlFor="settings-email"/, "Email label must be associated with its input.");
  assert.match(source, /aria-label="Font size"/, "The font-size range needs a programmatic name.");

  process.stdout.write("Settings accessibility contract passed: 7/7\n");
}

void run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
