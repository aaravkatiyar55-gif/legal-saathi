import type { ConsentRequirements, SessionPayload } from "@/lib/backendApi";

export type CompletedAuthState = {
  acceptedCurrent: boolean;
  adminEligible: boolean;
  requirements: ConsentRequirements;
};

export function deriveCompletedAuthState(session: SessionPayload): CompletedAuthState {
  const requirements = {
    termsVersion: session.requiredTermsVersion?.trim(),
    privacyVersion: session.requiredPrivacyVersion?.trim(),
    consentVersion: session.requiredConsentVersion?.trim(),
  };
  if (!requirements.termsVersion || !requirements.privacyVersion || !requirements.consentVersion) {
    throw new Error("AUTH_SESSION_CONSENT_REQUIREMENTS_MISSING");
  }
  return {
    acceptedCurrent: session.acceptedCurrent === true,
    adminEligible: session.adminEligible === true,
    requirements,
  };
}

export async function completeAuthenticatedHandoff<T>(options: {
  loadWorkspace: () => Promise<T>;
  applyWorkspace: (workspace: T) => void;
  clearWorkspace: () => void;
  resumeAction: () => Promise<void>;
}) {
  let workspaceAvailable = true;
  try {
    options.applyWorkspace(await options.loadWorkspace());
  } catch {
    workspaceAvailable = false;
    options.clearWorkspace();
  }
  await options.resumeAction();
  return { workspaceAvailable };
}
