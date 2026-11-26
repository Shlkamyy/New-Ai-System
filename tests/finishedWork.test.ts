import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFinishedWorkTaskProgress } from '../src/utils/finishedWork';
import type {
  Appointment,
  Invoice,
  Operation,
  Patient,
  PatientFollowUpLogEntry,
  WeekdaySetting
} from '../src/types/clinic';

const WEEKDAYS: WeekdaySetting[] = [
  { dayOfWeek: 0, dayName: 'الأحد', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 1, dayName: 'الاثنين', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 2, dayName: 'الثلاثاء', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 3, dayName: 'الأربعاء', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 4, dayName: 'الخميس', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 5, dayName: 'الجمعة', isClosed: true, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 6, dayName: 'السبت', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 }
];

function makePatient(id: string, overrides: Partial<Patient> = {}): Patient {
  return {
    id,
    name: `مريض ${id}`,
    phone: '01000000000',
    tags: [],
    followUpStatus: '',
    registeredDate: '2026-10-01',
    totalBilled: 0,
    totalPaid: 0,
    outstandingBalance: 0,
    palmerTeeth: [],
    notes: [],
    ...overrides
  };
}

function makeCompletedAppt(patientId: string, date: string, time = '12:00'): Appointment {
  return {
    id: `appt_${patientId}_${date}`,
    patientId,
    patientName: `مريض ${patientId}`,
    patientPhone: '01000000000',
    doctorId: 'doc_1',
    doctorName: 'د. مي قاسم',
    unitId: 'unit_1',
    unitName: 'العيادة الرئيسية',
    date,
    time,
    durationMinutes: 30,
    status: 'completed',
    procedureType: 'حشو',
    createdAt: `${date}T10:00:00.000Z`
  };
}

test('computeFinishedWorkTaskProgress includes ALL >5 previous-working-day eligible patients without dropping them', () => {
  // Eval date: 2026-10-20 (Tuesday), prevWorkDay = 2026-10-19 (Monday)
  const patients = Array.from({ length: 8 }, (_, idx) => makePatient(`p${idx + 1}`));
  const appointments = patients.map((p, idx) =>
    makeCompletedAppt(p.id, '2026-10-19', `${String(10 + idx).padStart(2, '0')}:00`)
  );
  // Add an older candidate too (should NOT displace or be needed when prevWorkDay > 5)
  patients.push(makePatient('p_old'));
  appointments.push(makeCompletedAppt('p_old', '2026-10-10', '09:00'));

  const progress = computeFinishedWorkTaskProgress(
    '2026-10-20',
    WEEKDAYS,
    patients,
    appointments,
    [] as Operation[],
    [] as Invoice[],
    [] as PatientFollowUpLogEntry[]
  );

  assert.equal(progress.prevWorkDay, '2026-10-19');
  assert.equal(progress.activePatientIds.length, 8);
  assert.equal(progress.quotaTarget, 8);
  assert.equal(progress.remainingCount, 8);
  assert.equal(progress.hasMoreCandidates, true);
  assert.equal(progress.activePatientIds.includes('p_old'), false);
});

test('computeFinishedWorkTaskProgress rolls over surplus above quota 5 and reduces next day remainingCount', () => {
  const patients = Array.from({ length: 10 }, (_, idx) => makePatient(`s${idx + 1}`));
  const appointments = patients.map(p => makeCompletedAppt(p.id, '2026-10-18'));
  const logs: PatientFollowUpLogEntry[] = patients.slice(0, 7).map((p, idx) => ({
    id: `log_${idx}`,
    patientId: p.id,
    patientName: p.name,
    patientPhone: p.phone,
    previousStatus: 'غير محدد',
    newStatus: 'خلص شغل',
    changedBy: 'موظف',
    changedById: 'u1',
    timestamp: '2026-10-19T12:00:00.000Z',
    taskType: 'finished_work',
    finishedWorkAction: 'finished',
    actionDate: '2026-10-19',
    reverted: false
  }));

  const progress = computeFinishedWorkTaskProgress(
    '2026-10-20',
    WEEKDAYS,
    patients,
    appointments,
    [],
    [],
    logs
  );

  // 7 finished on 2026-10-19 vs daily quota 5 -> 2 carryover credit into 2026-10-20
  assert.equal(progress.carryoverCredit, 2);
  assert.equal(progress.doneCount, 2);
  assert.equal(progress.quotaTarget, 5);
  assert.equal(progress.remainingCount, 3);
});

test('computeFinishedWorkTaskProgress respects snoozeUntilDate and re-activates candidate after snooze expires', () => {
  const p1 = makePatient('snoozed_1');
  const appt = makeCompletedAppt(p1.id, '2026-10-12');
  const unreachableLog: PatientFollowUpLogEntry = {
    id: 'log_u1',
    patientId: p1.id,
    patientName: p1.name,
    patientPhone: p1.phone,
    previousStatus: 'غير محدد',
    newStatus: 'لا يمكن التواصل',
    changedBy: 'موظف',
    changedById: 'u1',
    timestamp: '2026-10-15T12:00:00.000Z',
    taskType: 'finished_work',
    finishedWorkAction: 'unreachable',
    finishedWorkAttempt: 1,
    actionDate: '2026-10-15',
    snoozeUntilDate: '2026-10-18',
    reverted: false
  };

  const whileSnoozed = computeFinishedWorkTaskProgress(
    '2026-10-17',
    WEEKDAYS,
    [p1],
    [appt],
    [],
    [],
    [unreachableLog]
  );
  assert.equal(whileSnoozed.activePatientIds.includes(p1.id), false);

  const afterExpiry = computeFinishedWorkTaskProgress(
    '2026-10-18',
    WEEKDAYS,
    [p1],
    [appt],
    [],
    [],
    [unreachableLog]
  );
  assert.equal(afterExpiry.activePatientIds.includes(p1.id), true);
  assert.equal(afterExpiry.patientInfoById.get(p1.id)?.unreachableAttempts, 1);
});

test('computeFinishedWorkTaskProgress pulls fallback older visits beyond 45-day window when recent active < 5', () => {
  const oldPatient = makePatient('very_old');
  const oldAppt = makeCompletedAppt(oldPatient.id, '2026-07-01');

  const progress = computeFinishedWorkTaskProgress(
    '2026-10-20',
    WEEKDAYS,
    [oldPatient],
    [oldAppt],
    [],
    [],
    []
  );

  assert.deepEqual(progress.activePatientIds, ['very_old']);
  assert.equal(progress.quotaTarget, 1);
});
