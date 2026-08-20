"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REQUEST_CONFIGURATION,
  MODEL_DETAILS,
  supportsThinkingMode
} from "@/lib/requestSettings";
import { LegalAiModel, RequestConfiguration, RequestSpeed, ThinkingMode } from "@/lib/types";
import type { AppLanguage } from "@/lib/i18n";
import { appCopy, formatAppCopy, type AppCopyKey } from "@/lib/i18n/appCopy";
import { getAiRequestAvailability } from "@/lib/aiRequestAvailability";
import { usePlanState } from "./PlanStateProvider";

interface RequestControlsProps {
  value?: RequestConfiguration;
  onChange: (configuration: RequestConfiguration) => void;
  disabled?: boolean;
  className?: string;
  webEnabled?: boolean;
  contextCharacters?: number;
  language?: AppLanguage;
}

const modelOrder: LegalAiModel[] = ["auto", "fast", "flash", "pro", "ultra"];
const speedOptions: RequestSpeed[] = ["normal", "1.5x", "2x"];

const thinkingLabelKeys: Record<ThinkingMode, AppCopyKey> = {
  default: "request.default",
  standard: "request.standard",
  extended: "request.extended"
};

const modelDescriptionKeys: Record<LegalAiModel, AppCopyKey> = {
  auto: "request.modelDescription.auto",
  fast: "request.modelDescription.fast",
  flash: "request.modelDescription.flash",
  pro: "request.modelDescription.pro",
  ultra: "request.modelDescription.ultra",
};

const speedLabels: Record<RequestSpeed, string> = {
  normal: "1x",
  "1.5x": "1.5x",
  "2x": "2x"
};

