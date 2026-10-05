# ABBSS hiring pipeline

Internal hiring tool for AB Business Support: candidates, assessments (GRIT, Values, EMM), interviews, offers, offboarding. Built for a handful of staff (HR, Operations, PM, CEO).

Vite, React, TypeScript, Tailwind v4 on the AB Design System. The backend is a Google Apps Script web app over a Google Sheet (`backend/`).

## Run
```bash
npm install
cp .env.example .env.local   # set VITE_API_URL to a staging backend, never production
npm run build && npm run preview
```
`npm run ci` runs typecheck, lint, unit tests, backend tests and the build.

## Layout
`src/api` (the only backend layer), `src/domain` (rules and the EMM grader, tested), `src/features` (one folder per screen), `src/ui` (shared components), `backend/` (Apps Script and its tests), `legacy/` (the previous single-file app, kept as reference). Working notes for contributors are in `CLAUDE.md`.
