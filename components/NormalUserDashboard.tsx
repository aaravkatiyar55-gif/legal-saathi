"use client";
import DocumentUpload from "./DocumentUpload";

interface NormalUserDashboardProps {
  onUpload: (file: File) => void;
}

export default function NormalUserDashboard({ onUpload }: NormalUserDashboardProps) {
  return (
    <div className="centered-content fade-in">
      <DocumentUpload 
        headline="Drop your document — we'll explain it in simple terms"
        subtext="Upload any legal document and get an instant, easy-to-understand analysis."
        onUpload={onUpload}
      />
    </div>
  );
}
