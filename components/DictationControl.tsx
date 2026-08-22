"use client";

import { Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppLanguage } from "@/lib/i18n/types";
import { dictationLocale, dictationText, DictationState, joinDictationText, uniqueDictationTranscript } from "@/lib/speechDictation";

interface RecognitionAlternativeLike {
  transcript: string;
}

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: RecognitionAlternativeLike;
}

interface RecognitionEventLike extends Event {
  readonly results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

interface DictationControlProps {
  value: string;
  onChange: (value: string) => void;
  language: AppLanguage;
  disabled?: boolean;
  onMessage?: (message: string) => void;
  className?: string;
}

function errorMessage(code: string, language: AppLanguage) {
  if (code === "not-allowed" || code === "service-not-allowed") return dictationText(language, "permission");
  if (code === "no-speech") return dictationText(language, "noSpeech");
  if (code === "audio-capture") return dictationText(language, "noMicrophone");
  if (code === "network") return dictationText(language, "network");
  return dictationText(language, "failed");
}

export default function DictationControl({
  value,
  onChange,
  language,
  disabled = false,
  onMessage,
  className = "",
}: DictationControlProps) {
  const [state, setState] = useState<DictationState>("idle");
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const baseValueRef = useRef("");
  const cancelledRef = useRef(false);
  const transcriptRef = useRef("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  const clearTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  const finishWithError = (message: string) => {
    clearTimer();
    setState("error");
    onMessage?.(message);
  };

  const beginRecognition = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      finishWithError(dictationText(language, "unsupported"));
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    baseValueRef.current = value;
    transcriptRef.current = "";
    cancelledRef.current = false;
    recognition.lang = dictationLocale(language);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setState("listening");
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += `${event.results[index][0]?.transcript ?? ""} `;
      }
      transcriptRef.current = uniqueDictationTranscript(transcriptRef.current, transcript);
      onChange(joinDictationText(baseValueRef.current, transcriptRef.current));
    };
    recognition.onerror = (event) => {
      if (cancelledRef.current || event.error === "aborted") return;
      finishWithError(errorMessage(event.error, language));
    };
    recognition.onend = () => {
      clearTimer();
      recognitionRef.current = null;
      if (!cancelledRef.current) setState((current) => current === "error" ? current : "stopped");
    };

    setState("requesting");
    try {
      recognition.start();
      timeoutRef.current = setTimeout(() => {
        if (recognitionRef.current) {
          setState("transcribing");
          recognitionRef.current.stop();
        }
      }, 60_000);
    } catch {
      recognitionRef.current = null;
      finishWithError(dictationText(language, "busy"));
    }
  };

  const requestStart = () => {
    if (disabled || state === "requesting" || state === "listening" || state === "transcribing") return;
    if (!disclosureAccepted) {
      setShowDisclosure(true);
      return;
    }
    beginRecognition();
  };

  const stop = () => {
    if (!recognitionRef.current) return;
    setState("transcribing");
    recognitionRef.current.stop();
  };

  const cancel = () => {
    cancelledRef.current = true;
    clearTimer();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    onChange(baseValueRef.current);
    setState("cancelled");
  };

  useEffect(() => {
    if (showDisclosure) acceptButtonRef.current?.focus();
  }, [showDisclosure]);

  useEffect(() => () => {
    cancelledRef.current = true;
    clearTimer();
    recognitionRef.current?.abort();
  }, []);

  const active = state === "requesting" || state === "listening" || state === "transcribing";

  return (
    <>
      <div className={`dictation-control ${active ? "active" : ""} ${className}`.trim()}>
        <button
          type="button"
          className="legal-ai-dictation"
          aria-label={active ? dictationText(language, state) : dictationText(language, "idle")}
          aria-pressed={active}
          disabled={disabled || state === "requesting" || state === "transcribing"}
          onClick={active ? stop : requestStart}
          title={active ? dictationText(language, state) : dictationText(language, "idle")}
        >
          {active ? <Square size={15} /> : <Mic size={18} />}
        </button>
        {active && (
          <>
            <span className="dictation-status" role="status">
              <span className="dictation-pulse" aria-hidden="true" />
              {dictationText(language, state)}
            </span>
            <button type="button" className="dictation-cancel" onClick={cancel} aria-label="Cancel dictation and discard its transcript">
              <X size={15} />
            </button>
          </>
        )}
      </div>

      {showDisclosure && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowDisclosure(false);
        }}>
          <section className="modal-content dictation-disclosure" role="dialog" aria-modal="true" aria-labelledby="dictation-disclosure-title" onKeyDown={(event) => {
            if (event.key === "Escape") setShowDisclosure(false);
          }}>
            <h2 id="dictation-disclosure-title">Use voice dictation?</h2>
            <p>
              Your browser or its speech vendor may process microphone audio to create text. Legal Saathi does not upload or permanently store audio in this browser dictation mode. Review the Privacy Notice before continuing.
            </p>
            <p className="dictation-disclosure-note">The transcript is inserted into the composer for you to review and edit. It is never sent automatically.</p>
            <div className="dictation-disclosure-actions">
              <button type="button" className="btn" onClick={() => setShowDisclosure(false)}>Cancel</button>
              <button ref={acceptButtonRef} type="button" className="btn-primary" onClick={() => {
                setDisclosureAccepted(true);
                setShowDisclosure(false);
                window.setTimeout(beginRecognition, 0);
              }}>Continue with microphone</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
