// Payload-First Security TDD Test Specification for firestore.rules
// Verifies the 12 adversarial "Dirty Dozen" payloads against the Eight Pillars.

export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated List Scrape on patients_sync',
    operation: 'list',
    path: 'patients_sync',
    auth: null,
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof',
    operation: 'get',
    path: 'staff_members/user_shlkamy',
    auth: { uid: 'spoof_1', email: 'muhammed.shlkamy@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Unauthorized Outsider Read on clinic_config',
    operation: 'get',
    path: 'clinic_config/default',
    auth: { uid: 'ext_1', email: 'outsider@gmail.com', email_verified: true },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Shadow Update with Ghost Field',
    operation: 'update',
    path: 'expenses/exp_1',
    auth: { uid: 'staff_1', email: 'staff@clinic.com', email_verified: true },
    payload: { isAdminOverride: true },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Invalid Path ID Poisoning',
    operation: 'create',
    path: 'tasks/invalid$id!with*badChars',
    auth: { uid: 'admin_1', email: 'muhammed.shlkamy@gmail.com', email_verified: true },
    payload: { id: 'invalid$id!with*badChars', title: 'Bad Task' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Non-Admin Staff Permission Escalation',
    operation: 'update',
    path: 'staff_members/user_mariam',
    auth: { uid: 'staff_1', email: 'mariam@gmail.com', email_verified: true },
    payload: { role: 'admin', permissions: { manageSettings: true } },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Owner Email Hijack During Update',
    operation: 'update',
    path: 'tasks/task_1',
    auth: { uid: 'staff_1', email: 'mariam@gmail.com', email_verified: true },
    payload: { ownerEmail: 'attacker@gmail.com' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Client-Forged createdAt Timestamp',
    operation: 'create',
    path: 'expenses/exp_forged',
    auth: { uid: 'admin_1', email: 'muhammed.shlkamy@gmail.com', email_verified: true },
    payload: { id: 'exp_forged', title: 'Test', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Immortal createdAt Mutation',
    operation: 'update',
    path: 'expenses/exp_1',
    auth: { uid: 'staff_1', email: 'mariam@gmail.com', email_verified: true },
    payload: { createdAt: '2026-11-15T12:00:00Z' },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Oversized String Resource Exhaustion',
    operation: 'create',
    path: 'expenses/exp_big',
    auth: { uid: 'admin_1', email: 'muhammed.shlkamy@gmail.com', email_verified: true },
    payload: { id: 'exp_big', title: 'X'.repeat(5000) },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Array Element Type Poisoning in allowedEmails',
    operation: 'create',
    path: 'tasks/task_bad_arr',
    auth: { uid: 'admin_1', email: 'muhammed.shlkamy@gmail.com', email_verified: true },
    payload: { id: 'task_bad_arr', allowedEmails: [12345] },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Non-Admin Reopening Completed Terminal Task',
    operation: 'update',
    path: 'tasks/task_completed',
    auth: { uid: 'staff_1', email: 'mariam@gmail.com', email_verified: true },
    payload: { isCompleted: false },
    expected: 'PERMISSION_DENIED'
  }
];
