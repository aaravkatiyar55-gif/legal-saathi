# Public-source package policy

The existing Legal Saathi repository remains private. It contains operational material and history that have not been cleared for public distribution.

`npm run public-source:check` validates the explicit source allowlist. After a reviewed release has been committed and the working tree is clean, `npm run public-source:prepare` can assemble a separate, ignored `.public-source-package/` directory. It does not create a GitHub repository, push, change visibility, deploy, or publish anything.

## What the package includes

- application and backend source needed to understand the product architecture;
- focused tests and public UI contracts;
- curated legal-information source files included in the codebase;
- a short README, architecture note, licence, attribution inventory, and the package verification script;
- safe development and build configuration that contains no credential values.

## What the package excludes

- `.env` files, Vercel metadata, Render configuration, runtime data, and deployment state;
- database migrations and credential-related schema material pending a separate review;
- QA reports, security-audit artifacts, release screenshots, browser traces, and generated data;
- dependency folders, build output, cache folders, local stores, and any symlink;
- known credential formats, if the verification scan detects them.

## Publication gate

The generated directory is a candidate, not an automatically publishable repository. Before publishing it, the owner must review the exact package, confirm licensing and IP ownership, run the package verifier, and make a separate intentional publication decision. The public repository must point to the same reviewed release as the public demo and README.
