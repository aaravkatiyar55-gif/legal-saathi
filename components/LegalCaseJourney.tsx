import { BookOpen, Briefcase, FolderOpen, MessageSquare, Search } from "lucide-react";
import type { AppLanguage } from "@/lib/i18n";
import { caseJourneyStepMessage, entryJourneyMessage } from "@/lib/i18n/entryJourneyMessages";

export const LEGAL_CASE_JOURNEY_STEPS = [
  {
    id: "intake",
    title: "Explain the situation",
    description: "Start in plain language. Guided intake asks only for facts that affect the next step.",
  },
  {
    id: "record",
    title: "Build the case record",
    description: "Keep dates, parties, questions, and documents you choose to save in one case workspace.",
  },
  {
    id: "gaps",
    title: "Find the gaps",
    description: "Review missing information, contradictions, evidence to collect, and questions for the other side.",
  },
  {
    id: "sources",
    title: "Check the source trail",
    description: "Separate your facts, document findings, and AI-prepared material before relying on legal information.",
  },
  {
    id: "handoff",
    title: "Prepare the handoff",
    description: "Create an editable case brief for a qualified advocate; nothing is filed or sent automatically.",
  },
] as const;

const journeyIcons = {
  intake: MessageSquare,
  record: FolderOpen,
  gaps: Search,
  sources: BookOpen,
  handoff: Briefcase,
} as const;

interface LegalCaseJourneyProps {
  language: AppLanguage;
}

export default function LegalCaseJourney({ language }: LegalCaseJourneyProps) {
  const copy = (key: Parameters<typeof entryJourneyMessage>[1]) => entryJourneyMessage(language, key);

  return (
    <section className="legal-case-journey" aria-labelledby="legal-case-journey-title">
      <div className="legal-case-journey-heading">
        <span className="legal-case-journey-kicker">{copy("journey.kicker")}</span>
        <h2 id="legal-case-journey-title">{copy("journey.heading")}</h2>
        <p>{copy("journey.intro")}</p>
      </div>

      <ol className="legal-case-journey-steps">
        {LEGAL_CASE_JOURNEY_STEPS.map((step, index) => {
          const Icon = journeyIcons[step.id];
          const localizedStep = caseJourneyStepMessage(language, step.id);
          return (
            <li key={step.id}>
              <span className="legal-case-journey-marker" aria-hidden="true">
                <Icon size={18} strokeWidth={1.8} />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </span>
              <h3>{localizedStep.title}</h3>
              <p>{localizedStep.description}</p>
            </li>
          );
        })}
      </ol>

      <ul className="legal-case-journey-guardrails" aria-label={copy("journey.guardrails")}>
        <li>{copy("journey.guardrail.editable")}</li>
        <li>{copy("journey.guardrail.traceable")}</li>
        <li>{copy("journey.guardrail.review")}</li>
      </ul>
    </section>
  );
}
