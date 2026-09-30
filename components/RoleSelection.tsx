import { Scale, Shield } from "lucide-react";
import { appLanguages, languageLabel, type AppLanguage } from "@/lib/i18n";
import { publicEntryMessage } from "@/lib/i18n/publicEntryMessages";
import LegalCaseJourney from "./LegalCaseJourney";
import LegalClaritySprint from "./LegalClaritySprint";
import LegalPreparationCompass from "./LegalPreparationCompass";
import PreparationNote, { preparationNoteCopy } from "./PreparationNote";
import styles from "./RoleSelection.module.css";

interface RoleSelectionProps {
  onSelectRole: (role: "normal" | "lawyer") => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
}

export default function RoleSelection({ onSelectRole, language, onLanguageChange }: RoleSelectionProps) {
  const copy = (key: Parameters<typeof publicEntryMessage>[1]) => publicEntryMessage(language, key);
  const tools = preparationNoteCopy[language];

  return (
    <main className={styles.shell}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Legal Saathi</h1>
          <p className={styles.byline}>{copy("brand.byline")}</p>
          <p className={styles.intro}>{copy("entry.heading")}</p>
        </header>

        <label className={styles.languageControl}>
          <span>{copy("entry.language")}</span>
          <select value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
            {appLanguages.map((option) => <option key={option} value={option}>{languageLabel(option)}</option>)}
          </select>
        </label>

        <section className={styles.cards} aria-label={copy("entry.heading")}>
          <button
            type="button"
            className={styles.roleCard}
            onClick={() => onSelectRole("lawyer")}
            aria-label={copy("entry.professional.aria")}
          >
            <Scale size={40} aria-hidden="true" />
            <h2>{copy("entry.professional.title")}</h2>
            <p>{copy("entry.professional.description")}</p>
          </button>

          <button
            type="button"
            className={styles.roleCard}
            onClick={() => onSelectRole("normal")}
            aria-label={copy("entry.public.aria")}
          >
            <Shield size={40} aria-hidden="true" />
            <h2>{copy("entry.public.title")}</h2>
            <p>{copy("entry.public.description")}</p>
          </button>
        </section>

        <nav className={styles.tools} aria-label={tools.nav}>
          <a href="#prepare">01 / {tools.checklist}</a>
          <a href="#clarity">02 / {tools.exercise}</a>
          <a href="#journey">03 / {tools.journey}</a>
          <a href="#note">04 / {tools.note}</a>
        </nav>
        <div id="prepare" className={styles.toolSection}><LegalPreparationCompass language={language} /></div>
        <div id="clarity" className={styles.toolSection}><LegalClaritySprint language={language} /></div>
        <div id="journey" className={styles.toolSection}><LegalCaseJourney language={language} /></div>
        <div id="note" className={styles.toolSection}><PreparationNote language={language} /></div>

        <footer className={styles.footer}>
          <p>{copy("entry.boundary")}</p>
          <p>{copy("entry.urgent")}</p>
          <nav aria-label={copy("entry.links")}>
            <a href="/terms">{copy("entry.terms")}</a>
            <a href="/privacy">{copy("entry.privacy")}</a>
          </nav>
        </footer>
      </div>
    </main>
  );
}
