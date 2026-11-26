# ClinicFlow incremental target — 18 October 2026

The user's master specification and incremental update in the current conversation are the delivery checklist. Continue the independent GitHub/Neon/Railway installation; never rebuild it, copy Floot records, or import Excel until readiness is established. Existing data and audits must survive. The incremental instructions take precedence where they refine the master: unified patients/CRM/finance/tasks, physical branches for attendance and appointments, same-page modal workflows, and appointment-patient meaning for today's invoices. Production publication requires the user's review; staging remains a review environment.

## Incremental scope

| Requirement | Implementation in this change | Validation required |
|---|---|---|
| Quick patient without branch | Nested patient modal; existing branchless patient API | DOM workflow and database regression |
| Correct nested layering | Native dialog stack, focus restoration, inert parent | DOM and real browser/mobile review |
| Arabic search and empty query | Reuse normalized token search; scoped minimal lookup for appointment/invoice/payment staff | PostgreSQL query tests |
| Clear/reselect patient and procedure | Clear actions, focus, refreshed options; same invoice line retained | DOM workflow |
| Same-page global Add | Patient, appointment, invoice, payment, task, expense dialogs | DOM and preview workflow |
| Mobile sheets | Responsive dialogs, internal scrolling, touch controls | Mobile browser QA; physical keyboard/device review still needed |
| Compact dashboard rows | Appointment rows with direct status; task rows with real checkboxes | DOM/backend regressions; visual QA |
| PM default and AM control | 14:00 defaults; min time follows safe booking configuration; server enforces policy | Existing AM tests plus edit tests |
| Today's invoices | EXISTS noncancelled appointment today in Cairo; any invoice date; other filters AND | PostgreSQL integration |
| No debt -> invoice | Minimal payable endpoint; green empty result; preselected nested invoice | Scope and DOM tests |
| Directory add button | Replaces inline creation with modal button | DOM tests |
| Bottom nav label | المواعيد links to existing calendar view | Browser QA |
| No global branch restriction | Preserve unified scoped APIs; branch filters only local workflows | Existing integration regressions |
| View permissions / payable | Default-deny existing view grants; payable excludes line items and history | PostgreSQL permissions test |
| Palmer optional code | Migration 012, validated separate field, audit before/after, permanent/primary chart | PostgreSQL and DOM tests |
| Login enhancements | Username/email tabs, existing secure remember session and visibility switch | Existing auth tests and DOM/browser QA |
| Invoice/payment edit dialogs | Existing financial edit behavior retained; creation moved to stack | Existing financial regressions |
| Task/expense popup | Source forms reused in global dialog; task editing moved to dialog | DOM and backend regressions |
| Final mobile review | Staging preview after CI, inspect available browser sizes | Do not claim physical-device acceptance without running it |

## Remaining full-system delivery gates

This change does not by itself establish that every requirement in the master specification is finished. Verify branch add/rename/archive/restore administration, attendance month calendar, task month calendar/counts, complete dashboard aggregates, PWA installation, source-parity review, record-limit/pagination journeys and all 24 master acceptance workflows before final readiness. No fake statistics or inferred test passes are permitted. The app remains JavaScript; syntax checks are relevant, while a TypeScript pass cannot be claimed for files that are not TypeScript.
