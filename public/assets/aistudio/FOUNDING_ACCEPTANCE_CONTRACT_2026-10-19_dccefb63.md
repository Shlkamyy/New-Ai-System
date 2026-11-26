# ClinicFlow — User-approved founding UX/functional acceptance contract
Updated 2026-10-19. This checklist comes from the owner's founding instructions and subsequent refinements. It is **not** evidence that every item is implemented.

## Precedence and data boundaries
- The latest instruction for a feature overrides its earlier iteration; do not blindly concatenate repeated requests.
- The final **Floot editor** is the approved visual reference for layout/interaction; the Railway `pilot` is backend test harness, not the approved final design.
- **Never import Floot demo patients, appointments, users or money.** The independent Neon database remains the source of truth. Import the approved reconciled Excel only after signed-off system readiness.
- Both physical branches share ONE patient registry, doctors, CRM, invoices, payments, procedures, tasks and user base. Branch belongs to appointments and location-specific attendance, not the patient.
- Every create/edit/delete must persist securely, be attributed to the signed-in account, be permission checked on the server, and preserve audit history. Deletions should prefer soft delete/archive/void when history or accounting is affected.

## 1. Shell, navigation and mobile UX
- [ ] Match last Floot editor on Android-first RTL: drawer on right, persistent search on the opposite side, sticky navigation during scrolling.
- [ ] Bottom bar in approved RTL order: فواتير اليوم, المرضى, central +, المواعيد, الرئيسية. `المواعيد` opens calendar view.
- [ ] Global + creates patient, appointment, invoice, payment, expense/task (subject to permission) with compact accessible mobile dialogs, not full-page navigation.
- [ ] After submit keep user on the current screen, update its data and retain search/filter/nav context; nested quick-patient dialog must overlay booking without covering/closing the booking unexpectedly.
- [ ] Reversible search patient selection with clear/reselect and instant results. All forms and expandable filter groups must remain readable without overlap at mobile widths.
- [ ] Remove the informational `جميع الفروع على نظام واحد` banner from app UI.
- [ ] Restore the tab context when navigating out and back; explicitly tapping المرضى while already viewing a patient returns to the directory.
- [ ] Global search finds patients by phone/name and, for notes-authorized users, notes without leaking restricted note content.
- [ ] PWA installation, physical Android testing and accessibility passes are launch requirements, not automatically satisfied by CI.

## 2. Patients and CRM
- [x] Server-backed patient directory supports name/phone searches and cross-order Arabic matching; validate against actual Arabic spelling variants.
- [x] Collapsible patient filters and server-backed total billed, paid, remaining min/max ranges and invoice-line procedure filter (subject to finance permissions); distinguish 'procedure billed' from 'treatment completed'.
- [x] Optional second phone, age, and customizable required name/phone/source fields in patient creation, with Egyptian mobile format and duplicate checks (not an SMS OTP identity proof).
- [ ] Staff can create quick patient inside appointment without choosing branch, retaining the booking draft.
- [ ] Phone call dialer and WhatsApp actions appear on directory and CRM as well as patient file where a validated mobile exists.
- [x] Record edit and archive with optimistic concurrency, permissions and audit; confirm all delete scenarios and restore rules.
- [x] CRM follows up independently from branch using tags, status definitions and users; configurable labels/colors with archive/history retention.
- [ ] Patients directory should have a visible + to add a new file; archived records remain available only via authorized workflows.

## 3. Patient profile
- [x] Patient timeline combines authorized appointments, invoices, payments, notes and followups with timestamps; has all-time financial totals without double counting.
- [ ] History filters: default **إخفاء**; الكل, المواعيد, الفواتير, المدفوعات, الملاحظات (and procedure view when backed by actual procedure data). Open detail/edit/delete with permissions.
- [ ] Place history filters below account totals; notes heading and إضافة ملاحظة must appear before note entries; all actions grouped neatly.
- [x] Secure paginated older appointments/invoices/payments/notes without dropping earlier records.
- [ ] Patient detail offers direct add appointment, invoice, payment while retaining the original tab after saving.
- [ ] Notes may be written or recorded by voice, chronological together, optional Palmer tooth; edit via dialog. Voice recording requires private media storage and independent permission QA (not yet confirmed).
- [ ] Show exact note timestamp **and** highlighted relative age (e.g. منذ 17 دقيقة). Hide admin-authored notes from staff lacking independent grant.
- [ ] Invoice label uses procedure names + remaining, not invoice number + remaining (only for users allowed to see payments).

