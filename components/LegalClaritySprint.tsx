"use client";

import { CircleCheckBig, Lightbulb, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AppLanguage } from "@/lib/i18n";
import { clarityChallengeMessage, entryJourneyMessage } from "@/lib/i18n/entryJourneyMessages";

export type LegalClarityChoice = "context" | "record";

export const LEGAL_CLARITY_CHALLENGES = [
  {
    id: "screenshot",
    statement: "A screenshot is always enough proof.",
    correctChoice: "context" as const,
    feedback: "Not always. The date, source, full conversation, and how it was obtained can matter too.",
  },
  {
    id: "promise",
    statement: "A spoken promise can never matter.",
    correctChoice: "context" as const,
    feedback: "Not always. Keep the exact words, who was present, and any follow-up messages in one place before asking for guidance.",
  },
  {
    id: "timeline",
    statement: "A short date-by-date timeline can make a legal question clearer.",
    correctChoice: "record" as const,
    feedback: "Yes. A simple factual timeline often helps you explain the issue without sharing more personal information than needed.",
  },
] as const;

export function getClaritySprintFeedback(challengeId: string, choice: LegalClarityChoice) {
  const challenge = LEGAL_CLARITY_CHALLENGES.find((item) => item.id === challengeId);
  if (!challenge) throw new Error(`Unknown legal clarity challenge: ${challengeId}`);

  return {
    isCorrect: choice === challenge.correctChoice,
    message: challenge.feedback,
  };
}

interface LegalClaritySprintProps {
  language: AppLanguage;
}

export default function LegalClaritySprint({ language }: LegalClaritySprintProps) {
  const [answers, setAnswers] = useState<Partial<Record<(typeof LEGAL_CLARITY_CHALLENGES)[number]["id"], LegalClarityChoice>>>({});
  const copy = (key: Parameters<typeof entryJourneyMessage>[1]) => entryJourneyMessage(language, key);

  return (
    <section className="legal-clarity-sprint" aria-labelledby="legal-clarity-sprint-title">
      <div className="legal-clarity-sprint-heading">
        <span className="legal-clarity-sprint-kicker"><Sparkles size={15} aria-hidden="true" />{copy("clarity.kicker")}</span>
        <h2 id="legal-clarity-sprint-title">{copy("clarity.heading")}</h2>
        <p>{copy("clarity.intro")}</p>
      </div>

      <ol className="legal-clarity-sprint-list">
        {LEGAL_CLARITY_CHALLENGES.map((challenge, index) => {
          const selectedChoice = answers[challenge.id];
          const feedback = selectedChoice ? getClaritySprintFeedback(challenge.id, selectedChoice) : null;
          const localizedChallenge = clarityChallengeMessage(language, challenge.id);

          return (
            <li key={challenge.id} className="legal-clarity-challenge">
              <span className="legal-clarity-challenge-index" aria-hidden="true">0{index + 1}</span>
              <div>
                <p className="legal-clarity-challenge-label">{copy("clarity.scenario")}</p>
                <h3>{localizedChallenge.statement}</h3>
                <div className="legal-clarity-choice-row" aria-label={copy("clarity.choose")}>
                  <button
                    type="button"
                    className={selectedChoice === "context" ? "legal-clarity-choice is-selected" : "legal-clarity-choice"}
                    aria-pressed={selectedChoice === "context"}
                    onClick={() => setAnswers((current) => ({ ...current, [challenge.id]: "context" }))}
                  >
                    {copy("clarity.context")}
                  </button>
                  <button
                    type="button"
                    className={selectedChoice === "record" ? "legal-clarity-choice is-selected" : "legal-clarity-choice"}
                    aria-pressed={selectedChoice === "record"}
                    onClick={() => setAnswers((current) => ({ ...current, [challenge.id]: "record" }))}
                  >
                    {copy("clarity.record")}
                  </button>
                </div>
                {feedback && (
                  <p className={feedback.isCorrect ? "legal-clarity-feedback is-correct" : "legal-clarity-feedback"} aria-live="polite">
                    {feedback.isCorrect ? <CircleCheckBig size={16} aria-hidden="true" /> : <Lightbulb size={16} aria-hidden="true" />}
                    {localizedChallenge.feedback}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
