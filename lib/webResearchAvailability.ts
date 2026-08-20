export const WEB_RESEARCH_ENVIRONMENT_UNAVAILABLE = "Web research is unavailable in this environment. You can still ask a question without it.";
export const WEB_RESEARCH_PLAN_STATUS_UNKNOWN = "Web research is temporarily unavailable while your plan is checked. You can still ask a question without it.";
export const WEB_RESEARCH_PLAN_UNAVAILABLE = "Web research is not included in the active plan.";

export type WebResearchAvailability =
  | "available"
  | "environment_unavailable"
  | "plan_status_unknown"
  | "plan_unavailable";

/**
 * The server remains authoritative for Web access. The client only enables the
 * control once both configuration and the current plan are positively known.
 */
export function getWebResearchAvailability(
  configured: boolean | null,
  includedInPlan: boolean | null | undefined,
): WebResearchAvailability {
  if (configured !== true) return "environment_unavailable";
  if (includedInPlan === undefined || includedInPlan === null) return "plan_status_unknown";
  if (!includedInPlan) return "plan_unavailable";
  return "available";
}

export function getWebResearchAvailabilityMessage(
  availability: Exclude<WebResearchAvailability, "available">,
) {
  if (availability === "plan_status_unknown") return WEB_RESEARCH_PLAN_STATUS_UNKNOWN;
  if (availability === "plan_unavailable") return WEB_RESEARCH_PLAN_UNAVAILABLE;
  return WEB_RESEARCH_ENVIRONMENT_UNAVAILABLE;
}