## 4. Appointments, calendar and home
- [x] Day default, week/month views; time-accurate event cards open appointment detail with actions for authorized users.
- [x] Appointment statuses: محجوز / مؤكد / وصل / اكتمل / ملغي / لم يحضر; show physician, branch, creator account, date and time (not procedure/visit note).
- [x] Booking searches patient by Arabic name/phone and allows new patient nested creation; branch required for appointment but not patient. Physician managed in settings.
- [ ] Booking dates: اليوم / بكرة / بعد بكرة / أول الأسبوع القادم / أول الشهر القادم; + advances **selected date itself** (not adds a shortcut); label day of week.
- [ ] Preferred analog 12h picker with PM default and admin-controlled AM; optional time defaults from descending open booking slots (9, 8, 7 ...), except when an explicit calendar slot was selected.
- [ ] Admin sets calendar visible hour range and each weekday's default appointment branch. Preserve previously booked out-of-range times in historical display.
- [ ] Home appointment date navigator with center اليوم; appointment section heading shows weekday+date WITHOUT prefix مواعيد; small cards have legible time and inline status.
- [ ] Independent task-date navigator on the home page with weekday+date and today reset, without changing appointment date. All tasks for selected day only; overdue shown separately.
- [ ] Calendar existing appointment tap opens detail; separate + on available slot creates booking without ambiguous click targeting.
- [ ] Filter appointments and tasks by employee/doctor where semantically applicable, branch only for appointments and attendance.
- [ ] Display no redundant `إجراء/نوع الزيارة` or appointment note field; clinical procedure belongs to invoice and note belongs to patient.

## 5. Invoice, payment and expense flow
- [x] Separate drawer pages for invoices and payments, patient link to file, editable financial records via dialogs, audit and void support.
- [x] Search patients by name/phone; autocomplete procedures linked to procedure catalog with default price; multiple lines and discounts.
- [x] Payment starts from patient lookup, lists only unpaid invoices and a green `لا يوجد مديونية` empty state with option to add invoice; includes wallet method.
- [x] `فواتير انهاردة` means **invoices for patients with a noncancelled appointment today**, irrespective of invoice issue date; filters combine by AND.
- [x] Invoice filters: patient, collapsible date range, invoice total min/max and outstanding min/max; today checkbox remains visible. Payment filters: patient, date, amount range.
- [ ] Display paid date in full, not time only; title invoices by procedures and balance subject to access.
- [x] Expenses are clinic spending, not patient spending; amount, admin-managed category and editable date (defaults to now), deducted from appropriate cash-flow reporting, never billed to patient.
- [ ] Re-test real cash payment creation for historical `failed to fetch` reports end-to-end on authenticated staging.
- [ ] Verify transaction idempotency, void/refund effects, concurrent payments and amount permissions at release.

## 6. Staff permissions, attendance, tasks
- [x] Staff usernames, password auth, remember me and show password; admin decides independent view/edit/delete grants on server.
- [ ] Shared staff can be assigned to both branches for attendance; geofence branch-specific, radius hidden for non-admin.
- [ ] Rename `بصمة الدوام` to `بصمة الحضور`; employee sees only own punch controls and personal days/hours, no admin attendance calendar.
- [ ] Employees see compact punch card on home before appointments; home contains only permitted appointments and unfinished tasks, with red alert when nonzero.
- [ ] Employees task page defaults to today's assigned tasks only, no administrator calendar; admin can adjust historical punch times with audit.
- [x] Recurrence per task occurrence and overdue separation without shifting the original task's due date. Staff can complete only authorized occurrences.
- [ ] Admin tasks/calendar filters and grouped mobile lists (compact one-row cards + checkbox). All staff-added invoices, payments and actions record creator ID.

## Release gates (do not mark complete based on staging availability alone)
- [ ] Verify each item against latest available Floot editor (read UX only), especially responsive visual parity.
- [ ] Complete full integration/CI and physical Android acceptance for every role with restricted credentials, including financial permissions and private notes.
- [ ] Backups/restore and Neon schema provenance verified, then import real Excel only once via authenticated, audited, idempotent process.
- [ ] Explicit final user approval before production launch or entry of real patient information.

## Focused October 19 patch
Targets home task date independence, patient WhatsApp/dialer links (where valid), default collapsed patient history and highlighted note ages. This patch does **not** attest other unchecked items were delivered.

### Booking calendar: date shortcuts and note-entry visibility (19 October 2026)
- Booking form offers today, tomorrow, day after tomorrow, first day of next Saturday-starting week, first day of next month, plus a single `+ يوم` that advances the currently selected date. Shortcuts never multiply.
- Date/weekday label updates on every date change, with existing patient, branch, physician and time values preserved in the dialog.
- A permitted patient-note create action remains available with the default hidden timeline. After successful note creation, the notes filter is selected so the new entry can be seen.
- Browser acceptance covers selected-date plus without committing any real patient data.

