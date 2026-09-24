# Cognitive Gym app

Local-first practice app for the workbook in `../workbook/Cognitive_Gym_Workbook.md`. Vite + React + TypeScript. No backend; progress lives in the browser's storage. Vocabulary: `../CONTEXT.md`.

## Quick start

```sh
git clone https://github.com/ohmanurak/cognitive-gym.git
cd cognitive-gym/app
npm ci
npm run dev
```

Then open the address printed in the terminal (usually http://localhost:5173). Needs Node 22+ and Git. Progress is stored in your browser; back it up from the Data page.

## Setup

Node 22+.

```sh
cd app
npm ci
```

## Run

```sh
npm run dev        # parses the workbook, starts Vite
```

`npm run data` (run automatically by `dev` and `build`) parses the workbook into `src/data/workbook.json`. The file is generated and gitignored.

## Test

```sh
npx tsc -b         # typecheck
npm test           # unit and component tests (vitest)
npm run lint       # oxlint
npm run audit:keys    # every Item maps to exactly one Key
npm run audit:limits  # parsed Block time limits
```

CI (`../.github/workflows/ci.yml`) runs data, typecheck, tests and build on every push and pull request.

## Build

```sh
npm run build      # outputs app/dist
npm run preview    # serve the build locally
```

## Deploy

The build is static, so any static host works. Settings:

| Setting | Value |
| ------- | ----- |
| Root directory | `app` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22 |

Routing is hash-based, so no redirect rules are needed. Suitable free hosts: Cloudflare Pages, Netlify, Vercel.

### Public URL vs login-gated host

The workbook text (Items and Answer Key) is compiled into the JavaScript bundle. A public URL therefore publishes the whole workbook, Key included.

- Public URL: simplest. Fine only if the workbook may be public.
- Login-gated host (e.g. Cloudflare Access, Netlify or Vercel password/SSO protection): needed if the workbook must stay private.

**Decision: not yet recorded.** The owner picks one and writes it here, with the host used.

### Data lives per browser

Progress is stored in the browser on the device and origin that ran it. A new URL is a new, empty store. Use the Data page to export before changing host or device, and import to restore.

## Manual release checklist

Run against the deployed (or `npm run preview`) build before relying on a release.

- [ ] Phone width: Block runner, Progress and Errors pages are usable without horizontal scroll
- [ ] Dark mode: text and controls readable on every page
- [ ] Key is not visible before Commit, including after a retry
- [ ] Timed Block: limit, T and U marks and skip behave as in the workbook
- [ ] Export, clear browser data, import: progress matches the export (preview before merge)
- [ ] Deployed URL opens the app in a fresh browser profile
