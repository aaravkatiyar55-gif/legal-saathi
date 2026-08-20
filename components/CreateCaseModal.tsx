"use client";
import { useState, useRef, useEffect } from "react";
import DocumentUpload from "./DocumentUpload";
import { BackendApiError } from "@/lib/backendApi";
import { useSafeAppError } from "./AppErrorProvider";
import type { AppLanguage } from "@/lib/i18n";
import { caseCreationCopy, caseTypeCopyKeys } from "@/lib/i18n/caseCreationCopy";
import { getModalFocusCycleTargetInContainer } from "@/lib/modalFocusTrap";
import { getMenuFocusIndex } from "@/lib/menuKeyboardNavigation";

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCase: (name: string, clientName: string, description: string, typeTag: string, file?: File) => boolean | void | Promise<boolean | void>;
  onViewExistingCases: () => void;
  onUpgrade: () => void;
  language: AppLanguage;
}

export default function CreateCaseModal({ isOpen, onClose, onCreateCase, onViewExistingCases, onUpgrade, language }: CreateCaseModalProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [typeTag, setTypeTag] = useState("Litigation");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [productError, setProductError] = useState<"case_limit" | "other" | null>(null);
  const [productMessage, setProductMessage] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const caseTypeTriggerRef = useRef<HTMLButtonElement>(null);
  const caseTypeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const { showSafeError } = useSafeAppError();
  const copy = (key: Parameters<typeof caseCreationCopy>[1]) => caseCreationCopy(language, key);

  const caseTypes = ["Litigation", "Corporate", "Real Estate", "Intellectual Property", "Other"];

  const focusCaseTypeOption = (index: number) => {
    window.requestAnimationFrame(() => caseTypeOptionRefs.current[index]?.focus());
  };

  const closeCaseTypeDropdown = (restoreFocus = false) => {
    setIsDropdownOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        if (caseTypeTriggerRef.current?.isConnected) caseTypeTriggerRef.current.focus();
      });
    }
  };

  const selectCaseType = (nextType: string) => {
    setTypeTag(nextType);
    closeCaseTypeDropdown(true);
  };

  const handleCaseTypeTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && isDropdownOpen) {
      event.preventDefault();
      closeCaseTypeDropdown(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setIsDropdownOpen(true);
    const currentIndex = caseTypes.indexOf(typeTag);
    const nextIndex = getMenuFocusIndex(caseTypes.map(() => ({})), currentIndex, event.key);
    focusCaseTypeOption(nextIndex ?? Math.max(0, currentIndex));
  };

  const handleCaseTypeListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCaseTypeDropdown(true);
      return;
    }

    const optionButtons = caseTypeOptionRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
    const nextIndex = getMenuFocusIndex(optionButtons, optionButtons.indexOf(document.activeElement as HTMLButtonElement), event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    optionButtons[nextIndex]?.focus();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { if (!isOpen) setIsDropdownOpen(false); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const focusFrame = window.requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previouslyFocusedRef.current?.isConnected) previouslyFocusedRef.current.focus();
    };
  }, [isOpen]);

  const resetAfterSuccess = () => {
    setStep(1);
    setName("");
    setClientName("");
    setDescription("");
    setTypeTag("Litigation");
    setProductError(null);
    setProductMessage("");
  };

  const submitCase = async (file?: File) => {
    if (submitting) return;
    setSubmitting(true);
    setProductError(null);
    setProductMessage("");
    try {
      const created = await onCreateCase(name, clientName, description, typeTag, file);
      if (created === false) return;
      resetAfterSuccess();
      onClose();
    } catch (error) {
      if (error instanceof BackendApiError && error.kind === "case_limit") {
        setProductError("case_limit");
      } else if (error instanceof BackendApiError && error.presentation === "product") {
        setProductError("other");
        setProductMessage(error.message);
      } else if (!(error instanceof BackendApiError)) {
        showSafeError({
          referenceId: crypto.randomUUID(),
          errorCode: "CASE_CREATION_FAILED",
          httpStatus: 0,
          routeCategory: "cases",
          feature: "case",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="create-case-title" onKeyDown={handleDialogKeyDown} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
        {productError === "case_limit" ? (
          <div className="case-limit-dialog">
            <h2 id="create-case-title">{copy("limit.title")}</h2>
            <p>{copy("limit.description")}</p>
            <div className="case-limit-actions">
              <button type="button" className="btn-primary" onClick={onViewExistingCases}>{copy("action.viewExisting")}</button>
              <button type="button" className="btn" onClick={onViewExistingCases}>{copy("action.deleteOrArchive")}</button>
              <button type="button" className="btn" onClick={onUpgrade}>{copy("action.upgrade")}</button>
              <button type="button" className="btn" onClick={() => setProductError(null)}>{copy("action.close")}</button>
            </div>
          </div>
        ) : (
          <>
        <h2 id="create-case-title" style={{ marginBottom: "2rem" }}>{step === 1 ? copy("title.create") : copy("title.upload")}</h2>
        {productError === "other" && <div className="product-condition-message" role="alert" data-no-i18n>{productMessage}</div>}
        
        {step === 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
              <label htmlFor="create-case-name" style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">{copy("field.caseName")}</label>
              <input 
                id="create-case-name"
                ref={nameInputRef}
                className="apple-glass-input" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder={copy("placeholder.caseName")}
                aria-required="true"
              />
            </div>
            
            <div>
              <label htmlFor="create-case-client" style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">{copy("field.clientName")}</label>
              <input 
                id="create-case-client"
                className="apple-glass-input" 
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)} 
                placeholder={copy("placeholder.optional")}
              />
            </div>

            <div>
              <label id="create-case-type-label" style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">{copy("field.caseType")}</label>
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  ref={caseTypeTriggerRef}
                  type="button"
                  className="apple-glass-input" 
                  onClick={() => {
                    if (isDropdownOpen) closeCaseTypeDropdown();
                    else setIsDropdownOpen(true);
                  }}
                  onKeyDown={handleCaseTypeTriggerKeyDown}
                  aria-labelledby="create-case-type-label"
                  aria-haspopup="listbox"
                  aria-expanded={isDropdownOpen}
                  aria-controls="create-case-type-options"
                  style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  {copy(caseTypeCopyKeys[typeTag as keyof typeof caseTypeCopyKeys])}
                  <span style={{ fontSize: "0.8rem" }}>▼</span>
                </button>
                {isDropdownOpen && (
                  <div id="create-case-type-options" role="listbox" aria-labelledby="create-case-type-label" onKeyDown={handleCaseTypeListboxKeyDown} style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)", 
                    borderRadius: "var(--radius-md)", 
                    marginTop: "0.5rem",
                    zIndex: 10,
                    overflow: "hidden"
                  }}>
                    {caseTypes.map((type, index) => (
                      <button
                        ref={(element) => { caseTypeOptionRefs.current[index] = element; }}
                        type="button"
                        key={type} 
                        role="option"
                        aria-selected={typeTag === type}
                        tabIndex={typeTag === type ? 0 : -1}
                        onClick={() => selectCaseType(type)}
                        style={{ display: "block", width: "100%", padding: "0.75rem 1rem", cursor: "pointer", border: 0, borderBottom: "1px solid var(--border-default)", color: "inherit", font: "inherit", textAlign: "left", background: "transparent" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        {copy(caseTypeCopyKeys[type as keyof typeof caseTypeCopyKeys])}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="create-case-description" style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">{copy("field.description")}</label>
              <textarea 
                id="create-case-description"
                className="apple-glass-input" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                placeholder={copy("placeholder.notes")}
                style={{ resize: "vertical", minHeight: "80px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
              <button type="button" className="btn" onClick={onClose} style={{ borderRadius: "var(--radius-full)" }}>{copy("action.cancel")}</button>
              <button
                type="button"
                className="btn btn-primary" 
                onClick={() => setStep(2)} 
                disabled={!name.trim()}
                style={{ borderRadius: "var(--radius-full)", opacity: !name.trim() ? 0.5 : 1 }}
              >
                {copy("action.nextAddFile")}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <DocumentUpload 
              headline={copy("upload.headline")}
              subtext={copy("upload.subtext")}
              language={language}
              onUpload={(file) => {
                void submitCase(file);
              }}
            />
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button type="button" className="btn" onClick={() => setStep(1)} style={{ borderRadius: "var(--radius-full)" }}>{copy("action.back")}</button>
              <button
                type="button"
                className="btn btn-primary" 
                onClick={() => { void submitCase(); }}
                disabled={submitting}
                style={{ borderRadius: "var(--radius-full)" }}
              >
                {copy("action.skipCreateEmpty")}
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
