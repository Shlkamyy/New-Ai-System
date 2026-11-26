# ClinicFlow — eventual Excel import (not Floot)

Status: FUTURE / NOT AUTHORIZED TO RUN YET.

## Source-of-truth decision
- Real patient, appointment, procedure, invoice, payment, and related operating data will be imported ONLY from the user's previously uploaded Excel workbooks, after ClinicFlow is functionally complete and approved for go-live.
- Floot production/test/demo records are explicitly excluded. Floot can inform UI workflows and feature requirements, never data.
- The independent Neon `clinicflow-clean-independent` database remains isolated. No Excel rows should be imported while building or testing the current staging application.

## Required process before first import
1. Recover and inventory all user-provided Excel workbooks, including paginated Patients and Appointments files and any Operations, Invoices, Payments, Tasks, or other related workbooks. Do not assume that the visible filename list is complete.
2. Inspect actual sheets, headers, IDs, date columns, relationships, and data quality. Do not infer missing columns or treat repeated financial representations as separate transactions.
3. Build a transparent mapping: source workbook/sheet/row + original patient ID to one destination patient, original appointment ID to one appointment, invoice/operation to one actual invoice and its procedure lines, and payment transaction to one payment. Flag ambiguous joins, conflicting balances and unmapped entries for manual review.
4. Use stable source keys, an import ledger, idempotent upserts/merge guards, and a dry-run report showing row counts, duplicates, rejected rows, linked records, and financial reconciliation. Identical payments recorded in both Operations and Invoices must not be counted twice.
5. Back up the newly prepared staging database; test on an isolated disposable Neon branch or fresh non-production database and reconcile total billed, total paid, total outstanding, and appointment counts per patient.
6. Request the user's explicit approval of the mapping and dry-run summary before importing any real personal, medical or financial patient data into the eventual production environment.
7. Enforce least-privilege access, audit logs, secure retention of source workbooks and documented rollback/recovery.

## Current clean-state contract
- Exactly two configured branches: Smart Dental Care and iSmile Dental Care.
- One manually bootstrapped admin account and zero imported patient records.
- No automated import from Floot or Excel is scheduled or permitted by the application.

Do not add demo/test patients to the clean real-data destination. Review and test all APIs, staff permissions, and restore process before real-world use.
