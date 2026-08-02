# P8 PWA Installable Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RetroFit installable as a PWA (Chrome/Android install prompt) and load offline, by adding a hand-written service worker plus registration. The manifest + RF logo (title/icon) already exist from the last commit (`38e85dd`).

**Architecture:** A small static `public/sw.js` (no dependency — next-pwa is rejected as overkill) that precaches the app shell and does a network-first/cache-first split: HTML navigation requests go network-first with cached fallback (so the dashboard's server-fetched profile stays fresh online), while static assets are cache-first with runtime caching. A tiny client component registers it from the root layout. The Dexie offline layer from P5 already handles data offline; the SW adds the app *shell* offline.

**Tech Stack:** Next.js 16 App Router, vanilla service worker API (Cache Storage, `caches.match`), existing Playwright check pattern in `/tmp/opencode/`.

## Global Constraints

- No new dependencies (no `next-pwa`).
- SW must live in `public/sw.js` (served as static file).
- Cache name versioned (`retrofit-shell-v1`) with a `ponytail:` comment naming the upgrade path.
- Registration must be client-side only (layout is a server component).
- Only same-origin `GET` requests are intercepted; everything else passes through untouched.
- Dev caveat (known ceiling, do not "fix"): with the SW active, dev-server asset changes can serve stale cached files — document it, don't work around it.
- One commit per task, conventional style.

---

### Task 1: Service worker + registration

**Files:**
- Create: `public/sw.js`
- Create: `components/sw-register.tsx`
- Modify: `app/layout.tsx` (add `<SwRegister />` inside `<body>`)

**Interfaces:**
- Consumes: nothing
- Produces: `/sw.js` registered on all pages; precached routes `/`, `/log`, `/scan`, `/weight`, `/settings`, `/manifest.webmanifest`, `/RF logo.png`; Task 2 verifies `navigator.serviceWorker.controller` is set and offline navigation works

- [ ] **Step 1: Write the service worker**

Create `public/sw.js`:

```js
// ponytail: hand-rolled SW; next-pwa not worth a dependency for 50 lines.
// ponytail: cache-first for static, network-first for pages; upgrade path:
// precache hashes / route handlers if offline needs to go deeper.
const CACHE = "retrofit-shell-v1";
const PRECACHE = ["/", "/log", "/scan", "/weight", "/settings", "/manifest.webmanifest", "/RF logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  e.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
```

- [ ] **Step 2: Write the registration component**

Create `components/sw-register.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
```

- [ ] **Step 3: Mount it in the root layout**

In `app/layout.tsx`, add the import and render `<SwRegister />` as the first child of `<body>`:

```tsx
import SwRegister from "@/components/sw-register";
// ...
<body className="min-h-full flex flex-col">
  <SwRegister />
  {children}
</body>
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: `✓ Compiled successfully` (exit 0)

- [ ] **Step 5: Commit**

```bash
git add public/sw.js components/sw-register.tsx app/layout.tsx
git commit -m "feat: service worker for offline app shell"
```

---

### Task 2: Offline verification script

**Files:**
- Create: `/tmp/opencode/p8-check.js` (throwaway, outside the repo)

**Interfaces:**
- Consumes: `/sw.js` + registration from Task 1
- Produces: pass/fail evidence for offline installability

- [ ] **Step 1: Write the check script**

Create `/tmp/opencode/p8-check.js`:

```js
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/home/dannyboi/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
  });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  console.log("1. load app online, wait for SW activation");
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(4000);
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      registered: !!reg,
      active: reg?.active ? reg.active.state : null,
      controlled: !!navigator.serviceWorker.controller,
    };
  });
  console.log("   SW:", JSON.stringify(swState));

  console.log("2. precache contents");
  const precached = await page.evaluate(async () => {
    const c = await caches.open("retrofit-shell-v1");
    return (await c.keys()).map((r) => r.url.replace(location.origin, ""));
  });
  console.log("   cached:", JSON.stringify(precached));

  console.log("3. go offline, reload, expect page still loads");
  await context.setOffline(true);
  const offlineLoad = await page.goto("http://localhost:3000/log", { waitUntil: "domcontentloaded" });
  console.log("   offline /log status:", offlineLoad.status());
  const body = (await page.locator("body").innerText()).slice(0, 80).replace(/\n/g, " | ");
  console.log("   body:", body);
  await context.setOffline(false);

  console.log("4. console errors:", errors.length === 0 ? "(clean)" : JSON.stringify(errors));
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it (dev server must be running on :3000)**

Run: `node /tmp/opencode/p8-check.js`
Expected:
- `registered: true`, `active: "activated"`, `controlled: true`
- cached list contains `/`, `/log`, `/scan`, `/weight`, `/settings`, `/manifest.webmanifest`, `/RF logo.png`
- offline `/log` loads (status 200), body shows the app UI or login — anything but a network error page
- no console errors

- [ ] **Step 3: Fix anything the check surfaces; if fixed, rerun step 2**

- [ ] **Step 4: User test — hard-refresh the app on phone/desktop, then toggle airplane mode and reload `/log`** — app shell must still render.

---

## Self-Review Notes

- **Spec coverage:** installability needs manifest (done) + SW (Task 1) + registration (Task 1); offline shell (Task 1 fetch handler); verification (Task 2). All covered.
- **Placeholders:** none — complete code in every step.
- **Type consistency:** cache name `retrofit-shell-v1` matches between `sw.js`, the ledger note, and the check script's `caches.open` call.
