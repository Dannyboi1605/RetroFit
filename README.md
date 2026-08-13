# RetroFit

An 8-bit SNES RPG-themed, dark-mode Progressive Web App for personal calorie and macro tracking. Built with a high-contrast pixel aesthetic, modern UI ergonomics, and an offline-first sync architecture.

## Features

- **Home Dashboard** – calories/macros vs. target with pixel-progress bars and a weight trend graph
- **Daily Meal Logging** — log, edit, and delete meals across breakfast, lunch, dinner, snacks
- **AI Meal Scan** — camera photo → Gemini vision API (via OpenRouter, server-side key) → calorie/macro estimates
- **Barcode Scanner** — camera barcode lookup against Open Food Facts, with manual fallback
- **Weight Tracker** — daily weigh-ins with delta and trend charts
- **TDEE Quest Wizard** — 4-step Mifflin-St Jeor onboarding that computes calorie/macro targets; re-runnable anytime from Settings
- **Offline-First** — all writes hit IndexedDB (Dexie) instantly and sync to Supabase via a background queue with client-generated IDs for idempotency
- **Single-admin auth** — public signup disabled; session persisted via Supabase cookies and retained offline

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Environment variables

Copy `.env.local` (or create it) with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENROUTER_API_KEY=        # AI meal scan (server-side only)
GEMINI_API_KEY=            # optional; used by some AI tooling
```

### Database setup

Apply `db/schema.sql` to your Supabase project (tables: profiles, logged_meals, weight_logs, custom_foods, plus RLS policies). Enable the `pgcrypto` extension and disable public signup in Supabase Auth, then pre-seed your account.

## Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production build |
| `npm run lint` | ESLint |

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | Next.js (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS 4, pixel/retro design system |
| Database & Auth | Supabase (PostgreSQL, RLS, cookie sessions) |
| Local storage | IndexedDB via Dexie.js |
| AI vision | OpenRouter (Gemini flash) via Server Actions |
| Food database | Open Food Facts API |

## Resources

- Product spec: `RetroFit_PRD_v2.md`
- Manual test checklist: `docs/MANUAL_TESTING.md`