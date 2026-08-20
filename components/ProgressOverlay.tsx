"use client";
import { Loader2, CheckCircle, Circle } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppLanguage } from "@/lib/i18n";
import { appCopy } from "@/lib/i18n/appCopy";

interface ProgressOverlayProps {
  stages: string[];
  language: AppLanguage;
  onComplete: () => void;
}

export default function ProgressOverlay({ stages, language, onComplete }: ProgressOverlayProps) {
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    if (currentStage >= stages.length) {
      const timer = setTimeout(() => {
        onComplete();
      }, 500);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setCurrentStage(prev => prev + 1);
    }, 1500);

    return () => clearTimeout(timer);
  }, [currentStage, stages.length, onComplete]);

  return (
    <div className="modal-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="modal-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "400px" }}>
        <Loader2 size={48} className="spin" style={{ color: "var(--accent-primary)", marginBottom: "1.5rem" }} />
        <h2 style={{ marginBottom: "2rem" }}>{appCopy(language, "progress.analyzingDocument")}</h2>
        
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {stages.map((stage, idx) => {
            const isCompleted = idx < currentStage;
            const isCurrent = idx === currentStage;
            
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {isCompleted ? (
                  <CheckCircle size={24} style={{ color: "var(--accent-primary)" }} />
                ) : isCurrent ? (
                  <Loader2 size={24} className="spin" style={{ color: "var(--text-secondary)" }} />
                ) : (
                  <Circle size={24} style={{ color: "var(--border-default)" }} />
                )}
                <span className={isCompleted || isCurrent ? "text-primary" : "text-secondary"}>
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
