# Barcode Scanner Diagnosis — RetroFit

**Date:** 2026-08-18
**Scope:** Investigation only. No code changed. This file explains what is likely happening; a fix proposal follows only after review.

---

## 1. Current config (exact initialization code)

From `app/scan/page.tsx`, the barcode mode `useEffect` (lines 111–186). The relevant excerpt, verbatim:

```tsx
const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
// ...
const scanner = new Html5Qrcode("barcode-container", {
  verbose: false,
  formatsToSupport: [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.ITF,
  ],
});
scannerRef.current = scanner;
// ...
await scanner.start(
  { facingMode: "environment" },
  {
    fps: 20,
    qrbox: { width: 280, height: 180 },
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      focusMode: "continuous",
    } as MediaTrackConstraints,
  },
  async (decodedText) => {
    // qrCodeSuccessCallback — stops scanner, looks up barcode, sets result
  },
  () => {} // qrCodeErrorCallback — EMPTY no-op
);
```

Summary of the config in use:

| Setting | Value | Notes |
|---|---|---|
| Class | `Html5Qrcode` (manual, low-level) | not `Html5QrcodeScanner` |
| `verbose` | `false` | all internal library logging silenced |
| `formatsToSupport` | EAN_13, EAN_8, UPC_A, UPC_E, CODE_39, CODE_93, CODE_128, ITF | **explicitly set**, includes the product-barcode formats |
| `fps` | `20` | 50ms decode cadence |
| `qrbox` | `{ width: 280, height: 180 }` | region sampled for decode |
| camera id | `{ facingMode: "environment" }` | back camera requested |
| `videoConstraints` | `facingMode: "environment"`, `width: {ideal: 1280}`, `height: {ideal: 720}`, `focusMode: "continuous"` | passed as `MediaTrackConstraints` |
| `qrCodeErrorCallback` | `() => {}` | **no-op — swallows every decode failure** |
| `useBarCodeDetectorIfSupported` | not set → **defaults to `true`** | critical, see §4/§6 |

---

## 2. Format check

`formatsToSupport` **is explicitly set** — so this is *not* a "defaults don't include EAN/UPC" problem.

For completeness, the default when `formatsToSupport` is omitted: `Html5Qrcode.getSupportedFormats()` returns **all 17 formats** (`QR_CODE` through `UPC_EAN_EXTENSION`), so EAN_13/UPC_A/UPC_E *would* be included even without explicit config. The explicit list here is a narrowing, not the cause of the failure. All 8 requested formats are valid and map 1:1 to ZXing `BarcodeFormat` values (verified in `esm/zxing-html5-qrcode-decoder.js`).

---

## 3. Callback behavior — what fires (and what doesn't)

The current `qrCodeErrorCallback` is `() => {}` and `verbose: false`, so **nothing is ever logged**, and the error callback fires on **every single frame** that fails to decode (i.e. most frames, ~20x/sec). Evidence from the library internals:

- `Html5Qrcode.start()` (in `esm/html5-qrcode.js`) wraps every failed `decodeAsync` in `scanContext()`:
  ```js
  .catch(function (error) {
      _this.possiblyUpdateShaders(false);
      var errorMessage = Html5QrcodeStrings.codeParseError(error);
      qrCodeErrorCallback(errorMessage, Html5QrcodeErrorFactory.createFrom(errorMessage));
      return false;
  });
  ```
  So the no-op callback is invoked constantly; it just does nothing visible.
- `foreverScan()` then re-samples on a 50ms timer (`1000 / fps`), and because `disableFlip` is not set, each failed frame is retried once after a horizontal canvas flip — a heuristic for mirroring that doubles work on 1D barcodes but doesn't help decode them.
- `verbose: false` sets `BaseLoggger(this.verbose)`, so library-level logs are suppressed. The ZXing `MultiFormatReader` is constructed with `verbose=false` too, so no per-reader console output either.

**Verified observation (from code, no live device in this session):** with the current code you would see *zero* console output during a scan. Neither callback logs. The only observable signals are the "Starting camera…" → "Point at the barcode" UI flip when the `start()` promise resolves (which proves camera acquisition succeeded) and, if a decode ever succeeded, the lookup flow. The UI showing the camera feed with the scanline tells you nothing about decode attempts.

To instrument this, temporary logging should be added (proposed, not yet applied):

```tsx
// qrCodeErrorCallback — temporary diagnostic
(err) => console.debug("[scan] decode failed:", err),
// qrCodeSuccessCallback — temporary diagnostic
(decodedText) => console.info("[scan] DECODED:", decodedText),
```

Plus a one-time `videoWidth`/`videoHeight`/`facingMode` trace after `start()` resolves (see §4).

**Expected result when instrumented:** the error callback fires ~20x/sec with `"QR code parse error, error = ..."` messages, the success callback never fires, and `videoWidth`/`videoHeight` will report the camera's actual negotiated resolution (e.g. 640×480 rather than the ideal 1280×720 — see §4/§6).

---

## 4. Camera / resolution trace

Two resolution concepts must be separated:

1. **Layout size** — the container is `aspect-square w-full` (mobile ≈ 360–400px wide). The video element is created at `parentElement.clientWidth` (`RenderedCameraImpl.createVideoElement`).
2. **Intrinsic stream resolution** — set by the camera and `getUserMedia` constraints; read via `videoElement.videoWidth` / `videoElement.videoHeight`.

The decode pipeline (in `foreverScan`/`setupUi`):

