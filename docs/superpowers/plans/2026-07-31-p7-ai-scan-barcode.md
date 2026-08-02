# P7 AI Meal Scan + Barcode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dead Scan tab into the AI Meal Scan screen from the Stitch project — camera capture → OpenRouter vision analysis (structured JSON) → editable review form → save to Dexie (offline-first, `source: "ai_scan"`). Plus barcode scanning (`html5-qrcode`) → Open Food Facts lookup → pre-filled form (`source: "barcode"`), with graceful fallback to manual entry on any failure.

**Architecture:** The OpenRouter API key lives ONLY in a Server Action (`app/scan/actions.ts`); the client sends the captured image as a base64 data URL and receives a validated, typed result — the key never enters the client bundle. AI output is treated as untrusted input: numbers are coerced/clamped server-side, strings rendered as plain React text (no `dangerouslySetInnerHTML` — PRD hard constraint). Saving still goes through the existing Dexie path (`addMeal`), so AI/barcode meals get the same offline-first sync treatment (`client_id` idempotency, queue, RLS). Camera capture uses `navigator.mediaDevices.getUserMedia` into a `<video>` with retro reticle overlays; failure anywhere (permission denied, no camera, API error, parse fail) falls back to a plain file input and/or the existing manual AddEntryModal. Barcode decode uses `html5-qrcode`'s camera viewfinder; the Open Food Facts lookup runs in a server action (kills CORS + keeps fetch logic server-side).

**Tech Stack:** OpenRouter REST API (fetch, no SDK), `html5-qrcode` (client), existing `addMeal`/Dexie, existing retro CSS, Material Symbols (`camera_alt`, `qr_code_scanner`, `barcode_scanner`, `auto_awesome`).

## Global Constraints

- No comments in code unless asked
- One commit per task with the exact message given
- OpenRouter key: server actions only; never in client components or env vars with `NEXT_PUBLIC_` prefix
- No `dangerouslySetInnerHTML` anywhere — external strings (AI names, OFF product names) render as escaped text only
- All saves go through `addMeal` (Dexie) — the scan screens never write to Supabase directly
- Untrusted AI/OFF output is validated in the server action: numbers finite + clamped (calories 0–6000, macros 0–2000g), name trimmed, empty name → "Unknown meal"
- The user provisions the OpenRouter key together with the agent (services set up together, per working agreement)
- `custom_foods` stays unused this phase (favorites feature not in scope); barcode meals log with `source: "barcode"`

---

### Task 0: Provision the OpenRouter API key (together)

- [ ] **Step 1: User gets a key**

User: sign up at https://openrouter.ai → create an API key. (Free vision models exist; if the free tier requires a $5 credit top-up, a minimal top-up is the expected route.)

- [ ] **Step 2: Add to `.env.local`**

```
OPENROUTER_API_KEY=sk-or-v1-...
```

- [ ] **Step 3: Verify a current free vision model**

Verified at execution: smoke test with a real food photo — `google/gemma-4-31b-it:free` returned 429 (shared-pool rate limit); `google/gemma-4-26b-a4b-it:free` responded instantly with correct JSON (`{"name":"Coca-Cola Original","calories":140,...}`). **Pinned: `google/gemma-4-26b-a4b-it:free`.** Free-tier 429s are transient; the UI shows a "busy, retry" message and the model id is a one-line constant swap. (Adding a personal Google AI Studio key under OpenRouter integrations bypasses the shared pool if needed.)

---

### Task 1: AI analysis lib + server action

**Files:**
- Create: `lib/ai.ts` (pure, no React)
- Create: `app/scan/actions.ts` (server actions)
- Modify: `.env.local` (done in Task 0)

**Interfaces:**
- `lib/ai.ts`:
  - `analyzeMealImage(imageDataUrl: string): Promise<AIMealResult>` — strips the data-URL prefix to base64, POSTs to `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>`, a vision model id, system prompt demanding **JSON only** with exact keys `name, calories, protein_g, carbs_g, fat_g, serving_size` (numbers; grams can be decimal), `response_format: { type: "json_object" }`. Parses + validates:
    - `calories` → `Math.round(clamp(Number(v), 0, 6000))`
    - `protein_g`/`carbs_g`/`fat_g` → `Math.round(clamp(Number(v), 0, 2000))`
    - `name` → trimmed string, `"Unknown meal"` fallback; max 80 chars
    - `serving_size` → trimmed string, optional, max 80 chars
    - throws `AIError("...")` on fetch failure / non-JSON / missing calories
  - `lookupBarcode(barcode: string): Promise<{ name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number } | null>` — GET `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`; map `product.nutriments` (energy-kcal_100g, proteins_100g, carbohydrates_100g, fat_100g — all per-100g, scaled by `product.quantity` weight if present, else show per-100g values) + `product.product_name`; null on 404/parse fail. Validation mirrors the AI path.
