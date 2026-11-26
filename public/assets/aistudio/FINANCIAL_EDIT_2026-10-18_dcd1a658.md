# Invoice and payment corrections

This milestone adds dedicated invoice and receipt edit dialogs in the accounts pages and patient financial history. It remains part of the engineering pilot; it does not establish final Floot UI parity or authorize importing Excel records.

- Invoice identity and patient association remain fixed. Items, issue date, discount and notes can be corrected. Net totals cannot fall below active payments.
- Payments retain their invoice and original creator. Corrections support amount, method, notes and actual receipt time, including wallet payments.
- Changes require both view and edit permissions, organization scope and the current record version. Invoice locks serialize competing financial changes. Payment changes also invalidate old invoice forms.
- Audit entries retain before/after values and the editing actor. Retrying an original creation request returns the current corrected record without creating another receipt or undoing corrections.
- Migration 011 adds receipt version and request metadata, and expands payment method constraints. It changes no amounts or patient associations.

Validation includes synthetic PostgreSQL integration tests for permissions, overpayment, concurrent edits, exact rounding, original-request retries, stale forms, audit records and organization boundaries. Browser DOM tests exercise prefilled dialogs and Cairo receipt timestamps, including preservation of original milliseconds.

Release sequence: run the isolated CI suite, validate migration on an isolated Neon branch, retain a pre-change database branch, apply the tested migration, promote the tested commit, and verify Railway health. Existing patient data must remain untouched. Excel import and exact Floot UI review remain separate milestones.