```js
// foreverScan:
var widthRatio = videoElement.videoWidth / videoElement.clientWidth;
var heightRatio = videoElement.videoHeight / videoElement.clientHeight;
var sWidthOffset = this.qrRegion.width * widthRatio;
var sHeightOffset = this.qrRegion.height * heightRatio;
this.context.drawImage(videoElement, sxOffset, syOffset, sWidthOffset, sHeightOffset, 0, 0, this.qrRegion.width, this.qrRegion.height);
```

So the canvas decoded each frame is at most the **qrbox size (280×180 CSS px)**, sampled from the source video via drawImage. The effective source region is tiny; if the negotiated stream is low-res (many phones default to 640×480 for a plain `ideal` request), an EAN-13 barcode fills only a small band of that region.

The `width: {ideal: 1280}` / `height: {ideal: 720}` / `focusMode: "continuous"` constraints are **only ideal hints** — a browser is free to negotiate lower (and frequently does on mobile), and some browsers reject unknown constraints like `focusMode` outright (see §6). Nothing in this codebase ever reads `videoWidth`/`videoHeight`/`getSettings()` at runtime, so the actual negotiated resolution and facing mode have never been observed.

To trace it (proposed, not yet applied):

```tsx
// after start() resolves:
const video = document.querySelector("#barcode-container video");
if (video) {
  console.info("[scan] videoWidth:", video.videoWidth, "videoHeight:", video.videoHeight);
}
// additionally, inside the success/error callbacks:
scanner.getRunningTrackSettings().then((s) => console.info("[scan] track settings:", s));
```

---

## 5. Library version

- **package.json:** `"html5-qrcode": "^2.3.8"`
- **package-lock.json:** `"version": "2.3.8"` (resolved `https://registry.npmjs.org/html5-qrcode/-/html5-qrcode-2.3.8.tgz`)
- **node_modules:** `node_modules/html5-qrcode/package.json` → `"version": "2.3.8"` — matches, no drift.
- **npm registry:** 2.3.8 is the **latest published version** (published ~2023, no newer release exists).

Changelog entries relevant to barcode detection (from the project changelog):

- **2.3.8 (current):** UI/refactor only — no decoder changes. No known detection regression introduced.
- **2.3.4:** `useBarCodeDetectorIfSupported` **defaults to `true`**; when the native BarcodeDetector is available, the library alternates between `BarcodeDetector` and `zxing-js` per frame.
- **2.3.1:** "Improved support for UPC types" / "Fix support for UPC-E" — i.e. 1D formats are nominally supported in this line.
- **2.2.7 → 2.3.2:** zoom slider and torch added (Chrome desktop/Android only).

Known issues relevant to "camera opens but never decodes" with this library/version:

- **iOS Safari:** no native `BarcodeDetector` → ZXing only; QR codes work, but 1D (EAN/UPC) detection is much weaker on real-world camera feeds.
- **Android Chrome:** `BarcodeDetector` exists but its `formats` support is platform-dependent; if the device's `BarcodeDetector` only supports `qr_code`, the requested EAN/UPC formats are silently dropped and every frame falls back to the weaker ZXing path.
- **Unknown/unsupported `videoConstraints`** (e.g. `focusMode: "continuous"`) can cause the whole `getUserMedia` to reject on some browsers — though here the camera does start, so at minimum the constraints were accepted or ignored.
- **QR-only shader assumption:** the viewfinder/border-shader and `qrbox` logic are QR-oriented; the 280×180 crop is small for 1D bars.

---

## 6. Root cause conclusion

The single most likely cause of zero detections is that **the decode pipeline never actually tries the 1D formats with the native BarcodeDetector, and the ZXing fallback is configured in its weakest mode** — combined with a camera frame that is too small/low-res to satisfy ZXing's 1D readers. Concretely: (a) `useBarCodeDetectorIfSupported` is implicitly `true`, so on devices with a `BarcodeDetector` that lacks EAN/UPC support (common — e.g. Android Chrome where the detector is QR-only, or iOS where it doesn't exist at all), the primary decoder is a no-op for 1D and the alternating shim keeps burning frames on it; (b) the ZXing decoder is built with `TRY_HARDER: false`, so the 1D readers (`MultiFormatOneDReader`) run in fast "normal" mode and routinely miss partially-in-focus or slightly-blurred real-world barcodes; (c) the `ideal`-only 1280×720 constraint frequently negotiates down to 640×480 on mobile, so a barcode spans few pixels in the decoded 280×180 crop; and (d) because `verbose: false` plus a no-op error callback swallows every failure, nothing ever surfaced to tell you the pipeline was failing — the error callback *is* firing, roughly 20 times per second, silently. In short: it's not the config, it's the decoder path (native detector without 1D support → weak ZXing 1D mode) operating on under-sized camera frames, with all diagnostics silenced.

---

## 7. What a fix would need to address (for the follow-up, not yet implemented)

- Force the **ZXing-only** path (`useBarCodeDetectorIfSupported: false`) for consistent 1D behavior, or detect `BarcodeDetector` 1D capability explicitly.
- Enable **`TRY_HARDER`** for the 1D readers (the shim hard-codes `false`).
- Raise the **captured resolution / decode crop** — e.g. `width: {exact|min: 1280}`, a larger `qrbox`, or decoding full-frame instead of the 280×180 crop.
- Drop or guard the **`focusMode`** constraint, and drop `fps` from 20 to ~10 (decoding 2x per frame with mirror-flip at 20fps is wasteful).
- Add **real logging** to the error callback until detection is proven working.
