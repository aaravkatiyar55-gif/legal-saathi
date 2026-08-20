import assert from "node:assert/strict";
import { helpAvailabilityNotice } from "./helpContent";
import { translateUiText } from "./i18n";

const publicJourney = "Start with general legal information and prepare questions for a qualified advocate.";
const professionalJourney = "Organise your preparation and questions before speaking with a client, court, or colleague.";
const sensitiveDataNotice = "Share only what is necessary for your question. Do not include passwords, bank or card details, or government identity numbers.";
const guidedFlowCopy = [
  "Ask a legal question",
  "Start with the facts, jurisdiction, and outcome you need.",
  "Analyse a document",
  "Attach one document and ask what it means for your situation.",
  "Research current law",
  "Prepare a current-law question for review before it is sent.",
  "Review an agreement",
  "Attach an agreement for a focused clause and risk review.",
  "Draft a legal document",
  "Prepare an editable draft from your facts; nothing is sent or filed automatically.",
  "Prepare a case",
  "Open the existing protected Case Workspace intake.",
  "Compare documents",
  "Attach the first document, then add the second in Case Workspace before asking for a comparison.",
];

for (const language of ["hinglish", "hi"] as const) {
  assert.notEqual(translateUiText(publicJourney, language), publicJourney);
  assert.notEqual(translateUiText(professionalJourney, language), professionalJourney);
  assert.notEqual(translateUiText(sensitiveDataNotice, language), sensitiveDataNotice);
  assert.ok(helpAvailabilityNotice[language].length > 80);
  for (const text of guidedFlowCopy) assert.notEqual(translateUiText(text, language), text);
}

assert.match(helpAvailabilityNotice.en, /visible state/i);

process.stdout.write("Onboarding safety copy tests passed: 37/37\n");
