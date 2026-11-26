# Deployed verification — 2026-10-26

Target: https://dr-mai-kassem-clinicflow.vercel.app

This is a read-only verification round. No deployment, migration, database mutation, or protection-setting change was performed.

## Executed evidence

- Authenticated Vercel fetch `/api/health`: HTTP 200, JSON `status: ok`, `database: connected`.
- Vercel fetch `/api/auth/session` and `/api/whatsapp`: blocked by Vercel Deployment Protection (`deployment_authentication_required`, `blockedAt: share_link`). These responses do **not** verify application access controls.
- Direct Node fetch smoke run: all three requests failed at transport/JSON stage; command exited 1. No successful direct HTTP verification is claimed.
- `node --test tests/deployment-check.test.mjs`: 4 passed, 0 failed, 0 skipped. These are mocked response contract checks, not database or browser tests.
- `npm run check:server`: passed syntax checks.

## Repeatable read-only smoke check

Run `node scripts/check-deployment.mjs https://deployment.example` from an environment with network access. The checker deliberately does not follow redirects, send login credentials, print response bodies, or create data. It verifies healthy database JSON and application-generated `UNAUTHORIZED` JSON for unauthenticated session and WhatsApp requests. Redirects and HTML responses are reported as BLOCKED; any non-pass produces exit code 1. Deployment Protection must be handled through an authorized access path, not disabled to obtain passing tests.

## Follow-up: transport issue resolved

The earlier connector protection errors did not establish that the application endpoints were inaccessible. Direct Python requests returned application JSON successfully. Node 24 needed `--use-env-proxy` to use this workspace's configured outbound proxy; with that flag the smoke command passed **18/18** read-only requests (health plus 17 unauthenticated protected requests). No protection policy was changed and no auth token was supplied. This verifies denial of anonymous access, not fine-grained permissions for logged-in employees.

Repeat in this workspace with:

`node --use-env-proxy scripts/check-deployment.mjs https://dr-mai-kassem-clinicflow.vercel.app`

The expanded checker covers patient files/history, appointments, invoice/payment finance routes, attendance/report/admin, staff/shifts, settings, analytics, search, CRM, session and WhatsApp. All protected requests returned application JSON `401 UNAUTHORIZED`; health returned connected JSON 200.

Local synthetic PostgreSQL + real HTTP regression suite was executed again: **6/6 passed**, zero skipped. It exercises login/session, clinical booking/history, tenant isolation, concurrent financial requests, exact amounts, replay protection, stable invoice items, stale updates, WhatsApp permissions/concurrency, and manual/GPS attendance across work-unit reassignment. This is local evidence, not deployed logged-in verification. Mocked smoke checker tests also passed **4/4** after expansion.

## Remaining gate

Local `test:clinical-browser` also passed in Chromium using synthetic PostgreSQL and real local API: patient/appointment/invoice/partial payment, WhatsApp template/deep link/manual completion/audit, GPS-free admin shift start/end, and responsive bounds at 360/390/430/768/1280 pixels. No WhatsApp delivery was attempted. Playwright host prerequisite validation was disabled for the previously provisioned runtime libraries; actual browser assertions executed.

Separate synthetic clinic accounts are still needed for deployed admin/restricted-employee workflows. No authenticated deployed clinical workflow or real Android/iOS device test was executed in this round. Existing configuration documents the website as connected to QA; this round did not retrieve or change database secrets.

## Synthetic accounts provisioned and login verified

The user subsequently authorized creation of two test accounts. On the explicitly designated QA branch `br-red-queen-b97kc1tv` in project `round-cloud-44606760`, database `clinicflow`, created a separate synthetic Dr Mai organization, one admin, one restricted employee, and two work units within that single organization. The existing organization still carried the Smart/iSmile name; none of its existing users, patients, or records was modified or reused. Work units have no fabricated GPS coordinates. All creation occurred in one atomic SQL statement; no migration was executed.

Each account has an independently generated random password hashed with bcrypt cost 12. Passwords are stored only in a private local file outside the repository (directory mode 0700, file mode 0600); no credentials or password hashes are included here. These accounts have no automatic expiry and must be deactivated when the QA work is complete.

Real deployed HTTPS checks completed for both accounts: login 200, session 200 with expected role, logout 200. Employee session confirms patient/appointment read permissions enabled, financial read and patient write disabled. Employee requests for invoices, payments and admin settings each returned 403. Session cookies were kept only in process memory. This verifies deployed login and those access controls, not complete clinical workflows. No patient, appointment, or financial fixture was created in this account-provisioning round. The production website uses the QA database; these were explicitly authorized synthetic QA account writes, not a deployment or a production/default Neon branch modification.

