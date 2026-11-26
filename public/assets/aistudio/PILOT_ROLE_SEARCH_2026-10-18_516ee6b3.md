# ClinicFlow Pilot — role isolation, Arabic name matching and session control

**Preview-only backend branch; no Floot production data modified.**

## Changes

- Arabic patient matching on the server is now **word-order independent**, matching query terms with AND semantics. It normalizes common Alef forms, Alef Maqsura/Ya, Ta Marbuta/Ha, Arabic diacritics and Tatweel. Full Egyptian +20 / local phone numbers normalize before searching either saved phone field. All text search uses positional parameter binding, not user-generated SQL.
- `GET /api/patient-lookup?q=...` is a new restricted endpoint for appointments: requires `appointments_view` or `appointment_edit`; rejects blank or one-character queries; returns **at most 15 names and IDs only**, never phone numbers, notes, or financial data. `GET /api/patients` still requires independent `patients_view` permission.
- `GET /api/auth/session` returns safe server-authoritative permission flags, separately from public user identification. Admin has full permissions; staff with no permission row defaults to denied.
- The authenticated `/pilot.html` frontend dynamically hides inaccessible modules and forms, does not call the full patient-directory endpoint when a user can only book appointments, allows staff to pick a patient by name through the restricted search, and hides tasks belonging to another employee from inline editing. Each server mutation independently checks privileges, so menu hiding is not the security boundary.
- Remember Me is now controlled by login policy. **Unchecked**: secure session cookie without Max-Age, server expiry **12 hours**. **Checked**: secure cookie with 7-day Max-Age and server expiry **7 days**. User preference may store only the username/email; the raw password is never stored.
- Unit/browser tests validate Arabic variants, search ordering, limited staff navigation, restricted booking picker, and Remember Me. Disposable PostgreSQL integration tests exercise staff-only appointment lookup, admin-authored restrictions and cross-module access. Original Floot schema and patient data were never accessed.

## Important exclusions

- The published primary website remains a browser-only demonstration and is untouched.
- The backend Pilot still needs a **permanent** PostgreSQL instance, Vercel Preview environment variables configured by an authorized account, safe end-to-end integration with the original **unpublished Floot** code and schema, real device testing, and server-enforced permissions for remaining financial and attendance features.
- Pilot login on an external Preview may return a setup error until permanent database configuration is connected. **No real patient data** or login passwords from the clinic should be entered on these tests.
- Existing original production migrations must **never** be replaced with these isolated prototype SQL scripts without read-only schema inspection, backups and explicit authorization.

## Acceptance scenarios

1. Staff with appointments_view and without patients_view cannot GET /api/patients or read patient notes; still may query minimum patient names in appointment lookup.
2. Every search term must be present independent of name word order.
3. A query with one Arabic character returns 400 from restricted picker.
4. Unchecked Remember Me produces a nonpersistent cookie, and checked Remember Me a seven-day persistent cookie.
5. View-only appointment staff can see the list but cannot create/edit; employee can complete own tasks but not others.
6. Legacy localStorage preview data is never read by Pilot.

All of the above are isolated-development acceptance criteria, not claims of production rollout.
