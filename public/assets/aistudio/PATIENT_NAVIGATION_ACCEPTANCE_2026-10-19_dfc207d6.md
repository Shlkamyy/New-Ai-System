# ClinicFlow patient navigation — current staging implementation (2026-10-19)

- Patient file selection is retained in in-memory state when switching to Calendar, CRM or other sections.
- Returning via the Patients button from another section reopens the patient file and the active notes/history filter.
- Pressing Patients while already in the patient file explicitly resets to the directory.
- The back-to-patients control also opens the directory and restores its saved search, filters, page and viewport position.
- No patient-specific navigation state is persisted to localStorage or shared between employees; logout clears private state.
- Bottom navigation does not programmatically steal focus back to the hamburger unless the drawer was actually open.
- Existing nested creation/edit forms continue to preserve their parent page context.
- Read-only Floot editor source review verified intentional same-tab Patients reset logic; Floot data was not copied or queried.
- Acceptance test covers jsdom route/filters/logout and 390px Chromium navigation with an isolated synthetic PostgreSQL.
- Staging only: not approval for production or historical Excel import.
