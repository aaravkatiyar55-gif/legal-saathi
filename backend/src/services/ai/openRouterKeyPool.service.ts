import { createHash } from "node:crypto";
import {
  type ClassifiedOpenRouterFailure,
  type OpenRouterFailureCategory,
  parseRetryAfterMs,
} from "./openRouterErrorClassifier.service";

export type { ClassifiedOpenRouterFailure } from "./openRouterErrorClassifier.service";
export { parseRetryAfterMs } from "./openRouterErrorClassifier.service";

type PoolEntry = {
  secret: string;
  fingerprint: string;
  internalId: string;
  enabled: boolean;
  cooldownUntil: number | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastSafeCheckAt: string | null;
  lastFailureCategory: OpenRouterFailureCategory | null;
  lastFailureOrder: number;
  inFlightRequests: number;
};

export type OpenRouterKeyLease = {
  secret: string;
  fingerprint: string;
  internalId: string;
};

export type OpenRouterKeyPoolStats = {
  configuredKeyCount: number;
  usableKeyCount: number;
  invalidKeyCount: number;
  rateLimitedKeyCount: number;
  paymentRequiredKeyCount: number;
  temporarilyUnavailableKeyCount: number;
  inFlightRequestCount: number;
  accountWideBlocked: boolean;
  lastSanitizedCheckAt: string | null;
};

export class OpenRouterKeyPoolUnavailableError extends Error {
  constructor(public readonly failure: ClassifiedOpenRouterFailure) {
    super("OPENROUTER_KEY_POOL_UNAVAILABLE");
  }
}

const maximumCooldownMs = 15 * 60 * 1000;
const maximumProviderAttempts = 3;

