# Public Source Audit

## Decision

**Verdict: sanitizable, but the existing repository must remain private for now.**

This is a tracked-path and configuration audit only. It did not read secret values, local `.env` files, cookies, account data, or provider credentials.

## Findings

- `.gitignore` and `.vercelignore` exclude local environment files, dependency folders, runtime stores, `.vercel`, and common key-file patterns.
- The tracked tree contains a large history of `qa/reports/**` artifacts. These are not appropriate for an initial public source release without a separate review for personal, environment, or operational information.
- A tracked migration path is named `database/migrations/20260728_admin_credentials_production.sql`. Its presence requires a focused security and IP review before any public release, even though this audit did not inspect or expose its contents.
- No `LICENSE` file is present, so the public sharing license and ownership terms are unresolved.
- The product source contains security, payment, authentication, document, and deployment material. A public source release needs an allowlist review, not a blanket repository visibility change.

## Safe public-source path

1. Keep this existing repository private.
2. Create a new, clean public-source branch or repository from an explicit allowlist of application source, test fixtures, documentation, and safe configuration examples.
3. Exclude environment files, runtime data, QA reports, generated outputs, security-audit artifacts, operational runbooks that reveal internal topology, credential-related migrations, and copied third-party material unless their licence and disclosure are confirmed.
4. Add a licence selected by the owner and an attribution/IP inventory.
5. Run a focused secret scan and human review on the exact public candidate.
6. Only then request owner approval to publish that new public-source version.

Until those steps are completed, the truthful Stardance status is **private source under public-source preparation**, not public repository ready.
