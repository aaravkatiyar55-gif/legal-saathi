# Legal Saathi

Legal Saathi helps people in India put a legal question into words and organise the facts before speaking to an advocate. The interface supports English, Hindi and Hinglish.

[Open the live demo](https://legalsaathi-india.vercel.app/) · [How the application is structured](docs/ARCHITECTURE.md)

## Try it without an account

Start on the entry page. You can:

1. Pick a situation in the preparation checklist: a purchase, rental disagreement, delayed salary or agreement review.
2. Work through three short clarity questions about records and context.
3. Read the case journey to understand the preparation steps.
4. Write dates, records and one question in **Make a note before you ask**, then download a plain-text preparation note.

The note tool runs in the browser. It does not send the note to AI, store it in the account, or autosave it. Reloading or leaving the page loses the note; a downloaded file stays on your device. Use fictional details when trying the demo.

Numbered links take you straight to each tool. You can switch languages while working without resetting the checklist or note. The public and professional role choices remain available for entering the workspace.

## What it can and cannot do

The broader application has account, chat, document and case-workspace code. Those flows depend on separately configured identity, storage, AI and payment services. A working entry page does not prove all those integrations.

Legal Saathi is for general information and preparation. It is not a law firm or legal representation. It does not file a case, contact another party, send a document or make a payment on your behalf. AI responses can be incomplete or wrong; get qualified advice before taking legal action. For urgent situations, use appropriate official help.

## Run the source

Use Node.js 24 and npm. Install dependencies from both lockfiles:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd --prefix backend ci --ignore-scripts
npm.cmd run dev:web
```

The website opens at `http://localhost:3001`. In another terminal, start the API if you need to test configured backend flows:

```powershell
npm.cmd run dev:backend
```

The backend health endpoint is `http://localhost:8000/health`. The public preparation tools work without an account. Protected features need the corresponding environment configuration; do not reuse credentials from another project.

## Check a change

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:web
npm.cmd run build:backend
npm.cmd run test:entry
```

Before deploying an entry-page change, also try a narrow mobile screen, keyboard navigation, all three languages, note download, and the Terms/Privacy links at the bottom. Use synthetic data for every test.

## Find the relevant code

| Area | Location |
| --- | --- |
| Entry page, roles and navigation | `components/RoleSelection.tsx` and its CSS module |
| Private note tool | `components/PreparationNote.tsx`, `lib/preparationNote.ts` |
| Checklist and clarity exercise | `components/LegalPreparationCompass.tsx`, `components/LegalClaritySprint.tsx` |
| Translations | `lib/i18n/` |
| Same-origin API boundary | `app/api/legal-sathi/`, `lib/server/` |
| Authentication and API services | `backend/src/` |

The Next.js frontend talks to the Express backend through a same-origin BFF. Server code owns identity checks, quotas, payments and sensitive-data handling. Missing configuration should produce an honest availability error rather than a fake success.

## Release notes and current limits

See [the entry-page release notes](docs/ENTRY_PREPARATION_RELEASE.md) and [the earlier scroll fix](docs/ENTRY_SCROLL_FIX.md) for the exact changes and validation. GitHub source and live deployment are checked separately.

The public preparation-note download completed in the production browser walkthrough on 30 September 2026 using fictional details. The release notes distinguish that browser evidence from the formatter tests and authenticated product checks.

Google provider readiness was false in the hosted configuration check on 30 September 2026. Its underlying provider configuration has not been changed, and live Google sign-in is not claimed as verified. Saved chats, uploads, AI responses and payments need their own authenticated end-to-end evidence before they are claimed as ship-ready.

## About this repository

This is the public, allowlisted source snapshot. Credentials and private operational runbooks are excluded. Some inherited operational commands in `package.json` refer to private scripts; use the public commands above for this snapshot.

[Source package policy](docs/PUBLIC_SOURCE_PACKAGE.md) · [Source audit](docs/PUBLIC_SOURCE_AUDIT.md) · [Third-party attribution](docs/THIRD_PARTY_ATTRIBUTION.md)

AI assistance was used in development, testing and documentation, including this entry-page update. The source and test evidence are available for review. This README does not claim an AI-percentage limit has been met or that Stardance has approved the project.
