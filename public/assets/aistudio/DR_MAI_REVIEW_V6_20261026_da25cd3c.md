# Dr Mai — review corrections, 2026-10-26

## Implemented

- Removed nonessential onboarding/instruction copy from login, empty states, page subtitles, booking hints, attendance/report introductions and settings descriptions. Kept errors, validation, unsaved-change protection and result-limit warnings. The home promotional area is now a short useful date/action strip.
- Home date cursors show weekday, day number and month, without year. Only today's cursor has the small “اليوم” label. Previous/next/date/plus stay centered together; “الرجوع لليوم” is a separate small centered action below them.
- “كل المواعيد” now has the same small arrow as “كل المهام”.
- Home metric cards are real buttons: appointments/tasks focus and scroll to their home sections, patients opens the patient directory, and staff on duty opens the attendance report and focuses shift details. The latter resets employee/work-unit/day restrictions and shows the current month.
- The header scrolls away normally. Only its original menu/search/WhatsApp notification controls stay fixed. Disabled backdrop filtering on the header avoids turning it into a containing block for those fixed controls. Week/day sticky headings clear the floating controls instead of following an invisible fixed header.
- Sidebar sections are grouped into collapsible Accounts, WhatsApp, Employees and Settings submenus in the requested order. Existing buttons, IDs, server workflows and per-view permissions are retained. Groups start open to preserve direct access, can be collapsed, and disappear when none of their children is permitted. Keyboard navigation includes summaries and ignores children of closed groups.
- Procedures/prices have their own admin-only page using the existing catalog editor/API; all other settings remain in Settings. No procedure data was moved or duplicated.
- The login welcome is aligned to the start of its panel rather than centered. Removed duplicate introductory paragraphs.
- Final in-app Back reaches an explicit exit guard and offers “الخروج من البرنامج؟” with “نعم” / “لا”. No retains the session and current workspace. Yes requests navigation out/closing the window; browsers and installed PWAs control whether programmatic closing is permitted. An ordinary web app cannot guarantee Android/iOS process termination. Navigation within the app and unsaved-dialog protections remain intact.

## Manual attendance defect and rule change

The admin's “آخر سجلات الحضور” rendered `own.history`, which is intentionally filtered to the signed-in admin's user ID. Employee shifts created manually could therefore be saved correctly but absent from that section. It now renders the authorized admin employee history, with staff/work-unit names. A just-entered record is pinned in the refreshed recent list, including a backdated record outside its first 60 chronological results. If entered through a report, its range is expanded when necessary and employee/work-unit filters align with that entry so filters cannot silently hide it.

Per the user's explicit new requirement, the manual punch reason is optional on both client and server, including an empty or one-character reason. The 500-character cap and type validation remain. Admin authorization, employee/work-unit validation, overlap prevention and audit logging are unchanged. The audit always records actor, timestamps, operation and `gpsVerified=false`; no synthetic GPS observations are added. This changes manual start/end entries, not the separate historical timestamp-correction workflow.

## Executed verification

- Full Node runner on a newly created disposable **local** PostgreSQL installation: **351/351 passed, zero skipped**. This aggregate includes overlapping source/DOM, mocked handler, database, HTTP and fixture-browser suites; it is not a production-readiness count.
- Mobile safety suite: **177/177 passed**. Local UI suite: **94/94 passed**.
- Five new DOM regressions verify optional-reason creation and visible employee recent history, actionable home metrics, grouped/permission-scoped sidebar, independent procedure settings, exit confirmation/cancel and yearless date cursors.
- Mocked manual-attendance handler checks missing, blank and short reasons while retaining audit/GPS assertions. Invalid oversized input remains rejected.
- Actual local HTTP/PostgreSQL integration: **6/6 including the parent**, with fresh admin-history readback after a blank-reason manual entry and employee denial of admin history.
- Actual Chromium and WebKit fixture-browser suites: **2/2 passed** across eight phone widths and AA accessibility. New assertions cover exact centering of the date row and separate return button, normal scrolling of the header with viewport-fixed controls, submenu interaction, procedures/settings separation, metric focusing, Back/Forward, restored sections and canceling the final exit prompt.
- Full Chromium → local HTTPS → real API → PostgreSQL workflow passed. Manual in/out operations were submitted with empty reasons; each saved shift was visibly found in admin recent history, and SQL verified three blank-reason audit records. Existing invoice/payment, conflict, WhatsApp manual handoff/audit, attendance and PWA checks passed. No real WhatsApp message was sent.
- Syntax checks and `git diff --check` passed. Playwright used the already provisioned browser runtime with host prerequisite validation disabled; browser assertions executed.

Existing tests expecting required reasons, long onboarding/privacy copy, a permanently fixed header or subtitles were updated to this explicit requested behavior. Permission/financial/unsaved-change assertions were retained. Physical Android/iOS hardware and actual OS-level app closing are not verified.

Only synthetic local data was created by these tests. No new migration, production deployment, production/default Neon branch change, or patient import occurred. A subsequent Preview deployment can publish this change using the existing designated QA configuration; it does not migrate or modify the database.
