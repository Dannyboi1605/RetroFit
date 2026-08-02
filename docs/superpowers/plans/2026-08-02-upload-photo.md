# Upload Meal Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible "Upload Photo" button to the Scan screen's AI mode so users can analyze a meal photo from their device gallery/file picker.

**Architecture:** The photo-analysis pipeline already exists (`handleCapture(dataURL)` → `analyzeScan` server action → review form) and is proven to work with uploaded images via the camera-failure fallback picker. This feature surfaces that capability as a permanent button: export the file→dataURL helper from `scan-camera.tsx`, then add a hidden file input inside a styled button on `app/scan/page.tsx` that feeds the same pipeline.

**Tech Stack:** Next.js 16 App Router (client component), React, TypeScript, existing retro pixel styling (`pixel-btn-secondary`), existing Playwright check script (`/tmp/opencode/p7-check.js`).

## Global Constraints

- No new dependencies.
- No changes to barcode mode.
- No changes to the analysis pipeline, review form, or data model.
- Must reuse the file→dataURL logic already inside `components/scan-camera.tsx` — do not duplicate it.
- Follow existing component style: `pixel-btn-secondary` class, `material-symbols-outlined` icons, `font-mono` labels.
- Verification uses the Playwright script pattern from previous phases: throwaway script in `/tmp/opencode/`, dev server on `http://localhost:3000`, creds via `EMAIL`/`PASSWORD` env vars.
- One commit per task, conventional style (`feat:` / `refactor:`).

---

### Task 1: Extract and export `fileToDataUrl` helper

**Files:**
- Modify: `components/scan-camera.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `export function fileToDataUrl(file: File): Promise<string>` — resolves with the file's data URL; Task 2 imports it from `@/components/scan-camera`

- [ ] **Step 1: Refactor `onFile` to use a new exported helper**

In `components/scan-camera.tsx`, replace the current `onFile` (lines 54-59) with the exported helper plus an async `onFile` that uses it and reports read errors through `onError`:

```ts
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function onFile(file: File | undefined) {
  if (!file) return;
  try {
    onCapture(await fileToDataUrl(file));
  } catch {
    onError("Could not read that file — try another photo");
  }
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: `✓ Compiled successfully` (2 lines of output, exit 0)

- [ ] **Step 3: Commit**

```bash
git add components/scan-camera.tsx
git commit -m "refactor: extract reusable fileToDataUrl helper in scan camera"
```

---

### Task 2: Add "Upload Photo" button to the Scan page

**Files:**
- Modify: `app/scan/page.tsx` (imports + AI-mode block)
- Test: `/tmp/opencode/p7-check.js`

**Interfaces:**
- Consumes: `fileToDataUrl(file: File): Promise<string>` from `@/components/scan-camera` (Task 1); existing `handleCapture(dataUrl: string): Promise<void>` in `app/scan/page.tsx`
- Produces: a `handleFile` function on the page; the "Upload Photo" button (visible to the user and to the Playwright check via `getByRole("button", { name: /upload photo/i })`)

- [ ] **Step 1: Import the helper and add `handleFile`**

In `app/scan/page.tsx`:
1. Change the import on line 6 from `import ScanCamera from "@/components/scan-camera";` to:

```ts
import ScanCamera, { fileToDataUrl } from "@/components/scan-camera";
```

2. Add this function right after `handleCapture` (after line 113):

```ts
async function handleFile(file: File | undefined) {
  if (!file) return;
  await handleCapture(await fileToDataUrl(file));
}
```

- [ ] **Step 2: Add the button between the viewfinder and the manual-entry button**

In `app/scan/page.tsx`, in the AI-mode block, directly after `<ScanCamera onCapture={handleCapture} onError={setError} />` (line 169) and before the `{error && (` banner, insert:

```tsx
<label className="pixel-btn-secondary w-full cursor-pointer">
  <span className="material-symbols-outlined text-base">photo_library</span>
  Upload Photo
  <input
    type="file"
    accept="image/*"
    className="hidden"
    onChange={(e) => handleFile(e.target.files?.[0])}
  />
</label>
```

- [ ] **Step 3: Update the Playwright check to use the new button**

In `/tmp/opencode/p7-check.js`, replace step 2's fallback-picker usage (`page.setInputFiles('input[type="file"]', ...)`) with a filechooser event on the new button:

```js
console.log("2. AI scan via upload photo button");
await page.goto("http://localhost:3000/scan");
await page.waitForTimeout(2000);
const chooserPromise = page.waitForEvent("filechooser");
await page.getByRole("button", { name: /upload photo/i }).click();
const chooser = await chooserPromise;
await chooser.setFiles("/tmp/opencode/food-test.jpg");
```

Also remove the now-unused "camera fallback visible" check lines.

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: `✓ Compiled successfully` (exit 0)

- [ ] **Step 5: Run the full Playwright check (user-run, needs creds)**

Run: `EMAIL=<user email> PASSWORD=<user password> node /tmp/opencode/p7-check.js`
Expected: all steps pass — step 2 reports an AI result (e.g. `Coca-Cola Original | 140`), steps 3-7 unchanged and green, console clean.

- [ ] **Step 6: Commit**

```bash
git add app/scan/page.tsx
git commit -m "feat: upload meal photo button on scan screen"
```

---

## Self-Review Notes

- **Spec coverage:** Spec's design — button below viewfinder (Task 2 Step 2), reuse of file helper (Task 1), no barcode changes (Global Constraints), no new deps (Global Constraints), testing via p7-check (Task 2 Step 3) — all covered. Non-goals respected.
- **Placeholders:** none — all code blocks are complete.
- **Type consistency:** `fileToDataUrl(file: File): Promise<string>` is defined in Task 1 and consumed identically in Task 2; `handleCapture` signature unchanged.
