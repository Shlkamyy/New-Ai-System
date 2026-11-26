# ClinicFlow latest development target — 17 October 2026

This document captures the user's latest "CLINICFLOW — COMPLETE MASTER DEVELOPMENT PROMPT" (sections 1–22), and **supersedes earlier conflicting assumptions** in the first Master Prompt or previous prototype code.

## Target and non-negotiables
- Reference is the **latest in-development Floot project**, not the old published Floot site. Floot project ID: 37c26b35-d7a9-41f7-bcea-ed3a0bfc59fc.
- Floot stack as specified: React, TypeScript, Floot-managed PostgreSQL, authenticated APIs. **Inspect the real source code, schema, authentication and logs before modifying existing structures**.
- Preserve patients, appointments, staff, tasks, invoices, payments, attendance, voice notes, audit and settings. No destructive migrations or fake replacement data.
- **Never auto-merge this new Postgres foundation into production.** The GitHub demo uses localStorage and is NOT the live Floot code.
- Publish only after explicit permission and successful acceptance tests.

## P0 priorities (before new features)
1. Diagnose the original login runtime error: Cannot read properties of undefined (reading 'stringify'). Inspect React auth UI, imports, backend login endpoint, session state, redirects, console and network logs; do not presume invalid credentials.
2. Validate username + password and email + password; new employees created by admin without email, no access granted by self-registration. Password hashing, session refresh, deactivation, password reset, server-side authorization.
3. Inspect actual database schemas and backups. Do not blindly recreate or replace existing tables/columns.
4. Diagnose failed cash-payment API request (Failed to fetch), introduce server-enforced payment submission idempotency tokens, transaction safety, and server reconciliation before retry.
5. Introduce granular staff mutation permissions and complete audit attribution.

## Critical unified clinic semantics
- One organization, shared patient identity, shared CRM, doctor list, employee accounts, procedures, invoices, payments, patient balances, notes, tags, follow-up statuses, financial history and tasks.
- Physical branch applies to **appointments and attendance geofences**; expenses can have optional reporting attribution by branch.
- Patient may have appointments in either clinic, one file and combined balances; change of appointment location never clears selected patient.
- Patients are never filtered by original registration branch; users with authorized organization access can work with shared clinical administration while attendance is limited to physical assigned branches.
- Historic branch references retained.
- **Current proposed foundation differs**: tasks has mandatory branch_id; invoices has mandatory branch_id; patient_notes has branch_id. These assumptions must be reconciled after inspecting real Floot schema. Proposed Github migrations are **not yet a Floot migration**.

## Patient directory, status, notes
- Unique ID; full name and primary phone configurable as required/optional; optional secondary phone (local Egyptian and +20 normalized), optional age integer 0–120; configurable mandatory referral source; follow-up status.
- Search name words in any order, primary/secondary mobile. Duplicate detection across unified patients, with view existing / explicitly create anyway choices.
- Collapsible AND-combined filters for source, follow-up status, tags, procedures, billed/paid/outstanding financial min/max.
- Shared configurable patient sources, tags/color, follow-up statuses and doctors; archive options without erasing historic links.
- Patient profile quick actions: إضافة ميعاد / إضافة فاتورة / إضافة دفع, preselected patient; payment list only this patient's outstanding invoices.
- Patient chronological tabs: all, appointments, invoices, payments, procedures; event detail/edit/delete with permissions and audit.
- Text and private voice notes in **one chronological timeline** with Cairo date/time, author, edit/delete, audit; text note editing in dedicated prefilled popup, never in new-note form.

## Appointment creation and calendar
- New appointment popup contains only location/branch, patient search, optional الطبيب المسؤول from **independent doctor settings**, date and time. Do NOT show responsible employee, procedure or appointment notes.
- Creator user ID is derived from session, never manually selectable.
- Search patient by arbitrary name-token order or primary/secondary phone. Nested new patient popup pre-fills searched name/phone; creates patient independently from branch, returns to original appointment form without losing location/date/time/doctor.
- Quick dates: النهارده / بكرة / بعد بكرة. Small + **only within new appointment popup** adds further upcoming dates, never in dashboard appointment header.
- Blank time defaults to **2:00 PM Africa/Cairo**; display AM/PM; analog-style dial preferred. Warn but do not automatically reject overlapping appointments.
- Appointment details popup: patient name separately clickable, location/date/time/doctor/status/creator, authorized edit/delete; no procedure/notes; audited mutation.
- Calendar defaults to DAILY, supports daily/weekly/monthly, navigation, date jump, booking from slot and doctor/location filters.

