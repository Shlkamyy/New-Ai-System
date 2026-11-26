# ClinicFlow branch management — QA gate (2026-10-19)

This candidate adds admin-only branch creation, rename, archive, and restore without touching patient data.

- Mutation API `/api/branches` is authenticated, same-origin, organization-scoped, audited.
- Duplicate active branch names are rejected.
- Archive refuses an open attendance shift, a future active appointment, or removal of the final active branch.
- Archive clears weekday booking defaults while retaining appointments, attendance, assigned staff, and accounting history. Restore does not silently recreate defaults.
- The settings page has active and archived branch controls and retains the previous booking-day interface.
- New unit/DOM and isolated PostgreSQL tests are included. Real patients must not be used as test fixtures.
- Production release remains separately gated by full system testing and owner's approval.
