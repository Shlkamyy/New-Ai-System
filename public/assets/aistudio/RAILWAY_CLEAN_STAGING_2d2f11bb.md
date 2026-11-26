# ClinicFlow — isolated Railway staging (18 October 2026)

## Data policy
Do not copy, sync, import, or read patient, staff, appointment, invoice, payment, attendance or task records from Floot. All Floot records are considered test data. Never run scripts/import-legacy.mjs against the new database.

## New resources
- Railway project: ClinicFlow Full, environment: staging
- Railway service: clinicflow-staging (source not yet connected)
- Neon project: clinicflow-clean-independent, database: clinicflow (new and verified initially empty)
- GitHub source: Shlkamyy/clinicflow-web-test, branch: feature/clinicflow-railway-staging

## Deployment instructions
Connect the exact GitHub branch above to the existing Railway staging service. Set `npm start` as the start command and `/healthz` as the container healthcheck; the service intentionally serves the server-backed pilot UI only and does not serve the old localStorage demo. The branch has no privileged DB secrets.

For database setup, use private Railway Variables, not GitHub or ChatGPT messages:
- DATABASE_URL: connection string from the new Neon project only, with SSL enabled.
- AUTH_PEPPER: cryptographically random secret, 24+ characters.
- CLINICFLOW_SCHEMA_MODE: fresh_install
- CLINICFLOW_CONFIRM_EMPTY_DB: YES_NEW_CLINICFLOW_DATABASE
- NODE_ENV: production

Before applying any migration, verify again that the selected new Neon database is empty. Run `npm run db:migrate` once using a private Railway command or temporary pre-deploy command; migration scripts refuse non-empty foreign databases and never touch the Floot database.

Bootstrap the first administrator using private ADMIN_USERNAME, ADMIN_PASSWORD (14+ chars) and ADMIN_FULL_NAME in the service's private environment and `npm run db:bootstrap-admin`. Do not send those values in chat or store them in GitHub. Remove one-time bootstrap credentials when setup finishes. Validate using `npm run db:verify-fresh` before entering records.

## Release gate
This is **not ready for real patient information**. The server-backed pilot remains incomplete and needs full UI/API integration, role-based authorization checks, financial and attendance tests, backup/restore verification, and mobile device acceptance before a real clinical go-live. Production deployment must not be enabled on a staging smoke test alone.
