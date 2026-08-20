"use client";

import { useEffect, useState } from "react";
import { appCopy, appLanguageChangeEvent, currentDocumentAppLanguage, documentLanguageFor } from "@/lib/i18n/appCopy";
import type { AppLanguage } from "@/lib/i18n";

export default function GlobalRootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = error.digest && /^[A-Za-z0-9_-]{8,120}$/.test(error.digest) ? error.digest.slice(0, 18) : "root-render-error";
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const applyLanguage = (next?: AppLanguage) => setLanguage(next ?? currentDocumentAppLanguage());
    const onLanguageChange = (event: Event) => applyLanguage((event as CustomEvent<AppLanguage>).detail);
    applyLanguage();
    document.addEventListener(appLanguageChangeEvent, onLanguageChange);
    return () => document.removeEventListener(appLanguageChangeEvent, onLanguageChange);
  }, []);

  return (
    <html lang={documentLanguageFor(language)}>
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#07111f", color: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}>
        <main role="alertdialog" aria-labelledby="root-error-title" style={{ width: "min(460px, 100%)", padding: "1.5rem", border: "1px solid rgba(148,163,184,.22)", borderRadius: 8, background: "#111827" }}>
          <p style={{ color: "#94a3b8" }}>Legal Saathi</p>
          <h1 id="root-error-title" style={{ fontSize: "1.5rem" }}>{appCopy(language, "error.unexpectedTitle")}</h1>
          <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>{appCopy(language, "error.genericActionFailure")}</p>
          <code style={{ display: "block", marginBottom: "1rem", color: "#94a3b8" }}>{appCopy(language, "error.reference")}: {reference}</code>
          <button type="button" onClick={reset} style={{ border: 0, borderRadius: 8, padding: ".7rem 1rem", background: "#2563eb", color: "white", cursor: "pointer" }}>{appCopy(language, "error.tryAgain")}</button>
        </main>
      </body>
    </html>
  );
}

