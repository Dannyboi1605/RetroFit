# RetroFit 8-Bit — Manual Testing Test Case Suite

Full manual regression suite covering every feature in the app. Run against `npm run dev` (or a deployed build) with a configured Supabase project and `GEMINI_API_KEY` / `OPENROUTER_API_KEY` set.

## 0. Test Setup & Environment

| Item | Value |
|---|---|
| App URL | `http://localhost:3000` (or deployed URL) |
| Test users | `tester@example.com` (fresh signup), plus 1 user with completed onboarding and logged data |
| Required env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY` or `OPENROUTER_API_KEY` |
| Database | Supabase schema from `db/schema.sql` applied (4 tables: `profiles`, `logged_meals`, `weight_logs`, `custom_foods`) |
| Browsers | Latest Chrome (desktop + mobile emulation), Safari on iPhone (real device for camera), Firefox |
| Devices | Desktop (≥1024px, tests sidebar layout), Mobile (<1024px, tests bottom nav) |
| Network | DevTools offline toggle (to test offline behavior) |
| Baseline data | Known TDEE fixture: age 30, male, 175 cm, 70 kg, moderate → BMR 1649, TDEE 2556, maintain target = 2556 kcal, protein 140 g, carbs ≈307 g, fat ≈85 g |

### Legend
- **P** = Preconditions, **S** = Steps, **E** = Expected result
- Test IDs: `RF-AUTH`, `RF-QUEST`, `RF-HOME`, `RF-LOG`, `RF-SCAN`, `RF-WEIGHT`, `RF-SETTINGS`, `RF-OFFLINE`, `RF-PWA`, `RF-SEC`, `RF-API`, `RF-UX`

---

## 1. Authentication (RF-AUTH)

### RF-AUTH-01 — Login page renders for anonymous users
- **P:** Logged out, no session.
- **S:** Visit `/`.
- **E:** Redirected to `/login`. "RetroFit" title, Email + Password fields, "Start Game" button, "Forgot password?" link, "New here? Create an account" link. Retro pixel (SNES window) styling with green accents.

### RF-AUTH-02 — Successful login
- **P:** User exists, onboarding completed.
- **S:** Enter valid email + password → click "Start Game".
- **E:** Redirected to `/` (home dashboard). No error shown.

### RF-AUTH-03 — Login with wrong credentials
- **P:** Valid account exists.
- **S:** Enter wrong password → "Start Game".
- **E:** Inline error message shown in red (`role="alert"`), stays on `/login`, no crash.

### RF-AUTH-04 — Login with unconfirmed account
- **P:** Signup completed but email not confirmed (Supabase email confirmation on).
- **S:** Attempt login.
- **E:** Error displayed (e.g. "Email not confirmed"). User remains on login.

### RF-AUTH-05 — Signup flow
- **P:** Logged out.
- **S:** Click "New here? Create an account" → form switches to "Create Account" mode → enter new email + password (≥6 chars) → "Create Account".
- **E:** Message "Account created — check your email to confirm." appears. User stays on `/login`. Confirm link in inbox → account usable.

### RF-AUTH-06 — Signup with existing email
- **S:** Signup with an email already registered.
- **E:** Inline error from Supabase shown, no crash.

### RF-AUTH-07 — Forgot password without email
- **S:** On login, click "Forgot password?" with empty email.
- **E:** Error "Enter your email first."

### RF-AUTH-08 — Forgot password with email
- **S:** Enter email → "Forgot password?".
- **E:** Message "Password reset link sent — check your inbox." Reset link works and new password can be logged in with.

### RF-AUTH-09 — Form validation (HTML)
- **S:** Submit login/signup with empty fields or malformed email (`abc`).
- **E:** Browser native validation blocks submit; no network call.

### RF-AUTH-10 — Logged-in user visiting /login
- **P:** Authenticated, onboarding complete.
- **S:** Visit `/login`.
- **E:** Redirected to `/`.

---

## 2. Quest Onboarding (RF-QUEST)

### RF-QUEST-01 — New user is pushed to quest
- **P:** Freshly signed-up account (profile row may not exist yet or `has_completed_onboarding=false`).
- **S:** Log in → land on `/`.
- **E:** Redirected to `/quest`. Header "Welcome to RetroFit.", stepper shows 5 steps: AGE & GENDER → HEIGHT & WEIGHT → ACTIVITY → MACROS → GOAL. "Step 1 of 5".

### RF-QUEST-02 — Step 1: age & gender validation
- **S:** Leave age empty or gender unselected → "Continue".
- **E:** Continue disabled (greyed out) until age (13–100) and a gender are provided.
- **S:** Enter age 12 or 101 (via devtools/typed value).
- **E:** Continue stays disabled (input `min`/`max` attributes; server re-validates on submit).

### RF-QUEST-03 — Step 2: height & weight validation
- **S:** Proceed to step 2. Enter height 99/251 or weight 29/301.
- **E:** Continue disabled. Valid range: height 100–250, weight 30–300.

### RF-QUEST-04 — Step 3: activity selection shows reference TDEE
- **P:** Steps 1–2 filled (fixture: 30/M/175cm/70kg).
- **S:** On step 3, before selecting: no TDEE line. Select "Moderate".
- **E:** Option highlights with primary border. "REFERENCE TDEE: 2,556 KCAL" appears. Selecting different options updates the TDEE (Sedentary 1,979 / Light 2,267 / Moderate 2,556 / Heavy 2,844 / Athlete 3,133 — ~±2 rounding tolerance).

### RF-QUEST-05 — Step 4: macros prefilled from TDEE and auto-calc
- **P:** Fixture data selected; continue past step 3.
- **S:** Verify prefill on step 4.
- **E:** Protein = 140, Carbs = 307, Fat = 85 (rounding ±2). "Total: 2,556 kcal" shown (P×4 + C×4 + F×9). Reference TDEE line shows 2,556.
- **S:** Edit Fat to 100.
- **E:** Total updates live: 140×4 + 307×4 + 100×9 = 2,689 kcal. Negative values rejected (min=0).
- **S:** Set all three to 0.
- **E:** Total shows 0 kcal; allowed (min 0) but blocked at submit by server 800–6000 range.

### RF-QUEST-06 — Step 5: goal picker recalculates macros
- **S:** On step 5 select "Cut".
- **E:** Goal highlighted. Cut = −500 → total ≈ 2,056 kcal, macros re-derived (P still 140; C/F reduced). Select "Maintain" → back to 2,556. Select "Bulk" → +400 → 2,956.
- **E:** Hint text "FOR WEIGHT-TREND GUIDANCE — RECALCULATES YOUR MACROS" visible.

### RF-QUEST-07 — Back navigation preserves state
- **S:** Fill steps 1–4, go Back to step 1, change age to 40.
- **E:** All previously entered values retained (only age changed). Going forward again re-prefills step 4 from the new TDEE (age 40, M, 175, 70, moderate → TDEE 2,478 → P 140, C 295, F 82 ±2). Stepper checkmarks show completed steps.

### RF-QUEST-08 — Complete quest saves profile and redirects
- **S:** Complete all 5 steps → "Complete Quest".
- **E:** Redirected to `/`. Dashboard shows targets matching the saved macros.

### RF-QUEST-09 — Server-side validation errors surface in UI
- **P:** Quest prefilled in retake mode.
- **S:** Submit the quest with macros summing outside 800–6000 (e.g. via devtools setting fat to 10,000).
- **E:** Error shown on the wizard: "Total calories must stay between 800-6000." User stays on `/quest`. (Same for age/height/weight bounds via tampered fields.)

### RF-QUEST-10 — Quest retake via settings link
- **P:** Onboarding complete.
- **S:** `/settings` → click "Retake Quest — Recalculate Your Targets".
- **E:** Land on `/quest?retake=1` with header "Recalculate Your Targets." / "RETAKE THE QUEST — UPDATES YOUR DAILY TARGETS". All fields prefilled from the saved profile (age, gender, height, weight, activity, macros, goal).

### RF-QUEST-11 — Retake completes and returns to settings
- **P:** Retake mode prefilled.
- **S:** Change weight to 80 kg → continue (activity re-select or keep) → step 4 macros update (P=160, C/F scaled) → pick goal → "Complete Quest".
- **E:** Redirected to `/settings` (not `/`). Settings now show new targets.

### RF-QUEST-12 — Quest guard: completed users can't enter non-retake quest
- **P:** Onboarding complete.
- **S:** Visit `/quest` (no `?retake=1`).
- **E:** Redirected to `/`.

### RF-QUEST-13 — Quest guard: anonymous users
- **S:** Logged out → visit `/quest`.
- **E:** Redirected to `/login`.

---

## 3. Home Dashboard (RF-HOME)

### RF-HOME-01 — Dashboard loads for completed users
- **P:** Onboarding complete, some meals logged today.
- **S:** Visit `/`.
- **E:** "Daily Overview" header, current date (desktop). Energy card: "kcal logged / target kcal". Macro bars P/C/F with per-color values and progress bars. Weight Trend card. Recent Logs section listing today's entries grouped by meal type with icon, name, P/C/F (desktop), kcal.

### RF-HOME-02 — Energy bar and macro bars reflect totals
- **P:** Logged today: breakfast 500 kcal (P 30, C 60, F 15), lunch 800 kcal (P 40, C 90, F 30). Target 2556/140/307/85.
- **S:** Open `/`.
- **E:** Energy shows `1,300 / 2,556 kcal`; bar width ≈ 50.9% (1300/2556). P: 70g/140g (50%), C: 150g/307g (48.9%), F: 45g/85g (52.9%). Bars visually scaled to those fractions.

### RF-HOME-03 — Energy bar caps at 100%
- **P:** Meals logged exceeding the daily target (e.g. 3,000 kcal vs 2,556).
- **E:** Bar width does not exceed 100%; counter shows the true overage number `3,000 / 2,556 kcal`.

### RF-HOME-04 — Weight trend card
- **P:** 2+ weight logs in last 7 days (e.g. 70.0 then 69.5).
- **S:** Visit `/`.
- **E:** Card shows delta `-0.5 kg`; polyline chart with dot on latest point; "Log a couple of weights to chart." absent.
- **P:** 0 or 1 weight log in the window.
- **E:** Placeholder text "Log a couple of weights to chart." and `-- kg` delta.

### RF-HOME-05 — Weight trend card navigation
- **S:** Click the Weight Trend card (or press Enter/Space with focus).
- **E:** Navigates to `/weight`. Keyboard: card focusable (`tabIndex=0`), Enter and Space both navigate.

### RF-HOME-06 — Quick action buttons
- **S:** Click "Log Manually".
- **E:** → `/log`.
- **S:** Click "Scan Meal".
- **E:** → `/scan`.

### RF-HOME-07 — Recent logs
- **S:** Click any recent-log row (or Enter/Space).
- **E:** → `/log`.
- **E:** Meals grouped in order breakfast → lunch → dinner → snack; only non-empty groups render. Empty day shows "Nothing logged today yet."

### RF-HOME-08 — Dashboard only shows TODAY's meals
- **P:** Meals logged yesterday + today.
- **E:** Only today's meals in Energy card and Recent Logs.

---

## 4. Food Log (RF-LOG)

### RF-LOG-01 — Layout
- **S:** Visit `/log`.
- **E:** Date navigation bar (◀ chevron, date + "TODAY"/"DAY" label, ▶ chevron). HP (Calories) panel with totals vs targets, SYNCED/OFFLINE badge, macro bar, P/C/F mini-bars. Four meal sections: breakfast, lunch, dinner, snack, each with icon, kcal subtotal, entries, "Add Entry" button.

### RF-LOG-02 — Date navigation
- **S:** Click ◀ once.
- **E:** Date shifts −1 day; label becomes "DAY"; empty sections show "No Entries Yet."; totals reset to 0 for that date.
- **S:** Click ▶ back to today.
- **E:** "TODAY" label returns; today's meals and totals return.
- **S:** Click the center date button from a past day.
- **E:** Jumps back to today.
- **S:** Navigate several days forward/backward (e.g. −30, +40).
- **E:** No crash; each day shows its own meals only (IndexedDB per `logged_date`).

### RF-LOG-03 — Totals math
- **P:** Day has: breakfast 300 kcal, snack 150 kcal.
- **E:** HP shows 450 kcal total; breakfast section shows 300 KCAL; snack 150 KCAL; P/C/F sums across all sections.

### RF-LOG-04 — Offline badge when offline
- **S:** DevTools → Offline → visit `/log`.
- **E:** "OFFLINE" shown in place of SYNCED. Targets area shows "OFFLINE — target unavailable" only if profile never fetched (fresh load offline); if page loaded online first and then offline, targets remain displayed.

### RF-LOG-05 — Add Entry modal — manual entry (happy path)
- **S:** Breakfast → "Add Entry" → "Manual Entry".
- **E:** Modal "Add Entry — breakfast" opens; Name input auto-focused. Meal type segmented control (4 types). Ingredients section, serving size (grams/servings), Total Calories, P/C/F inputs, Date field (defaults to selected log day), Cancel/Save buttons.
- **S:** Fill Name "Oatmeal", Calories 250, P 10, C 40, F 4 → Save.
- **E:** Toast "Meal logged!" (auto-dismisses ~2.5s). Entry appears under breakfast with name, P/C/F chips, kcal 250. HP totals update.

### RF-LOG-06 — Validation: name and calories required
- **S:** Open modal, enter nothing, click Save.
- **E:** Error "Name and calories required." appears; no entry created. Save button also disabled until both filled.

### RF-LOG-07 — Meal type switching in modal
- **S:** In modal, select "dinner" → Save.
- **E:** Entry appears under the dinner section; modal title reflected the change ("Add Entry — dinner").
- **S:** Also test adding for a specific date via the Date field (e.g. yesterday).
- **E:** Entry appears on yesterday's log only.

### RF-LOG-08 — Macro auto-calc from macros
- **S:** Modal: Name "Protein Shake", P 30, C 10, F 2 → Save.
- **E:** Calories auto-filled to 30×4 + 10×4 + 2×9 = 178 before saving (editable afterwards). Saved entry shows 178 kcal.

### RF-LOG-09 — Manual calories override stays
- **S:** Modal: Name "Cake", Calories 400, P 4, C 60, F 15 → Save.
- **E:** Saved as exactly 400 kcal (calories not recomputed from macros when P+C+F = 0 at time of typing).

### RF-LOG-10 — Ingredients add/remove recalculation
- **S:** Modal → "Add Ingredient" twice → name "Rice" (200 kcal, P 4, C 45, F 0) and "Chicken" (250 kcal, P 30, C 0, F 10).
- **E:** Total Calories auto-updates to 450; P 34, C 45, F 10.
- **S:** Delete "Chicken".
- **E:** Totals drop to 200 / P 4 / C 45 / F 0. Ingredient chips appear on the saved entry row with `name (kcal)`.

### RF-LOG-11 — Serving size math (grams)
- **P:** Modal: Name "Pasta", Calories 350, amount field default 100.
- **S:** Change amount to 200.
- **E:** All macros scale ×2 (per-100g basis): 700 kcal, P/C/F doubled.
- **S:** Change amount to 50.
- **E:** Halved: 175 kcal.

### RF-LOG-12 — Serving size math (servings)
- **P:** Modal: Name "Rice", Calories 250 at 100 g, unit "g".
- **S:** Switch unit to "servings".
- **E:** Amount converts to 1 serving (100 g = 1); macros stay 250 kcal.
- **S:** Set "1 serving =" to 150 g, amount 2 servings.
- **E:** 300 g → 750 kcal, macros ×3 of per-100g.
- **S:** Set amount 0.5 servings.
- **E:** 75 g → 187.5 kcal (rounded to 1 decimal).

### RF-LOG-13 — Edit entry
- **P:** Entry "Oatmeal" 250 kcal exists.
- **S:** Click the pencil icon on the entry.
- **E:** Modal "Edit Entry — breakfast" opens prefilled (name, kcal, macros, ingredients, meal type).
- **S:** Change name to "Oatmeal & Berries", kcal 300, switch meal type to "snack" → Save.
- **E:** Toast "Entry updated!". Entry now under snack section with updated name/kcal. No duplicate created.

### RF-LOG-14 — Edit keeps per-100g scaling consistent
- **S:** Edit an entry and change amount (grams) to half.
- **E:** Kcal/macros halve (per-100g basis preserved).

### RF-LOG-15 — Delete with confirmation
- **P:** Entry exists.
- **S:** Click the trash icon.
- **E:** Trash icon swaps to a red "Sure?" button. Click elsewhere → reverts within ~1s. Click "Sure?" → entry disappears, totals update, no toast.
- **S:** Re-click trash then wait 3 seconds.
- **E:** "Sure?" auto-reverts to trash icon without deleting.

### RF-LOG-16 — Add Entry chooser modal
- **S:** Dinner → "Add Entry".
- **E:** Chooser modal: "Add dinner" with two options — "Scan Meal / AI photo estimate" and "Manual Entry / Type the details yourself".
- **S:** Press Escape / click backdrop / click ✕.
- **E:** Modal closes without action.

### RF-LOG-17 — Chooser → Scan with date carry-over
- **S:** Navigate log to a past date (e.g. 2026-08-03) → "Add Entry" → "Scan Meal".
- **E:** Lands on `/scan?date=2026-08-03`. After saving a scan there, the meal appears on the log page under 2026-08-03 (not today).

### RF-LOG-18 — Chooser → Manual
- **S:** "Add Entry" → "Manual Entry".
- **E:** AddEntryModal opens for the chosen meal type; saving adds to that section.

### RF-LOG-19 — Add Entry modal — Escape/backdrop close
- **S:** Open modal → press Escape / click dark backdrop.
- **E:** Closes; no data saved. Reopening shows fresh empty form.

### RF-LOG-20 — Empty sections
- **P:** No entries for a meal type.
- **E:** Section dimmed (opacity-70), "No Entries Yet." placeholder, "0 KCAL" subtotal.

---

## 5. Meal Scan (RF-SCAN)

### RF-SCAN-01 — Mode switcher
- **S:** Visit `/scan`.
- **E:** "AI Scan" and "Barcode" toggle buttons; AI mode active by default (highlighted). Switching highlights the other.

### RF-SCAN-02 — AI camera capture
- **P:** Camera permission granted.
- **S:** AI mode → "Point & Capture".
- **E:** Live video with pixel viewfinder corners and animated scanline. "Capture" button enabled when camera ready. Click Capture → "Analyzing meal..." state with pulsing icon → Review & Confirm screen appears with AI-estimated items.

### RF-SCAN-03 — Camera permission denied / no camera
- **P:** Camera blocked or absent (desktop without webcam).
- **S:** Open AI scan.
- **E:** "Camera Unavailable — use the file picker" panel + "Choose Photo" button. No crash.

### RF-SCAN-04 — Upload photo
- **S:** AI mode → "Upload Photo" → select a food image (large ≥4MB JPEG).
- **E:** Photo downscaled client-side; "Analyzing meal..." then Review & Confirm with item estimates. (Verifies the 1MB server-action limit workaround.)
- **S:** Upload a non-image/corrupt file (e.g. rename a .txt to .png).
- **E:** Error "Could not read that file — try another photo".

### RF-SCAN-05 — Notes are passed to the AI
- **S:** Type "cooked in oil, extra gravy, chicken is fried" into Notes → capture.
- **E:** Result includes items consistent with fried/heavy prep (higher fat estimates). (Behavioral; no hard assert.)

### RF-SCAN-06 — Describe your meal (text analysis)
- **S:** AI mode → type "half a plate of fried rice with an egg, two pieces of fried chicken, and a bowl of soup" → "Analyze Description".
- **E:** "Analyzing..." then Review & Confirm with 2+ items. Button disabled while empty.
- **S:** Submit empty (button disabled) — also confirm clicking does nothing.
- **E:** No error if truly empty (button disabled); if triggered via keyboard, error "Describe your meal first".

### RF-SCAN-07 — Review screen structure
- **S:** After any successful analysis.
- **E:** "Review & Confirm" header. Editable Description field (prefilled short meal name). One fieldset per item: name, serving size (number + grams/servings toggle), "1 serving =" field (only in servings mode), portion label from AI, Kcal + P/C/F inputs. Total box (kcal + P/C/F). Meal type selector (4). "Retake" and "Save Meal" buttons.

### RF-SCAN-08 — Editing items: name, kcal, macros
- **S:** In review, rename item, set kcal 300, P 20, C 30, F 10.
- **E:** Total box updates live (P/C/F sums, kcal = 300 from field). Entering P/C/F recalculates kcal automatically (P×4+C×4+F×9) when any macro > 0; typing kcal directly wins while macros are 0.

### RF-SCAN-09 — Amount scaling in review
- **S:** Item per 100 g: 500 kcal. Change amount 100 → 250.
- **E:** kcal 1250, macros ×2.5. Hint "Macros adjust automatically when you change the serving size" present.
- **S:** Switch unit to servings; set 1 serving = 200 g; amount 2.
- **E:** 400 g → 2000 kcal.
- **S:** Switch back to grams.
- **E:** Amount converts to 400 (grams), same kcal.

### RF-SCAN-10 — Add / delete ingredients in review
- **S:** Click "Add Ingredient".
- **E:** New "Ingredient N" row appears; totals update (0 initially). Delete it → row removed.
- **S:** Delete all items.
- **E:** "No ingredients listed. Click 'Add Ingredient' below to add one manually." placeholder appears.

### RF-SCAN-11 — Save validation
- **P:** Review result with all items at 0 kcal.
- **S:** Click "Save Meal".
- **E:** Error "Enter calories before saving" — nothing saved.
- **S:** Set kcal > 0 → Save Meal.
- **E:** Toast "Meal logged!". Back to empty scan form. Entry appears on `/log` under the chosen date/meal type with ingredients chips.

### RF-SCAN-12 — Meal type selection in review
- **S:** Result defaults to "snack". Click "lunch" → Save.
- **E:** Log entry appears under lunch on the log page.

### RF-SCAN-13 — Retake discards result
- **S:** After analysis, click "Retake".
- **E:** Returns to the capture UI; no meal saved.

### RF-SCAN-14 — AI estimation reasoning disclosure
- **S:** After a scan, review screen.
- **E:** If the AI returned reasoning, a collapsible "AI Estimation Reasoning" `<details>` shows it; toggles open/closed.

### RF-SCAN-15 — Description override
- **S:** In review, clear Description → type "Nasi Lemak with Fried Chicken" → Save.
- **E:** Log entry named "Nasi Lemak with Fried Chicken" (used when non-empty; falls back to first item name, else "Meal").

### RF-SCAN-16 — AI errors surface cleanly
- **P:** No AI keys configured (or keys invalid), or offline.
- **S:** Capture/describe.
- **E:** Red error box in the panel (e.g. "AI is not configured" / "AI is busy right now — try again in a moment"). No uncaught crash; app still usable.
- **P:** Gemini key present but provider down; OpenRouter key valid.
- **S:** Analyze.
- **E:** Falls back to OpenRouter and succeeds (check server console for "[ai] Gemini failed, falling back to OpenRouter").

### RF-SCAN-17 — Barcode: camera scanner
- **P:** Camera permission granted; a real product barcode at hand (EAN-13 e.g. 5449000000996 Coca-Cola, or UPC-A).
- **S:** Switch to Barcode → "Starting camera..." then live view with corner brackets, scanline animation, and "Point at the barcode" hint.
- **E:** Pointing a valid barcode → scanner stops → "Review & Confirm" appears with product name from Open Food Facts, serving size label, per-100g macros, kcal scaled to serving_quantity. "Barcode: <code>" chip shown.

### RF-SCAN-18 — Barcode: manual code lookup
- **S:** Barcode mode → type `5449000000996` → "Look Up" (or press Enter).
- **E:** Button shows "Looking up..." then review screen with product data.
- **S:** Type a non-existent 13-digit code (e.g. `1234567890123`).
- **E:** Review screen opens with "Not found — fill in the details" and an empty item (0 kcal) — user can fill manually and save (source stays barcode).
- **S:** Type garbage (letters / 3 digits / 20 digits).
- **E:** No lookup performed (lookup only fires for 8–14 digits; review screen NOT shown).

### RF-SCAN-19 — Barcode: camera unavailable
- **P:** Camera denied/unavailable.
- **S:** Barcode mode.
- **E:** Error "Camera unavailable — enter the barcode manually instead." Manual code input still works.

### RF-SCAN-20 — Barcode: UPC-A 12-digit handling
- **S:** Type a 12-digit UPC (e.g. US product 012345678905).
- **E:** If not found as-is, the app retries with a leading zero (EAN-13); found products load correctly.

### RF-SCAN-21 — Barcode scan logs as snack by default
- **S:** Scan any barcode → change meal type if desired → Save.
- **E:** Saved under snack (default), source barcode; entry appears on log page.

### RF-SCAN-22 — Scan page "Enter Manually Instead"
- **S:** AI mode → scroll → "Enter Manually Instead".
- **E:** AddEntryModal opens (mealType snack, date = today).

---

## 6. Weight Tracker (RF-WEIGHT)

### RF-WEIGHT-01 — Layout
- **S:** Visit `/weight`.
- **E:** "Weight Tracker" header. Current weight + range toggle (1W / 1M / 1Y, default 1M highlighted). Chart panel. "Log Weight" form (Date, Weight (kg), Note (optional), Save Weight). History list.

### RF-WEIGHT-02 — Log a weight (happy path)
- **S:** Date today, weight 70.5 → "Save Weight".
- **E:** Toast "Weight saved!". History shows entry `Jul 6, 2026 · 70.5 kg` (note if given). Inputs cleared. Current weight shows 70.5 kg.

### RF-WEIGHT-03 — Validation 30–300 kg
- **S:** Type 25 → Save.
- **E:** Alert "Weight must be between 30 and 300 kg."; Save disabled (greyed).
- **S:** Type 300.5 / blank / 0.
- **E:** Same invalid state (alert visible once field non-empty).
- **S:** Type 30 / 300.
- **E:** Valid; Save enabled.

### RF-WEIGHT-04 — Same-date entry replaces previous
- **P:** Weight 70.5 logged for today.
- **S:** Log 71.0 for today.
- **E:** History shows only ONE entry for today (71.0), not two. (IndexedDB upsert + sync queue handles replacement.)

### RF-WEIGHT-05 — Notes
- **S:** Log weight with note "Morning, fasted".
- **E:** Note shown under the date in history.

### RF-WEIGHT-06 — Chart rendering
- **P:** ≥2 weights within the selected range (e.g. 70.0 on day −10, 69.5 on day −5, 69.0 today).
- **S:** Visit page.
- **E:** Polyline chart drawn with grid background; hi/lo labels (e.g. 70.2 / 68.8 kg), first/last date labels, delta badge `-1.0 kg` (with `+` prefix for gains). Latest point has a dot.
- **S:** Toggle 1W / 1M / 1Y.
- **E:** Filtering changes which entries chart + history show (cutoff = now − 7/30/365 days).

### RF-WEIGHT-07 — Chart states
- **P:** 0 weights.
- **E:** "No entries yet." in chart; "No weight logged yet." in history; Current = "-- kg".
- **P:** 1 weight.
- **E:** "Add one more entry to chart."; Current shows the single weight.

### RF-WEIGHT-08 — History ordering
- **S:** Log weights on several dates.
- **E:** History lists newest first (reverse chronological).

### RF-WEIGHT-09 — Weight sync dedupe
- **P:** Sync to Supabase succeeds for a weight entry; `weight_logs` has UNIQUE(user_id, logged_date).
- **S:** From another browser (same user), log a weight on the same date.
- **E:** Upsert/delete-queue path prevents duplicates — verify only one row per date in the DB.

---

## 7. Settings (RF-SETTINGS)

### RF-SETTINGS-01 — Layout
- **S:** Visit `/settings`.
- **E:** "Settings" header. Goal picker window, Activity picker window, Daily Targets form, "Retake Quest — Recalculate Your Targets" link, Sync Status window, Log Out button.

### RF-SETTINGS-02 — Goal picker
- **P:** Current goal "maintain" (fixture).
- **S:** Click "Cut".
- **E:** Toast "Goal updated!". Daily Targets form and displayed kcal now reflect cut (2,556 − 500 = 2,056); macro fields show recalculated values; goal line under picker updates.
- **S:** Click "Bulk" → "Maintain".
- **E:** Each change persists after reload (`/settings` refresh shows latest). Picker reflects DB state on load.

### RF-SETTINGS-03 — Activity picker
- **P:** Fixture "moderate".
- **S:** Click "Light".
- **E:** Toast "Activity updated!"; targets recalculate from light multiplier (1.375 → TDEE 2,267 → cut −500 = 1,767 etc. per current goal). Reload persists.
- **P:** Onboarding data missing (fresh profile pre-quest).
- **S:** Click an activity.
- **E:** Error "Onboarding data missing — redo the quest first."

### RF-SETTINGS-04 — Daily Targets form
- **S:** Set Protein 150, Carbs 250, Fat 70 → "Save Targets".
- **E:** Toast "Targets saved!". Resulting daily calories box shows 150×4+250×4+70×9 = 2,230 kcal. Home dashboard and Log page now use these targets.
- **S:** Set macros summing below 800 (e.g. all 100).
- **E:** Server error "Total calories must stay between 800-6000." shown; nothing saved.
- **S:** Enter negative value.
- **E:** Server error "Macros must be 0 or more grams." (min=0 also blocks at input).

### RF-SETTINGS-05 — Retake quest link
- **S:** Click "Retake Quest — Recalculate Your Targets".
- **E:** → `/quest?retake=1` (see RF-QUEST-10/11).

### RF-SETTINGS-06 — Sync Status panel
- **P:** Some unsynced entries.
- **S:** Open `/settings`.
- **E:** "Queue: N pending" where N = count in syncQueue (0 if all synced). Network shows ONLINE/OFFLINE live. "Push Now" disabled when queue is 0 or while pushing; click → "Pushing..." → "Synced!" toast → queue 0.

### RF-SETTINGS-07 — Log Out
- **S:** Click "Log Out".
- **E:** Redirected to `/login`. Visiting `/` stays on login; browser back to `/settings` does not resurrect the session.

---

## 8. Offline-First & Sync (RF-OFFLINE)

### RF-OFFLINE-01 — Logging while offline
- **S:** DevTools Offline → `/log` → add a manual meal (Name "Offline Oatmeal", 200 kcal).
- **E:** Entry saves locally, appears immediately, totals update, badge shows OFFLINE. No error.
- **S:** Go Online (wait ≤15s).
- **E:** `online` event + interval timer push the entry to Supabase. Badge → SYNCED. Queue drains (verify in `/settings` Sync Status → 0 pending, or `Push Now` disabled).

### RF-OFFLINE-02 — Delete while offline
- **S:** Offline → delete a synced entry (two-step "Sure?").
- **E:** Entry disappears locally; delete op queued. Online → row removed from Supabase (verify in DB).

### RF-OFFLINE-03 — Edit while offline
- **S:** Offline → edit a synced meal (rename).
- **E:** Local edit applies; queue holds an `update` op (one per client_id — re-editing twice keeps only the latest op). Online → Supabase row updated via upsert on client_id.

### RF-OFFLINE-04 — Duplicate-safe insert sync
- **P:** Entry inserted offline, then app closed before sync. Supabase already has a row with the same client_id (e.g. from a prior sync attempt that succeeded but dropped the queue locally).
- **S:** Go online.
- **E:** Insert treated as success (duplicate error ignored), entry marked synced, queue drains. No duplicate rows.

### RF-OFFLINE-05 — Weight offline, same date
- **S:** Offline → log 70.0 today → online. Offline again → log 70.5 today.
- **E:** Online: DB has exactly one row for today, 70.5 (delete+insert queue path). No unique-constraint error in console.

### RF-OFFLINE-06 — Push Now from settings
- **P:** ≥1 pending op, online.
- **S:** `/settings` → "Push Now".
- **E:** Queue → 0, "Synced!" toast. Verify rows in Supabase.

### RF-OFFLINE-07 — Sync requires auth
- **P:** Logged out (data still in local IndexedDB).
- **S:** Log back in as a DIFFERENT user, go online.
- **E:** Old user's pending queue is NOT pushed to the new account (sync payloads carry user.id; queued ops from previous session only flush when that user signs in). No cross-account data leak.

### RF-OFFLINE-08 — Fresh page load offline shows cached UI
- **P:** Previously visited app online; PWA installed or SW active.
- **S:** Offline → hard reload `/`.
- **E:** App shell loads from service worker cache (see RF-PWA). Log page loads from IndexedDB; newly added entries unavailable only if never fetched.

---

## 9. PWA (RF-PWA)

### RF-PWA-01 — Manifest
- **S:** Visit `/manifest.webmanifest`.
- **E:** Valid JSON: name "RetroFit 8-Bit", short_name "RetroFit", start_url "/", standalone display, theme/background `#0c1609`, icon `/RF logo.png`.