function fingerprint(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function defaultCooldownMs(failure: ClassifiedOpenRouterFailure, consecutiveFailures: number) {
  const base = failure.category === "rate_limited"
    ? 30_000
    : failure.category === "account_wide_limit"
      ? 5 * 60 * 1000
      : failure.category === "provider_capacity"
        ? 20_000
        : failure.category === "timeout"
          ? 10_000
          : 15_000;
  return Math.min(maximumCooldownMs, base * (2 ** Math.min(4, Math.max(0, consecutiveFailures - 1))));
}

export class OpenRouterKeyPool {
  private readonly entries: PoolEntry[];
  private cursor = 0;
  private failureOrder = 0;
  private poolBlockedUntil: number | null = null;
  private poolBlockedFailure: ClassifiedOpenRouterFailure | null = null;

  constructor(keys: string[], private readonly now: () => number = Date.now) {
    const seen = new Set<string>();
    this.entries = keys.flatMap((value) => {
      const secret = value.trim();
      if (!secret) return [];
      const id = fingerprint(secret);
      if (seen.has(id)) return [];
      seen.add(id);
      return [{
        secret,
        fingerprint: id,
        internalId: `key-${String(seen.size).padStart(2, "0")}`,
        enabled: true,
        cooldownUntil: null,
        consecutiveFailures: 0,
        lastSuccessAt: null,
        lastSafeCheckAt: null,
        lastFailureCategory: null,
        lastFailureOrder: 0,
        inFlightRequests: 0,
      }];
    });
  }

  private refreshPoolBlock() {
    if (this.poolBlockedUntil === null || this.now() < this.poolBlockedUntil) return;
    this.poolBlockedUntil = null;
    this.poolBlockedFailure = null;
  }

  private refresh(entry: PoolEntry) {
    if (!entry.enabled || entry.cooldownUntil === null || this.now() < entry.cooldownUntil) return;
    entry.cooldownUntil = null;
    entry.consecutiveFailures = 0;
  }

  healthyKeyCount(excludedFingerprints: ReadonlySet<string> = new Set()) {
    this.refreshPoolBlock();
    if (this.poolBlockedFailure) return 0;
    return this.entries.filter((entry) => {
      this.refresh(entry);
      return entry.enabled && entry.cooldownUntil === null && !excludedFingerprints.has(entry.fingerprint);
    }).length;
  }

  acquire(excludedFingerprints: ReadonlySet<string> = new Set()): OpenRouterKeyLease | null {
    this.refreshPoolBlock();
    if (this.poolBlockedFailure || this.entries.length === 0) return null;

    const eligible = this.entries.filter((entry) => {
      this.refresh(entry);
      return entry.enabled && entry.cooldownUntil === null && !excludedFingerprints.has(entry.fingerprint);
    });
    if (eligible.length === 0) return null;

    const lowestInFlight = Math.min(...eligible.map((entry) => entry.inFlightRequests));
    for (let offset = 0; offset < this.entries.length; offset += 1) {
      const index = (this.cursor + offset) % this.entries.length;
      const entry = this.entries[index];
      if (!eligible.includes(entry) || entry.inFlightRequests !== lowestInFlight) continue;
      this.cursor = (index + 1) % this.entries.length;
      entry.inFlightRequests += 1;
      return {
        secret: entry.secret,
        fingerprint: entry.fingerprint,
        internalId: entry.internalId,
      };
    }
    return null;
  }

  release(keyFingerprint: string) {
    const entry = this.entries.find((candidate) => candidate.fingerprint === keyFingerprint);
    if (!entry) return;
    entry.inFlightRequests = Math.max(0, entry.inFlightRequests - 1);
  }

  recordSuccess(keyFingerprint: string) {
    const entry = this.entries.find((candidate) => candidate.fingerprint === keyFingerprint);
    if (!entry) return;
    this.release(keyFingerprint);
    entry.enabled = true;
    entry.cooldownUntil = null;
    entry.consecutiveFailures = 0;
    entry.lastFailureCategory = null;
    entry.lastSuccessAt = new Date(this.now()).toISOString();
    entry.lastSafeCheckAt = entry.lastSuccessAt;
  }

  recordFailure(keyFingerprint: string, failure: ClassifiedOpenRouterFailure) {
    const entry = this.entries.find((candidate) => candidate.fingerprint === keyFingerprint);
    if (!entry) return;
    this.release(keyFingerprint);
    entry.consecutiveFailures += 1;
    entry.lastSafeCheckAt = new Date(this.now()).toISOString();
    entry.lastFailureCategory = failure.category;
    entry.lastFailureOrder = ++this.failureOrder;

    if (failure.keyAction === "disable") {
      entry.enabled = false;
      entry.cooldownUntil = null;
      return;
    }
    if (failure.keyAction === "block_pool") {
      const cooldownMs = Math.max(
        1_000,
        Math.min(maximumCooldownMs, failure.retryAfterMs ?? defaultCooldownMs(failure, entry.consecutiveFailures)),
      );
      this.poolBlockedUntil = this.now() + cooldownMs;
      this.poolBlockedFailure = { ...failure, allowAlternate: false, retryAfterMs: cooldownMs };
      return;
    }
    if (failure.keyAction === "cooldown") {
      const cooldownMs = Math.max(
        1_000,
        Math.min(maximumCooldownMs, failure.retryAfterMs ?? defaultCooldownMs(failure, entry.consecutiveFailures)),
      );
      entry.cooldownUntil = this.now() + cooldownMs;
    }
  }

  unavailableFailure(): ClassifiedOpenRouterFailure | null {
    this.refreshPoolBlock();
    if (this.poolBlockedFailure) {
      return {
        ...this.poolBlockedFailure,
        allowAlternate: false,
        retryAfterMs: this.poolBlockedUntil === null ? undefined : Math.max(0, this.poolBlockedUntil - this.now()),
      };
    }

    for (const entry of this.entries) this.refresh(entry);
    const blocked = this.entries.filter((entry) => !entry.enabled || entry.cooldownUntil !== null);
    if (blocked.length === 0) return null;
    const mostRecent = blocked.reduce((latest, entry) => (
      entry.lastFailureOrder > latest.lastFailureOrder ? entry : latest
    ));
    const category = mostRecent.lastFailureCategory ?? "unknown_provider_failure";
    return {
      category,
      scope: mostRecent.enabled ? "key" : "key",
      keyAction: mostRecent.enabled ? "cooldown" : "disable",
      allowAlternate: false,
      ...(mostRecent.cooldownUntil === null
        ? {}
        : { retryAfterMs: Math.max(0, mostRecent.cooldownUntil - this.now()) }),
    };
  }

  stats(): OpenRouterKeyPoolStats {
    this.refreshPoolBlock();
    for (const entry of this.entries) this.refresh(entry);
    const blockedByPool = Boolean(this.poolBlockedFailure);
    const checks = this.entries
      .map((entry) => entry.lastSafeCheckAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    return {
      configuredKeyCount: this.entries.length,
      usableKeyCount: blockedByPool
        ? 0
        : this.entries.filter((entry) => entry.enabled && entry.cooldownUntil === null).length,
      invalidKeyCount: this.entries.filter((entry) => !entry.enabled && entry.lastFailureCategory === "invalid_credential").length,
      rateLimitedKeyCount: this.entries.filter((entry) => entry.cooldownUntil !== null && entry.lastFailureCategory === "rate_limited").length,
      paymentRequiredKeyCount: this.poolBlockedFailure?.category === "account_wide_limit" ? this.entries.length : 0,
      temporarilyUnavailableKeyCount: this.entries.filter((entry) => (
        entry.cooldownUntil !== null
        && ["provider_capacity", "transient_upstream", "timeout", "unknown_provider_failure"].includes(entry.lastFailureCategory ?? "")
      )).length,
      inFlightRequestCount: this.entries.reduce((total, entry) => total + entry.inFlightRequests, 0),
      accountWideBlocked: this.poolBlockedFailure?.scope === "account",
      lastSanitizedCheckAt: checks.at(-1) ?? null,
    };
  }
}

export async function runWithOpenRouterKeyPool<T>(input: {
  pool: OpenRouterKeyPool;
  attempt: (lease: OpenRouterKeyLease, attemptIndex: number) => Promise<T>;
  classifyFailure: (error: unknown) => ClassifiedOpenRouterFailure | null;
  maxAttempts?: number;
}) {
  const attempted = new Set<string>();
  let lastError: unknown = new Error("OPENROUTER_KEY_POOL_EXHAUSTED");
  const attemptBudget = Math.min(
    maximumProviderAttempts,
    Math.max(0, input.maxAttempts ?? maximumProviderAttempts),
    input.pool.healthyKeyCount(),
  );

  if (attemptBudget === 0) {
    const failure = input.pool.unavailableFailure();
    if (failure) throw new OpenRouterKeyPoolUnavailableError(failure);
    throw lastError;
  }

  for (let attemptIndex = 0; attemptIndex < attemptBudget; attemptIndex += 1) {
    const lease = input.pool.acquire(attempted);
    if (!lease) break;
    attempted.add(lease.fingerprint);
    try {
      const result = await input.attempt(lease, attemptIndex);
      input.pool.recordSuccess(lease.fingerprint);
      return result;
    } catch (error) {
      lastError = error;
      const failure = input.classifyFailure(error);
      if (!failure) {
        input.pool.release(lease.fingerprint);
        throw error;
      }
      input.pool.recordFailure(lease.fingerprint, failure);
      if (!failure.allowAlternate) throw error;
    }
  }
  throw lastError;
}
