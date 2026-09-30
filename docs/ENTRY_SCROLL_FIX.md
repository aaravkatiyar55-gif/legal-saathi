# Public entry scroll repair

The live entry page was taller than the viewport but could not scroll. The global body locks scrolling for the workspace, while the entry page used `min-height: 100dvh`. Its main element therefore grew to its content height and had no internal scroll range.

The entry shell now uses `height: 100dvh`, `min-height: 0`, and contained vertical overscroll. Its preparation tools and footer remain inside one scrollable viewport. Existing roles, languages, and preparation features are preserved.

## Reproduce and verify

1. Open the entry page without selecting a role.
2. Scroll to the preparation checklist, clarity sprint, and case journey.
3. Continue to the Terms and Privacy links and open Privacy.
4. Repeat at a 390 × 844 mobile viewport; there should be no horizontal overflow.
5. Select Hindi and Hinglish and repeat the checklist interactions.

## Verification on 2026-09-30

- Before: live main height and scroll height were both 2782 px; wheel scrolling left scrollTop at zero. The footer started at 2603 px below the viewport.
- After: local desktop main height was 717 px with 2782 px content; scrolling reached scrollTop 2065 and the footer was visible.
- At 390 × 844: main client width and scroll width were both 384 px; scrolling reached the footer.
- Frontend typecheck, frontend build, and backend build passed.
- Lint passed with two existing unused-import warnings in `lib/requestSettings.ts`.
- Public-entry, preparation-compass, and clarity-sprint contracts passed: 164 assertions across three test files.

These results describe a local source repair. Deployment and hosted verification are separate steps. This change was implemented and tested with Codex assistance; it is not evidence of a particular human/AI authorship percentage.
