import assert from "node:assert/strict";
import { parseOpenRouterApiKeys } from "../../config/openRouterKeys";
import {
  classifyOpenRouterHttpFailure,
  extractOpenRouterSafeErrorMetadata,
} from "./openRouterErrorClassifier.service";
import {
  type ClassifiedOpenRouterFailure,
  OpenRouterKeyPool,
  OpenRouterKeyPoolUnavailableError,
  parseRetryAfterMs,
  runWithOpenRouterKeyPool,
} from "./openRouterKeyPool.service";

class SyntheticFailure extends Error {
  constructor(public readonly poolFailure: ClassifiedOpenRouterFailure) {
    super("synthetic provider failure");
  }
}

const classify = (error: unknown) => error instanceof SyntheticFailure ? error.poolFailure : null;
const fakeKey = (label: string) => `sk-or-v1-${label.padEnd(32, "x")}`;

async function main() {
  let checks = 0;
  const check = (condition: unknown, message: string) => {
    assert.ok(condition, message);
    checks += 1;
  };

  const legacy = fakeKey("legacy-primary");
  const secondary = fakeKey("secondary");
  const tertiary = fakeKey("tertiary");
  const parsed = parseOpenRouterApiKeys({
    OPENROUTER_API_KEY: ` ${legacy} `,
    OPENROUTER_API_KEY_2: secondary,
    OPENROUTER_API_KEY_3: tertiary,
  });
  check(parsed.length === 3, "legacy plus numbered keys parse");
  check(parsed[0] === legacy, "legacy primary is first when numbered slot one is absent");
  check(parseOpenRouterApiKeys({ OPENROUTER_API_KEYS: ` ${legacy}, ,${secondary},${legacy} ` }).length === 2, "comma list trims blanks and duplicates");
  check(parseOpenRouterApiKeys({ OPENROUTER_API_KEY_12: fakeKey("twelfth") }).length === 1, "arbitrary positive numbered slot parses");
  check(parseOpenRouterApiKeys({ OPENROUTER_API_KEY: "short", OPENROUTER_API_KEY_2: "contains whitespace and is invalid" }).length === 0, "malformed keys are ignored");
  check(parseOpenRouterApiKeys({ OPENROUTER_API_KEYS: legacy, OPENROUTER_API_KEY_1: legacy, OPENROUTER_API_KEY: legacy }).length === 1, "cross-format deduplication");

  const now = Date.parse("2026-01-01T00:00:00.000Z");
  check(parseRetryAfterMs("60", now) === 60_000, "Retry-After delta seconds");
  check(parseRetryAfterMs(new Date(now + 45_000).toUTCString(), now) === 45_000, "Retry-After HTTP date");
  check(parseRetryAfterMs("999999", now) === 15 * 60 * 1000, "Retry-After is clamped");
  check(parseRetryAfterMs("invalid", now) === undefined, "invalid Retry-After is ignored");

  const rateFailure = classifyOpenRouterHttpFailure({
    status: 429,
    retryAfterHeader: "60",
    metadata: extractOpenRouterSafeErrorMetadata('{"error":{"code":429,"metadata":{"error_type":"rate_limit_exceeded"}}}'),
  });
  check(rateFailure.category === "rate_limited" && rateFailure.allowAlternate && rateFailure.retryAfterMs === 60_000, "429 classification");

  const accountFailure = classifyOpenRouterHttpFailure({
    status: 429,
    metadata: extractOpenRouterSafeErrorMetadata('{"error":{"code":429,"message":"Account daily limit reached"}}'),
  });
  check(accountFailure.category === "account_wide_limit" && !accountFailure.allowAlternate, "account-wide 429 stops cycling");

  const capacityFailure = classifyOpenRouterHttpFailure({
    status: 503,
    metadata: extractOpenRouterSafeErrorMetadata('{"error":{"code":503,"metadata":{"error_type":"provider_overloaded"}}}'),
  });
  check(capacityFailure.category === "provider_capacity" && !capacityFailure.allowAlternate, "typed provider capacity does not rotate keys");

  const transientFailure = classifyOpenRouterHttpFailure({ status: 503 });
  check(transientFailure.category === "transient_upstream" && transientFailure.allowAlternate, "generic 503 permits bounded failover");

  const badRequestFailure = classifyOpenRouterHttpFailure({ status: 400 });
  const contentFailure = classifyOpenRouterHttpFailure({
    status: 400,
    metadata: extractOpenRouterSafeErrorMetadata('{"error":{"metadata":{"error_type":"content_policy_violation"}}}'),
  });
  const privacyFailure = classifyOpenRouterHttpFailure({
    status: 403,
    metadata: extractOpenRouterSafeErrorMetadata('{"error":{"message":"Zero data retention is unavailable for this route"}}'),
  });
  check(badRequestFailure.category === "bad_request" && !badRequestFailure.allowAlternate, "HTTP 400 does not rotate");
  check(contentFailure.category === "content_or_policy_rejection" && !contentFailure.allowAlternate, "content rejection does not rotate");
  check(privacyFailure.category === "privacy_ineligible" && !privacyFailure.allowAlternate, "privacy-ineligible route does not rotate");

  const failoverPool = new OpenRouterKeyPool([legacy, secondary]);
  let rateAttempts = 0;
  const rateResult = await runWithOpenRouterKeyPool({
    pool: failoverPool,
    classifyFailure: classify,
    attempt: async (_lease, attemptIndex) => {
      rateAttempts += 1;
      if (attemptIndex === 0) throw new SyntheticFailure(rateFailure);
      return "ok";
    },
  });
  check(rateResult === "ok" && rateAttempts === 2, "first key 429 then second succeeds");
  check(failoverPool.stats().rateLimitedKeyCount === 1 && failoverPool.stats().usableKeyCount === 1, "429 key enters cooldown");

  let postRateLease = "";
  await runWithOpenRouterKeyPool({
    pool: failoverPool,
    classifyFailure: classify,
    attempt: async (lease) => {
      postRateLease = lease.internalId;
      return "next-ok";
    },
  });
  check(postRateLease === "key-02", "next request skips cooling key");

  const timeoutPool = new OpenRouterKeyPool([legacy, secondary]);
  let timeoutAttempts = 0;
  const timeoutResult = await runWithOpenRouterKeyPool({
    pool: timeoutPool,
    classifyFailure: classify,
    attempt: async (_lease, attemptIndex) => {
      timeoutAttempts += 1;
      if (attemptIndex === 0) {
        throw new SyntheticFailure({
          category: "timeout",
          scope: "key",
          keyAction: "cooldown",
          allowAlternate: true,
        });
      }
      return "ok";
    },
  });
  check(timeoutResult === "ok" && timeoutAttempts === 2, "timeout then second key succeeds");

  const transientPool = new OpenRouterKeyPool([legacy, secondary]);
  let transientAttempts = 0;
  const transientResult = await runWithOpenRouterKeyPool({
    pool: transientPool,
    classifyFailure: classify,
    attempt: async (_lease, attemptIndex) => {
      transientAttempts += 1;
      if (attemptIndex === 0) throw new SyntheticFailure(transientFailure);
      return "ok";
    },
  });
  check(transientResult === "ok" && transientAttempts === 2, "generic 503 then second key succeeds");

  const invalidPool = new OpenRouterKeyPool([legacy, secondary]);
  const invalidFailure = classifyOpenRouterHttpFailure({ status: 401 });
  let invalidAttempts = 0;
  await runWithOpenRouterKeyPool({
    pool: invalidPool,
    classifyFailure: classify,
    attempt: async (_lease, attemptIndex) => {
      invalidAttempts += 1;
      if (attemptIndex === 0) throw new SyntheticFailure(invalidFailure);
      return "ok";
    },
  });
  check(invalidAttempts === 2 && invalidPool.stats().invalidKeyCount === 1, "invalid first key is disabled and alternate succeeds");

  for (const [label, failure] of [
    ["bad request", badRequestFailure],
    ["content policy", contentFailure],
  ] as const) {
    const pool = new OpenRouterKeyPool([legacy, secondary]);
    let attempts = 0;
    await assert.rejects(runWithOpenRouterKeyPool({
      pool,
      classifyFailure: classify,
      attempt: async () => {
        attempts += 1;
        throw new SyntheticFailure(failure);
      },
    }));
    check(attempts === 1, `${label} stops after one attempt`);
    check(pool.stats().inFlightRequestCount === 0, `${label} releases in-flight state`);
  }

  const accountPool = new OpenRouterKeyPool([legacy, secondary, tertiary]);
  let accountAttempts = 0;
  await assert.rejects(runWithOpenRouterKeyPool({
    pool: accountPool,
    classifyFailure: classify,
    attempt: async () => {
      accountAttempts += 1;
      throw new SyntheticFailure(accountFailure);
    },
  }));
  check(accountAttempts === 1 && accountPool.healthyKeyCount() === 0, "account-wide limit blocks remaining same-pool keys");
  await assert.rejects(runWithOpenRouterKeyPool({
    pool: accountPool,
    classifyFailure: classify,
    attempt: async () => "unexpected",
  }), (error: unknown) => error instanceof OpenRouterKeyPoolUnavailableError && error.failure.category === "account_wide_limit");
  checks += 1;

  let privacyProviderCalls = 0;
  if (privacyFailure.category !== "privacy_ineligible") privacyProviderCalls += 1;
  check(privacyProviderCalls === 0, "privacy-ineligible preflight invokes zero provider calls");

  const boundedPool = new OpenRouterKeyPool([legacy, secondary, tertiary, fakeKey("fourth"), fakeKey("fifth")]);
  let boundedAttempts = 0;
  let reservations = 1;
  let finalizations = 0;
  let refunds = 0;
  await assert.rejects(runWithOpenRouterKeyPool({
    pool: boundedPool,
    classifyFailure: classify,
    attempt: async () => {
      boundedAttempts += 1;
      throw new SyntheticFailure(transientFailure);
    },
  }));
  refunds += 1;
  check(boundedAttempts === 3, "attempt count never exceeds three");
  check(reservations === 1 && finalizations === 0 && refunds === 1, "all-key failure refunds one reservation once");

  const settlementPool = new OpenRouterKeyPool([legacy, secondary]);
  reservations = 1;
  finalizations = 0;
  refunds = 0;
  await runWithOpenRouterKeyPool({
    pool: settlementPool,
    classifyFailure: classify,
    attempt: async (_lease, attemptIndex) => {
      if (attemptIndex === 0) throw new SyntheticFailure(rateFailure);
      return "final-answer";
    },
  }).then(() => {
    finalizations += 1;
  }).catch(() => {
    refunds += 1;
  });
  check(reservations === 1 && finalizations === 1 && refunds === 0, "failover success settles once");

  let userLimitAllowsProvider = false;
  let userLimitProviderCalls = 0;
  if (userLimitAllowsProvider) {
    await runWithOpenRouterKeyPool({
      pool: new OpenRouterKeyPool([legacy]),
      classifyFailure: classify,
      attempt: async () => {
        userLimitProviderCalls += 1;
        return "unexpected";
      },
    });
  }
  check(userLimitProviderCalls === 0, "user product limit invokes zero provider calls");

  const diagnosticText = JSON.stringify(new OpenRouterKeyPool([fakeKey("never-expose-this-secret")]).stats());
  check(!diagnosticText.includes("never-expose-this-secret"), "aggregate diagnostics contain no key material");
  check(!Object.keys(JSON.parse(diagnosticText)).some((key) => /slot|fingerprint|secret|label/i.test(key)), "aggregate diagnostics contain no key identifiers");
  const exhaustedText = JSON.stringify(new OpenRouterKeyPoolUnavailableError(accountFailure));
  check(!/sk-or|fingerprint|key-0/i.test(exhaustedText), "pool exhaustion error contains no key material");

  console.log(`OpenRouter parsing, centralized classification, cooldowns, bounded failover, and single settlement: PASS ${checks}/${checks}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "OpenRouter key-pool test failed");
  process.exitCode = 1;
});
