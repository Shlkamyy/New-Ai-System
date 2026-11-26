# ClinicFlow Frontend Parity Contract — APPROVED FLOOT DESIGN

## Non-negotiable source of truth
- The latest **development/editor** version of the user's ClinicFlow project in Floot ("ClinicFlow — إدارة العيادات", project `37c26b35-d7a9-41f7-bcea-ed3a0bfc59fc`) is the reference for **visual design, information architecture, button placement, navigation and UI flows**.
- The existing Railway `pilot.html` / `pilot.js` / `pilot.css` is explicitly an **engineering/backend test harness**, not an approved replacement UI. No accidental approval is implied when the user does not comment on its appearance.
- Floot's **data, user accounts, patients, test appointments, financial records and all demo records must NOT be copied**. New independent Neon data will eventually come from approved, reconciled Excel workbooks (see `docs/EXCEL_IMPORT_AFTER_COMPLETION.md`), and only at import time.
- Floot's public published URL `https://clinicflow-dental-eg.floot.app` may be an **older publication**. Prefer the latest editor development version as the UX authority, not the public copy when these differ.

## Known user-approved UX (from previous conversation and Floot iterations)
- Arabic RTL, responsive mobile-first; the overall ClinicFlow app shell uses a **right-side drawer/sidebar**, stays accessible during scrolling, instead of a permanent horizontal pilot tabs list.
- Approved mobile bottom navigation (RTL arrangement and exact labels to verify against the latest Floot editor): `فواتير اليوم`, `المرضى`, centered **+**, `المواعيد`, `الرئيسية`.
- A persistent prominent search affordance across the app, opposite the menu icon, where present in the Floot version.
- The main centered floating + opens short workflows for patient, appointment, invoice, payment, expense. Shortcuts and popup stacking/navigation follow the Floot design (quick patient modal above appointment modal when relevant), rather than swapping full pages.
- Home daily navigator plus compact vertical appointment and task rows; 12-hour AM/PM time format. As of the most recent documented Floot iterations, the homepage **does not use a carousel**; verify in latest editor if there were later revisions.
- Home task section shows tasks specific to the selected date, with overdue tasks distinguished instead of showing every historical task as today's.
- App structure includes Home, Attendance, Tasks and Calendar, Patients, CRM, Appointments, Invoices/Finance, and Settings with staff permissions. The exact side menu hierarchy and visibility must match editor.
- Patient directory: collapsible filters, click-to-open patient names, search by phone/name, numeric paid/remaining/total ranges and procedures, responsive layout.
- Patient detail: chronological timeline with appointments, procedures, invoices, payments and notes; segmented filters; add-note control beside/under notes heading, not after the entire notes history.
- Appointments: approved Floot navigation, date/employee/status filters, date short cuts, searchable patient select, status editing, same-page modals, and 12-hour time.
- Invoices: multi-procedure items, discounts, payment/balance reporting without duplication; the existing Finance backend must conform to the approved forms and interactions.
- Secondary phone and age on patient form; source/reference custom list.
- Staff role and branch security; geofence radius hidden from nonadmin UI; attendance and tasks conform to existing Floot flows.
- Palmer tooth chart and other UI components only if present in last Floot editor; do not redraw speculative versions or treat an old published copy as final.

## Engineering work order
1. Continue independent Neon/Railway/GitHub backend implementation and QA **without declaring the pilot UI final**.
2. When Floot editor access is available, inspect latest source tree, page layouts, reusable components, design tokens and screenshot layouts (mobile + desktop); capture the structure **without reading or exporting Floot data**.
3. Record exact routing map, menu ordering, floating-action behavior, component placements, patient/appointment workflows, and responsive breakpoints.
4. Implement a production frontend using the existing independent auth, scoped APIs and Neon backend, aiming for **1:1 parity** in layout and interactions (not merely similar feature coverage).
5. Cross-check screenshots and interaction behavior against the latest Floot editor on mobile and desktop before user design review. Any intentional deviations require the user's explicit approval.
6. Perform security, permissions, functional and financial tests before importing patient data from Excel.

## Current access note — 18 Oct 2026
- Floot connector `list_projects` confirmed the project; `get_publish_status` confirmed the public published URL.
- Source-tree inspection was temporarily blocked by the Floot account's daily build-action limit, resetting `2026-10-19T04:00:00Z`. **No Floot source comparison was completed in this turn**. Do not claim exact parity until latest editor is inspected.
- Do not mutate any Floot project; source is read-only UX reference.
