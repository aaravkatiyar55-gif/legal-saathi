# Entry preparation update — 30 September 2026

The entry page now has a preparation note tool. A visitor can write a factual timeline, list available records, and frame one question, then download a plain-text draft without an account or an AI request. Notes live in component memory and disappear on reload or unmount. Downloads remain on the visitor's device. The privacy notice explains this before the fields.

Numbered section links make the existing checklist, clarity exercise, case journey and new note tool easier to find. The header uses a simple margin rule and smaller role cards, keeping the existing role paths and mobile scroll fix. English, Hindi and Hinglish labels are complete for the added controls; switching language preserves a note already being edited.

The Google sign-in message no longer says the provider is available when readiness has not been confirmed. This is a wording correction, not a provider configuration fix. Authentication, payments, account permissions and backend integrations have not been changed.

## Check the public walkthrough

1. Open the entry page. Use the numbered note link with the keyboard.
2. Confirm download and clear are disabled for an empty or whitespace-only note.
3. Enter fictional dates and a question. Switch to Hindi and Hinglish: values should remain intact while labels change.
4. Download the `.txt` file. Check that multiline text is preserved and blank sections are omitted.
5. Clear the note and reload. No previous note should be restored.
6. At 390px width, check that fields and actions fit, navigation wraps, and Terms/Privacy remain reachable.

Run typecheck, lint, frontend/backend builds and the entry contracts before deployment. `lib/preparationNote.test.ts` checks whitespace, multiline Hindi, omitted empty sections, and literal plain-text handling of markup. It does not prove a browser download by itself.

## Assistance and remaining boundaries

Codex assisted with these changes, the tests and documentation. This update does not claim the student invented the added features independently, rewrite the application's authorship history, or establish a particular AI-use percentage. The Stardance eligibility condition is excluded from this requested work.

Hosted Google sign-in still needs provider investigation; the owner requested no Supabase login. Account-only chat, document, AI and payment flows need separate authenticated tests. Local checks and public preparation-tool checks must not be used as proof that those flows work.

Deployment identifiers and screenshot evidence are recorded in the task's shipping report after hosted verification. A source commit alone is not a deployed release.
