import { BookOpen, Briefcase, FolderOpen, MessageSquare, Search } from "lucide-react";
import { translateUiText, type AppLanguage } from "@/lib/i18n";

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
  const t = (text: string) => translateUiText(text, language);

  return (
    <section className="legal-case-journey" aria-labelledby="legal-case-journey-title">
      <div className="legal-case-journey-heading">
        <span className="legal-case-journey-kicker">{t("A continuous case journey")}</span>
        <h2 id="legal-case-journey-title">{t("From first explanation to an advocate-ready brief")}</h2>
        <p>{t("Legal Saathi keeps the work around one matter connected instead of ending at a single chat reply.")}</p>
      </div>

      <ol className="legal-case-journey-steps">
        {LEGAL_CASE_JOURNEY_STEPS.map((step, index) => {
          const Icon = journeyIcons[step.id];
          return (
            <li key={step.id}>
              <span className="legal-case-journey-marker" aria-hidden="true">
                <Icon size={18} strokeWidth={1.8} />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </span>
              <h3>{t(step.title)}</h3>
              <p>{t(step.description)}</p>
            </li>
          );
        })}
      </ol>

      <ul className="legal-case-journey-guardrails" aria-label={t("Trust boundaries")}>
        <li>{t("Your facts stay editable")}</li>
        <li>{t("Sources remain traceable")}</li>
        <li>{t("Professional review stays in the loop")}</li>
      </ul>
    </section>
  );
}
