"use client";

import { useEffect, useState } from "react";
import { useSafeAppError } from "@/components/AppErrorProvider";
import { appCopy, appLanguageChangeEvent, currentDocumentAppLanguage } from "@/lib/i18n/appCopy";
import type { AppLanguage } from "@/lib/i18n";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { showSafeError } = useSafeAppError();
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const applyLanguage = (next?: AppLanguage) => setLanguage(next ?? currentDocumentAppLanguage());
    const onLanguageChange = (event: Event) => applyLanguage((event as CustomEvent<AppLanguage>).detail);
    applyLanguage();
    document.addEventListener(appLanguageChangeEvent, onLanguageChange);
    return () => document.removeEventListener(appLanguageChangeEvent, onLanguageChange);
  }, []);

  useEffect(() => {
    const referenceId = error.digest && /^[A-Za-z0-9_-]{8,120}$/.test(error.digest) ? error.digest : crypto.randomUUID();
    showSafeError({ referenceId, errorCode: "REACT_ROUTE_ERROR", httpStatus: 0, routeCategory: "page", feature: "page", retry: reset });
  }, [error.digest, reset, showSafeError]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#0b1220", color: "#f8fafc" }}>
      <section style={{ width: "min(460px, 100%)", padding: "2rem", border: "1px solid rgba(148,163,184,.22)", borderRadius: 16, background: "#111827" }}>
        <p style={{ color: "#94a3b8", marginTop: 0 }}>Legal Saathi</p>
        <h1 style={{ marginTop: 0 }}>{appCopy(language, "error.unexpectedTitle")}</h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>{appCopy(language, "error.genericActionFailure")}</p>
        <button type="button" onClick={reset} style={{ border: 0, borderRadius: 8, padding: ".7rem 1rem", background: "#2563eb", color: "white", cursor: "pointer" }}>{appCopy(language, "error.tryAgain")}</button>
      </section>
    </main>
  );
}