## Weekday appointment branch defaults
- Seven day-specific optional branch defaults stored by organization with admin-only edits and audit; no cross-organization assignment.
- New appointment defaults update on date changes unless explicitly overridden; old appointments remain unchanged.

## Calendar hour window (2026-10-19)
- The appointment catalog exposes the organization booking work_start_hour and work_end_hour, readable only by appointment-authorized accounts.
- Day view renders hourly slots inclusively between configured start and end (fallback 14:00–21:00). Only those hours have + booking-slot controls.
- Appointments at any other hour are retained in a clearly labeled, clickable list below the visible timeline; no deletion or hidden financial/patient records.
- Week/month continue showing all matching events; week quick-add uses opening hour, not a hardcoded 14:00.
- UI displays setting choices as 12-hour AM/PM values. Morning booking permission remains separately server-enforced; display range alone does not grant AM booking rights.

## Time picker ergonomics (2026-10-19)
- Mobile appointment dialog defaults new bookings to the first booking-permitted hour within the configured calendar window; a calendar slot or editing an appointment preserves its requested time.
- 30-minute horizontal quick-pick controls show only times within configured work hours, excluding AM when admin setting disallows morning bookings. A time input remains freely editable to minute precision, subject to backend AM restrictions.
- Label and selection stay in sync on quick-pick or manual entry, including AM/PM and a warning for manual choices outside work hours. Quick picks are suggestions, **not** real-time occupancy/availability claims.
- Date changes and nested quick patient creation preserve the selected time. Historical appointments and patient data remain unchanged.

## Appointment collision confirmation (2026-10-19)
- Backend POST and reschedule PATCH use scoped conflict queries. HTTP 409 includes localized conflict time, matching branch and (only for accounts with appointments_view) the other patient's name, assigned dentist, and status; never expose contact details.
- The appointment form presents an escaped inline warning rather than a generic JavaScript confirm dialog. Both create and edit require an explicit **confirm despite conflict** click; dismissing or changing fields doesn't alter the booking.
- A confirmation is tied to its exact form fingerprint: edits after the warning invalidate the permission to override, requiring re-check. The existing authenticated server conflict override remains explicit and audited as appointment create/edit.

## Duration-aware appointment conflicts (2026-10-19)
- Exposes existing integer appointments.duration_minutes (5–600; default 30) for new/edit appointments, GET list, and cards/details. Booking form shows projected session end time in Cairo.
- Collision predicate uses half-open ranges: existing.start < requested.end AND existing.end > requested.start. An adjacent session starting precisely at the old end is allowed. Existing cancelled/no-show events are excluded.
- The 409 response includes conflicting appointment start/end and actual duration. Change of duration clears pending override; only a deliberate confirmation may bypass collision check.
- Branch-scoped transaction advisory locks serialize concurrent creates and reschedules on target branch; no migration required, no historical appointments rewritten. Same-branch doctor matching policy and cross-branch independence remain intact.

## Floot visual parity — appointment calendar and booking (2026-10-19)
- Read only Floot frontend component and styling files (AppointmentPlanner.tsx and module CSS) as *design references*, without reading Floot database, copying any patient records, importing assets, or touching the Floot project.
- ClinicFlow appointment week view is a true RTL scrollable hour×weekday grid, with seven selectable day headers, sticky time labels, status/patient links preserving permissions, and direct per-cell booking. Out-of-working-hours records remain visible in a separate list.
- Day view uses a teal time rail, highlighted date header, and real appointment cards; month grid fits narrow mobile screens. Booking editor is an appointment-scoped mobile bottom sheet; unrelated financial and patient editors are unchanged.
- Collapsible physician and branch visual filters; branch is still queried server-side, physician applied only to authorized loaded calendar records. Filtering never alters stored appointments or patient assignments.
- Duration always remains manually entered per appointment (default 30 min). There is **no procedure/service-to-duration binding** and absolutely no Floot data migration.
- Safety acceptance: synthetic isolated Postgres, unit tests, browser-based 360px weekly scrolling, booking from grid, nested quick patient, conflict override, finance, and mobile viewport bounds.

