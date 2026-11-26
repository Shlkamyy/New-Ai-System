# Dr Mai — booking, calendar, navigation and performance refinement

## Implemented behavior

- Date cursors explicitly invoke the native date picker on activation, keeping ordinary native input behavior as fallback.
- Patient lookup results remain closed when a booking/invoice/payment form opens. A deliberate tap or typing starts lookup; native patient ID validation and quick patient creation are preserved.
- Booking is a narrower centered dialog with tighter spacing and less explanatory clutter. Work unit and optional doctor share a compact row above patient search. It keeps date, date shortcuts and manually editable time. Duration buttons select 15/30/45/60 minutes. Existing appointment edits retain custom duration input. Time shortcut chips show whole hours only; manual minute selection and verified automatic fallback times still work. Conflict checks remain authoritative on the server. Removed the copied inline-only cancel button from the modal, preserving its proper close/cancel actions and the standalone inline workflow.
- Patient directory search submits after a 250ms typing pause, without pressing Search. Old view revisions cannot paint over the latest query, and focus/cursor are restored after rendering. The submit button remains a keyboard/fallback action.
- Menu, search and WhatsApp notification controls stay in the sticky app header. Notifications remain permission gated. Weekly headings stick immediately below the header; only the inner week grid scrolls horizontally.
- Day/week calendar hours have a consistent 120px height. A 15-minute visit occupies 30px; a :45 start is positioned 90px down its hour. Cross-hour durations extend into following rows, with overlapping visits assigned separate lanes. Compact cards retain accessible detail access and full existing appointment actions in the detail workflow. Off-hours records remain in their explicit list.
- A Cairo-local current-time line advances every minute and refreshes when returning to the foreground.
- Opening Week centers today's column when today's date is in the displayed week, preserving explicit navigation to other weeks.
- The last section is stored per authenticated user. A patient file stores only its opaque route reference, never patient name, medical contents, amounts, search terms or passwords. File data is fetched and authorized again; a missing/inaccessible restored file falls back safely. Browser/Android Back traverses workspace history and closes dialogs with the existing unsaved-change protection.
- Payments and invoices both have independently collapsible filters. Today-only stays outside the collapsed region.
- New transparent Dr Mai installation icons were generated and resized to 192px/512px. Manifest purpose is `any`, avoiding an incorrect maskable claim for a transparent icon. Verified alpha transparency in both PNGs. Service-worker shell cache is v5 for eventual release.

## Performance changes and limits

- Catalog GETs are coalesced/reused for up to 20 seconds **in memory in the current authenticated session only**. Writes and logout invalidate that cache. Patient records, invoices, payments and balances are not cached by this change. A regression test proves three simultaneous catalog calls make one network call, and a write causes the next catalog request to refetch.
- Employee catalog permissions are read in one tenant-scoped SQL snapshot instead of eight separate permission queries. No permissions are cached across requests; missing/inactive users still deny access.
- Independent catalog reads are scheduled together through the existing pool (maximum four connections). Permission checks complete before any permitted group is queried.
- Reuse Cairo Intl formatters and per-render lane layouts rather than repeatedly constructing formatters/sorting the same day's appointments for every card.
- Search debounce reduces duplicate directory calls while typing.

These are verified reductions in duplicated work, **not a measured production latency percentage**. Deployment remains unchanged. The previously inspected Vercel region was `iad1`, while the designated Neon branch is in EU Central; measuring API timings and testing a colocated Preview region is a useful next performance step. No region, paid plan, autoscaling policy or production environment variable was changed.

## Verification

Verification evidence is recorded separately for mocked DOM/source checks, local PostgreSQL/HTTP and real browser execution; no hardware-device claim is made. Existing tests expecting an automatically open dropdown, half-hour shortcut chips, disappearing header, variable-height time rows or always-open payment filters were updated to the user's new requested behavior. Financial/conflict/permission assertions remain in place.

During browser testing, fixed an actual legacy `top:auto!important` rule defeating the sticky header, a hidden notification-button rule, and an outer week-frame overflow rule preventing sticky weekday headings. Fixed the current-time marker's accessible role after axe reported a prohibited label. The browser fixture was corrected to supply the real finance API response shape and appointment `cairo_date`; the enhanced checks assert actual loaded content instead of treating an accessible error screen as a successful financial page.

Screenshots are ignored local artifacts in `artifacts/mobile-qa`, including `chromium-compact-booking-390.png` and `chromium-refined-week.png`. The browser suite checks Chromium and WebKit, 8 phone widths, AA accessibility, explicit lookup, duration presets, quarter-hour geometry, current-time line, today-column focus, pinned controls/headings, live search, notification navigation and last-section restoration. The long clinical browser script uses actual local API/PostgreSQL with synthetic fixtures.

### Executed results

| Verification type | Executed result |
| --- | --- |
| Syntax and diff checks | `check:server`, catalog syntax and `git diff --check` passed |
| Source/DOM UI checks | `test:ui-local`: 93/93 passed |
| Source/DOM/handler/mobile safety | Final `test:mobile-safe`: 171/171 passed, zero skipped |
| Permission snapshot mocked SQL checks | 4/4 passed; query count, tenant scope, deny default, no cross-request cache and column whitelist |
| Real local HTTP + PostgreSQL | `test:http`: 6/6 including parent (5 scenario groups), with restricted/denied catalog checks |
| Full Node runner against fresh local PostgreSQL | 345/345 passed, zero skipped; this includes overlapping source, mocked, database and fixture-browser suites, not 345 production tests |
| Final Chromium + WebKit fixture-browser suites | 2/2 passed, including the new interaction/geometry/history checks and axe AA |
| Final Chromium → local HTTPS → API → PostgreSQL clinical workflow | Passed after the final compact form and catalog changes; synthetic records only, including appointment conflict/edit, invoices/payments, WhatsApp manual action/audit, attendance and PWA checks |
| Actual Android/iOS hardware | Not available; not executed |
| Newly deployed application version | Not deployed; no new remote workflow verification claimed |

The initial full Node run on a reused disposable local database passed 341/345 and failed four suites because fixed synthetic usernames, phone records and legacy-map keys already existed. A new local-only database was created, the existing migrations/bootstrap applied, and the complete runner passed 345/345. The bulk DB suites assume a fresh synthetic installation; no real or remote data was cleared to accommodate them. Following the last compact-form refinements, affected modal regression checks, the 171-check safety suite, both fixture browsers and the full clinical browser workflow were executed again and passed. Counts overlap and must not be added together.

Final real-API compact booking screenshot: `artifacts/clinical-qa/compact-booking-390.png`, visually inspected with all primary booking fields, duration choices and save/cancel actions visible. Only route references are persisted per user; the browser rechecks permissions and retrieves current patient records after authentication. The test account's clinical data is never restored from local storage.

No deployment, merge to main, remote QA data mutation, production database operation or migration was performed in this refinement round. Existing generated source artwork is retained outside the repository; only the required optimized icon assets are committed. Real Android/iOS installation behavior and launcher icon refresh still require physical-device checks.
