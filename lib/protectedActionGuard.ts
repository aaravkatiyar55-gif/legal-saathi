export type ProtectedActionDecision = "sign_in" | "accept_terms" | "run";

export function decideProtectedAction(
  isAuthenticated: boolean,
  hasAcceptedCurrentTerms: boolean,
): ProtectedActionDecision {
  if (!isAuthenticated) return "sign_in";
  if (!hasAcceptedCurrentTerms) return "accept_terms";
  return "run";
}
