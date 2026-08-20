"use client";

import { Crown, Sparkles } from "lucide-react";
import type { AppLanguage } from "@/lib/i18n";
import { appCopy, formatAppCopy } from "@/lib/i18n/appCopy";
import { usePlanState } from "./PlanStateProvider";

export default function PlanHeaderControl({ onOpenPlans, language }: { onOpenPlans: () => void; language: AppLanguage }) {
  const { planState, loading } = usePlanState();
  const copy = (key: Parameters<typeof appCopy>[1]) => appCopy(language, key);
  if (loading && !planState) return <span className="header-plan-badge">{copy("plan.checking")}</span>;
  const planName = planState?.plan.id === "free" ? copy("plan.free") : planState?.plan.name ?? copy("plan.free");
  const isFree = !planState || planState.plan.id === "free";
  if (isFree) {
    return (
      <button className="header-plan-control header-upgrade-cta" type="button" onClick={onOpenPlans} aria-label={copy("plan.viewUpgrade")}>
        <Sparkles size={15} />
        <strong>{copy("plan.upgrade")}</strong>
      </button>
    );
  }
  return (
    <div className={`header-plan-control header-plan-badge plan-${planState.plan.id}`} aria-label={formatAppCopy(language, "plan.current", { planName })}>
      <Crown size={15} />
      <strong>{planName}</strong>
    </div>
  );
}
