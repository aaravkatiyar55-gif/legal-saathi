# Legal Saathi

Legal Saathi is an India-focused workspace for general legal information and case preparation. It helps a person frame a question, organise facts and documents they choose to save, and prepare an editable brief for a qualified advocate.

**It is not a law firm, legal representation, or a substitute for urgent official help.** It does not automatically file, send, pay, publish, contact another party, or act for a user.

## Demo

[Open the live Legal Saathi demo](https://legalsaathi-india.vercel.app/)

The live service and this branch are verified separately. A local change is not a live-feature claim until the exact reviewed commit is deployed and checked.

## What a first-time user can do

- Choose a public legal-help or legal-professional preparation path.
- Use English, Hindi, or Hinglish interface copy.
- Try a private preparation checklist and short legal-literacy exercise before entering the workspace.
- Frame a general legal question with privacy guidance and clear limits.
- Review public Terms, Privacy, Support, and legal-information boundaries.

Authenticated features—including saved chats, case records, document processing, AI responses, Web citations, plan state, and payments—need their own synthetic-data verification before they are described as live in a public demo or submission.

## Architecture at a glance

```text
Next.js user interface + same-origin BFF
                 |
                 v
          Express API services
                 |
                 v
Configured identity, storage, retrieval, AI, and payment providers
```

The server is responsible for identity, ownership checks, quota enforcement, sensitive-data handling, and payment verification. Missing configuration fails safely rather than inventing a successful result. See [Architecture](docs/ARCHITECTURE.md) for the detailed boundary map.

## Local quick start

```powershell
npm.cmd ci
npm.cmd --prefix backend ci
npm.cmd run dev
```

- Web app: `http://localhost:3001`
- Backend health endpoint: `http://localhost:8000/health`

Use only synthetic data in local or hosted tests. Never put real legal files, government IDs, bank details, passwords, provider keys, or payment details into test flows.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Focused product and safety contracts live in `lib/`, `components/`, `backend/src/`, and `scripts/`. Passing local checks proves source behavior only; it does not prove hosted AI, identity, payments, storage, or provider configuration.

## AI and legal-information limits

Legal Saathi may use configured AI and retrieval providers to prepare general legal-information responses. AI output can be incomplete or wrong, may not reflect the latest law, and needs qualified professional review before legal action. The interface should preserve drafts and show an honest error or availability state when a provider cannot complete a request.

Development has used AI assistance. Product decisions, integration, testing, and factual documentation must remain reviewable and must not be represented as someone else's work.

## Public-source status

This repository is intentionally private while operational material and history are reviewed. A separate allowlisted public-source candidate can be prepared locally without making this repository public:

```powershell
npm.cmd run public-source:check
npm.cmd run public-source:prepare
npm.cmd run public-source:verify
```

The generator refuses uncommitted source, omits secrets and operational material, and does not publish anything. Read [Public-source package policy](docs/PUBLIC_SOURCE_PACKAGE.md), [Public-source audit](docs/PUBLIC_SOURCE_AUDIT.md), and [third-party attribution inventory](docs/THIRD_PARTY_ATTRIBUTION.md) before any publication decision.

## Operational references

The private working repository keeps deployment, payment, migration, incident, rollback, and protected-flow runbooks in `docs/`. They are intentionally not included in the public-source candidate until a separate operational and security review clears the exact material. Their presence is not a claim that every protected integration has been verified on the current live release.
