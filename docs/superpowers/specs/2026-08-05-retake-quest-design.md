# Retake Quest from Settings — Design

Date: 2026-08-05

## Goal

Let users redo the 5-step onboarding quest from the Settings page. The wizard
pre-fills with their current profile values, and completing a retake saves to
the same `profiles` columns and lands them back on Settings.

## Approach

Reuse the existing `/quest` route and `QuestWizard` component. A query param
distinguishes retake mode from first-time onboarding. No schema changes.

## Changes

### 1. Settings page (`app/settings/page.tsx`)

Add a "Retake Quest" button linking to `/quest?retake=1`, placed with the
GoalPicker/TargetsForm block. Copy notes it recalculates daily targets.

### 2. Quest page (`app/quest/page.tsx`)

- Read `searchParams.retake`.
- When `retake=1` is present, skip the `has_completed_onboarding →
  redirect("/")` guard and load the full profile row for pre-fill.
- When absent, behave exactly as today (onboarding mode, no prefill).

### 3. Quest wizard (`components/quest-wizard.tsx`)

- Accept an optional `initial` profile prop: age, gender, heightCm, weightKg,
  activityLevel, proteinG, carbsG, fatG, goal.
- Use those as the initial `useState` values when provided.
- In retake mode, set `next=/settings` on the submitted form data so the
  server action knows where to redirect.

### 4. Server action (`app/quest/actions.ts`)

- Honor an optional `next` field: `redirect(next ?? "/")`. Absent field keeps
  first-time onboarding redirecting home.

## Non-goals

- No schema changes (existing `profiles` columns already hold every field).
- No changes to the 5 steps, validation, or target calculation logic.

## Testing

- Manual: retake with prefilled values, edit one field, save → lands on
  Settings with updated targets.
- Manual: `/quest` without param still redirects home for onboarded users.
