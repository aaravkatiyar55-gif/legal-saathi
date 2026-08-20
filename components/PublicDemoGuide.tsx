"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { appLanguages, languageLabel, type AppLanguage } from "@/lib/i18n";
import { appCopy, appLanguageFromSearch, publicLanguageHref, syncDocumentLanguage } from "@/lib/i18n/appCopy";
import { getHowItWorksContent } from "@/lib/howItWorksContent";

export default function PublicDemoGuide({ initialLanguage = "en" }: { initialLanguage?: AppLanguage }) {
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);
  const content = getHowItWorksContent(language);

  useEffect(() => {
    const languageFromUrl = appLanguageFromSearch(window.location.search);
    setLanguage(languageFromUrl ?? initialLanguage);
  }, [initialLanguage]);

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
    <main className="public-policy-shell public-guide-shell">
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

      <article className="public-policy-content public-guide-content">
        <p className="case-hub-kicker">{content.kicker}</p>
        <h1>{content.title}</h1>
        <p className="public-policy-summary">{content.summary}</p>
        <p className="public-policy-translation-note" role="note">{appCopy(language, "policy.translationNotice")}</p>

        <section aria-labelledby="guide-steps">
          <h2 id="guide-steps">{content.stepsHeading}</h2>
          <ol className="public-guide-steps">
            {content.steps.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="public-guide-grid">
          <section>
            <h2>{content.publicHeading}</h2>
            <ul>{content.publicItems.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h2>{content.accountHeading}</h2>
            <ul>{content.accountItems.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>

        <section className="public-guide-example">
          <h2>{content.exampleHeading}</h2>
          <p>{content.example}</p>
        </section>

        <section className="public-guide-urgent" aria-labelledby="guide-urgent">
          <h2 id="guide-urgent">{content.urgentHeading}</h2>
          <p>{content.urgentNotice}</p>
        </section>

        <footer>
          <nav aria-label={content.navigationAria}>
            <Link href={publicLanguageHref("/", language)}>{appCopy(language, "policy.returnHome")}</Link>
            <Link href={publicLanguageHref("/terms", language)}>{appCopy(language, "help.terms")}</Link>
            <Link href={publicLanguageHref("/privacy", language)}>{appCopy(language, "help.privacy")}</Link>
            <Link href={publicLanguageHref("/support", language)}>{appCopy(language, "policy.support")}</Link>
          </nav>
        </footer>
      </article>
    </main>
  );
}
