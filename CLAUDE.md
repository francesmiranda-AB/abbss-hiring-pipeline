# ABBSS Hiring Pipeline

Internal hiring app for AB Business Support (at most 5 staff users). Vite + React + TypeScript + Tailwind v4, on the AB Design System. The backend is Google Apps Script (`backend/Code.js`) over a Google Sheet.

## Layout
- `src/api/`: the only code that talks to the backend (`client.ts` transport, `actions.ts` typed actions, `queries.ts` cache and the one save path: optimistic update, rollback, Retry).
- `src/domain/`: business rules as plain TypeScript, with tests. Screens never re-implement these.
  - `stages.ts` (12 stored stage names, `stageLabelFor` per department, `stageName` for mixed lists)
  - `attention.ts` (`getStageTask`: the next step and who does it, derived from stage plus facts; `needsAttention`)
  - `permissions.ts` (`capabilities(role, candidate)`: what each role may do; the one place that decides)
  - `outcome.ts`, `autoAdvance.ts`, `assessments.ts`, `emailTemplates.ts`, `calendar.ts`, `reports.ts`, `links.ts`, `team.ts`
- `src/domain/grader/engine.js`: the EMM grader, moved verbatim from the old app. Change it only with the golden tests passing.
- `src/features/`: one folder per feature; `registry.tsx` lists them with roles and flags (`FEATURE_FLAGS` Script Property switches features without a deploy). `candidate/` is the record panel, `email/Composer.tsx` is the shared email composer.
- `src/ui/`: `kit.tsx` (Button, Badge, Section, Tabs, Dialog, ConfirmDialog, FilePicker, useMenu...) and `toast.tsx`.
- `backend/`: Apps Script source and its vm tests (`npm run test:backend`).
- `legacy/index.html`: the old single-file app, kept as reference for the golden tests.

## Checks
`npm run ci` runs typecheck, lint, unit tests, backend tests and the build (if the combined script errors in your shell, run the steps one by one). The Vite dev server runs out of memory on some machines: use `npm run build` and `npm run preview`.

## Rules
- Never point a local dev server at the production backend (`VITE_API_URL` must be staging locally).
- Sheet columns never move; the backend decides which columns a save may change (`_changed`). Data-model changes are out of scope until the backend remake.
- No login, a product decision: people pick their name and role (`src/auth/auth.tsx`). Never put secrets, keys or tokens in this repo; it is public.
- Candidate-facing links (`trackOpen`, `pickSlot`, `viewAssessment`) stay public.
- A role's controls come from `capabilities()`: hide what a role can't use; don't redirect silently.
- The next step is derived (`getStageTask`); don't add a hand-edited "next action" field. Auto-advance moves forward only, on a fact, with Undo.
- Anything saved goes through `useUpdateCandidate` (one path). Text boxes use `SavingInput` or `SavingTextarea` (keeps the draft if a save fails).
- Dialogs: close handlers must check `e.target === e.currentTarget` (React passes `close` events from a nested dialog up to the dialog around it). Confirm anything hard to undo with `ConfirmDialog`.
- Width: pages use the full width up to 105rem. Breakpoints: 767px (phone: drawer sidebar, one column), 1099px (strip sticky from 1100), 1280px (the candidates table; below it people get cards, two across on tablets), 1600px (table shows Department and the note text). The record panel is `clamp(56rem, 54vw, 76rem)` and its tab layouts use `@container panel` queries (the panel's width, not the window's).
- Record panel sections (`PanelSection`, `src/features/candidate/sections/common.tsx`) have a `kind`: `action` (white card, navy top rule: what you do now), `result` (gray block: what came back), `reference` (no box, a rule under the title: context). Every section has an icon tile. The panel header carries the phase colour (`stagePhase()`, `--app-phase-*` tokens in `app.css`): it says where the person is in the process and is never a status colour (amber and red mean "look at this").
- Dialogs: the frame (rules under the title and over the buttons) is in `app.css`; group fields with `DialogGroup` (tile, title, rule). A long dialog scrolls in its body.
- Notes: the table shows a mark (`NoteMark`) that opens the note in a popover; cards and the board show `NoteGlyph`.
- CSS: `src/index.css` imports `app.css` before `screens.css`, so on equal specificity `screens.css` wins. Tailwind's reset zeroes dialog margins (`.ab-modal` puts them back).

## Design system
This app uses the AB Design System (synced into `src/styles/ab/`; source: D:\Codebases\ui-ux-capture).
- Use semantic tokens only: CSS `var(--ab-*)`, Tailwind `bg-primary`, `bg-card`, `text-muted-foreground`, `bg-ab-surface`, `text-ab-heading`. Never hardcode hex colors.
- Cards: flat `bg-card` (#EDEDED / navy in dark), `rounded-xl` (15px), no shadow. Shadows only on menus/dialogs/toasts.
- Buttons: one primary (blue) per view; tonal/gray for secondary; UPPERCASE labels; `rounded-md` (5px).
- Headings navy (`text-ab-heading`). Marketing headlines UPPERCASE with one bold-italic phrase; app titles sentence case, semibold.
- Font: Mona Sans (tokens.typeface), loaded via next/font with variable `--ab-font-primary` on <html>. Never Inter/Poppins/Plus Jakarta/Figtree/Geist/Space Grotesk. Icons: lucide, 2px stroke.
- Composition:
  - one committed moment per page (`.ab-feature` navy block, `.ab-statement` or `.ab-kpis`)
  - asymmetric left-aligned section heads (`.ab-section-head`)
  - lists as `.ab-rows`, not card grids
  - data screens use `data-density="compact"`
- Do not add `dark:` color overrides; semantic tokens switch themselves.
- Never: purple, gradient text, glows, glass/backdrop-blur, emoji icons, `border-l-4` stripe cards, `shadow-lg` on cards, cards in cards, scroll fade-ups, number counters, arrows on CTA labels, "seamless/elevate/powerful" copy, lorem/John Doe.
- Eyebrow + bold-italic emphasis: marketing hero only, once per page; none in app UI.
- Full spec: D:\Codebases\ui-ux-capture\DESIGN.md · anti-vibecode checklist: D:\Codebases\ui-ux-capture\docs\ANTI-VIBECODE.md

## Never (anti-vibecode, see ui-ux-capture/docs/ANTI-VIBECODE.md)
- No purple, gradient text, glows, aurora/radial backgrounds, glassmorphism or backdrop-blur.
- No `shadow-lg` on cards; cards are flat `bg-card rounded-xl`. No cards inside cards.
- No emoji as icons, no Sparkles/Rocket icons, no arrows on CTA labels.
- No `border-l-4` accent-stripe cards, no decorative status dots, no 01/02/03 numbering.
- No scroll fade-ups, number counters, bounce easing or Aceternity/Magic UI effects.
- No centered-hero + 3-icon-cards + stat-row template pages.
- Copy: no "seamless/elevate/powerful/unlock", no "Get Started", no lorem/John Doe.
- Eyebrow and bold-italic emphasis: marketing hero only, once per page. App UI: sentence case.
- No Inter/Roboto/Geist/Space Grotesk; use the tokens.typeface family. No middle-dot meta strings.
- Don't over-correct into bland: one committed moment per screen (.ab-feature / .ab-statement / .ab-kpis),
  asymmetric .ab-section-head, lists as .ab-rows, real specific content.
- Every control must work; every form needs loading/error/success states; visible focus.
