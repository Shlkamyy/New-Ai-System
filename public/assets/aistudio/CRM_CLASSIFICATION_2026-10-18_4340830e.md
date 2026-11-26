# CRM and patient classification

## Independent data model
- Shared organization-wide tags with validated hex colors and admin-defined follow-up status names/colors. Archived settings disappear from new selections without deleting historical patient links.
- A nullable patient follow-up status and existing patient/tag link table carry classification. Changes require patient-edit permission, a current patient version, and organization-owned allowed settings; they are audited transactionally.
- CRM follow-up entries use the existing `crm_followups` table. Its call stage (`new`, `contacted`, `booked`, `closed`) is separate from the patient's configurable classification and never creates an appointment, invoice or payment.
- Follow-up creation uses a stable request UUID and canonical digest. Concurrent/repeated submissions return the same record; reusing an ID for different input is rejected. Edits retain history through before/after audit entries and reject stale versions.

## Access and filters
- CRM reading requires patient-view permission. CRM changes require both patient-view and patient-edit permission; tag/status settings remain admin-only.
- CRM filters: arbitrary patient-name token order or phone, stage, responsible user, due-now, Cairo date range, patient ID and pagination.
- Patient-directory filters combine source, configurable follow-up status, every selected tag, procedures and permitted financial ranges with AND logic. Existing finance permission gates remain unchanged.
- Assigned users, tags, statuses and patient IDs are checked against organization ownership. Inactive assignees or archived classifications may be retained on existing entries but cannot be newly assigned.

## Test harness
- Patient profile shows classification chips and CRM history, with separate dialogs for classification and follow-up creation/editing.
- Settings contain tag and follow-up-status create/edit/archive controls. The CRM page has due/employee/stage/date/search filters and paging. These are engineering-harness flows; final visual parity with the Floot development editor remains pending editor access.

## Migration and validation
- `010_patient_classification_crm.sql` is additive and repeatable. It seeds no patients, statuses, tags, notes or financial transactions.
- Validate on a Neon child branch and disposable Postgres before the independent staging database. Keep the original database's rows and links untouched; add a schema-migration record only after successful application.
- Postgres integration tests exercise organization isolation, default-deny/view-only restrictions, AND filters, archival fidelity, duplicate names, concurrent retries, date validation, stale edits and audit attribution. DOM tests exercise dialog values and Cairo time submission.
- No Floot records or uploaded Excel rows are used or imported.
