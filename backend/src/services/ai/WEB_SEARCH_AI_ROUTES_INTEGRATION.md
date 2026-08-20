# Web Search Integration Note For `ai.routes.ts`

This note defines the route-layer handoff for `webSearch.service.ts`. It intentionally does not change `ai.routes.ts`.

## Required order

1. Authenticate the user and verify Terms consent.
2. Resolve the authoritative plan and Web entitlement.
3. Reserve the base request once by request ID.
4. Call `searchLegalWebWithStatus` only after safety classification.
5. Pass only the returned bounded sources into AI context. Never pass the original private case/document text to a Web provider.
6. Finalize or refund exactly once.

## Charging contract

- Use `result.chargeable`, not `attempted` or `performed`, for the Web unit component.
- `chargeable: true` means reliable official source cards are available to the user.
- `timeout`, `provider_unavailable`, `not_configured`, and `no_reliable_result` are non-chargeable.
- A provider timeout or failed synthesis must not create a second reservation or a second refund.

## Source-only fallback

If Web retrieval succeeds but AI synthesis fails, call `createLegalWebSourceOnlyFallback(result)`.

- When it returns a value, respond with HTTP 200 and its exact safe message and source cards.
- Do not invent a legal summary.
- Preserve `requestId`, requested/resolved public model classes, and `webUsed: true`.
- Reconcile the request to the successful Web component only; refund the unused AI component exactly once.
- When it returns `null`, use the normal safe provider error path.

## User-facing states

- Not configured: `Live web search is not configured on this environment.`
- Timeout: `Live search took too long. Your request was not charged for the incomplete Web search.`
- No reliable result: `I could not find sufficiently reliable current official sources for this request.`
- Source-only fallback: `Live sources were found, but AI synthesis is temporarily unavailable.`

## Response safety

- Return only `title`, `url`, `excerpt`, `authority`, and `retrievedAt` from each source.
- Render URLs as links, but never as raw HTML.
- Do not return provider response bodies, authorization details, the minimized provider query, or private input.
- Keep the same application request ID across retrieval, synthesis, and any bounded provider failover.

## Route regression checks

- Free-plan Web requests are rejected before provider invocation.
- Paid-plan Web requests work independently of the selected configured model class.
- Timeout and no-result paths consume no Web units.
- Successful source-only fallback returns HTTP 200 and visible citations.
- Private identifiers and document text do not appear in the outbound Web request or response logs.
- One request ID produces at most one reservation and one finalization/refund.
