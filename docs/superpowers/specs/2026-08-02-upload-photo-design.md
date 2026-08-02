# Upload Meal Photo — Design Spec

Date: 2026-08-02
Status: Approved (design)

## Goal

Let users analyze a meal photo from their device's photo gallery/file picker on the Scan screen, instead of only using the live camera.

## Current State

- Scan screen (`app/scan/page.tsx`) AI mode shows a live camera viewfinder (`components/scan-camera.tsx`) plus an "Enter Manually Instead" button.
- `scan-camera.tsx` already contains a hidden `<input type="file">` + FileReader → dataURL helper, but it only renders as a fallback when the camera is unavailable.
- The full analysis pipeline (`handleCapture(dataURL)` → `analyzeScan` server action → review form) already works with any dataURL, as proven by the headless Playwright test using the fallback picker.

## Design

### Changes

1. **`components/scan-camera.tsx`** — export the existing file→dataURL helper so it can be reused by the page.
2. **`app/scan/page.tsx`** — in AI mode, below the `ScanCamera` viewfinder and above the "Enter Manually Instead" button, add:
   - A button styled like `pixel-btn-secondary` with `upload` icon and label "Upload Photo"
   - A hidden `<input type="file" accept="image/*">` nested in the button
   - On selection: read file via the exported helper → `handleCapture(dataURL)` → same AI analysis → same review form

### Non-Goals

- No changes to barcode mode (barcode scanning is not meal photos).
- No new dependencies, no new state, no changes to the analysis pipeline or review form.

### Error Handling

Identical to camera capture: any AI/server error flows through the existing `error` state and banner; the user can retry or use manual entry.

### Testing

- Extend `/tmp/opencode/p7-check.js`: add a step that uses the new "Upload Photo" button (file chooser) instead of the camera-failure fallback, then asserts the review form appears and saving works.
- Build must pass; commit after verification.
