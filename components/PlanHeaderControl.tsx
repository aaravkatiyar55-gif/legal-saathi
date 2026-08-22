"use client";

import { Crown, Sparkles } from "lucide-react";
import { usePlanState } from "./PlanStateProvider";

export default function PlanHeaderControl({ onOpenPlans }: { onOpenPlans: () => void }) {
  const { planState, loading } = usePlanState();
  if (loading && !planState) return <span className="header-plan-badge">Checking plan...</span>;
  const planName = planState?.plan.name ?? "Free";
  const isFree = !planState || planState.plan.id === "free";
  if (isFree) {
    return (
      <button className="header-plan-control header-upgrade-cta" type="button" onClick={onOpenPlans} aria-label="View upgrade plans">
        <Sparkles size={15} />
        <strong>Upgrade</strong>
      </button>
    );
  }
  return (
    <div className={`header-plan-control header-plan-badge plan-${planState.plan.id}`} aria-label={`${planName} plan`}>
      <Crown size={15} />
      <strong>{planName}</strong>
    </div>
  );
}
