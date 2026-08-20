export const currentTermsVersion = "2026-07-28-terms-3";
export const currentPrivacyVersion = "2026-07-28-privacy-3";
export const currentConsentVersion = "2026-07-28-consent-4";
export const currentAiDisclaimerVersion = "2026-07-28-ai-2";
export const currentDataProcessingVersion = "2026-07-28-processing-2";
export const currentCookiePreferencesVersion = "2026-07-24-essential-cookies-1";

export const currentConsentPolicy = {
  termsVersion: currentTermsVersion,
  privacyVersion: currentPrivacyVersion,
  consentVersion: currentConsentVersion,
  aiDisclaimerVersion: currentAiDisclaimerVersion,
  dataProcessingVersion: currentDataProcessingVersion,
  cookiePreferencesVersion: currentCookiePreferencesVersion,
} as const;

export const currentTermsConsentVersion = JSON.stringify(currentConsentPolicy);