### RF-PWA-02 — Service worker registration
- **S:** Open DevTools → Application → Service Workers (fresh session).
- **E:** `sw.js` registered and activated, client claimed (`skipWaiting` + `clients.claim`). Console: no registration errors (silent catch).

### RF-PWA-03 — App installability
- **S:** Desktop Chrome → install icon in address bar (or `beforeinstallprompt`).
- **E:** Installs as standalone app with RetroFit icon. Launches fullscreen without browser chrome.

### RF-PWA-04 — Installable on mobile
- **S:** iOS Safari → Share → Add to Home Screen; Android Chrome → Install.
- **E:** Adds icon; opens standalone with black-translucent status bar (apple-web-app meta). Home screen icon = apple-touch-icon.png on iOS.

### RF-PWA-05 — Offline shell navigation
- **S:** Visit `/`, `/log`, `/scan`, `/weight`, `/settings` online once → go offline → reload each.
- **E:** Each route renders from cache (navigate → network-first → cache fallback → "/"). No white screen. (Build artifacts/RSC payloads are never cached — pages that were never visited offline fall back to cached "/").

### RF-PWA-06 — Static asset caching
- **S:** Offline → load page.
- **E:** `/RF logo.png`, `/fonts/material-symbols.woff2`, `/manifest.webmanifest` serve from cache (icons/fonts render).

