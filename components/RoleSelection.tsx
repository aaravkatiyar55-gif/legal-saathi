import { Scale, Shield } from "lucide-react";
import { useEffect } from "react";
import { appLanguages, languageLabel, translateUiText, type AppLanguage } from "@/lib/i18n";
import { appCopy, publicLanguageHref, syncDocumentLanguage } from "@/lib/i18n/appCopy";

interface RoleSelectionProps {
  onSelectRole: (role: "normal" | "lawyer") => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
}

export default function RoleSelection({ onSelectRole, language, onLanguageChange }: RoleSelectionProps) {
  useEffect(() => {
    syncDocumentLanguage(language);
  }, [language]);

  const handleSelect = (role: "normal" | "lawyer") => {
    onSelectRole(role);
  };
  const t = (text: string) => translateUiText(text, language);

  return (
    <div className="role-selection">
      <header className="role-selection-header fade-in-down">
        <h1>Legal Saathi</h1>
        <p className="text-secondary">by inceptionaistudios</p>
        <p className="role-selection-intro">{t("Choose the path that fits your legal situation.")}</p>
      </header>

      <label className="role-selection-language fade-in" style={{ animationDelay: "0.15s" }}>
        <span>{t("Language")}</span>
        <select value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
          {appLanguages.map((option) => <option key={option} value={option}>{languageLabel(option)}</option>)}
        </select>
      </label>
      
      <div className="role-cards">
        <button
          type="button"
          className="role-card fade-in-up" 
          style={{ animationDelay: "0.2s" }}
          onClick={() => handleSelect("lawyer")}
          aria-label={t("Continue as a legal professional")}
        >
          <Scale size={48} style={{ marginBottom: "1rem" }} />
          <h2>{t("I'm a Legal Professional")}</h2>
          <p>{t("Organise your preparation and questions before speaking with a client, court, or colleague.")}</p>
        </button>
        
        <button
          type="button"
          className="role-card fade-in-up" 
          style={{ animationDelay: "0.3s" }}
          onClick={() => handleSelect("normal")}
          aria-label={t("Continue as someone seeking legal help")}
        >
          <Shield size={48} style={{ marginBottom: "1rem" }} />
          <h2>{t("I Need Legal Help")}</h2>
          <p>{t("Start with general legal information and prepare questions for a qualified advocate.")}</p>
        </button>
      </div>
      
      <footer className="role-selection-footer fade-in" style={{ animationDelay: "0.6s" }}>
        <p>{t("Legal Saathi provides general legal information, not legal representation. Do not share passwords, bank details, or highly sensitive identity information.")}</p>
        <p>{t("For immediate danger or urgent legal action, contact official emergency help or a qualified legal professional.")}</p>
        <nav aria-label={t("Legal information links")}>
          <a href={publicLanguageHref("/how-it-works", language)}>{appCopy(language, "entry.howItWorks")}</a>
          <a href={publicLanguageHref("/terms", language)}>{t("Terms")}</a>
          <a href={publicLanguageHref("/privacy", language)}>{t("Privacy")}</a>
        </nav>
      </footer>
    </div>
  );
}
