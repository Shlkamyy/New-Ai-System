# Financial ledger reconciliation — 18 October 2026

## Changes
- Invoice APIs omit `paid_total` and `outstanding` unless the authenticated user also has `payments_view`, including invoice creation retries. Invoice viewing permissions continue to protect invoice access.
- Patient timeline invoices include active payments and outstanding amounts only with invoice and payment access. Voided invoices have zero outstanding; voided payments remain in history but are excluded from balances.
- Creation uses exact integer cents for net amounts. Invoice retry responses now agree with invoice listings about zero outstanding on voided invoices.
- Patient totals remain all-time, computed per invoice before aggregation, independent of timeline row limits.

## Verification
- Isolated handler and DOM tests cover invoice idempotency and permission-sensitive timeline balances.
- A disposable Postgres 16 CI job applies the migrations and exercises real handlers and session/permission checks with synthetic data. It covers multiple items and payments, payment cancellation, invoice cancellation, settlement, unauthenticated/denied users, tenant isolation, and 101 invoices with a 100-row display limit.
- Existing finance integration tests also run, including competing concurrent payments and audit entries. Their creation requests now provide the required request ID.
- These tests never connect to the Railway/Neon staging database, import spreadsheets, or read Floot records. No production data/schema migration is part of this change.

## UI contract
`docs/FLOOT_UI_PARITY_CONTRACT.md` remains authoritative. This is backend QA plus settlement information in the existing test harness. Final visual comparison against the latest Floot editor remains pending its availability.
