import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_PREPARATION_NOTE, formatPreparationNote, hasPreparationNote } from "./preparationNote";

const labels = { title: "Preparation", timeline: "Dates", records: "Records", question: "Question", boundary: "Personal draft; not legal advice." };

test("empty or whitespace-only notes cannot be exported", () => {
  assert.equal(hasPreparationNote(EMPTY_PREPARATION_NOTE), false);
  assert.equal(hasPreparationNote({ timeline: " \n", records: "", question: "\t" }), false);
  assert.equal(hasPreparationNote({ ...EMPTY_PREPARATION_NOTE, question: "What should I prepare?" }), true);
});

test("export preserves multiline Hindi and excludes unfilled sections", () => {
  const output = formatPreparationNote({ timeline: "  १ जून: भुगतान किया\n२ जून: जवाब नहीं मिला  ", records: "", question: "कौन से रिकॉर्ड रखूँ?" }, labels);
  assert.ok(output.includes("१ जून: भुगतान किया\n२ जून: जवाब नहीं मिला"));
  assert.ok(output.includes("कौन से रिकॉर्ड रखूँ?"));
  assert.ok(!output.includes("Records"));
  assert.ok(output.endsWith(`${labels.boundary}\n`));
});

test("user text remains plain text, including markup and spreadsheet prefixes", () => {
  const question = '=SUM(1,2)\n<script>alert("example")</script>';
  assert.ok(formatPreparationNote({ ...EMPTY_PREPARATION_NOTE, question }, labels).includes(question));
});
