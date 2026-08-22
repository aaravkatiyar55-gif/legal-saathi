"use client";

import Link from "next/link";
import { useState } from "react";
import InterfaceTranslator from "@/components/InterfaceTranslator";
import { appLanguages, languageLabel, translateUiText, type AppLanguage } from "@/lib/i18n";
import DataRightsActions from "@/components/DataRightsActions";

export type PolicySection = { heading: string; paragraphs?: string[]; items?: string[] };

export default function PublicPolicyPage({
  title,
  summary,
  sections,
  dataRightsAction,
}: {
  title: string;
  summary: string;
  sections: PolicySection[];
  dataRightsAction?: "export" | "deletion";
}) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const t = (text: string) => translateUiText(text, language);

  return (
    <main className="public-policy-shell">
      <InterfaceTranslator language={language} />
      <header className="public-policy-header">
        <Link href="/" className="public-policy-brand">Legal Saathi</Link>
        <div className="public-policy-header-actions">
          <span>{t("General legal information and preparation help")}</span>
          <label className="public-policy-language">
            <span>{t("Language")}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as AppLanguage)}>
              {appLanguages.map((option) => <option key={option} value={option}>{languageLabel(option)}</option>)}
            </select>
          </label>
        </div>
      </header>
      <article className="public-policy-content">
        <p className="case-hub-kicker">{t("Legal Saathi public information")}</p>
        <h1>{t(title)}</h1>
        <p className="public-policy-summary">{t(summary)}</p>
        {sections.map((section) => (
          <section key={section.heading}>
            <h2>{t(section.heading)}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{t(paragraph)}</p>)}
            {section.items && <ul>{section.items.map((item) => <li key={item}>{t(item)}</li>)}</ul>}
          </section>
        ))}
        <footer><Link href="/">{t("Return to Legal Saathi")}</Link><a href="mailto:inceptionaistudios@gmail.com">{t("Support")}</a></footer>
      </article>
      {dataRightsAction && <div className="public-policy-floating-action"><DataRightsActions action={dataRightsAction} language={language} /></div>}
    </main>
  );
}