## Authenticated deployed clinical HTTP workflows completed

Following user authorization to continue, ran `scripts/verify-deployed-qa.mjs` against the production website backed by the designated QA database. The script requires explicit branch confirmation and an external private account file, verifies that the tenant has exactly the two expected accounts and two work units before creating fixtures, records fixture IDs privately, refuses to replay a started run, and logs out in a finally block. No credentials, cookies or fixture IDs are committed.

Six scenario groups passed over real HTTPS:

1. Synthetic tenant and both login identities verified.
2. Created synthetic patient, booked appointment, marked arrived, found appointment in patient history, and rejected employee patient creation (403).
3. Created invoice 251.00, paid 100.10, replayed the payment request without duplication, verified 150.90 outstanding, edited invoice to 301.00 retaining item ID, verified 200.90 outstanding, rejected 999.00 overpayment (409), and denied employee invoice access (403).
4. Created a WhatsApp template and personalized alert with normalized phone. Marked opened and manually sent, rejected conflicting dismissed transition (409), denied employee template access (403), and deactivated the synthetic template. No WhatsApp URL was opened and no message was sent or delivery verified in this HTTP round.
5. Created and closed a manual GPS-free shift, rejected employee manual entry (403), missing reason (400), and duplicate open shift (409), then verified closed history from employee account.
6. Both account sessions logged out successfully; scenario completion and fixture identifiers remain in the private account file.

Explicit QA-branch read-only SQL checks then confirmed: two WhatsApp audit records with recipient/message snapshots and `deliveryConfirmed=false`; two attendance audit records containing the required reason; closed manual-review shift with null sensor accuracy values; exactly one procedure event for the invoice item after editing. These are actual remote PostgreSQL checks, separate from local mocked/browser tests.

Synthetic patient, appointment, invoice, payment, alert and attendance records are retained in the isolated test organization for review and audit. No historical data was deleted, no migration executed, no deployment triggered, and no Neon default/production branch modified. The accounts remain active for further QA and need explicit deactivation when testing ends. This proves the exercised HTTP flows; deployed browser interactions, opening WhatsApp, and physical Android/iOS behavior remain unverified.

## Deployed Chromium navigation and mobile finance refinement

Ran `scripts/verify-deployed-browser.mjs` using the private synthetic accounts and Chromium through the workspace proxy. Actual login and logout, RTL, nonempty loaded content, expected section headings, drawer closure, horizontal page overflow (maximum 2px), and absence of uncaught page errors were checked. Admin screens: patients, appointments, invoices, payments, patient alerts and attendance report. Employee screens: patients, appointments and attendance, with hidden invoice/payment/settings/staff navigation. All nine screens were checked at 360, 390, 430, 768 and 1280px: **45/45 screen/viewport cases passed**. These are navigation/layout cases, not 45 independent clinical workflows. Screenshots and result JSON are ignored artifacts under `artifacts/deployed-browser-qa`.

An initial harness attempt incorrectly treated an offscreen closed drawer as visible and timed out; corrected the harness to open the drawer explicitly. Initial screenshots also caught loading/transition states, so the accepted run waits for the correct title, cleared busy state and closed drawer. No application behavior was removed to obtain passing tests.

Visual inspection found that the invoice payment button could shrink into several short lines among its sibling actions on phones. Changed its mobile flex basis to 100% with no text wrapping, preserving all actions, and bumped the service-worker shell cache to v4 for eventual release. This CSS change has **not** been deployed.

Re-ran all **45/45 cases** against the same deployed application with only `native-mobile.css` intercepted and supplied from the local candidate file. This separate candidate run additionally asserts a full-row payment action with 44–60px height at 360/390/430px. Candidate screenshots are under `artifacts/candidate-browser-qa`; the 390px invoice screenshot was visually inspected. This is candidate CSS verification against the deployed frontend/API, not evidence that production already contains the fix.

`npm run test:mobile-safe`: **163/163 passed**, zero failures/skips. After the cache-name update, PWA checks were explicitly rerun: **2/2 passed**. No real device, deployed form submission via browser, or WhatsApp opening/delivery was tested in this navigation round. No new deployment, database migration, or clinical record edits were performed; browser login/logout creates and revokes synthetic auth sessions only. Playwright prerequisite validation was disabled for the already provisioned runtime libraries; actual Chromium assertions ran.
