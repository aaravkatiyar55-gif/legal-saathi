"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { appLanguages, languageLabel, type AppLanguage } from "@/lib/i18n";
import { appCopy, appLanguageFromSearch, publicLanguageHref, syncDocumentLanguage } from "@/lib/i18n/appCopy";
import { getPolicyPageContent, type PolicyPageId } from "@/lib/policyContent";

export type PolicySection = { heading: string; paragraphs?: string[]; items?: string[] };

export default function PublicPolicyPage({ page }: { page: PolicyPageId }) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const content = getPolicyPageContent(page, language);

  useEffect(() => {
    const languageFromUrl = appLanguageFromSearch(window.location.search);
    if (languageFromUrl) setLanguage(languageFromUrl);
  }, []);

  useEffect(() => {
    syncDocumentLanguage(language);
  }, [language]);

  const handleLanguageChange = (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    const nextUrl = publicLanguageHref(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      nextLanguage,
    );
    window.history.replaceState(null, "", nextUrl);
  };

  return (
    <main className="public-policy-shell">
      <header className="public-policy-header">
        <Link href={publicLanguageHref("/", language)} className="public-policy-brand">Legal Saathi</Link>
        <span>{appCopy(language, "policy.generalLegalInformation")}</span>
        <label className="public-policy-language">
          <span>{appCopy(language, "shell.language")}</span>
          <select value={language} onChange={(event) => handleLanguageChange(event.target.value as AppLanguage)} aria-label={appCopy(language, "shell.language")}>
            {appLanguages.map((option) => <option key={option} value={option}>{languageLabel(option)}</option>)}
          </select>
        </label>
      </header>
      <article className="public-policy-content">
        <p className="case-hub-kicker">{appCopy(language, "policy.publicInformation")}</p>
        <h1>{content.title}</h1>
        <p className="public-policy-summary">{content.summary}</p>
        <p className="public-policy-translation-note" role="note">{appCopy(language, "policy.translationNotice")}</p>
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>
        ))}
        <footer><Link href={publicLanguageHref("/", language)}>{appCopy(language, "policy.returnHome")}</Link><a href="mailto:inceptionaistudios@gmail.com">{appCopy(language, "policy.support")}</a></footer>
      </article>
    </main>
  );
}
