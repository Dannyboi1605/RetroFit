# Barcode Scanner Viewfinder — Design

Date: 2026-08-06

## Goal

Make the barcode camera box in `/scan` match the AI camera box styling and
look like a proper viewfinder, without changing scanner behavior.

## Approach

Pure presentational change to the barcode mode block in `app/scan/page.tsx`.
Html5Qrcode keeps its qrbox shading; we overlay the same corner brackets and
hint treatment the AI camera uses. No new dependencies, no functional changes.

## Changes

### `app/scan/page.tsx` (barcode mode block, ~line 745)

1. **Container**: harmonize classes with `scan-camera.tsx` (`relative`,
   `aspect-square`, `w-full`, `overflow-hidden`, `border-2
   border-outline-variant`, `bg-surface-container`, `lg:mx-auto lg:max-w-md`).
2. **Corner brackets**: reuse the tertiary corner-frame overlay from
   `scan-camera.tsx:128-131`, always visible.
3. **"Starting camera..." overlay**: while `scanning && !started`, show the
   same placeholder text the AI camera shows.
4. **Scanline + hint pill**: only when `started`; hint becomes a pill
   (`bg-surface/80` backdrop, icon + "Point at the barcode") instead of bare
   bottom text.

### State

Add a `started` boolean set after `await scanner.start(...)` resolves
(reset on unmount/mode change alongside `scanning`).

## Skipped (explicitly not in scope)

- Torch / flashlight toggle
- Front-camera switch
- Responsive qrbox sizing
- Any changes to the AI scan camera