## Dashboard and navigation
- Premium navy/teal, Cairo font, RTL, responsive at 390–420px, no horizontal overflow. Right-side mobile drawer, desktop sidebar.
- Latest mobile bottom nav in RTL order: **فواتير اليوم | المرضى | center round + | التقويم | الرئيسية**. + opens authorized new patient/appointment/invoice/payment/expense actions.
- Dashboard: real data; appointment time prominent; patient link opens file, appointment card background opens detail popup. Compact responsive card rows with **all visible**, do NOT clip items in horizontal scrolling carousel.
- Task cards compact with assignee, date or overdue status and checkbox. Shared clinic tasks are not hidden merely by physical branch filter.

## Tasks
- One-time/daily/weekly/monthly tasks; independent per-occurrence status, date, creator, assignee and completed-by, overdue preserved. Default weekly occurrence Sunday and monthly first day; calendar and employee filters.
- Backend restricts updates to assigned employee or authorized admin; archive recurring task while preserving history.

## Finance
- Invoices have multiple line items, quantity, unit price, line totals, discount fixed/%/none, net and balance. Display procedure names + remaining balance, not invoice number as main title.
- Invoice filters always show patient and today-only; separate independently expandable AND-combined date/total/outstanding ranges. Edit/void safely with audit.
- Payments: patient -> outstanding invoice, cash/card/bank transfer/wallet/other, reject overpayment, exact-once/idempotent recording, historical ledger, independent edit popup, Cairo date AND time and creator.
- Payment filters always show patient and today-only; separate expandable date/amount ranges (AND). Protect edit/delete with permissions and audit.
- Expenses separate from invoices, optional branch attribution; net cash reflects actual receipts minus expenses, not invoiced revenue.

## Security and accountability
- Granular admin-controlled staff permissions: appointment_edit, appointment_delete, patient_edit, patient_delete, note_edit, note_delete, invoice_edit, invoice_delete, payment_edit, payment_delete. Default deny staff. Enforce every protected mutation on backend.
- Audit who created/edited/voided with timestamps and old/new values; historically unknown user = غير مسجل, never invented.
- Attendance per physical branch GPS geofence 10–50m, fresh fix, server distance and accuracy validation, no concurrent open shifts, no staff disclosure of radius or coordinates, awareness of spoofing risks.
- Central settings for patient form, sources, tags, follow-up statuses, doctors, calendar hours, expense categories, staff and specific permissions, branches/geofence.

## Legacy Floot schema names to inspect, not assume
Potential tables: users, sessions, branches, branch_members, patients, appointments, appointment_audit, clinic_tasks, task_occurrences, attendance, invoices, invoice_items, invoice_payments, invoice_revisions, payment_audit, clinic_transactions, clinic_services, patient_notes, patient_voice_notes, patient_sources, patient_tags, patient_tag_links, patient_form_settings, clinic_ui_settings, expense_categories, clinic_doctors, follow_up_statuses, staff_permissions.
Potential preexisting columns: patients.secondary_phone, patients.age_years, patients.follow_up_status, appointments.doctor_id. Query actual schema and code before adding any migrations.

## Actual acceptance target
All user-supplied acceptance journeys A–O must pass against a test database, with real admin/restricted employee sessions, browser/mobile checks and audit assertions. Current GitHub Actions test results only validate isolated demo and disposable PostgreSQL scaffolding, not Floot login or patient data integrity.

## Present blocker
Floot project file-reading endpoints currently reject due to the 100/day account build-action limit. **No original Floot source, real schema, login error stacktrace or payment failing request has been retrieved.** This is a staging document, not a claim of implementation or diagnosis.
