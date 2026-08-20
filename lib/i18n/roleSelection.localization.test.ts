import assert from "node:assert/strict";
import { translateUiText } from ".";

const roleSelectionStrings = [
  "Choose the path that fits your legal situation.",
  "Language",
  "Continue as a legal professional",
  "I'm a Legal Professional",
  "Organise your preparation and questions before speaking with a client, court, or colleague.",
  "Continue as someone seeking legal help",
  "I Need Legal Help",
  "Start with general legal information and prepare questions for a qualified advocate.",
  "Legal Saathi provides general legal information, not legal representation. Do not share passwords, bank details, or highly sensitive identity information.",
  "For immediate danger or urgent legal action, contact official emergency help or a qualified legal professional.",
  "Legal information links",
  "Terms",
  "Privacy",
];

let assertions = 0;
const missing: string[] = [];
for (const language of ["hi", "hinglish"] as const) {
  for (const source of roleSelectionStrings) {
    const translated = translateUiText(source, language);
    if (translated === source) missing.push(`${language}: ${source}`);
    assertions += 1;
  }
}

assert.deepEqual(missing, [], `Role-selection copy must be localized:\n${missing.join("\n")}`);
console.info(`Role selection localization coverage: PASS ${assertions}/${assertions}`);
