"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BackendPlanState,
  ExpandedBackendUsage,
  getBackendSession,
  getBackendUsage,
  getPlansCatalog,
  ProductCatalog,
  restoreBackendSession,
  safeInlineBackendMessage,
} from "@/lib/backendApi";
import { LegalAiModel, RequestConfiguration } from "@/lib/types";
import { updateSafeDiagnosticContext } from "@/lib/safeIncident";
import { loadPlanStateBootstrap } from "@/lib/planStateBootstrap";

export const PLAN_STATE_REFRESH_EVENT = "legal-sathi-plan-state-refresh";

type PlanStateContextValue = {
  catalog: ProductCatalog | null;
  planState: BackendPlanState | null;
  usage: ExpandedBackendUsage | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  estimateUnits: (configuration: RequestConfiguration, options?: { webEnabled?: boolean; contextCharacters?: number }) => number;
};

const PlanStateContext = createContext<PlanStateContextValue | null>(null);

export function requestPlanStateRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PLAN_STATE_REFRESH_EVENT));
}

const baseUnits: Record<LegalAiModel, number> = { auto: 1, fast: 1, flash: 2, pro: 6, ultra: 15 };

function estimateUnits(configuration: RequestConfiguration, options: { webEnabled?: boolean; contextCharacters?: number } = {}) {
  const supportsThinking = configuration.model === "pro" || configuration.model === "ultra";
  const thinking = supportsThinking && configuration.thinkingMode === "extended" ? 2 : 1;
  const speed = configuration.model === "fast" ? 1 : configuration.speed === "2x" ? 1.5 : configuration.speed === "1.5x" ? 1.25 : 1;
  const modelCost = Math.ceil(baseUnits[configuration.model] * thinking * speed);
  const contextCharacters = Math.max(0, Math.min(40_000, Math.floor(options.contextCharacters || 0)));
  const contextCost = contextCharacters > 0 ? Math.min(6, 3 + Math.ceil(Math.max(0, contextCharacters - 10_000) / 10_000)) : 0;
  return modelCost + (options.webEnabled ? 2 : 0) + contextCost;
}

export default function PlanStateProvider({ children }: { children: React.ReactNode }) {
  const [catalog, setCatalog] = useState<ProductCatalog | null>(null);
  const [planState, setPlanState] = useState<BackendPlanState | null>(null);
  const [usage, setUsage] = useState<ExpandedBackendUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const bootstrap = await loadPlanStateBootstrap({
        getExistingSession: getBackendSession,
        loadCatalog: getPlansCatalog,
        restoreSession: async () => {
          const restored = await restoreBackendSession();
          return restored ? getBackendSession() : null;
        },
        loadUsage: getBackendUsage,
      });
      setCatalog(bootstrap.catalog.catalog);
      if (!bootstrap.session || !bootstrap.usage) {
        setPlanState(null);
        setUsage(null);
        return;
      }
      setUsage(bootstrap.usage);
      setPlanState(bootstrap.usage.planState);
    } catch (refreshError) {
      setError(safeInlineBackendMessage(refreshError, "Plan state could not be refreshed."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleRefresh = () => { void refresh(); };
    window.addEventListener(PLAN_STATE_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(PLAN_STATE_REFRESH_EVENT, handleRefresh);
  }, [refresh]);

  useEffect(() => {
    updateSafeDiagnosticContext({ planClass: planState?.plan.id ?? "unknown" });
  }, [planState?.plan.id]);

  const value = useMemo<PlanStateContextValue>(() => ({ catalog, planState, usage, loading, error, refresh, estimateUnits }), [catalog, planState, usage, loading, error, refresh]);
  return <PlanStateContext.Provider value={value}>{children}</PlanStateContext.Provider>;
}

export function usePlanState() {
  const value = useContext(PlanStateContext);
  if (!value) throw new Error("usePlanState must be used inside PlanStateProvider");
  return value;
}