## Calendar page-owned vertical scrolling and sticky week heading (2026-10-19)
- Weekly calendar uses only horizontal overflow for its inner timeline; all vertical scroll gestures move the whole document, with no independent vertical scroll cap or scroll chaining lock.
- One sticky weekday header row lives **outside** the horizontal scrolling element so it remains pinned to the top of the page as the user scrolls through the week. The header tracks RTL horizontal scrollLeft using a scroll handler; no duplicated interactive headers.
- The right-hand time corner stays visible during horizontal scrolling. Days remain clickable. Existing appointment actions, editable manual durations, status/grants and collision detection are unaffected.
- Browser regression checks: 360px page width and document Y wheel, scrollTop unchanged on calendar scroller, sticky position, RTL heading synchronization and bookable week cells.

## Compact seven-day month calendar (2026-10-19)
- The independent ClinicFlow monthly view follows the approved Floot *layout patterns only*: seven weekday headings, tappable day cells, an event tally, limited desktop event previews and mobile booking-state dots. No Floot accounts or patient data are accessed or copied.
- On 360px+ screens the complete seven-day grid fits the viewport without horizontal overflow; appointment names are hidden inside tiny month cells on mobile and are available by opening the selected day. The day count and day-specific accessibility labels remain.
- Weekday headings use document-sticky positioning; the monthly grid does not establish an internal X/Y scrollbox. Vertical gestures scroll the entire page, consistent with week.
- Month totals exclude leading/trailing days from neighboring months while keeping those cells tappable with their own counts. Calendar doctor/branch filters continue to scope month records.
- Manual per-appointment duration remains independent of any procedure. No database/schema changes.
- Regression verification includes unit tests with synthetic dense days and neighboring-month bookings plus 360px Chromium month layout, tapping the event day, and checking existing appointment data against the real scoped API.

## Daily calendar timeline navigation — 2026-10-19
- The daily appointment view retains saved start times, per-appointment manual durations, existing status permissions and real backend conflict checks; records within each hour are sorted chronologically by timestamp (and stable ID tie-break).
- Sticky daily date/clock heading follows **document Y scrolling**, not a separately scrolling grid. No independent vertical overflow or forced max-height is created.
- The compact daily overview shows all records, active, attended/completed and cancelled/no-show counts, including out-of-hours appointments. A row of direct **busy-hour jump controls** uses only actual, currently loaded appointments inside configured opening hours and does not claim availability.
- Jump controls scroll the page to their real hourly row; booking slots still invoke the existing authorized new-appointment modal at their exact day and hour. Existing out-of-hours list remains visible/clickable.
- Verified with isolated synthetic data: unsorted events in the same hour, omitted 0-count jump chips, malicious-looking patient name escaping, status totals, direct booking, and read-only grants; browser verifies mobile sticky title, no nested Y scrollbar and 360px viewport fit.

## Status-coded appointment cards (2026-10-19)
- Daily and weekly calendar cards now share a consistent, accessibility-conscious style: actual scheduled clock, **manually selected** duration (never procedure-linked), patient/branch/dentist and an explicit text-and-color status badge.
- Server-provided status labels map only to whitelisted CSS tokens: booked, confirmed, arrived, attended, completed, cancelled, no_show; unknown values use a neutral safe fallback.
- Every appointment card has an explicit **Details** button at mobile-touchable size. Clicking the patient name remains a separate permitted operation; hitting the rest of the card or keyboard Enter/Space still opens details. In day view the existing status dropdown continues only for appointment_edit accounts, while compact week cards show details without inline mutation.
- Rendering reuses already-authorized appointment data from ClinicFlow's APIs. It does not fetch or import Floot records, alter appointments, infer available booking slots, or update production data/schema.
- Regression: unit tests cover color/status token mapping, escaping and full/compact layout, view-only permissions, explicit details navigation; Chromium verifies appointment badge accent, mobile details and unaffected booking/payment flows.

## Mobile bottom navigation icons and left-frozen week hours (2026-10-19)
- Mobile bottom navigation shows distinct inline SVG icons with visible Arabic text labels for today's invoices, patients, appointments and home. The current destination is highlighted visually and marked aria-current="page"; the existing floating create action remains centered, independently authorized.
- Permission checks continue to hide forbidden destinations; the patient detail view highlights the patient directory. No route or backend contract changes.
- The RTL week calendar keeps days Saturday–Friday in right-to-left order, but moves the clock column to the **physical left** by placing it as the eighth grid cell. All hour cells have position:sticky;left:0 and a visible vertical boundary. The sticky top header has a matching fixed clock corner at left:0; day header scroll-synchronization and document-owned vertical scrolling are unchanged.
- No Floot records were imported; all edits are frontend-only.
- Browser acceptance checks compare real left pixel boundaries of the frozen hour column and pinned header on a 360px screen after a horizontal RTL scroll, plus presence, labels, and active states of bottom-nav icons.

