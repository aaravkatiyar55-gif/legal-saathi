"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REQUEST_CONFIGURATION,
  MODEL_DETAILS,
  supportsThinkingMode
} from "@/lib/requestSettings";
import { LegalAiModel, RequestConfiguration, RequestSpeed, ThinkingMode } from "@/lib/types";
import { translateUiText, type AppLanguage } from "@/lib/i18n";
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

const thinkingLabels: Record<ThinkingMode, string> = {
  default: "Default",
  standard: "Standard",
  extended: "Extended"
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
  const t = useCallback((text: string) => translateUiText(text, language), [language]);
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
      : language === "hi" ? "चैट" : "chat";
    const resetTime = new Date(quota.resetAt).toLocaleTimeString(language === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", minute: "2-digit" });
    setQuotaMessage(language === "hi"
      ? `${quota.remaining}/${quota.limit} ${label} संदेश शेष - ${resetTime} पर रीसेट`
      : language === "hinglish"
        ? `${quota.remaining}/${quota.limit} ${label} messages bache hain - ${resetTime} par reset`
        : `${quota.remaining}/${quota.limit} ${label} messages left - resets ${resetTime}`);
  }, [language, usage, value.model]);

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
    const isAvailable = allowedModels.has(model) && isConfigured && providerState !== "not_configured";
    const lockLabel = !allowedModels.has(model)
        ? ` - ${t("Upgrade required")}`
      : configurationState === "free_model_unavailable"
        ? ` - ${t("Free model currently unavailable")}`
        : configurationState === "provider_temporarily_unavailable"
          ? ` - ${t("Provider temporarily unavailable")}`
          : !isConfigured || providerState === "not_configured"
            ? ` - ${t("Model configuration required")}`
        : providerState === "payment_required"
          ? ` - ${t("Provider balance required")}`
          : providerState === "rate_limited"
            ? ` - ${t("Rate limited")}`
          : providerState === "unavailable"
            ? ` - ${t("Provider unavailable")}`
            : "";

    return { model, detail, isAvailable, lockLabel };
  }), [allowedModels, configuredModels, modelAvailability, providerAvailability, t]);

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
          <span>{t("Model")}</span>
          <strong>{MODEL_DETAILS[value.model].label}</strong>
          <ChevronDown size={13} />
          <select
            value={value.model}
            onChange={(event) => updateModel(event.target.value as LegalAiModel)}
            disabled={disabled}
            data-testid="ai-model-selector"
            aria-label={t("Select AI model")}
            title={MODEL_DETAILS[value.model].description}
          >
            {modelOptions.map(({ model, detail, isAvailable, lockLabel }) => (
              <option key={model} value={model} disabled={!isAvailable}>
                {detail.label}{lockLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="request-control-select">
          <span>{t("Thinking")}</span>
          <strong>{t(thinkingLabels[value.thinkingMode])}</strong>
          <ChevronDown size={13} />
          <select
            value={value.thinkingMode}
            onChange={(event) => onChange({ ...value, thinkingMode: event.target.value as ThinkingMode })}
            disabled={disabled || availableThinkingModes.length === 1}
            aria-label={t("Select thinking mode")}
            title={t(availableThinkingModes.length === 1 ? "Standard and Extended require a paid plan and a configured reasoning model" : "Choose provider reasoning depth")}
          >
            {availableThinkingModes.map((mode) => (
              <option key={mode} value={mode}>{t(thinkingLabels[mode])}</option>
            ))}
          </select>
        </label>

        {value.model !== "fast" && (
          <label className="request-control-select">
            <span>{t("Speed")}</span>
            <strong>{speedLabels[value.speed]}</strong>
            <ChevronDown size={13} />
            <select
              value={value.speed}
              onChange={(event) => onChange({ ...value, speed: event.target.value as RequestSpeed })}
              disabled={disabled}
              aria-label={t("Select request speed")}
            >
              {speedOptions.map((speed) => (
                <option key={speed} value={speed}>{speedLabels[speed]}</option>
              ))}
            </select>
          </label>
        )}

      </div>
      <small className="text-secondary request-controls-note">
        {language === "hi"
          ? `अनुमानित लागत: ${estimatedUnits} यूनिट। `
          : language === "hinglish"
            ? `Estimated cost: ${estimatedUnits} ${estimatedUnits === 1 ? "unit" : "units"}. `
            : `Estimated cost: ${estimatedUnits} ${estimatedUnits === 1 ? "unit" : "units"}. `}
        {value.model === "flash" ? (language === "hi" ? "Flash, Fast से अधिक यूनिट उपयोग करता है। " : language === "hinglish" ? "Flash, Fast se zyada units use karta hai. " : "Flash uses more units than Fast. ") : ""}
        {value.thinkingMode === "extended" ? (language === "hi" ? "विस्तृत सोच धीमी है और अधिक यूनिट उपयोग करती है। " : language === "hinglish" ? "Extended thinking slow hai aur zyada units use karti hai. " : "Extended thinking is slower and uses more units. ") : ""}
        {value.speed !== "normal" ? (language === "hi" ? "प्रदाता के अनुसार अधिक गति ज़्यादा यूनिट उपयोग कर सकती है या उत्तर की गुणवत्ता घटा सकती है। " : language === "hinglish" ? "Provider ke hisaab se higher speed zyada units use kar sakti hai ya answer quality kam kar sakti hai. " : "Higher speed may use more units or reduce answer quality depending on provider. ") : ""}
        {webEnabled ? (language === "hi" ? "लाइव वेब खोज वास्तव में चलने पर 2 यूनिट जोड़ती है। " : language === "hinglish" ? "Live Web search sach mein chalne par 2 units add karti hai. " : "Live Web search adds 2 units when a search actually runs. ") : ""}
        {quotaMessage}
      </small>
    </div>
  );
}
