# ClinicFlow private legacy import acceptance — 2026-10-21

## Precise current state

**NOT IMPORTED.** The full private 2026-10-18 ZIP is stored only in the owner's private ChatGPT Library/working environment. Never commit, email, or attach its JSONL/CSV files to GitHub, CI logs, Vercel, or public URLs.

Validated offline: 2,454 unique patient records, 6,729 linked appointments, 2,454 balance snapshots, 33 missing primary phones, 13 groups containing 26 possible duplicate appointment rows, 249 historical opening receivables totaling **EGP 318,440.01** and EGP 1,896,145.00 historical paid **snapshots only**. Every source SHA-256 checked. Original extra phone text, dates, statuses and clinical source notes must remain private.

## Approved isolated database

- Neon project: `round-cloud-44606760`
- Branch: `br-royal-snow-b9zm73ki` (`clinicflow-private-legacy-import-acceptance-20261021`)
- Database: `clinicflow`
- Parent: `br-wispy-fog-b9xm244q`, an already isolated schema-016 branch
- **The active Preview branch is not the import target** (`br-little-hill-b9urb0k8`)
- The isolated target alone contains a new `clinicflow_private_import_gate` table with the exact label `clinicflow-private-legacy-import-acceptance-20261021`. Existing Preview has no gate.
- The importer in `feature/clinicflow-legacy-review-flags-null-phones-20261021` refuses `--commit` unless this branch-local gate matches, as well as the original fresh-install/one-admin/empty-patient/empty-finance guards.

## Run only from a secure environment with private network access

The execution environment used during this review **cannot establish external PostgreSQL connections**, so the actual `--commit` script has **not run**. Never use GitHub Actions, public Replit, Vercel, or Railway as a workaround for uploading confidential source exports.

1. From a trusted local system with Node.js 22 and access to the above Neon branch, check out `feature/clinicflow-legacy-review-flags-null-phones-20261021`, install project dependencies, and unpack the private ZIP into a locally restricted (0700) directory.
2. Obtain `DATABASE_URL` directly from Neon for **that exact branch ID and `clinicflow` database**, passing it as an environment secret (not command line, log, report, or GitHub file). Independently verify that it is not the normal Preview connection.
3. Run the importer in default read-only mode first and verify the expected counts and totals:

```bash
node scripts/import-legacy.mjs "$PRIVATE_SOURCE_DIR"
```

4. Only after confirming source review and target settings, explicitly set:

```bash
export CLINICFLOW_SCHEMA_MODE='fresh_install'
export CLINICFLOW_CONFIRM_EMPTY_DB='YES_NEW_CLINICFLOW_DATABASE'
export CLINICFLOW_CONFIRM_IMPORT='YES_IMPORT_REVIEWED_PATIENT_DATA'
export CLINICFLOW_IMPORT_TARGET_LABEL='clinicflow-private-legacy-import-acceptance-20261021'
node scripts/import-legacy.mjs "$PRIVATE_SOURCE_DIR" --commit
```

5. The script holds one database transaction. Any failed gate or post-write reconciliation **rolls back the complete import**. Never bypass these checks or retry on a partly populated database.
6. Confirm exactly **2,454 patients, 6,729 appointments, 2,454 balance snapshots, 249 opening invoices, 0 created payment transactions, 33 NULL primary mobiles, 26 flagged appointment rows, 13 review groups, zero orphan appointments**, and **EGP 318,440.01** gross opening receivables. Independently verify historical paid snapshots **EGP 1,896,145.00** are not recognized as new payments.
7. Validate role-based patient note visibility and appointment chronology before any production cutover. Source appointments remain immutable and visibly flagged for manual review where appropriate.
8. Get a separate go-live approval before connecting this import branch or copying its contents into an accessible Vercel environment.

## Current blockers

The isolated target is prepared but empty. Direct database access from the current file-processing runtime is unavailable, and GitHub Actions/Vercel acceptance builds have recently failed before tests began. Treat static parsing and separate synthetic SQL rehearsal as helpful evidence, **not** proof of end-to-end real importer success.
