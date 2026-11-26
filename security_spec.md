# ClinicFlow Cloud Sync Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Verified Identity**: Only authenticated Firebase users with `request.auth.token.email_verified == true` may access clinic documents.
3. **Zero Blanket Reads & No `exists()` in `allow list`**: Every `allow list` and `allow get` verifies against `resource.data` directly (`isBootstrappedAdmin() || request.auth.token.email in resource.data.allowedEmails`) with no `get()` or `exists()` calls inside `allow list`.
4. **Immutable Ownership & Timestamps**: `ownerEmail` and `createdAt` cannot be modified after document creation; `createdAt == request.time` on create and `updatedAt == request.time` on create/update.
5. **Strict Key Allowlists & Size Bounds**: Every create validates required/allowed keys (`hasAll` + `hasOnly`), string `.size()` limits, bounded array sizes (`allowedEmails.size() >= 1 && <= 25` with element type checks), and path ID regex `^[a-zA-Z0-9_\-]+$`.
6. **PII & Credential Isolation**: `staff_members` (containing credentials/pins/emails) and `clinic_config` restrict writes strictly to `isBootstrappedAdmin()`, and all patient/financial PII requires verified clinic membership in `allowedEmails`.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated List Scrape**: `getDocs(collection(db, 'patients_sync'))` when `request.auth == null`.
2. **Unverified Email Spoof**: Signed in with `email == 'muhammed.shlkamy@gmail.com'` but `email_verified == false`.
3. **Unauthorized Outsider Read**: Signed in with verified email `'outsider@gmail.com'` not in `resource.data.allowedEmails`.
4. **Ghost Field / Shadow Update**: Updating `expenses/exp_1` with `{ ..., isAdminOverride: true }`.
5. **Invalid Document ID Poisoning**: Creating `/tasks/../../../bad..id` or a 500-char ID failing `isValidId()`.
6. **Privilege Escalation on Staff**: Non-admin authorized user attempting to update `staff_members/user_shlkamy` permissions or password.
7. **Owner Email Hijack**: Attempting to change `ownerEmail` from `'muhammed.shlkamy@gmail.com'` to `'attacker@gmail.com'` during update.
8. **Forged Client Timestamp**: Creating a document with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time`.
9. **Immutable Timestamp Tamper**: Updating `tasks/task_1` while changing `createdAt` to `request.time`.
10. **Oversized Resource Exhaustion**: Writing a 10,000-character `title` on `/expenses/exp_99`.
11. **Array Type Poisoning**: Creating a document with `allowedEmails: [12345]` instead of strings.
12. **Terminal State Mutation**: Non-admin attempting to edit a completed task (`existing().isCompleted == true`) without admin override.
