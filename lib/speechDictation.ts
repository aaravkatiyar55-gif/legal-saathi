import type { AppLanguage } from "@/lib/i18n/types";

export type DictationState =
  | "idle"
  | "requesting"
  | "listening"
  | "transcribing"
  | "stopped"
  | "cancelled"
  | "error";

export function dictationLocale(language: AppLanguage) {
  if (language === "hi") return "hi-IN";
  // en-IN preserves English and Roman-script Hinglish more reliably than
  // forcing Devanagari output. Browser engines may still vary by vendor.
  return "en-IN";
}

export function joinDictationText(existing: string, transcript: string) {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return existing;
  if (!existing) return cleanTranscript;
  const separator = /\s$/.test(existing) ? "" : " ";
  return `${existing}${separator}${cleanTranscript}`;
}

export function uniqueDictationTranscript(previous: string, next: string) {
  const cleanNext = next.trim();
  if (!cleanNext) return previous;
  const cleanPrevious = previous.trim();
  if (cleanPrevious === cleanNext) return previous;
  if (cleanPrevious.endsWith(cleanNext)) return previous;
  return cleanNext;
}

export function dictationText(language: AppLanguage, key: "idle" | "requesting" | "listening" | "transcribing" | "stopped" | "cancelled" | "error" | "unsupported" | "permission" | "noSpeech" | "noMicrophone" | "network" | "failed" | "busy") {
  const values = language === "hi" ? {
    idle: "बोलकर लिखें", requesting: "माइक्रोफ़ोन अनुमति मांगी जा रही है", listening: "सुन रहा हूं", transcribing: "ट्रांसक्रिप्ट पूरा हो रहा है", stopped: "डिक्टेशन रुक गया", cancelled: "डिक्टेशन रद्द किया गया", error: "डिक्टेशन उपलब्ध नहीं है",
    unsupported: "इस ब्राउज़र में वॉइस डिक्टेशन समर्थित नहीं है। आप सामान्य रूप से टाइप कर सकते हैं।", permission: "माइक्रोफ़ोन की अनुमति नहीं मिली। डिक्टेशन के लिए ब्राउज़र में माइक्रोफ़ोन अनुमति दें।", noSpeech: "कोई आवाज़ नहीं मिली। कृपया फिर से कोशिश करें।", noMicrophone: "कोई उपलब्ध माइक्रोफ़ोन नहीं मिला।", network: "ब्राउज़र की स्पीच सेवा तक पहुंच नहीं हो सकी।", failed: "इस ब्राउज़र में डिक्टेशन पूरा नहीं हो सका।", busy: "एक और डिक्टेशन अनुरोध सक्रिय है। पहले उसे रोकें।",
  } : language === "hinglish" ? {
    idle: "Bolkar likhein", requesting: "Microphone permission maangi ja rahi hai", listening: "Sun raha hoon", transcribing: "Transcript complete ho raha hai", stopped: "Dictation ruk gaya", cancelled: "Dictation cancel ho gaya", error: "Dictation available nahi hai",
    unsupported: "Is browser mein voice dictation supported nahi hai. Aap normally type kar sakte hain.", permission: "Microphone permission deny ho gayi. Dictation ke liye browser mein microphone allow karein.", noSpeech: "Koi speech detect nahi hui. Please dobara try karein.", noMicrophone: "Koi available microphone nahi mila.", network: "Browser speech service tak pahunch nahi ho saki.", failed: "Is browser mein dictation complete nahi ho saka.", busy: "Ek aur dictation request active hai. Pehle use stop karein.",
  } : {
    idle: "Dictate", requesting: "Requesting microphone permission", listening: "Listening", transcribing: "Finishing transcript", stopped: "Dictation stopped", cancelled: "Dictation cancelled", error: "Dictation unavailable",
    unsupported: "Speech recognition is not supported by this browser. You can continue typing normally.", permission: "Microphone permission was denied. Allow microphone access in your browser to dictate.", noSpeech: "No speech was detected. Please try again.", noMicrophone: "No available microphone was found.", network: "The browser speech service could not be reached.", failed: "Dictation could not be completed in this browser.", busy: "Another dictation request is already active. Stop it before starting again.",
  };
  return values[key];
}
