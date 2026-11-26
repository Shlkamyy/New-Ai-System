# Financial range filters

Invoices support inclusive `totalMin` / `totalMax` (net after discount) and `outstandingMin` / `outstandingMax` (active remaining balance, zero for voided invoices). Payments support inclusive `amountMin` / `amountMax`. These combine with existing patient, record, date and Cairo today filters using AND before the endpoint's result limit.

Amounts accept plain nonnegative decimal strings with at most two decimal places. Empty bounds are unbounded; zero is valid. Invalid/reversed bounds return 400. Outstanding filtering requires payments_view as well as invoices_view, preventing balance inference through otherwise redacted invoice results. Organization scope remains enforced.

The pilot provides independent collapsible date and money groups, keeps applied values when a group closes, and keeps invoice/payment ranges separate. Patient and today controls remain visible; clearing ranges retains those two controls. Applying filters is explicit. No database migration or record mutation is required.

Synthetic PostgreSQL coverage checks exact inclusive boundaries, combined criteria, denied inference, invalid inputs and Cairo day boundaries. DOM tests cover group persistence, query submission, reset and permission-based visibility. This milestone does not establish final Floot design parity or import Excel records.