- `app/scan/actions.ts`:
  - `analyzeScan(imageDataUrl: string): Promise<AIMealResult | { error: string }>` — server action; calls `analyzeMealImage`; wraps errors so the client always gets a serializable object. If `OPENROUTER_API_KEY` is missing → `{ error: "AI is not configured" }`.
  - `lookupBarcodeScan(barcode: string): Promise<BarcodeResult | { error: string }>` — same wrapper pattern.

- [ ] **Step 1: Create `lib/ai.ts`** with both functions + validation helpers (shared `clampInt`)

- [ ] **Step 2: Create `app/scan/actions.ts`** — thin server-action wrappers (add `"use server"`; the wrappers exist so the client never imports `lib/ai.ts` directly and the key stays server-only)

- [ ] **Step 3: Verify build**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/ai.ts app/scan/actions.ts
git commit -m "feat: openrouter vision analysis and barcode lookup server actions"
```

---

### Task 2: Scan screen — AI capture + review flow

**Files:**
- Create: `components/scan-camera.tsx` (client; camera viewfinder + capture)
- Create: `app/scan/page.tsx` (client; mode switch AI/Barcode, review form, save)
- Modify: `components/app-shell.tsx` (Scan tab href → `/scan`)

**Interfaces:**
- `ScanCamera({ onCapture: (dataUrl: string) => void, onError: (msg: string) => void })`:
  - `useEffect`: `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })` → `<video autoplay playsInline muted>` inside the retro viewfinder frame (reticle corners, green scan line animation via existing CSS or a small keyframe in the component — reuse `snes-window` styling)
  - CAPTURE button → `canvas.drawImage(video)` → `toDataURL("image/jpeg", 0.8)` → `onCapture`
  - Cleanup: stop tracks on unmount
  - `getUserMedia` rejection → `onError("Camera unavailable — use file picker")` and render a fallback: `<input type="file" accept="image/*" capture="environment">` → FileReader → `dataURL` → `onCapture`
- `app/scan/page.tsx`:
  - Two-mode toggle (AI SCAN / BARCODE) matching the Stitch screen
  - AI mode: `ScanCamera` → on capture: `setAnalyzing(true)` → `analyzeScan(dataUrl)` → result card: editable inputs (Name, Calories, P/C/F, Serving) pre-filled from the AI result; error → red pixel-banner with "try again" / "manual entry" link
  - SAVE → `addMeal({ logged_date: today, meal_type: "snack" → actually a meal-type picker (breakfast/lunch/dinner/snack buttons, default snack), ...values, source: "ai_scan" })` → success banner "MEAL LOGGED" → buttons: "Add Another" / "View Log"
  - Barcode mode: Task 3
  - Manual fallback link opens the existing `AddEntryModal` (source: "manual")

- [ ] **Step 1: Create `components/scan-camera.tsx`** (camera + fallback input)

- [ ] **Step 2: Create `app/scan/page.tsx`** — AI flow + review form + save; wire shell Scan tab

- [ ] **Step 3: Verify build**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/scan-camera.tsx app/scan/page.tsx components/app-shell.tsx
git commit -m "feat: ai meal scan screen with camera capture and review flow"
```

---

### Task 3: Barcode flow

**Files:**
- Modify: `app/scan/page.tsx` (barcode mode)
- Modify: `package.json` (new dep `html5-qrcode`)

