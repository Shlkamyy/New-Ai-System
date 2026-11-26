# ClinicFlow financial pilot — 18 Oct 2026

## Scope

This is a **private, isolated, synthetic-data-only** preview. The Vercel Hobby plan allows at most 12 Serverless Functions, so both financial modules are intentionally routed via the single `/api/finance` entry point.

- `GET /api/finance?resource=invoices` — organization-scoped invoices, item breakdown, net total, actual paid total, and outstanding.
- `POST /api/finance?resource=invoices` — server-authorized multi-item invoices with fixed/percent discounts and actor audit.
- `PATCH /api/finance?resource=invoices` — auditable soft void, refused while active payments exist.
- `GET /api/finance?resource=payments` — scoped cash ledger including canceled transactions.
- `POST /api/finance?resource=payments` — partial payments with mandatory client-generated UUID requestId. Retries of an identical request return the same row, without creating a second payment.
- `PATCH /api/finance?resource=payments` — auditable soft void, no destructive deletion.

All financial operations require an authenticated server session and granular permissions; unsafe methods also check same-origin. Payments take an invoice row lock so concurrent submissions cannot both spend the same outstanding balance. Existing legacy `clinicflow_legacy_balance_snapshot` remains archival, not cash transactions.

## Isolated Preview

The frontend is `/pilot.html` in preview deployments from `feature/clinicflow-fresh-start-db`, not the public production homepage. Vercel Authentication may require the project owner's login. Do not distribute the preview or enter actual patient records.

The underlying Neon preview branch is `clinicflow-preview-isolated-oct18`; its role has table access but no schema CREATE rights. Migrations `005` and `006` were applied to this **preview branch only**. Production remains untouched.

## Acceptance journeys

1. With a *fictional* patient record, create an invoice with two items and a percentage discount. Verify gross, discount, net and due.
2. Record a cash payment below the remaining balance; verify the unpaid amount decreases.
3. Retry the same request ID with identical amount: **no duplicate**. Change the amount under the same request ID: **409**.
4. Attempt overpayment or parallel payment that would exceed the due: the second must be rejected.
5. Check a read-only employee cannot create or void financial records without specific grants.
6. Try voiding an invoice with active payments: reject until payments are dealt with. After voiding an unpaid invoice, active due must be **zero**.
7. Confirm audit records contain actor, action and timestamps; historical snapshot balances do not appear as new cash payments.
8. Verify responsive layout on Android and the HTTP-only session persists as designed.

These are test instructions, not claims that browser acceptance on physical Android or a recovery drill has passed.

## Outstanding before real patients

- Clinical privacy/access review, Vercel protected-preview browser E2E, actual cross-role UI testing.
- Operator-friendly full patient file/timeline, all invoice/patient filters, dedicated payment edit/void workflow, scheduled reports, expense ledger, attendance GPS and backups.
- Move to full production only after explicit go-live authorization, quality checks and a separate data-import reconciliation.
