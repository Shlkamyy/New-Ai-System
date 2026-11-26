# ClinicFlow — secure operations backend (isolated proof of concept)

This is a separate GitHub/Vercel prototype, NOT the current Floot React/TypeScript app or its patient database. No real clinic records have been accessed or modified.

## Implemented endpoints

- POST /api/auth/login: username or email, bcrypt passwords, rate limiting, HttpOnly/Secure session cookies. GET /api/auth/session and POST /api/auth/logout restore and revoke sessions.
- GET /api/staff: admin-only account and permissions list, no password hashes. POST /api/staff: admin-created employee with username/password, no email required, default-deny permissions. PATCH /api/staff: whitelist-only view/edit/delete grants or deactivation; disabled user cannot use old sessions.
- GET /api/appointments?date=YYYY-MM-DD: shared organization patient identities and appointment-specific branch. POST: validation against same organization and active branches, Cairo timezone, 2 PM default if time omitted, AM blocked by server when disabled, 409 overlap warning with explicit acknowledgement. PATCH: edit appointment status with authenticated attribution and old/new audit.
- GET /api/tasks?date=YYYY-MM-DD: date-specific independent recurring status and all unfinished overdue one-time tasks. Optional overdueBefore date cursor fetches recurring overdue history in 31-day windows, with nextOverdueBefore to fetch earlier records. POST: shared organization task. PATCH: completion of exact dated occurrence with audit. Employees may complete only assigned tasks unless independently granted task_edit.
- GET /api/notes?patientId=UUID: separate notes_view grant, automatically excludes admin-authored notes unless user has notes_view_admin_authored. This is protected by the server, not just hidden UI.

## Database safety

- migrations/003_secure_operations.sql: add staff viewing and mutation permissions, organization-wide doctor catalog, booking settings, location defaults, appointment audit and patient secondary phone/age. Tasks and finance are shared across branches while appointment locations and attendance remain physical.
- scripts/migrate.mjs and scripts/bootstrap-admin.mjs reject all runs without CLINICFLOW_SCHEMA_MODE=isolated_test.
- That flag must only ever be used after verifying the target is a disposable test database: it is NOT sufficient proof by itself that the target is safe.
- Original Floot database schema has NOT been inspected; these SQL statements are NOT approved as Floot migrations.

## Tests

The CI job provisions a temporary PostgreSQL 16 service, runs forward-only migrations twice to check idempotency, bootstraps a synthetic admin, runs real integration calls against appointments, tasks, staff and notes, then runs legacy login/GUI tests. No real patient information or secrets are stored in the repository.

CI success is not certification for clinical privacy or production usage. An external Vercel preview will return an incomplete-setup response until private database and authentication environment variables have been connected.

## Still required before production

- Read real in-development Floot code, inspect original database schema and reconcile it without data loss.
- Diagnose original stringify login and failed-payment network errors from actual logs.
- Provision a permanent supported PostgreSQL connection and private server-side AUTH_PEPPER, using secret storage (do not send credentials in chat).
- Connect the Arabic frontend to these APIs; keep staff permissions enforced throughout the system; implement idempotent finance, hosted private audio, GPS and admin-only attendance editing.
- Run browser/mobile and real-role security tests. Obtain explicit publishing authorization before production deployment.

The existing Smart Dental main site is still a localStorage demo and was not changed by this branch.