### RF-PWA-07 — Cache versioning
- **S:** After a deploy (cache key bump), reload.
- **E:** Old caches purged (`activate` deletes non-matching keys); no stale-shell errors.

### RF-PWA-08 — No caching of RSC payloads
- **S:** Online, navigate between pages (client-side).
- **E:** Fresh RSC payloads fetched; no hydration mismatch errors in console (verifies `_rsc`/`/_next/` exclusion).

---

## 10. Responsive & Desktop Layout (RF-UX)

### RF-UX-01 — Mobile bottom nav
- **P:** Viewport < 1024px (or mobile emulation).
- **S:** Visit any app page.
- **E:** Fixed header with "RetroFit 8-Bit" + settings gear (→ `/settings`). Bottom nav with 5 tabs: Home, Log, Scan, Weight, Settings. Active tab highlighted with ▲ indicator and filled icon; inactive dimmed. Tapping navigates; active tab re-tap does nothing harmful.

### RF-UX-02 — Desktop sidebar
- **P:** Viewport ≥ 1024px.
- **S:** Visit any app page.
- **E:** Left sidebar with logo (click → `/`) and the 5 nav items; active item highlighted with primary border. No bottom nav, no top header (except dashboard date). Content shifted right (pl-64), no overlap with sidebar.

### RF-UX-03 — Content scroll behavior
- **S:** Mobile, long log day.
- **E:** Fixed header/bottom nav stay fixed; content scrolls between them (pt-20/pb-24 padding); no content hidden under bars.