## Fixed-left week clock regression and structural repair (2026-10-19)
- Mobile Chromium found that a CSS-sticky hour cell placed as the last child of a horizontally scrolled RTL grid was still clipped off the left edge. This was a real issue, not a test formatting issue.
- Corrected layout reserves a dedicated 70px **physical-left** rail OUTSIDE the horizontal-only weekday scrollport, and leaves seven weekday cells inside the scrollport. The clock rail is aligned to actual row bounding boxes at render and on viewport resize, including variable appointment-card heights; it moves vertically only with the whole document.
- The existing weekday sticky header sits outside the scrollport, with a matching fixed-left time corner. RTL weekdays and horizontal header-scroll synchronization are unchanged. No separate vertical scrolling or patient-data changes.
- Browser acceptance now measures rail-left, scrollport-left, pinned-corner-left, row top/height and verifies the rail is not a descendant of the scroller.

## Responsive bottom navigation and resilient frozen clock rail (2026-10-19)
- The **mobile bottom navigation** shows four actual permitted destinations (فواتير اليوم / المرضى / المواعيد / الرئيسية), each with a separate SVG icon and readable Arabic name, with a centered clearance for the real floating + button. A distinct selected-state indicator and accessible focus remain in sync with server-authorized navigation; hidden destinations remain hidden.
- No cosmetic placeholder routes were added. The drawer's previously mapped section icons are kept. This change only adjusts presentation and accessibility.
- The weekly calendar's **physical-left frozen hour rail** remains outside the RTL horizontal-only scroller, with the weekday header sticky to the document.
- Added ResizeObserver to measure actual hour-row geometry when appointment cards expand or the viewport changes. Clock positions/heights are updated to mirror all week rows, and the observer disconnects when leaving the week view. Browser font readiness also triggers a safe recalculation.
- Tests assert that bottom navigation icons/text remain visible and clear of the FAB on 360px screens, and that a dynamically enlarged weekly row stays precisely aligned with its hour label even after reflow. Unit tests exercise resize callbacks and teardown. No patient/financial data, Floot records, procedure-duration logic, or database schema are modified.

## Home / Tasks / Calendar presentation consistency (2026-10-19)
- These are presentation-only changes in the existing independent ClinicFlow staging frontend, not an assertion that the Floot-approved production frontend is fully matched.
- Home dashboard renders icon-backed section headings and responsive counters for **authorized** appointments, tasks, and overdue tasks, while preserving independently navigable appointment and task dates. Descriptive user-facing copy replaces backend technology jargon.
- Home quick links retain the original real, permission-scoped destinations. Each now has a distinct whitelisted decorative SVG, a readable text label and arrow; there are no placeholder routes. Existing vertical appointment/task lists and modal shortcuts remain functional.
- Daily appointments use the same icon/title visual style as Home and Tasks. The date/week/month calendar controls, sticky heading, frozen physical-left hour rail, conflict detection and manually chosen appointment duration remain unchanged.
- Task page uses matching title/icon and three summary metrics. Each task row shows a text-and-color status badge (required versus completed), preserves the assigned-owner checkbox authorization and keeps admin-only edit/archive controls. The overdue list remains separate and collapsible, with existing paging and date/branch/user filters unaffected.
- All patient/task names and details continue to use HTML escaping; decorative SVG content comes exclusively from a static whitelist.
- Regression tests: synthetic completed/pending/overdue tasks, escaped malicious-looking title, page route/permission checks, independently shifting task date, and 360px real-browser home/task layout without horizontal viewport overflow. No Floot data, real patients, financial migrations, or schema changes.

## Horizontal homepage card rails — 2026-10-19
- Build on the current Home/Tasks/Calendar shared visual system without replacing or duplicating its status chips, icons, task controls, or overview widgets.
- Only the **homepage** appointment and task cards are reinstated as separate RTL horizontal swipeable rails with keyboard-focusable accessible regions. The old forced vertical-column CSS override is superseded with a narrower, later homepage-specific rule. The whole page does not overflow horizontally.
- Inside those rails, existing authorized appointment detail buttons, links, task completion checkboxes, and task edit/archive actions are unchanged. Real data still comes solely from scoped ClinicFlow backend endpoints; no Floot demo data, additional app data or new schema.
- Weekly calendar behavior remains unchanged: left-frozen hour rail, sticky weekday heading, document-owned vertical scrolling, horizontal-only week swipe. Duration remains manually selected independently of procedure.
- Acceptance: synthetic appointment/task cards confirm carousel overflow only within their rail at 360px in Chromium; isolated unit tests cover task count, checkbox access, ability-gated actions and absence of fictitious appointment cards.
