import assert from "node:assert/strict";

import {
  ConsentService,
  type ConsentAcceptanceInput,
  type ConsentEvent,
  type ConsentStoreAdapter,
  currentAiDisclaimerVersion,
  currentConsentVersion,
  currentCookiePreferencesVersion,
  currentDataProcessingVersion,
  currentPrivacyVersion,
  currentTermsVersion,
  isCurrentConsentEvent,
} from "./consent.service";
import { acceptedConsentItems, consentDocumentBundle } from "./consentDocuments.service";

function event(overrides: Partial<ConsentEvent> = {}): ConsentEvent {
  return {
    id: overrides.id ?? "consent-1",
    subject: overrides.subject ?? "user-owner",
    termsVersion: overrides.termsVersion ?? currentTermsVersion,
    privacyVersion: overrides.privacyVersion ?? currentPrivacyVersion,
    consentVersion: overrides.consentVersion ?? currentConsentVersion,
    aiDisclaimerVersion: overrides.aiDisclaimerVersion ?? currentAiDisclaimerVersion,
    dataProcessingVersion: overrides.dataProcessingVersion ?? currentDataProcessingVersion,
    cookiePreferencesVersion: overrides.cookiePreferencesVersion ?? currentCookiePreferencesVersion,
    acceptedAt: overrides.acceptedAt ?? "2026-07-24T00:00:00.000Z",
    sourceVersion: overrides.sourceVersion ?? "test",
    locale: overrides.locale ?? "en",
    authenticationMethod: overrides.authenticationMethod ?? "google",
    authenticationSessionReference: overrides.authenticationSessionReference ?? "safe-session-reference",
    normalizedEmail: overrides.normalizedEmail ?? "owner@example.com",
    accepted: overrides.accepted ?? true,
    termsDocumentId: overrides.termsDocumentId ?? consentDocumentBundle.terms.id,
    privacyDocumentId: overrides.privacyDocumentId ?? consentDocumentBundle.privacy.id,
    termsContentHashSha256: overrides.termsContentHashSha256 ?? consentDocumentBundle.terms.sha256,
    privacyContentHashSha256: overrides.privacyContentHashSha256 ?? consentDocumentBundle.privacy.sha256,
    acceptedItems: overrides.acceptedItems ?? [...acceptedConsentItems],
    requestId: overrides.requestId ?? "request-consent-1",
    sourceRoute: overrides.sourceRoute ?? "/profile/consent",
    userAgentMetadata: overrides.userAgentMetadata ?? { present: true, sha256: "safe-hash" },
    revokedAt: overrides.revokedAt ?? null,
    supersededAt: overrides.supersededAt ?? null,
    createdAt: overrides.createdAt ?? "2026-07-24T00:00:00.000Z",
  };
}

class FakeConsentStore implements ConsentStoreAdapter {
  readonly events: ConsentEvent[];
  insertCount = 0;

  constructor(initial: ConsentEvent[] = []) {
    this.events = [...initial];
  }

  async latest(subject: string) {
    return this.events
      .filter((item) => item.subject === subject && !item.revokedAt)
      .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))[0] ?? null;
  }

  async history(subject: string, limit: number) {
    return this.events
      .filter((item) => item.subject === subject)
      .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))
      .slice(0, limit);
  }

  async insert(input: ConsentAcceptanceInput) {
    this.insertCount += 1;
    const accepted = event({
      id: `consent-${this.events.length + 1}`,
      subject: input.subject,
      locale: input.locale,
      authenticationMethod: input.authenticationMethod,
      authenticationSessionReference: input.authenticationSessionReference,
      normalizedEmail: input.normalizedEmail,
      requestId: input.requestId,
      userAgentMetadata: input.userAgentMetadata,
      acceptedAt: `2026-07-24T00:00:0${this.events.length + 1}.000Z`,
    });
    this.events.push(accepted);
    return accepted;
  }

}

async function main() {
  let passed = 0;
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label);
    passed += 1;
  };

  const store = new FakeConsentStore();
  const service = new ConsentService(store);
  check(await service.latestCurrent("user-owner") === null, "missing record requires consent");

  const first = await service.accept({
    subject: "user-owner",
    locale: "hinglish",
    authenticationMethod: "google",
    authenticationSessionReference: "safe-session-reference-1",
    normalizedEmail: "owner@example.com",
    requestId: "request-consent-1",
    userAgentMetadata: { present: true, sha256: "safe-hash" },
  });
  check(isCurrentConsentEvent(first), "acceptance writes every current policy version");
  check(first.locale === "hinglish", "acceptance stores the selected locale");
  check(store.insertCount === 1, "first acceptance appends one event");
  check(first.termsContentHashSha256 === consentDocumentBundle.terms.sha256, "acceptance binds the current Terms hash");
  check(first.privacyContentHashSha256 === consentDocumentBundle.privacy.sha256, "acceptance binds the current Privacy hash");
  check(first.normalizedEmail === "owner@example.com", "acceptance stores normalized email evidence");

  const repeated = await service.accept({
    subject: "user-owner",
    locale: "en",
    authenticationMethod: "supabase",
    authenticationSessionReference: "safe-session-reference-2",
    normalizedEmail: "owner@example.com",
    requestId: "request-consent-2",
    userAgentMetadata: { present: true, sha256: "safe-hash-2" },
  });
  check(repeated.id === first.id && store.insertCount === 1, "same identity and current policy are idempotent across login methods");

  const old = event({
    id: "old-consent",
    subject: "user-versioned",
    consentVersion: "2026-07-18-consent-2",
    acceptedAt: "2026-07-18T00:00:00.000Z",
  });
  const versionedStore = new FakeConsentStore([old]);
  const versionedService = new ConsentService(versionedStore);
  check(await versionedService.latestCurrent("user-versioned") === null, "older policy version requires reacceptance");
  const current = await versionedService.accept({
    subject: "user-versioned",
    locale: "hi",
    authenticationMethod: "supabase",
    authenticationSessionReference: "safe-session-reference-3",
    normalizedEmail: "versioned@example.com",
    requestId: "request-consent-3",
    userAgentMetadata: { present: false, sha256: "" },
  });
  check(isCurrentConsentEvent(current), "reacceptance appends the current policy event");
  check(versionedStore.events.length === 2, "historical acceptance remains stored");
  check(old.supersededAt === null, "older acceptance remains immutable and is not rewritten");
  check((await versionedService.history("user-versioned")).length === 2, "owner-scoped history returns both versions");
  check((await versionedService.history("another-user")).length === 0, "consent history is owner isolated");
  check(current.cookiePreferencesVersion === currentCookiePreferencesVersion, "essential-cookie policy is versioned");
  check(/^[a-f0-9]{64}$/.test(consentDocumentBundle.terms.sha256), "Terms content hash is a stable SHA-256 value");
  check(/^[a-f0-9]{64}$/.test(consentDocumentBundle.privacy.sha256), "Privacy content hash is a stable SHA-256 value");

  process.stdout.write(`Versioned consent focused tests passed: ${passed}/17\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Consent tests failed"}\n`);
  process.exitCode = 1;
});