### RF-UX-04 — Touch input zoom prevention
- **P:** Mobile viewport.
- **S:** Focus any input/textarea.
- **E:** Font ≥16px inside fields — no iOS auto-zoom on focus.

### RF-UX-05 — Focus visibility
- **S:** Tab through the UI (desktop).
- **E:** Every focusable element shows a clear 3px primary outline (`:focus-visible`); keyboard-only users can reach all buttons, links, modal controls.

### RF-UX-06 — Reduced motion
- **P:** OS "reduce motion" enabled.
- **S:** Open scan/barcode pages.
- **E:** Scanline animation and pulses are static (no animation) per `prefers-reduced-motion`.

### RF-UX-07 — Modals on mobile
- **S:** Open AddEntryModal at 375px width.
- **E:** Modal fits (max-w-md, max-h-90vh, internal scroll); Cancel/Save reachable without page scroll behind.

### RF-UX-08 — Fonts & icons
- **S:** Any page.
- **E:** Headline (Anybody), body (Inter), mono (JetBrains) all render; material symbols (icons) render as glyphs, not tofu boxes.

---

## 11. Security & Edge Cases (RF-SEC)

### RF-SEC-01 — Route guards
- `/` unauthenticated → `/login` (RF-AUTH-01)
- `/quest`, `/settings`, `/log`, `/weight`, `/scan` unauthenticated → `/login`
- `/login` authenticated → `/` (RF-AUTH-10)
- `/quest` onboarding-complete & no retake → `/` (RF-QUEST-12)
- `/settings` with no profile row → `/quest` (RF-SEC-02)

