# Legal Saathi architecture

Legal Saathi is an India-focused legal-information and case-preparation workspace. It is designed to help a person organise questions, records, and next steps; it does not file, send, pay, contact another party, or act as legal representation.

## Request path

```text
Browser
  -> Next.js application and same-origin BFF routes
  -> Express API
  -> authenticated services: chat, cases, documents, consent, plans, and payments
  -> configured storage, identity, retrieval, and AI providers
```

The browser only talks to the application origin for app requests. The Next.js BFF has an allowlist and bounded payloads, but it is not the authorization boundary. The Express API validates the session, ownership, plan, and request policy before it accesses a provider or persistent store.

## Main layers

| Layer | Responsibility |
| --- | --- |
| `app/` | Public pages and same-origin route handlers. |
| `components/` | The legal workspace, guided preparation, cases, settings, consent, and account interfaces. |
| `lib/` | Typed client contracts, UI state, request helpers, translations, and server-only BFF safeguards. |
| `backend/src/` | Express routes and services for identity, legal chat, retrieval, cases, documents, incidents, plans, and payment verification. |
| `backend/legal-knowledge/` | Curated, plain-language legal-information source material used only when configured through the retrieval pipeline. |

## Trust boundaries

- Authentication, authorization, ownership checks, quota enforcement, and payment verification happen server-side.
- Frontend availability states are informational. A visible control never grants a protected capability by itself.
- Legal questions and uploaded documents are sensitive. Production configuration must keep provider keys, service credentials, payment secrets, and admin secrets server-side.
- AI output is treated as draft legal information. It should be source-aware where a source is available and reviewed by a qualified advocate before legal action.

## Failure behaviour

When a dependency is missing, temporarily unavailable, out of quota, or rejected by policy, Legal Saathi should preserve the user draft and show a plain-language recovery path. It must not fabricate an answer, citation, successful upload, payment, or saved record.

## Local development

The development environment can use explicit local/mock adapters for UI and contract testing. Those adapters are deliberately not evidence that production identity, AI, Web research, storage, or payment integrations are live. See the root [README](../README.md) for the quick start and the existing operator documents for controlled hosted verification.
