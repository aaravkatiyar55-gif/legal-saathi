"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { helpAvailabilityNotice, helpSections } from "@/lib/helpContent";
import { AppLanguage } from "@/lib/i18n";
import { useSafeAppError } from "@/components/AppErrorProvider";

export default function HelpModal({ isOpen, onClose, language }: { isOpen: boolean; onClose: () => void; language: AppLanguage }) {
  const { openReportProblem } = useSafeAppError();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [isOpen, onClose]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(language === "hi" ? "hi-IN" : "en-IN");
    if (!normalized) return helpSections;
    return helpSections.filter((section) => `${section.title[language]} ${section.body[language]}`.toLocaleLowerCase(language === "hi" ? "hi-IN" : "en-IN").includes(normalized));
  }, [language, query]);
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 10020 }} onMouseDown={onClose}>
      <section className="modal-content help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="help-modal-header"><div><span className="case-hub-kicker">Legal Saathi guide</span><h2 id="help-title">Help & FAQ</h2><p>42 practical topics for using the app safely.</p></div><button className="btn" type="button" onClick={onClose} aria-label="Close Help"><X size={18} /></button></header>
        <p className="help-availability-note" role="note">{helpAvailabilityNotice[language]}</p>
        <label className="help-search"><Search size={17} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Help" /></label>
        <div className="help-results" aria-live="polite">
          {visible.length ? visible.map((section) => <article key={section.id} id={`help-${section.id}`}><h3>{section.title[language]}</h3><p>{section.body[language]}</p></article>) : <p className="text-secondary">No matching Help topic.</p>}
        </div>
        <footer className="help-modal-footer">
          <span>Need support? <a href="mailto:inceptionaistudios@gmail.com">inceptionaistudios@gmail.com</a>. Do not email secrets or private legal documents.</span>
          <button type="button" className="btn" onClick={() => {
            onClose();
            openReportProblem();
          }}>Report a problem</button>
          <nav aria-label="Legal and privacy links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/disclaimer">Disclaimer</a><a href="/refunds">Refunds</a><a href="/support">Support</a></nav>
        </footer>
      </section>
    </div>
  );
}
