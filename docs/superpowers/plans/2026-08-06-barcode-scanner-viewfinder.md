# Barcode Scanner Viewfinder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the barcode camera box in `/scan` to match the AI camera viewfinder styling.

**Architecture:** Presentational change to the barcode mode block in `app/scan/page.tsx`. Add a `started` state so the "Starting camera..." placeholder and scanline/hint appear at the right moments; reuse the corner bracket overlay from `scan-camera.tsx`.

**Tech Stack:** Next.js (App Router), React, Tailwind, html5-qrcode.

## Global Constraints

- No new dependencies, no functional scanner changes.
- Copy strings verbatim: "Starting camera...", "Point at the barcode".
- Reset `started` alongside `scanning` in the effect cleanup.

---

### Task 1: Barcode viewfinder polish

**Files:**
- Modify: `app/scan/page.tsx:74` (add `started` state), `app/scan/page.tsx:132-143` (set `started` after start resolves), `app/scan/page.tsx:169-178` (reset in cleanup), `app/scan/page.tsx:750-760` (box overlay)

**Interfaces:**
- Consumes: existing `scanning` state, `Html5Qrcode` scanner instance.
- Produces: `started` boolean state used by the JSX overlay.

- [ ] **Step 1: Add `started` state**

In `app/scan/page.tsx`, right after the `scanning` state (line 74), add:

```tsx
const [started, setStarted] = useState(false);
```

- [ ] **Step 2: Set `started` when the camera starts**

In `app/scan/page.tsx`, replace the line after `setScanning(true);`:

```tsx
      setScanning(true);
      setStarted(false);
```

Then, after the `await scanner.start(...)` call chain but inside the try (right after the `.catch()` block closes at line 167, i.e. after the `start` promise resolves), set it true. The cleanest spot is to wrap: change the `await scanner.start(...)` so that after it resolves the state flips — add below the `.catch`:

```tsx
        .catch(() => {
          scannerRef.current = null;
          if (!stopped) setError("Camera unavailable — enter the barcode manually instead.");
        })
        .finally(() => {
          if (!stopped) setStarted(true);
        });
```

Note: keep the existing `.catch` as-is; append `.finally`. If `start` rejects, `started` stays false and the "Starting camera..." overlay remains, which is acceptable since the error banner appears under the box.

- [ ] **Step 3: Reset `started` in cleanup**

In the effect cleanup (line 170 area), add reset:

```tsx
      setScanning(false);
      setStarted(false);
```

- [ ] **Step 4: Replace the barcode box JSX**

Replace the box at `app/scan/page.tsx:750-762` (the `div.relative.aspect-square...` containing `#barcode-container` and the `scanning` overlay) with:

```tsx
          <div className="relative aspect-square w-full overflow-hidden border-2 border-outline-variant bg-surface-container lg:mx-auto lg:max-w-md">
            <div id="barcode-container" className="h-full w-full" />
            {!started && (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold uppercase text-on-surface-variant">
                Starting camera...
              </div>
            )}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-4 top-4 h-1 border-x-2 border-t-2 border-tertiary" />
              <div className="absolute inset-x-4 bottom-4 h-1 border-x-2 border-b-2 border-tertiary" />
              <div className="absolute inset-y-4 left-4 w-1 border-y-2 border-l-2 border-tertiary" />
              <div className="absolute inset-y-4 right-4 w-1 border-y-2 border-r-2 border-tertiary" />
            </div>
            {started && (
              <div className="pointer-events-none absolute inset-0">
                <div className="scanline-anim pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary/60" />
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <span className="flex items-center gap-1.5 bg-surface/80 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-on-surface-variant">
                    <span className="material-symbols-outlined text-xs">barcode_scanner</span>
                    Point at the barcode
                  </span>
                </div>
              </div>
            )}
          </div>
```

- [ ] **Step 5: Verify**

Run the app locally: `npm run dev`, open `/scan`, switch to Barcode mode.

Expected:
- "Starting camera..." shows briefly until the video appears.
- Corner brackets overlay the live camera view.
- Scanline + "barcode_scanner icon + Point at the barcode" pill appear once the scanner is live.
- Error case (camera denied on desktop) still shows the error banner under the box with the manual entry fallback.

- [ ] **Step 6: Commit**

```bash
git add app/scan/page.tsx
git commit -m "feat: barcode scanner viewfinder polish"
```