export default function RequestControls({
  value = DEFAULT_REQUEST_CONFIGURATION,
  onChange,
  disabled = false,
  className = "",
  webEnabled = false,
  contextCharacters = 0,
  language = "en",
}: RequestControlsProps) {
  const [quotaMessage, setQuotaMessage] = useState("");
  const { catalog, planState, usage, estimateUnits } = usePlanState();
  const copy = useCallback((key: AppCopyKey) => appCopy(language, key), [language]);
  const formatCopy = useCallback((key: AppCopyKey, values: Readonly<Record<string, string | number>>) => formatAppCopy(language, key, values), [language]);
  const activePlan = planState?.plan.id ?? "free";
  const modelCapability = planState?.entitlements.modelCapabilities?.[value.model];
  const advancedThinkingAvailable = activePlan !== "free" && supportsThinkingMode(value.model) && modelCapability?.supportsReasoning === true;
  const availableThinkingModes = useMemo<ThinkingMode[]>(
    () => advancedThinkingAvailable ? ["default", "standard", "extended"] : ["default"],
    [advancedThinkingAvailable],
  );

  useEffect(() => {
    const feature = value.model === "pro" ? "proChats" : value.model === "ultra" ? "ultraChats" : "chat";
    const quota = usage?.usage.find((item) => item.feature === feature);
    if (!quota) {
      setQuotaMessage("");
      return;
    }
    const label = value.model === "pro" || value.model === "ultra"
      ? MODEL_DETAILS[value.model].label
      : copy("request.chat");
    const resetTime = new Date(quota.resetAt).toLocaleTimeString(language === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", minute: "2-digit" });
    setQuotaMessage(formatCopy("request.quotaStatus", {
      remaining: quota.remaining,
      limit: quota.limit,
      label,
      resetTime,
    }));
  }, [copy, formatCopy, language, usage, value.model]);

  const catalogPlan = catalog?.plans.find((plan) => plan.id === activePlan);
  const allowedModels = useMemo(
    () => {
      return new Set(planState?.entitlements.allowedModels ?? catalogPlan?.allowedModels ?? ["auto", "fast", "flash"]);
    },
    [catalogPlan?.allowedModels, planState?.entitlements.allowedModels],
  );
  const configuredModels = useMemo(
    () => new Set(planState?.entitlements.configuredModels ?? catalog?.models.filter((model) => model.configured).map((model) => model.id) ?? ["auto"]),
    [catalog?.models, planState?.entitlements.configuredModels],
  );
  const providerAvailability = planState?.entitlements.providerAvailability;
  const modelAvailability = planState?.entitlements.modelAvailability;

  useEffect(() => {
    if (!availableThinkingModes.includes(value.thinkingMode)) {
      onChange({ ...value, thinkingMode: "default" });
    }
  }, [availableThinkingModes, onChange, value]);

  const modelOptions = useMemo(() => modelOrder.map((model) => {
    const detail = MODEL_DETAILS[model];
    const configurationState = modelAvailability?.[model];
    const isConfigured = configurationState
      ? configurationState === "available" || configurationState === "provider_temporarily_unavailable"
      : configuredModels.has(model);
    const providerState = model === "auto" ? providerAvailability?.auto : providerAvailability?.explicit;
    const requestAvailability = getAiRequestAvailability(providerAvailability, model);
    const isAvailable = allowedModels.has(model) && isConfigured && requestAvailability.available;
    const lockLabel = !allowedModels.has(model)
        ? ` - ${copy("request.lock.upgrade")}`
      : configurationState === "free_model_unavailable"
        ? ` - ${copy("request.lock.freeUnavailable")}`
        : configurationState === "provider_temporarily_unavailable"
          ? ` - ${copy("request.lock.providerTemporary")}`
          : !isConfigured || providerState === "not_configured"
            ? ` - ${copy("request.lock.configuration")}`
        : providerState === "payment_required"
          ? ` - ${copy("request.lock.providerBalance")}`
          : providerState === "rate_limited"
            ? ` - ${copy("request.lock.rateLimited")}`
          : providerState === "unavailable"
            ? ` - ${copy("request.lock.providerUnavailable")}`
            : "";

    return { model, detail, isAvailable, lockLabel };
  }), [allowedModels, configuredModels, copy, modelAvailability, providerAvailability]);

  const estimatedUnits = estimateUnits(value, { webEnabled, contextCharacters });

  const updateModel = (model: LegalAiModel) => {
    const selectedSupportsAdvancedThinking = activePlan !== "free"
      && supportsThinkingMode(model)
      && planState?.entitlements.modelCapabilities?.[model]?.supportsReasoning === true;
    onChange({
      ...value,
      model,
      thinkingMode: selectedSupportsAdvancedThinking ? value.thinkingMode : "default",
      speed: model === "fast" ? "normal" : value.speed
    });
  };

  return (
    <div className={`request-controls ${className}`.trim()}>
      <div className="request-controls-row">
        <label className="request-control-select">
          <span>{copy("request.model")}</span>
          <strong>{MODEL_DETAILS[value.model].label}</strong>
          <ChevronDown size={13} />
          <select
            value={value.model}
            onChange={(event) => updateModel(event.target.value as LegalAiModel)}
            disabled={disabled}
            data-testid="ai-model-selector"
            aria-label={copy("request.selectModel")}
            title={copy(modelDescriptionKeys[value.model])}
          >
            {modelOptions.map(({ model, detail, isAvailable, lockLabel }) => (
              <option key={model} value={model} disabled={!isAvailable}>
                {detail.label}{lockLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="request-control-select">
          <span>{copy("request.thinking")}</span>
          <strong>{copy(thinkingLabelKeys[value.thinkingMode])}</strong>
          <ChevronDown size={13} />
          <select
            value={value.thinkingMode}
            onChange={(event) => onChange({ ...value, thinkingMode: event.target.value as ThinkingMode })}
            disabled={disabled || availableThinkingModes.length === 1}
            aria-label={copy("request.selectThinking")}
            title={copy(availableThinkingModes.length === 1 ? "request.reasoningPlanRequirement" : "request.chooseReasoningDepth")}
          >
            {availableThinkingModes.map((mode) => (
              <option key={mode} value={mode}>{copy(thinkingLabelKeys[mode])}</option>
            ))}
          </select>
        </label>

        {value.model !== "fast" && (
          <label className="request-control-select">
            <span>{copy("request.speed")}</span>
            <strong>{speedLabels[value.speed]}</strong>
            <ChevronDown size={13} />
            <select
              value={value.speed}
              onChange={(event) => onChange({ ...value, speed: event.target.value as RequestSpeed })}
              disabled={disabled}
              aria-label={copy("request.selectSpeed")}
            >
              {speedOptions.map((speed) => (
                <option key={speed} value={speed}>{speedLabels[speed]}</option>
              ))}
            </select>
          </label>
        )}

      </div>
      <small className="text-secondary request-controls-note">
        {formatCopy("request.estimatedCost", { units: estimatedUnits, unitLabel: copy(estimatedUnits === 1 ? "request.unit" : "request.units") })}
        {value.model === "flash" ? `${copy("request.flashCost")} ` : ""}
        {value.thinkingMode === "extended" ? `${copy("request.extendedThinkingCost")} ` : ""}
        {value.speed !== "normal" ? `${copy("request.speedCost")} ` : ""}
        {webEnabled ? `${copy("request.webCost")} ` : ""}
        {quotaMessage}
      </small>
    </div>
  );
}
