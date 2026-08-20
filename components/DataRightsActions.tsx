"use client";

import { useEffect, useState } from "react";
import { downloadBackendDataExport, requestBackendAccountDeletion, safeInlineBackendMessage } from "@/lib/backendApi";
import { translateUiText, type AppLanguage } from "@/lib/i18n";
import { appCopy, appLanguageChangeEvent, currentDocumentAppLanguage } from "@/lib/i18n/appCopy";

export default function DataRightsActions({ action }: { action: "export" | "deletion" }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(() => currentDocumentAppLanguage());
  const copy = (key: Parameters<typeof appCopy>[1]) => appCopy(language, key);

  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<AppLanguage>).detail;
      setLanguage(nextLanguage ?? currentDocumentAppLanguage());
    };
    setLanguage(currentDocumentAppLanguage());
    document.addEventListener(appLanguageChangeEvent, onLanguageChange);
    return () => document.removeEventListener(appLanguageChangeEvent, onLanguageChange);
  }, []);

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
        setStatus(copy("dataRights.exportPrepared"));
      } else {
        await requestBackendAccountDeletion();
        setStatus(copy("dataRights.deletionRecorded"));
      }
    } catch (error) {
      setStatus(translateUiText(safeInlineBackendMessage(error, copy("dataRights.failure")), language));
    } finally {
      setBusy(false);
    }
  };
  return <div className="data-rights-action"><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void run()}>{busy ? copy("dataRights.submitting") : action === "export" ? copy("dataRights.download") : copy("dataRights.requestDeletion")}</button>{status && <p role="status">{status}</p>}</div>;
}