### RF-SEC-02 — Settings with missing profile
- **P:** Auth'd user with no `profiles` row (e.g. DB row deleted).
- **S:** Visit `/settings`.
- **E:** Redirected to `/quest` (fresh onboarding).

### RF-SEC-03 — Quest redirect guard (backslash bypass)
- **P:** Auth'd user on `/quest?retake=1`.
- **S:** Tamper the `next` form field (devtools) to `//evil.com` or `/..\evil`.
- **E:** Redirected to `/` only (regex `/^\/[^/\\]/` rejects `//` and backslash paths). No open redirect.
- **S:** Tamper to `/settings` (valid internal path).
- **E:** Redirects to `/settings` (allowed).

### RF-SEC-04 — Server-side validation on quest (tampered payload)
- **S:** Tamper age/gender/height/weight/macros/goal to out-of-range or bogus values via devtools form edits.
- **E:** Server returns inline errors ("Age must be 13-100.", "Height must be 100-250 cm.", "Weight must be 30-300 kg.", "Macros must be 0 or more grams.", "Pick a goal.", "Total calories must stay between 800-6000."). No bad row written.

### RF-SEC-05 — RLS: user data isolation
- **P:** Two accounts A and B with logged data.
- **S:** Sign in as B → inspect network/DB.
- **E:** B sees only B's data. (Schema: RLS policies `auth.uid() = id` / `user_id` on all tables; manual attempt to query A's rows from B's session returns empty/403.)

