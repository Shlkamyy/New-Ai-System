import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortAttendanceRecordsDesc,
  findActiveShiftForUser,
  createDeterministicAttendanceId,
  reconcileAttendanceRecords,
  canRunMidnightAutoEndForRecord,
  isValidAttendanceRecordShape
} from '../src/utils/attendance';
import type { AttendanceRecord } from '../src/types/clinic';

function makeRec(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'att_u1_2026-10-20_s1',
    userId: 'u1',
    userName: 'سارة',
    unitId: 'unit_1',
    unitName: 'العيادة الرئيسية',
    date: '2026-10-20',
    clockIn: '09:00',
    status: 'active',
    ...overrides
  };
}

test('createDeterministicAttendanceId increments sequence cleanly for multiple shifts on same day', () => {
  const existing: AttendanceRecord[] = [
    makeRec({ id: 'att_u1_2026-10-20_s1' }),
    makeRec({ id: 'att_u1_2026-10-20_s2', status: 'completed', clockOut: '13:00' })
  ];
  const nextId = createDeterministicAttendanceId('u1', '2026-10-20', existing);
  assert.equal(nextId, 'att_u1_2026-10-20_s3');

  const sanitizedUserId = createDeterministicAttendanceId('user@clinic/1', '2026-10-21', []);
  assert.equal(sanitizedUserId, 'att_user_clinic_1_2026-10-21_s1');
});

test('findActiveShiftForUser picks newest active shift when multiple exist and ignores completed shifts', () => {
  const records: AttendanceRecord[] = [
    makeRec({ id: 'att_1', userId: 'u1', date: '2026-10-18', clockIn: '09:00', status: 'completed', clockOut: '17:00' }),
    makeRec({ id: 'att_2', userId: 'u1', date: '2026-10-19', clockIn: '09:00', status: 'active' }),
    makeRec({ id: 'att_3', userId: 'u1', date: '2026-10-20', clockIn: '10:30', status: 'active' }),
    makeRec({ id: 'att_4', userId: 'u2', date: '2026-10-20', clockIn: '11:00', status: 'active' })
  ];
  const activeU1 = findActiveShiftForUser(records, 'u1');
  assert.equal(activeU1?.id, 'att_3');
  assert.equal(findActiveShiftForUser(records, 'u3'), undefined);
});

test('reconcileAttendanceRecords deduplicates by id, prefers completed over active, and sorts descending', () => {
  const activeCopy = makeRec({
    id: 'att_u1_2026-10-20_s1',
    date: '2026-10-20',
    clockIn: '09:00',
    status: 'active'
  });
  const completedCopy = makeRec({
    id: 'att_u1_2026-10-20_s1',
    date: '2026-10-20',
    clockIn: '09:00',
    clockOut: '17:30',
    status: 'completed'
  });
  const olderRec = makeRec({
    id: 'att_u1_2026-10-19_s1',
    date: '2026-10-19',
    clockIn: '08:45',
    status: 'completed',
    clockOut: '16:00'
  });

  const reconciled = reconcileAttendanceRecords([olderRec, activeCopy, completedCopy]);
  assert.equal(reconciled.length, 2);
  assert.equal(reconciled[0].id, 'att_u1_2026-10-20_s1');
  assert.equal(reconciled[0].status, 'completed');
  assert.equal(reconciled[0].clockOut, '17:30');
  assert.equal(reconciled[1].id, 'att_u1_2026-10-19_s1');
});

test('sortAttendanceRecordsDesc sorts by date, clockIn, then id descending', () => {
  const sorted = sortAttendanceRecordsDesc([
    makeRec({ id: 'a', date: '2026-10-20', clockIn: '09:00' }),
    makeRec({ id: 'b', date: '2026-10-20', clockIn: '14:00' }),
    makeRec({ id: 'c', date: '2026-10-21', clockIn: '08:00' })
  ]);
  assert.deepEqual(
    sorted.map(r => r.id),
    ['c', 'b', 'a']
  );
});

test('canRunMidnightAutoEndForRecord enforces past-day active status, 5-minute midnight grace, and admin/owner scope', () => {
  const yesterdayActive = makeRec({ id: 'att_y', userId: 'u1', date: '2026-10-19', status: 'active' });
  const todayActive = makeRec({ id: 'att_t', userId: 'u1', date: '2026-10-20', status: 'active' });

  // During 00:00 - 00:04 grace period -> false even for owner/admin
  assert.equal(
    canRunMidnightAutoEndForRecord({
      record: yesterdayActive,
      cairoDateStr: '2026-10-20',
      cairoHour: 0,
      cairoMinute: 3,
      currentUserId: 'u1',
      isAdmin: true
    }),
    false
  );

  // After grace period -> true for owner, false for other employee, true for admin
  assert.equal(
    canRunMidnightAutoEndForRecord({
      record: yesterdayActive,
      cairoDateStr: '2026-10-20',
      cairoHour: 0,
      cairoMinute: 6,
      currentUserId: 'u1',
      isAdmin: false
    }),
    true
  );
  assert.equal(
    canRunMidnightAutoEndForRecord({
      record: yesterdayActive,
      cairoDateStr: '2026-10-20',
      cairoHour: 0,
      cairoMinute: 6,
      currentUserId: 'u2',
      isAdmin: false
    }),
    false
  );
  assert.equal(
    canRunMidnightAutoEndForRecord({
      record: yesterdayActive,
      cairoDateStr: '2026-10-20',
      cairoHour: 0,
      cairoMinute: 6,
      currentUserId: 'admin_1',
      isAdmin: true
    }),
    true
  );

  // Same-day active shift should not auto-end
  assert.equal(
    canRunMidnightAutoEndForRecord({
      record: todayActive,
      cairoDateStr: '2026-10-20',
      cairoHour: 23,
      cairoMinute: 59,
      currentUserId: 'u1',
      isAdmin: true
    }),
    false
  );
});

test('isValidAttendanceRecordShape rejects missing required fields or invalid date', () => {
  assert.equal(isValidAttendanceRecordShape(makeRec({})), true);
  assert.equal(isValidAttendanceRecordShape(makeRec({ date: '20/10/2026' })), false);
  assert.equal(isValidAttendanceRecordShape(makeRec({ userId: '' })), false);
  assert.equal(isValidAttendanceRecordShape(makeRec({ unitId: '' })), false);
});
