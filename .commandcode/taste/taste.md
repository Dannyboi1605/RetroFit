# Taste

## Workflow & communication

- Prefers a diagnose-first workflow: investigate and document root cause before any code is changed, and refuses fixes until the findings have been reviewed ("Do not fix anything yet — first explain what's really happening"; "Only after this diagnosis file is written and I've reviewed it, propose the fix"). Confidence: 0.9
- Wants investigation findings written to a reviewable markdown file (e.g., a `*_DIAGNOSIS.md` in the repo) rather than only summarized in chat. Confidence: 0.8
- Expects diagnosis docs to be evidence-based and structured: exact current config, explicit checks (e.g., library defaults, format support), runtime traces (callbacks/logging, camera resolution), library version verification against package.json/lockfile, and a single plain root-cause conclusion. Confidence: 0.8
- Prefers diagnostic/debug logging to be dev-only (gated behind `process.env.NODE_ENV === "development"`) and rate-limited so failures stay observable without spamming the console — observability without noise. Confidence: 0.8