### RF-SEC-06 — Health endpoint
- **S:** `GET /api/health`.
- **E:** `{"ok":true,"tables":4}` (200) when Supabase reachable. If DB unreachable: `{"ok":false,...}` (500).

### RF-SEC-07 — Numeric overflow in serving math
- **S:** In AddEntryModal set amount to 0 → save.
- **E:** kcal/macros → 0 (no NaN/Infinity displayed). Set amount to huge (1e15) → no crash (values scale, no infinite loop).
- **S:** Type "-" into amount field (intermediate state).
- **E:** Field accepts input without erroring/NaN (guarded), recalculates once a valid number exists.

### RF-SEC-08 — Rapid double-submit
- **S:** Double-click "Save Meal" / "Save Weight" / "Save" quickly.
- **E:** No duplicate entries (adds use unique client_ids but each click is one action; modal closes after first save; weight same-date replaces). No crash.

### RF-SEC-09 — Barcode regex hardening
- **S:** Manual lookup with `+123`, `12 34`, `abc12345678`, empty string.
- **E:** No network call (regex `^\d{8,14}$`); empty → nothing happens.

### RF-SEC-10 — AI payload caps
- **P:** Instrument `lib/ai.ts` (`cleanItem`).
- **S:** Analyze an image the AI claims is extreme (e.g. "10,000 kcal").
- **E:** Values clamped (item ≤ 2000 kcal / 2000 g, totals ≤ 6000 kcal); no overflow or negative macros stored.

