"use client";
import { UploadCloud, AlertTriangle } from "lucide-react";
import { useState, useRef } from "react";
import { CASE_UPLOAD_ACCEPT } from "@/lib/caseUploadPolicy";
import type { AppLanguage } from "@/lib/i18n";
import { caseCreationCopy } from "@/lib/i18n/caseCreationCopy";

interface DocumentUploadProps {
  headline: string;
  subtext: string;
  onUpload: (file: File) => void | Promise<void>;
  language?: AppLanguage;
}

export default function DocumentUpload({ headline, subtext, onUpload, language = "en" }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void onUpload(e.target.files[0]);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div style={{ width: "100%", maxWidth: "600px" }}>
      <button
        type="button"
        className={`document-upload ${isDragging ? "drag-over" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFilePicker}
        aria-describedby="document-upload-warning"
      >
        <UploadCloud size={48} style={{ marginBottom: "1rem", color: "var(--text-secondary)" }} />
        <h3 style={{ marginBottom: "0.5rem" }}>{headline}</h3>
        <p className="text-secondary" style={{ marginBottom: "1.5rem" }}>{subtext}</p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          accept={CASE_UPLOAD_ACCEPT}
          aria-label={caseCreationCopy(language, "upload.fileAria")}
          onChange={handleFileChange}
        />
        <span className="btn btn-primary" aria-hidden="true">{caseCreationCopy(language, "action.browseFiles")}</span>
      </button>

      <div className="disclaimer-banner" id="document-upload-warning" role="note">
        <AlertTriangle size={20} color="var(--accent-primary)" />
        <span style={{ fontSize: "0.875rem" }}>
          {caseCreationCopy(language, "upload.warning")}
        </span>
      </div>
    </div>
  );
}
