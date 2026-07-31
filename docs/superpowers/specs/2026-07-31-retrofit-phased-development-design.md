# RetroFit Phased Development Design

## Goal

Build RetroFit — an 8-bit SNES RPG-themed PWA for personal calorie/macro tracking — phase by phase, with the user learning the project deeply at each step.

## Source of Truth

- `RetroFit_PRD_v2.md` — feature spec, DB schema, security constraints (RLS, client_id idempotency, server-action-only AI key)
- Stitch project `projects/1924553826850334746` ("RetroFit 8-Bit Tracker") — the visual source of truth; built UI matches its screens closely
- Stitch design system (exported): dark green-black surface (`#0c1609`), neon lime primary (`#39ff14`), crimson secondary, amber tertiary; fonts Anybody (headlines), Inter (body), JetBrains Mono (data/labels)

## Working Agreement

- **Explain first**: each phase begins with a plan walkthrough (what/why/how), user approves, then code is written
- **Review at end of every phase**: stop for user review before the next phase starts
- **One commit per phase** on git (repo already initialized, PRD committed)
- **Services set up together**: Supabase/OpenRouter keys are provisioned during the phase that needs them, not upfront
- **Idiot-proof**: components match Stitch screens closely; state and data flows are simple, typed, and self-evident

## Phase Map

### Part 1 — Foundations

**P1 Scaffold**
- Next.js 19 (App Router) + TypeScript + Tailwind CSS + Lucide icons
- Design tokens (colors, fonts, pixel-border utilities) extracted from the Stitch design system
- Folder structure: `components/`, `lib/`, `db/`, `hooks/`, `app/` routes

**P2 Static slice**
- Component kit: PixelBox, macro progress bars, pixel buttons, header, summary card
- Static (no backend) render of Home Dashboard + Calorie Tracker screens, matching Stitch screens

### Part 2 — Core Loop

**P3 Supabase setup (together)**
- Create Supabase project; run PRD §3 SQL: `pgcrypto`, `profiles`, `logged_meals`, `weight_logs`, `custom_foods` (+ RLS policies), `meal-images` storage bucket policy
- `@supabase/ssr` auth wiring

**P4 Auth + onboarding**
- Login (sign-up disabled, admin account pre-seeded)
- `has_completed_onboarding` gate → "Welcome to RetroFit" banner → 4-Step TDEE Quest wizard (Mifflin-St Jeor; user confirms constants before this phase) → writes targets to `profiles`

**P5 Offline-first**
- Dexie (`dexie.js`) with `.version(1)` schema; client-generated `client_id` on every local row
- Sync queue (online detection, batch push, idempotent on `client_id`, LWW + delete-wins)

**P6 Feature completion**
- Date navigation on tracker, edit/delete meals, weight tracker with SVG chart (1W/1M/1Y), settings screen (targets override, sync status)

### Part 3 — Power-Ups

**P7 AI Meal Scan + Barcode**
- OpenRouter vision server action (key never in client bundle) with JSON schema output; graceful fallback to manual form
- `@zxing/library` or `html5-qrcode` camera scan → Open Food Facts lookup → pre-filled form; not-found → manual entry with barcode pre-filled

**P8 PWA polish**
- Manifest (standalone, pixel icons, dark bg), service worker (network-first API, cache-first assets)
- Push notifications: **deferred** (PRD open decision) — revisit after P8 if desired

## Open Decisions Carried From PRD

- Mifflin-St Jeor constants: confirm against original source before P4
- Push notifications: deferred, revisit post-P8

## Constraints (from PRD, non-negotiable)

- No `dangerouslySetInnerHTML` / unsanitized rendering of external strings (AI scan, barcode lookup)
- OpenRouter key server-side only
- RLS on every table
