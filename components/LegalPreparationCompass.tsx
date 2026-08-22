"use client";

import { CheckCircle2, ClipboardList, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AppLanguage } from "@/lib/i18n";
import {
  entryJourneyMessage,
  preparationChecklistMessage,
  preparationProgressMessage,
  preparationScenarioMessage,
} from "@/lib/i18n/entryJourneyMessages";

export const LEGAL_PREPARATION_PROMPTS = [
  { id: "consumer", title: "A consumer purchase went wrong", summary: "A product or service did not match what was promised.", prompt: "What proof and dates should I collect before I explore a consumer complaint?" },
  { id: "tenancy", title: "A rental issue is escalating", summary: "A tenant or landlord needs a clear, factual record before the next conversation.", prompt: "How can I organise a rental disagreement before I speak with the other side or an advocate?" },
  { id: "workplace", title: "A workplace payment is delayed", summary: "Salary, notice, or employment terms need a timeline before any next step.", prompt: "What details should I put in order before I ask about a delayed salary or employment issue?" },
  { id: "agreement", title: "An agreement needs a closer look", summary: "A document can be prepared for a focused clause, risk, and question review.", prompt: "What should I identify before I ask for a plain-language review of an agreement?" },
] as const;

export const LEGAL_PREPARATION_CHECKLIST = [
  "I can describe what happened in date order.",
  "I know which records I may be allowed to share.",
  "I can name the outcome or question I need help preparing for.",
] as const;

export function getPreparationProgressLabel(completed: number) {
  const boundedCompleted = Math.min(Math.max(Math.floor(completed), 0), LEGAL_PREPARATION_CHECKLIST.length);
  return `${boundedCompleted} of ${LEGAL_PREPARATION_CHECKLIST.length} preparation checks noted`;
}

interface LegalPreparationCompassProps {
  language: AppLanguage;
}

export default function LegalPreparationCompass({ language }: LegalPreparationCompassProps) {
  const [activePromptId, setActivePromptId] = useState<(typeof LEGAL_PREPARATION_PROMPTS)[number]["id"]>("consumer");
  const [completedChecks, setCompletedChecks] = useState<ReadonlySet<number>>(() => new Set());
  const activePrompt = LEGAL_PREPARATION_PROMPTS.find((prompt) => prompt.id === activePromptId) ?? LEGAL_PREPARATION_PROMPTS[0];
  const copy = (key: Parameters<typeof entryJourneyMessage>[1]) => entryJourneyMessage(language, key);

  const toggleCheck = (index: number) => {
    setCompletedChecks((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <section className="legal-preparation-compass" aria-labelledby="preparation-compass-title">
      <div className="legal-preparation-compass-heading">
        <span className="legal-preparation-compass-kicker"><Sparkles size={15} aria-hidden="true" />{copy("preparation.kicker")}</span>
        <h2 id="preparation-compass-title">{copy("preparation.heading")}</h2>
        <p>{copy("preparation.intro")}</p>
      </div>

      <div className="legal-preparation-compass-body">
        <div className="legal-preparation-prompt-picker" aria-label={copy("preparation.scenarioPicker")}>
          {LEGAL_PREPARATION_PROMPTS.map((prompt) => {
            const localizedPrompt = preparationScenarioMessage(language, prompt.id);
            return (
            <button key={prompt.id} type="button" className={prompt.id === activePrompt.id ? "legal-preparation-prompt is-active" : "legal-preparation-prompt"} aria-pressed={prompt.id === activePrompt.id} onClick={() => setActivePromptId(prompt.id)}>
              <strong>{localizedPrompt.title}</strong>
              <span>{localizedPrompt.summary}</span>
            </button>
            );
          })}
        </div>

        <div className="legal-preparation-scenario" aria-live="polite">
          <div className="legal-preparation-scenario-icon" aria-hidden="true"><ClipboardList size={19} /></div>
          <p className="legal-preparation-scenario-label">{copy("preparation.scenarioLabel")}</p>
          <p className="legal-preparation-scenario-prompt">{preparationScenarioMessage(language, activePrompt.id).question}</p>
          <p className="legal-preparation-scenario-note">{copy("preparation.adaptationNote")}</p>
        </div>

        <div className="legal-preparation-checklist">
          <div className="legal-preparation-checklist-heading">
            <div>
              <p className="legal-preparation-scenario-label">{copy("preparation.checklistTitle")}</p>
              <p>{copy("preparation.checklistNote")}</p>
            </div>
            <span aria-live="polite">{preparationProgressMessage(language, completedChecks.size, LEGAL_PREPARATION_CHECKLIST.length)}</span>
          </div>
          <ul>
            {LEGAL_PREPARATION_CHECKLIST.map((item, index) => (
              <li key={item}>
                <label>
                  <input type="checkbox" checked={completedChecks.has(index)} onChange={() => toggleCheck(index)} />
                  <span className="legal-preparation-checkbox" aria-hidden="true"><CheckCircle2 size={16} /></span>
                  <span>{preparationChecklistMessage(language, index)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
