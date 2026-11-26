# Dr Mai Kassem — requested UI, physician accounts, and bulk settlement (2026-10-26)

## Execution scope
- Work was committed to the existing `work/dr-mai-codex-continuation-20261025` branch only.
- No production or preview deployment initiated; no Neon SQL/migration executed; no patient/financial data mutated.
- The new `020_doctor_accounts_own_appointments.sql` is a **staged migration**, not yet applied.
- Verification available in this round is code-level inspection and JavaScript syntax parsing, not executed PostgreSQL, Chromium or WebKit tests. GitHub Actions runner remains failed before test steps on earlier revisions, so green QA must not be inferred.

## UI changes implemented
1. Centered home date navigation, separated the create (+) button to its physical left for RTL, and kept previous/next/return-to-today accessible.
2. Defaulted sidebar nested groups to closed, added parent icons and indented sub-items.
3. Made settings sections expandable `details` accordions.
4. Removed daily calendar date/banner line that overlaid the first hour; placed day toolbar directly over the grid; removed time-jump shortcuts; strengthened hour dividers. Retained inline status selectors even for compact appointments.
5. Removed the extra patient-choice reset from booking lookup; kept minute-precision duration field (5–600 min) before 15/30/45/60 presets.
6. Invoice procedure picker opens on initial input focus and supports choosing listed procedures without typing, while retaining text input.
7. Shortened payment labels and removed duplicate selected-patient information and nonessential accounting boilerplate.
8. Added pending/opened red WhatsApp count badge, plus optional sent/dismissed history filters in patient alerts, permission-scoped.
9. Moved admin attendance shift detail card directly below the report's calendar, preserving focus target from the home metric.

## Atomic pay-all invoices
- New `api/_lib/bulk-payments.js` supports `POST /api/finance?resource=payments` with `action:'payAll'`, patient ID, complete invoice ID set, expected total, payment method, notes, optional paidAt and request ID.
- Locks the patient and related invoices, recomputes balances in integer cents, validates exact invoice set and total, then commits one receipt and audit entry per invoice atomically.
- Stable per-invoice receipt request keys detect replay without duplicate payments; stale totals, incomplete invoice selections, mixed request reuse and other conflicts fail closed.
- The `كل الفواتير` button now selects all *visible payable* invoices when the payable API confirms no additional hidden invoices, fills total payment amount, and sends the atomic request. It never silently collects a subset when the result is truncated.
- Unit regressions were written but have not yet executed in this round.
- **Release gate:** disposable PostgreSQL tests, concurrent two-cashier and replay simulations, real local HTTP/browser tests, refund/writeoff/legacy debt checks, then authorized isolated QA.

## Physician accounts
- Added `users.doctor_id` and `staff_permissions.appointments_own_only` as an unapplied migration.
- New/Edit staff forms expose `طبيب` and a clinic-doctor selector (or new doctor creation). The doctor still has ordinary fine-grained staff permissions. `مواعيده فقط` appears for linked doctor accounts.
- New doctor accounts default to own-only scope even before appointments-view is granted, avoiding unrestricted access by accident.
- Authorization is enforced by request-local DB scope in appointment list/details/new/edit/status/void and patient appointment history; unlinked own-only users are denied, not shown all appointments.
- Removing doctor identity also revokes appointment view so the user cannot accidentally see all doctors' appointments.
- **Release gate:** run migration ONLY after explicit approval on disposable QA, test two distinct doctor accounts, staff/ad­min access, tenant isolation, restricted patient history, status edit and create, profile/link changes, and re-check admin workflows. No migration was run.

## Chrome installation and site warning
- This round did not remove Google Chrome's `Dangerous site` warning and did not make Chrome install the PWA. No claim of fix.
- Existing manifest and service worker are in the repository, but Preview is Vercel-auth protected; a protected preview may not expose installability assets to browser fetches. Chromium's own install-check behavior can also result in shortcut-only UI. Root cause has not been confirmed.
- Before asking users to install: diagnose Google's Search Console Security Issues / Safe Browsing flag and resolve or request review; check browser Network/manifest/icons/service worker and actual Chrome installability on a safe QA host. Do not bypass warnings, disable protection or collect real credentials.

## Test and deployment gate
- Added `tests/dr-mai-bulk-payments.test.mjs` and `tests/dr-mai-doctor-scope.test.mjs`; wired both into `test:ui-local` and `test:mobile-safe`.
- Updated earlier source/browser tests for new home navigation, hidden day banner, closed submenus and settings accordions.
- Need full `npm ci`, `check:server`, `test:ui-local`, `test:mobile-safe`, fresh disposable Postgres `test:all-local`, HTTP and real Chromium/WebKit before publishing.
- Don't promote to Production, don't touch the QA/default Neon DB or run the staged migration without explicit user approval.
