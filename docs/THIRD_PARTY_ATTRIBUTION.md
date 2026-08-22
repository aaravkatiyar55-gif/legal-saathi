# Third-party attribution inventory

This inventory is a starting point for the isolated public-source package. It is not a substitute for a final licence audit of the exact dependency lockfiles before publication.

## Runtime libraries

- Next.js and React: application framework and rendering.
- TypeScript: static type checking.
- Lucide: interface icons.
- Supabase JavaScript client: optional configured identity and data adapters.
- Google Auth Library: server-side identity-token verification when configured.
- Mammoth, PDF parsing, Tesseract: optional document processing utilities.
- QRCode React: optional QR rendering for supported product flows.

## Provider integrations

Legal Saathi can integrate with configured third-party services for identity, AI, retrieval, storage, and payments. Their credentials are not part of the public package. Each production deployment must follow the service's own terms, privacy requirements, and billing obligations.

## Before public release

1. Review the package's `package-lock.json` and backend lockfile for the exact dependency versions.
2. Confirm each included dependency's licence and notice obligations.
3. Add any required licence texts or notices to the public package.
4. Confirm that bundled assets, curated legal-information text, and branding may be distributed under the selected MIT licence.
