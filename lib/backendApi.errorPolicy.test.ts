import { BackendApiError, safeInlineBackendMessage, shouldAttemptLegalChatRecovery } from "./backendApi";

const assertions: Array<[boolean, string]> = [];
const check = (value: boolean, message: string) => assertions.push([value, message]);

const optionalRefreshError = new BackendApiError({
  code: "BACKEND_PROXY_TIMEOUT",
  requestId: "request-id-123",
  status: 504,
});

check(
  safeInlineBackendMessage(optionalRefreshError, "Plan state could not be refreshed.") === optionalRefreshError.message,
  "optional backend refresh errors remain inline instead of returning an empty value",
);
check(
  safeInlineBackendMessage(new Error("unexpected"), "Refresh failed.") === "Refresh failed.",
  "unknown optional errors return the caller fallback without dispatching a global modal",
);

const recoveredDuplicate = new BackendApiError({
  code: "REQUEST_ALREADY_PROCESSED",
  requestId: "request-id-456",
  status: 409,
});
check(
  recoveredDuplicate.kind === "duplicate_request" && recoveredDuplicate.message.includes("recovering your previous response"),
  "completed-response duplicate IDs use the recovery message",
);

const providerTimeout = new BackendApiError({
  code: "AI_PROVIDER_TIMEOUT",
  requestId: "request-id-789",
  status: 502,
});
check(
  providerTimeout.kind === "provider_timeout" && providerTimeout.presentation === "product",
  "provider timeouts have a clear inline retry-safe classification",
);

const providerUnavailable = new BackendApiError({
  code: "AI_PROVIDER_UNAVAILABLE",
  requestId: "request-id-901",
  status: 503,
});
check(
  providerUnavailable.kind === "provider_unavailable" && providerUnavailable.presentation === "product",
  "temporary provider outages stay in the conversation instead of opening the generic error modal",
);

const networkFailure = new BackendApiError({
  code: "BACKEND_OFFLINE",
  requestId: "request-id-902",
  status: 0,
});
check(
  networkFailure.kind === "network" && networkFailure.presentation === "product",
  "network recovery remains contextual so the original question can be retried safely",
);

const clientDeadlineTimeout = new BackendApiError({
  code: "REQUEST_TIMEOUT",
  requestId: "request-id-903",
  status: 0,
});
check(
  shouldAttemptLegalChatRecovery(clientDeadlineTimeout),
  "a client-side deadline timeout checks whether the same request completed before asking the user to send it again",
);
check(
  !shouldAttemptLegalChatRecovery(networkFailure),
  "an immediately known offline state does not add a misleading recovery request",
);

const failures = assertions.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length > 0) throw new Error(failures.join("\n"));
console.info(`Backend API error policy: PASS ${assertions.length}/${assertions.length}`);
