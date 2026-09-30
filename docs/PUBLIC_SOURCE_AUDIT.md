# Public Source Audit

This public repository is a source snapshot assembled from an explicit allowlist. The operational repository and its private history are separate.

## Current snapshot

- Application source, focused tests and dependency lockfiles are included.
- An MIT licence is present in `LICENSE`; third-party notes are in `THIRD_PARTY_ATTRIBUTION.md`.
- Environment files, deployment metadata, credential-related migrations, runtime data and private QA artifacts are excluded from the public package.
- `node scripts/verify-public-source-package.mjs --check` validates the allowlist and scans the candidate for known secret markers. It is a bounded check, not a guarantee that every possible secret format is detectable.
- No local credential values, cookies, account data or provider settings were read for this documentation update.

## Historical reason for using a snapshot

The original operational repository contained QA report history and credential-related migration paths. Its initial audit also found no sharing licence at that time. Those findings applied to that earlier private repository, not to the current published snapshot.

Do not change the operational repository's visibility to update this source. Review and publish only the exact allowlisted files. Keep credentials, generated evidence and private operational material out of commits.

## Release evidence

A successful source scan proves the candidate passed the defined checks. GitHub publication, deployment, live provider behavior and Stardance approval are separate outcomes. Record each honestly in the release report.
