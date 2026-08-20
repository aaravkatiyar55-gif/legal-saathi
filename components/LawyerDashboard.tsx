"use client";
import { FileText, Search, Filter } from "lucide-react";
import DocumentUpload from "./DocumentUpload";

interface LawyerDashboardProps {
  onUpload: (file: File) => void;
}

export default function LawyerDashboard({ onUpload }: LawyerDashboardProps) {
  return (
    <div style={{ padding: "2rem", width: "100%", maxWidth: "800px", margin: "0 auto" }} className="fade-in">
      <h2 style={{ marginBottom: "2rem" }}>Professional Workspace</h2>
      
      <DocumentUpload 
        headline="Upload Legal Document"
        subtext="Drag & drop contracts, filings, or evidence for instant AI analysis."
        onUpload={onUpload}
      />

      <div style={{ marginTop: "4rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h3>Recent Cases</h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn" disabled title="Coming soon">
              <Search size={16} /> Search
            </button>
            <button className="btn" disabled title="Coming soon">
              <Filter size={16} /> Filter
            </button>
          </div>
        </div>

        <div style={{ 
          border: "1px solid var(--border-default)", 
          borderRadius: "var(--radius-lg)", 
          padding: "4rem 2rem", 
          textAlign: "center",
          background: "var(--bg-secondary)"
        }}>
          <FileText size={48} style={{ color: "var(--text-placeholder)", margin: "0 auto 1rem" }} />
          <p className="text-secondary">No recent cases found. Upload a document above to create your first case.</p>
        </div>
      </div>
    </div>
  );
}
