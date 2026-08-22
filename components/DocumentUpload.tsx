"use client";
import { UploadCloud, AlertTriangle } from "lucide-react";
import { useState, useRef } from "react";
import { CASE_UPLOAD_ACCEPT } from "@/lib/caseUploadPolicy";

interface DocumentUploadProps {
  headline: string;
  subtext: string;
  onUpload: (file: File) => void | Promise<void>;
}

export default function DocumentUpload({ headline, subtext, onUpload }: DocumentUploadProps) {
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

  return (
    <div style={{ width: "100%", maxWidth: "600px" }}>
      <div
        className={`document-upload ${isDragging ? "drag-over" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud size={48} style={{ marginBottom: "1rem", color: "var(--text-secondary)" }} />
        <h3 style={{ marginBottom: "0.5rem" }}>{headline}</h3>
        <p className="text-secondary" style={{ marginBottom: "1.5rem" }}>{subtext}</p>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          accept={CASE_UPLOAD_ACCEPT}
          aria-label="Choose a case document"
          onChange={handleFileChange}
        />
        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
          Browse Files
        </button>
      </div>

      <div className="disclaimer-banner">
        <AlertTriangle size={20} color="var(--accent-primary)" />
        <span style={{ fontSize: "0.875rem" }}>
          Warning: AI analysis is for informational purposes only. Always consult a qualified attorney for legal advice.
        </span>
      </div>
    </div>
  );
}
