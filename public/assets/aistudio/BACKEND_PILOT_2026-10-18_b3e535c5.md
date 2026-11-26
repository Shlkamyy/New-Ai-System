# ClinicFlow — authenticated backend pilot, 18 October 2026

**Experiment only. The existing Floot application and its real clinic data are untouched.**

## New prototype frontend

- `pilot.html` / `pilot.js` / `pilot.css` create a separate mobile-first Arabic, RTL interface accessible at `/pilot.html` only if the branch is successfully deployed.
- Restores an authenticated HttpOnly-cookie server session. Login uses username/email and password; the optional preference saves username only, never passwords.
- Reads patient list from GET /api/patients, creates shared patients through POST /api/patients with Egyptian phone validation, optional secondary phone and age, enforced patient form settings, duplicate-phone confirmation.
- Uses role-limited GET /api/catalog for clinic branches, doctor list, patient sources and task assignee names, never GPS coordinates or radius.
- Books appointments with date/time in Africa/Cairo, optional doctor, server-enforced AM restriction and explicit conflict confirmation, and PATCH updates appointment status.
- Lists and creates tasks on the backend; completes a recurrence for an exact date, shows overdue and paginated older dates.
- Admin creates employees and manages independent view/edit/delete rights through the server; sensitive notes rely on the existing notes_view and notes_view_admin_authored restrictions.
- All AJAX requests are same-origin and cookie-backed, all server text in HTML is escaped, and errors keep their meaning. UI never reads the original localStorage demo records.

## Verification and boundary

- Tests use disposable PostgreSQL 16 through GitHub Actions. Original Floot schema was not inspected because its access limit was exhausted.
- Tests cover login single submission, no password persistence, HTML escaping, protected patient creation, Egyptian +20 search, duplicate confirmation and safe role-scoped catalog data.
- A production-quality permanent DB, full interface integration, all permissions across all modules, real mobile-browser inspection, GPS attendance, private audio storage and safe billing/payment reconciliation are NOT finished.
- This code branch is not a production build. It MUST NOT be merged into main or used with real patient data.
- As of this work, the Vercel connection for team `shlkamys-projects` was returning 403. The `/pilot.html` route is therefore **not a verified live preview**; share a URL only after Vercel deploys and the exact deployment becomes READY.

## Next blocking dependencies

1. Reauthorize Vercel access to the original user-owned team, or otherwise restore authorized Preview-only deployment access. Do not ask the user to provide credentials in chat.
2. Provision a **new** persistent isolated PostgreSQL instance and store DATABASE_URL and AUTH_PEPPER as encrypted environment variables, not source code.
3. Confirm service-account provisioning and role grants on the persistent test database; run the exact same suite against it, then test the preview from a real mobile.
4. When Floot access resumes, read-only inspect its actual in-development project and existing database schema before any migration.
5. Ask for user approval before changing production.
