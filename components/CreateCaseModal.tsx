"use client";
import { useState, useRef, useEffect } from "react";
import DocumentUpload from "./DocumentUpload";
import { BackendApiError } from "@/lib/backendApi";
import { useSafeAppError } from "./AppErrorProvider";

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCase: (name: string, clientName: string, description: string, typeTag: string, file?: File) => boolean | void | Promise<boolean | void>;
  onViewExistingCases: () => void;
  onUpgrade: () => void;
}

export default function CreateCaseModal({ isOpen, onClose, onCreateCase, onViewExistingCases, onUpgrade }: CreateCaseModalProps) {
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
  const { showSafeError } = useSafeAppError();

  const caseTypes = ["Litigation", "Corporate", "Real Estate", "Intellectual Property", "Other"];

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
        {productError === "case_limit" ? (
          <div className="case-limit-dialog" role="dialog" aria-labelledby="case-limit-title">
            <h2 id="case-limit-title">Case-folder limit reached</h2>
            <p>Your Free plan case-folder limit has been reached.</p>
            <div className="case-limit-actions">
              <button type="button" className="btn-primary" onClick={onViewExistingCases}>View existing cases</button>
              <button type="button" className="btn" onClick={onViewExistingCases}>Delete or archive an unused case</button>
              <button type="button" className="btn" onClick={onUpgrade}>Upgrade</button>
              <button type="button" className="btn" onClick={() => setProductError(null)}>Close</button>
            </div>
          </div>
        ) : (
          <>
        <h2 style={{ marginBottom: "2rem" }}>{step === 1 ? "Create New Case" : "Upload Case Document"}</h2>
        {productError === "other" && <div className="product-condition-message" role="alert">{productMessage}</div>}

        {step === 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">Case Name *</label>
              <input
                className="apple-glass-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Smith v. Jones"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">Client Name</label>
              <input
                className="apple-glass-input"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">Case Type</label>
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <div
                  className="apple-glass-input"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  {typeTag}
                  <span style={{ fontSize: "0.8rem" }}>▼</span>
                </div>
                {isDropdownOpen && (
                  <div style={{
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
                    {caseTypes.map(type => (
                      <div
                        key={type}
                        onClick={() => { setTypeTag(type); setIsDropdownOpen(false); }}
                        style={{ padding: "0.75rem 1rem", cursor: "pointer", borderBottom: "1px solid var(--border-default)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        {type}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }} className="text-secondary">Description</label>
              <textarea
                className="apple-glass-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes"
                style={{ resize: "vertical", minHeight: "80px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
              <button className="btn" onClick={onClose} style={{ borderRadius: "var(--radius-full)" }}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => setStep(2)}
                disabled={!name.trim()}
                style={{ borderRadius: "var(--radius-full)", opacity: !name.trim() ? 0.5 : 1 }}
              >
                Next: Add a file
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <DocumentUpload
              headline="Upload Document"
              subtext="The case folder is saved first. Document processing and AI preparation run separately."
              onUpload={(file) => {
                void submitCase(file);
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
              <button className="btn" onClick={() => setStep(1)} style={{ borderRadius: "var(--radius-full)" }}>Back</button>
              <button
                className="btn btn-primary"
                onClick={() => { void submitCase(); }}
                disabled={submitting}
                style={{ borderRadius: "var(--radius-full)" }}
              >
                Skip & Create Empty
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
