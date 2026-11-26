# IMPORTANT — Updated source of truth

The user's later **CLINICFLOW — COMPLETE MASTER DEVELOPMENT PROMPT** supersedes conflicting details in this earlier draft. **Read docs/DEVELOPMENT_TARGET_2026-10-17.md first.** In particular, one unified patient/finance system, only appointment/attendance physical branch attribution, doctor's independent list, the default 2 PM appointment, per-operation staff permissions, and diagnosing actual Floot login/payment bugs are controlling requirements. Do not apply proposed SQL migrations to the Floot database without introspection.

---

# ClinicFlow — Canonical Development Specification (17 Oct 2026)

## Source of truth / precedence
1. The user's supplied MASTER PROMPT sections 1–23, including the later continuation (database, security, UX, implementation order, mandatory tests, delivery requirements).
2. Later design and behavioral decisions from ongoing Floot-development conversations.
3. Latest explicit user instruction overrides earlier conflicting instructions.
The target is the **latest Floot development design**, **not** the older published Floot website.

## Target UX (most recent decisions)
- Arabic RTL throughout, Egyptian Arabic messages; Cairo font for Arabic and IBM Plex Sans for Latin/numbers, modern healthcare aesthetic. Navy #12303C, teal #087F80, turquoise #20A69D, background #F2F6F8.
- Mobile top header with hamburger and **right-side drawer**; desktop sidebar.
- **Latest mobile navigation supersedes standalone FAB for mobile**: fixed five-cell bottom navigation, right-to-left: فواتير اليوم | المرضى | prominent circular + in middle | التقويم | الرئيسية.
- Center + opens five working flows: patient, appointment, invoice, payment, expense.
- Home page: navy-teal welcome banner and compact cards, horizontally scrollable appointment/task cards; time prominently in 12-hour AM/PM. Task/appointment date navigation.
- All controls working, no decorative placeholder actions.
- Patient directory financial ranges (total/paid/due), procedure filter, collapsible advanced filters, order-independent token search and phone lookup.
- Patient profile: history tabs (all/appointments/invoices/payments), edit/delete individual events; timestamped editable notes (typed and potentially audio recording with explicit access policies).
- Appointment popup: search suggestions reappear when selection cleared, reverse word order matches; can save a standalone patient record **before** choosing appointment branch, and appointment branch must be required only when submitting appointment.
- Full-screen mobile responsive layout 390–420px without horizontal overflow.

## Fundamental nonnegotiables
- Production implementation **must use server-side PostgreSQL**, not browser localStorage.
- Production supports username or email/password login; first employee credentials provisioned by admin without email, securely hashed bcrypt/Argon2id, secure HTTP-only sessions and rate limits, deactivate employee without losing history.
- Server-enforced admin/employee RBAC with branch-level authorizations on every sensitive API; hiding UI is insufficient.
- Multi-branch Smart Dental Care and iSmile Dental Care; archive rather than destructively delete historical data.
- Attendance: fresh high accuracy geolocation; branch-specific 10–50m radius (default 30), validated server-side using Haversine/accuracy/staleness, employee cannot see radius or exact coordinates.
- Task occurrences per day/weekly/monthly, overdue preserved, weekly defaults to Sunday and monthly to day 1; archived task retains historical occurrences.
- Patients/CRM share identity; configurable required fields, persistent source options, normalized tags and mapping, note timeline and secure audit.
- Appointments linked to patient & branch, dentist, service and status; warn about overlaps.
- Multi-item invoices, individual partial payments and outstanding balances, financial access admin-only, branch expenses and net cash reports without double-counting.
- All financial/attendance/note edits create audit trail; administrative patient data first, not clinical records, X-rays or prescriptions.
- Never migrate or delete the Floot live database on assumption. Any production migration requires source schema, backup, reconciliation, separate plan and approval.

## Required database entities
organizations, users, user_credentials, auth_sessions, auth_login_attempts, branches, branch_members, attendance, tasks, task_occurrences, patients, patient_sources, patient_form_settings, tags, patient_tags, patient_notes, patient_note_audit, crm_followups, procedures, appointments, invoices, invoice_items, payments, expenses, audit_logs. Schema migrations, FK, indexes, archive flags, org/branch ownership checks.

## Implementation phases
- **Phase 1**: DB migrations; account system, sessions, roles, organizations/branches, secure backend; real integration tests against a disposable PostgreSQL.
- **Phase 2**: Patient CRUD and validation settings, sources, tags, notes and audit; branch/organization checks.
- **Phase 3**: Staff management and attendance, GPS and historical reports; employee restrictions.
- **Phase 4**: Task occurrences, overdue and visual calendar; per-branch authorization.
- **Phase 5**: CRM, appointments, invoices/payment/expenses and analytics.
- **Phase 6**: Final responsive UI integration, end-to-end browser tests, permission and security tests, data backup/recovery, PWA and production readiness.

## Mandatory production verification
Must verify all 24 checks from the supplied Master Prompt, including username/email login, deactivation, branch isolation, radius secrecy, GPS rejection, attendance history, recurrence/overdue preservation, configurable patient validation, source/tag/note behavior, add-menu forms, appointment linkage, invoice partial payments, admin restrictions, mobile usability, drawer behavior, and database persistence across devices/sessions.
No test is called passed unless executed successfully.

## Current repo reality (at authoring)
- The public Vercel web URL is a **separate, localStorage-only demo** with fictional data; it is neither the master prompt's intended production system nor the authoritative Floot development build.
- Database foundation is developed separately on feature/backend-foundation. It is **not configured for production** and must not store real patient records yet.
- UI work on feature/floot-dev-mobile-navigation is only a separate unfinished candidate, not accepted final UI.
- Environment variables and third-party database access are not provisioned by committing code. No secrets may be stored in the repository.
