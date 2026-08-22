import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Node's standalone type-stripping test runner requires the source extension.
import { dictationLocale, dictationText, joinDictationText, uniqueDictationTranscript } from "./speechDictation.ts";

assert.equal(dictationLocale("en"), "en-IN");
assert.equal(dictationLocale("hinglish"), "en-IN");
assert.equal(dictationLocale("hi"), "hi-IN");
assert.equal(joinDictationText("Existing text", "new words"), "Existing text new words");
assert.equal(joinDictationText("Existing text ", "new words"), "Existing text new words");
assert.equal(joinDictationText("Existing text", ""), "Existing text");
assert.equal(uniqueDictationTranscript("final words", "final words"), "final words");
assert.equal(uniqueDictationTranscript("first words", "first words next"), "first words next");
assert.match(dictationText("hi", "permission"), /माइक्रोफ़ोन/u);
assert.match(dictationText("hinglish", "noSpeech"), /speech/i);

const source = readFileSync(new URL("../components/DictationControl.tsx", import.meta.url), "utf8");
assert.match(source, /SpeechRecognition/);
assert.match(source, /60_000/);
assert.match(source, /recognitionRef\.current\?\.abort/);
assert.ok(!/MediaRecorder|fetch\(|localStorage|sessionStorage/.test(source));
assert.match(source, /It is never sent automatically/);

console.log("Dictation locales, text preservation, timeout, cleanup, disclosure, and no-upload contract: PASS");
