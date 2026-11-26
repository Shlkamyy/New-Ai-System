# ClinicFlow — Fresh database installation

Decision: Floot currently holds sample/test data only. No patient, invoice or staff data migration is needed. Keep old Floot and localStorage demo separate; create a clean database for the real shared-clinic platform.

## Architecture
- Arabic mobile-first ClinicFlow interface; existing index.html is still a localStorage demo.
- Node.js Vercel APIs for authenticated sessions, patient files, appointments, recurring tasks, notes and admin-defined staff permissions (pilot subset).
- Fresh Neon PostgreSQL, independent of Floot. One organization and exactly two clinics: Smart Dental Care and iSmile Dental Care.
- Patient, doctor, invoice, payment, procedure and task records are shared. Branch is tied to physical appointment or attendance only.
- On fresh install: zero patient files, invoices, payments, tasks, appointments, attendance, notes and expenses. One new administrator is bootstrapped privately.

## Required connections
1. The owner connects Neon to ChatGPT for direct provisioning; this requires explicit authorization. Do not paste credentials into chat.
2. Restore authorization to Vercel team shlkamys-projects (last attempt to inspect env variables was HTTP 403).
3. Create a brand-new Neon database with encrypted server-only DATABASE_URL and AUTH_PEPPER. Use TLS, connection pooling and managed backup/restore.
4. Set private one-time admin credentials ADMIN_USERNAME, ADMIN_PASSWORD (14+ characters), ADMIN_FULL_NAME in a secure setup environment, not in code.

## Install guard
- Mode isolated_test is for disposable test DBs.
- Mode fresh_install requires CLINICFLOW_CONFIRM_EMPTY_DB=YES_NEW_CLINICFLOW_DATABASE, refuses any existing public user tables, and writes a unique clinicflow_install_marker.
- Subsequent migrations require that marker to match. Running a fresh installation against Floot or any pre-existing database is prohibited.
- After migrating, bootstrap exactly one administrator, then run npm run db:verify-fresh BEFORE adding any real data.
- The verification script checks one organization, two branches, one admin and ZERO medical/financial records.

## Production release gates
- Real persistent DB provisioned and connected to Preview first; no test data or default passwords migrated into production.
- All frontend pages connected to authorized APIs, not browser localStorage. Pilot-only integration is insufficient.
- Secure billing/payment transactions, role permissions for every endpoint, private notes/audio, GPS attendance and consistent audit all implemented and tested.
- Real Android screen tests, backups and recovery drill, server timezone tests, and user approval before any production release.

CI separately tests empty installation and refuses an intentionally occupied PostgreSQL DB. This does not itself create or connect the real persistent database.