---

## 12. Cross-Cutting & Regression

### RF-REG-01 — Full happy-path journey
1. Fresh signup → quest (fixture 30/M/175/70/moderate/maintain) → dashboard shows 2,556 target.
2. `/log` → add breakfast (Oatmeal 250 kcal, P10/C40/F4) and lunch (Rice & Chicken via ingredients, 450 kcal).
3. `/scan` → describe "fried rice with egg" → adjust → save as dinner.
4. `/weight` → log 70.5 today.
5. `/settings` → change goal to cut → targets recalc to 2,056.
6. Offline → add snack → online → verify sync → `/settings` queue 0.
7. Reload all pages → no console errors, data persisted (IndexedDB + Supabase).

### RF-REG-02 — Server console cleanliness
- **S:** Run the full suite above.
- **E:** No unhandled promise rejections, no React hydration warnings, no 404s for assets. Expected-only logs (e.g. AI fallback notices).

### RF-REG-03 — Keyboard accessibility sweep
- **S:** Complete RF-REG-01 using only Tab/Enter/Space/Escape.
- **E:** Every flow doable: modal open/close (Esc), chooser (Esc), delete confirm, form submits, tab navigation, weight card Enter.

### RF-REG-04 — Data persistence across reloads
- **S:** Add entries/weights → hard reload (Ctrl+Shift+R).
- **E:** All local + synced data reappears; selected log day resets to today; range resets to 1M (expected defaults).

---

## Pass / Fail sheet

| Area | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| Auth | RF-AUTH-01..10 | | | |
| Quest | RF-QUEST-01..13 | | | |
| Home | RF-HOME-01..08 | | | |
| Log | RF-LOG-01..20 | | | |
| Scan | RF-SCAN-01..22 | | | |
| Weight | RF-WEIGHT-01..09 | | | |
| Settings | RF-SETTINGS-01..07 | | | |
| Offline/Sync | RF-OFFLINE-01..08 | | | |
| PWA | RF-PWA-01..08 | | | |
| Responsive | RF-UX-01..08 | | | |
| Security | RF-SEC-01..10 | | | |
| Regression | RF-REG-01..04 | | | |

**Known scope limits (from code):** `custom_foods` table exists in the schema but has no UI (only the `custom_favorite` source enum) — no tests required. `hooks/` is empty scaffolding. AI item estimation is probabilistic — assert on structure, not exact numbers.
