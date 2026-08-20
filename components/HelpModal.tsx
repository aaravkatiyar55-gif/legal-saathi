"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { helpAvailabilityNotice, helpSections } from "@/lib/helpContent";
import { AppLanguage } from "@/lib/i18n";
import { appCopy, publicLanguageHref } from "@/lib/i18n/appCopy";
import { getModalFocusCycleTargetInContainer } from "@/lib/modalFocusTrap";
import { useSafeAppError } from "@/components/AppErrorProvider";

export default function HelpModal({ isOpen, onClose, language }: { isOpen: boolean; onClose: () => void; language: AppLanguage }) {
  const { openReportProblem } = useSafeAppError();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusFrame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen, onClose]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(language === "hi" ? "hi-IN" : "en-IN");
    if (!normalized) return helpSections;
    return helpSections.filter((section) => `${section.title[language]} ${section.body[language]}`.toLocaleLowerCase(language === "hi" ? "hi-IN" : "en-IN").includes(normalized));
  }, [language, query]);
  const copy = (key: Parameters<typeof appCopy>[1]) => appCopy(language, key);
  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nextFocus = getModalFocusCycleTargetInContainer(event.currentTarget, document.activeElement, event.shiftKey);
    if (!nextFocus) return;
    event.preventDefault();
    nextFocus.focus();
  };
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 10020 }} onMouseDown={onClose}>
      <section className="modal-content help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onKeyDown={handleDialogKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <header className="help-modal-header"><div><span className="case-hub-kicker">{copy("help.kicker")}</span><h2 id="help-title">{copy("help.title")}</h2><p>{copy("help.description")}</p></div><button className="btn" type="button" onClick={onClose} aria-label={copy("help.closeAria")}><X size={18} /></button></header>
        <p className="help-availability-note" role="note">{helpAvailabilityNotice[language]}</p>
        <label className="help-search"><Search size={17} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("help.search")} /></label>
        <div className="help-results" aria-live="polite">
          {visible.length ? visible.map((section) => <article key={section.id} id={`help-${section.id}`}><h3>{section.title[language]}</h3><p>{section.body[language]}</p></article>) : <p className="text-secondary">{copy("help.empty")}</p>}
        </div>
        <footer className="help-modal-footer">
          <span>{copy("help.supportPrefix")} <a href="mailto:inceptionaistudios@gmail.com">inceptionaistudios@gmail.com</a>. {copy("help.supportSuffix")}</span>
          <button type="button" className="btn" onClick={() => {
            onClose();
            openReportProblem();
          }}>{copy("error.report")}</button>
          <nav aria-label={copy("help.linksAria")}><a href={publicLanguageHref("/privacy", language)}>{copy("help.privacy")}</a><a href={publicLanguageHref("/terms", language)}>{copy("help.terms")}</a><a href={publicLanguageHref("/disclaimer", language)}>{copy("help.disclaimer")}</a><a href={publicLanguageHref("/refunds", language)}>{copy("help.refunds")}</a><a href={publicLanguageHref("/support", language)}>{copy("help.support")}</a></nav>
        </footer>
      </section>
    </div>
  );
}
