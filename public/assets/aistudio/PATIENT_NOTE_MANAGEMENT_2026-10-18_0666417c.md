# Patient and note management

## Completed backend scope
- Patient PATCH supports partial field edits and archival. It validates required fields, Egyptian phones, secondary phone, age, referral source ownership, and duplicates across other active patient files. Existing archived referral sources may be retained; new archived/foreign sources cannot be assigned.
- Patient archival retains the row and every related appointment, invoice, payment and note. Archived patients are excluded from the directory and new-patient selectors, while their authorized profile and financial history remain accessible through existing links.
- Patient and note updates require the version (`expectedUpdatedAt`) last read by the client. A stale editor receives 409 without overwriting another user's changes.
- Note edits and soft deletions require the corresponding mutation grant, note view permission, organization ownership, and visibility of admin-authored notes. Original authorship and creation time are retained.
- Note creation, editing and deletion write `patient_note_audit` and the general audit log transactionally. Patient edits and archival record before/after values and the authenticated actor in the general audit log.

## Test-harness interactions
- A dedicated prefilled patient editor is separate from the new-patient form.
- Existing notes open in a dedicated prefilled dialog. Errors remain visible inside it and preserve the editor draft; creation and editing use separate forms.
- Archive and delete controls follow server permissions. Archival hides mutation controls in the archived profile.
- These additions do not declare the engineering pilot to be the final Floot-matched frontend. The latest Floot development version remains the UI authority.

## Verification scope
- Synthetic Postgres integration tests cover partial edits, required fields, normalization, duplicate acknowledgement, stale records, tenant isolation, hidden-note protection, immutable authorship, audited soft deletion and preservation of invoiced history on archival.
- DOM tests cover separate prefilled forms, retained drafts on conflict and absence of controls for view-only staff.
- The backend safety workflow also runs existing patient, appointments/tasks/notes, expense and private-import tests against disposable Postgres. No Floot data or real Excel rows are imported by these checks.

## Remaining backend work identified from the master specification
- Staff account name/username editing and admin password reset are now implemented alongside this change. Password/username changes invalidate prior sessions; resets do not reactivate disabled staff. Credential values are excluded from auditing and storage in the browser.
- Tags, follow-up statuses and CRM endpoints/settings.
- Safe invoice/payment editing beyond existing creation and cancellation.
- Final Floot frontend parity, private voice notes, complete mobile/browser acceptance and backup/restore verification before go-live and real import.
