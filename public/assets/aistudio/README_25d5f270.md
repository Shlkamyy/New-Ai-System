# ClinicFlow Web Test

A separate **static Arabic RTL browser prototype** for the ClinicFlow dental-clinic system. It is not a copy of the proprietary Floot source and is not yet ready to store real patient data.

## Live test

https://clinicflow-web-test.vercel.app/

## Modules

- Dashboard with upcoming appointments, tasks and balances
- Appointments: day/week/month filtering, new patient creation, branch and status
- Patients: order-independent word search, Egyptian mobile validation, duplicate detection, notes and history
- Tasks: owner, due date, completion and recurrence label
- Monthly calendar for appointments and tasks
- Invoices, procedures, discounts and linked payments
- Attendance: manual test entries only
- Reports and settings for branches, employees and referral sources

## Important limitations

**Demo only. Never enter real patient names, mobile numbers, treatment information, or payment records.**

This prototype stores test data in browser localStorage only. It has no cloud database, multi-device sync, production authentication, access control, audit logs, secure backups, real geofencing, or automatic recurring-task engine. Clearing browser storage removes demo records. The Vercel page is publicly reachable.

The original Floot source has **not** been imported; source access was temporarily rate-limited. An exact migration requires original code, database schema and integrations, followed by separate controlled data migration and security testing.

## Validation

GitHub Actions runs JavaScript syntax checks and DOM interaction tests after each push. A green check does not mean that clinical production readiness has been established.