**Interfaces:**
- Barcode mode: `Html5Qrcode` from `html5-qrcode` (`getUserMedia`-based, its own viewfinder div `scanner-container`); on success: stop scanner, call `lookupBarcodeScan(code)`:
  - found → review form pre-filled (name + per-100g macros; note "per 100g" hint when no serving weight) with a meal-type picker; SAVE → `addMeal(..., source: "barcode")`
  - not found → the same form but empty, with a read-only Barcode field showing the scanned code (PRD's not-found handling — user completes it manually rather than dead-ending)
  - error → red banner + retry + manual entry link
- Scanner cleanup on unmount/mode switch (html5-qrcode leaks camera if not stopped)

- [ ] **Step 1: Install `html5-qrcode`**

Run: `npm install html5-qrcode`

- [ ] **Step 2: Implement barcode mode in `app/scan/page.tsx`**

- [ ] **Step 3: Verify build**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/scan/page.tsx package.json package-lock.json
git commit -m "feat: barcode scan with open food facts lookup"
```

---

### Task 4: Browser verification

**Files:**
- Create: `/tmp/opencode/p7-check.js` (throwaway Playwright script — not committed)

**What's verifiable headlessly vs manually:**
- Headless: the full AI flow via the **file-input fallback** (`page.setInputFiles` with a downloaded food photo) — camera itself can't run headlessly. Also: the review form, save → Dexie → sync, and the server-side barcode lookup via the action path (type a code into a test input or call the action's endpoint indirectly). Also: barcode not-found path (random 13-digit code) → empty form with code shown.
- Manual (user): real camera on phone/desktop — AI capture + barcode decode. No automated camera tests.

- [ ] **Step 1: Write the check script**

1. Login (env EMAIL/PASSWORD)
2. Download a real food photo to /tmp (`https://images.openfoodfacts.org/images/products/...` — use a known product image URL fetched at runtime via node `fetch`) or a plain photo of food from any public URL
3. Go to `/scan` → click the file-picker fallback (camera will error headlessly → fallback input appears) → `setInputFiles(photo)` → wait for the result card → assert name/calories inputs are populated
4. Edit calories, pick meal type, SAVE → assert success banner; wait ~20s for sync
5. Barcode mode: assert scanner viewfinder renders; use the test-code input path if provided, else skip camera and verify `lookupBarcodeScan` via a hidden test route? — NO new routes; instead the script fills the manual-entry path with a known barcode (e.g. `5449000000996` Coca-Cola) and asserts the OFF lookup prefills the name (test via the app's UI if reachable, else via direct fetch to `world.openfoodfacts.org` to confirm the code returns data — the server action itself is verified by the not-found test)
6. Not-found: enter `9999999999999` → empty form, barcode field shows the code
7. Console capture: assert no sync errors

- [ ] **Step 2: User runs it**

User: `npm run dev`, then `node /tmp/opencode/p7-check.js`, reports output.

- [ ] **Step 3: Manual camera test (user)**

On their phone (or desktop browser with a camera): `/scan` → AI SCAN → real photo capture → review → save; BARCODE → scan a real product → prefill → save. Report results.

- [ ] **Step 4: Supabase check (user)**

`logged_meals`: rows with `source = 'ai_scan'` and `source = 'barcode'`, correct calories/macros, no duplicates.

- [ ] **Step 5: Fix anything the check surfaces** (agent)

---

## Self-Review Notes

- **Spec coverage:** P7 spec — OpenRouter vision server action (key never in client bundle) with structured JSON output ✓ (Task 1), graceful fallback to manual form ✓ (Tasks 2/3), `html5-qrcode` camera scan → Open Food Facts lookup → pre-filled form ✓ (Task 3), not-found → manual entry with barcode pre-filled ✓ (Task 3). PRD Module 5 camera viewfinder with retro reticles ✓ (Task 2). PRD Module 6 OFF endpoint `v2/product/{barcode}.json` ✓ (Task 1).
- **Model drift (flagged):** PRD's `google/gemini-2.0-flash-exp:free` is likely retired by 2026 — Task 0 verifies a current free vision model and pins it in one constant.
- **Security:** key server-only (server actions + `lib/ai.ts` never imported client-side); no `dangerouslySetInnerHTML`; AI/OFF output validated + clamped server-side before it ever reaches the client; images sent as data URLs to the server action only.
- **Offline-first preserved:** scans produce a review form; the actual save is `addMeal` → Dexie → queue → sync, same as manual entries. `source` distinguishes provenance.
- **Known limitations:** (1) camera paths can't be verified headlessly — manual phone test required; (2) OFF macros are per-100g unless the product has a serving weight (hint shown in UI); (3) no favorites/custom_foods UI (out of scope); (4) AI analysis requires connectivity + the OpenRouter key — offline = manual fallback (by design).
- **API cost:** free-tier vision models may be rate-limited; the form stays editable so a partial/wrong parse is never a dead end.
