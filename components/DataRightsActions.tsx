"use client";

import { useState } from "react";
import { downloadBackendDataExport, requestBackendAccountDeletion, safeInlineBackendMessage } from "@/lib/backendApi";
import { translateUiText, type AppLanguage } from "@/lib/i18n";

export default function DataRightsActions({ action, language = "en" }: { action: "export" | "deletion"; language?: AppLanguage }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const t = (text: string) => translateUiText(text, language);
  const run = async () => {
    setBusy(true);
    setStatus("");
    try {
      if (action === "export") {
        const blob = await downloadBackendDataExport();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `legal-sathi-export-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus(t("Your owner-scoped export was prepared."));
      } else {
        await requestBackendAccountDeletion();
        setStatus(t("Your deletion request was recorded for verified review."));
      }
    } catch (error) {
      setStatus(safeInlineBackendMessage(error, t("This request could not be completed.")));
    } finally {
      setBusy(false);
    }
  };
  return <div className="data-rights-action"><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void run()}>{busy ? t("Submitting...") : action === "export" ? t("Download my data") : t("Request account deletion")}</button>{status && <p role="status">{status}</p>}</div>;
}
