import {
  Appointment,
  FinishedWorkActionType,
  Invoice,
  Operation,
  Patient,
  PatientFollowUpLogEntry,
  WeekdaySetting
} from '../types/clinic';
import { addDaysToYmd, getArabicWeekdayName, getPreviousWorkingDayYmd } from './arabic';

export const FINISHED_WORK_TASK_ID = 'task_finished_work_daily';
export const FINISHED_WORK_TASK_TITLE = 'خلص شغل (مكالمة تليفونية)';
export const FINISHED_WORK_STATUS_DONE = 'خلص شغل';
export const FINISHED_WORK_STATUS_NOT_INTERESTED = 'غير مهتم';
export const FINISHED_WORK_STATUS_PROSPECT = 'عميل محتمل';
export const FINISHED_WORK_DEFAULT_QUOTA = 5;
const RECENT_WINDOW_DAYS = 45;
const ROLLOVER_LOOKBACK_DAYS = 21;

export function isFinishedWorkTaskTitle(title?: string): boolean {
  if (!title) return false;
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه');
  return (
    normalized.includes('خلص شغل') ||
    normalized.includes('خلصو شغل') ||
    normalized.includes('خلصوا شغل') ||
    normalized.includes('خلص الشغل') ||
    normalized.includes('finished work')
  );
}

const cairoDateFormatter =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : null;

const isoToCairoYmdCache = new Map<string, string>();

export function getCairoDateStringFromIso(iso?: string): string {
  if (!iso) return '';
  const cached = isoToCairoYmdCache.get(iso);
  if (cached !== undefined) return cached;

  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    const fallback = iso.slice(0, 10);
    if (isoToCairoYmdCache.size < 15000) isoToCairoYmdCache.set(iso, fallback);
    return fallback;
  }
  let res: string;
  try {
    res = cairoDateFormatter ? cairoDateFormatter.format(d) : iso.slice(0, 10);
  } catch {
    res = iso.slice(0, 10);
  }
  if (isoToCairoYmdCache.size > 15000) {
    isoToCairoYmdCache.clear();
  }
  isoToCairoYmdCache.set(iso, res);
  return res;
}

export function getYmdDiffDays(fromYmd: string, toYmd: string): number {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fromYmd || '').trim().slice(0, 10));
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec((toYmd || '').trim().slice(0, 10));
  if (!m1 || !m2) return 0;
  const fromUtc = Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
  const toUtc = Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  return Math.round((toUtc - fromUtc) / 86400000);
}

export function formatPostponeDaysArabic(days: number): string {
  const rounded = Math.max(1, Math.round(days));
  if (rounded === 1) return 'يوم واحد';
  if (rounded === 2) return 'يومين';
  if (rounded <= 10) return `${rounded.toLocaleString('ar-EG')} أيام`;
  return `${rounded.toLocaleString('ar-EG')} يوماً`;
}

function isCairoOffDay(ymd: string, weekdaySettings: WeekdaySetting[]): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || '').trim().slice(0, 10));
  if (!m) return false;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const dow = dt.getDay();
  const setting = weekdaySettings.find(w => w.dayOfWeek === dow);
  return Boolean(setting?.isClosed);
}

export interface FinishedWorkDeferralInfo {
  action: 'unreachable' | 'not_interested' | 'postpone_week';
  attempt: number;
  daysLabel: string;
  daysCount?: number;
  actionDate: string;
  snoozeUntilDate: string;
}

export interface FinishedWorkPatientInfo {
  patientId: string;
  latestCompletedAppt: Appointment;
  sessionProcedures: string[];
  doctorName: string;
  branchName: string;
  visitDate: string;
  visitDayName: string;
  unreachableAttempts: number;
  notInterestedAttempts: number;
  postponeWeekAttempts: number;
  currentCycleLogs: PatientFollowUpLogEntry[];
  lastDeferral: FinishedWorkDeferralInfo | null;
  isCurrentlySnoozed: boolean;
  todayAction?: FinishedWorkActionType | 'booked_appt';
  todayLogId?: string;
  isPrevWorkDayVisit: boolean;
}

export interface FinishedWorkTaskProgress {
  evalDate: string;
  prevWorkDay: string;
  quotaTarget: number;
  totalPatients: number;
  finishedCount: number;
  bookedApptCount: number;
  closedFileCount: number;
  unreachableCount: number;
  notInterestedCount: number;
  postponeWeekCount: number;
  carryoverCredit: number; // Surplus carried into evalDate toward quota
  surplusCount: number; // Extra eligible completions above quotaTarget on evalDate to roll to next day
  greenDoneCount: number; // finishedCount + bookedApptCount + carryoverCredit
  redClosedCount: number; // closedFileCount
  doneCount: number; // greenDoneCount + redClosedCount
  deferredCount: number; // unreachableCount + notInterestedCount + postponeWeekCount (NOT counted in 5/5)
  processedCount: number; // Same as doneCount (counted progress toward quotaTarget)
  remainingCount: number;
  hasMoreCandidates: boolean;
  orderedPatientIds: string[]; // Active + acted today patients selected for evalDate
  activePatientIds: string[]; // Eligible patients currently shown as action cards
  upcomingPatientIdSet: Set<string>;
  patientInfoById: Map<string, FinishedWorkPatientInfo>;
}

function normalizeProcName(raw?: string): string {
  return (raw || '').trim();
}

function getSessionProceduresForVisitIndexed(
  patientId: string,
  visitDate: string,
  completedApptsByPatient: Map<string, Appointment[]>,
  operationsByPatient: Map<string, Operation[]>,
  invoicesByPatient: Map<string, Invoice[]>
): {
  procedures: string[];
  doctorName?: string;
  branchName?: string;
} {
  const seenLower = new Set<string>();
  const procedures: string[] = [];
  let opDoctor: string | undefined;
  let opBranch: string | undefined;

  const pushProc = (rawName?: string, tooth?: string | number[]) => {
    const clean = normalizeProcName(rawName);
    if (!clean) return;
    let label = clean;
    if (typeof tooth === 'string' && tooth.trim()) {
      const cleanTooth = tooth.trim();
      if (!clean.includes(cleanTooth)) {
        label = `${clean} (سن ${cleanTooth})`;
      }
    } else if (Array.isArray(tooth) && tooth.length > 0) {
      const tStr = tooth.join('، ');
      if (!clean.includes(tStr)) {
        label = `${clean} (سن ${tStr})`;
      }
    }
    const key = label.toLowerCase();
    if (!seenLower.has(key)) {
      seenLower.add(key);
      procedures.push(label);
    }
  };

  const patOps = operationsByPatient.get(patientId);
  if (patOps) {
    for (let i = 0; i < patOps.length; i++) {
      const op = patOps[i];
      const statusLower = (op.status || '').toLowerCase();
      if (statusLower === 'rejected' || statusLower === 'cancelled') continue;
      const opDate = (op.appointmentDate || op.date || '').slice(0, 10);
      if (opDate !== visitDate) continue;
      if (!opDoctor && op.doctorName) opDoctor = op.doctorName;
      if (!opBranch && op.branchName) opBranch = op.branchName;
      pushProc(op.name, op.tooth);
    }
  }

  const patInvs = invoicesByPatient.get(patientId);
  if (patInvs) {
    for (let i = 0; i < patInvs.length; i++) {
      const inv = patInvs[i];
      if (inv.status === 'voided') continue;
      const invDate = (inv.date || '').slice(0, 10);
      if (invDate !== visitDate) continue;
      const items = inv.items || [];
      for (let j = 0; j < items.length; j++) {
        pushProc(items[j].procedureName, items[j].toothNumbers);
      }
    }
  }

  const specificCount = procedures.length;
  const patAppts = completedApptsByPatient.get(patientId);
  if (patAppts) {
    for (let i = 0; i < patAppts.length; i++) {
      const appt = patAppts[i];
      if ((appt.date || '').slice(0, 10) !== visitDate) continue;
      if (!opDoctor && appt.doctorName) opDoctor = appt.doctorName;
      if (!opBranch && appt.unitName) opBranch = appt.unitName;
      const pType = normalizeProcName(appt.procedureType);
      if (!pType) continue;
      if (specificCount > 0 && pType === 'كشف جديد') continue;
      pushProc(pType);
    }
  }

  return {
    procedures: procedures.length > 0 ? [procedures[procedures.length - 1]] : [],
    doctorName: opDoctor,
    branchName: opBranch
  };
}

export function getSessionProceduresForVisit(
  patientId: string,
  visitDate: string,
  appointments: Appointment[],
  operations: Operation[],
  invoices: Invoice[]
): {
  procedures: string[];
  doctorName?: string;
  branchName?: string;
} {
  const opsByPat = getOperationsByPatientMap(operations);
  const invsByPat = getInvoicesByPatientMap(invoices);
  const apptIndex = getAppointmentIndex(appointments);
  const patCompleted = apptIndex.completedApptsByPatientRaw.get(patientId);
  const singleCompletedMap = new Map<string, Appointment[]>();
  if (patCompleted) singleCompletedMap.set(patientId, patCompleted);
  return getSessionProceduresForVisitIndexed(
    patientId,
    visitDate,
    singleCompletedMap,
    opsByPat,
    invsByPat
  );
}

const patByIdCache = new WeakMap<Patient[], Map<string, Patient>>();

function getPatientByIdMap(patients: Patient[]): Map<string, Patient> {
  let map = patByIdCache.get(patients);
  if (!map) {
    map = new Map<string, Patient>();
    for (let i = 0; i < patients.length; i++) {
      const p = patients[i];
      if (p?.id) map.set(p.id, p);
    }
    patByIdCache.set(patients, map);
  }
  return map;
}

const opsByPatientCache = new WeakMap<Operation[], Map<string, Operation[]>>();

function getOperationsByPatientMap(operations: Operation[]): Map<string, Operation[]> {
  let map = opsByPatientCache.get(operations);
  if (!map) {
    map = new Map<string, Operation[]>();
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op.patientId) continue;
      const statusLower = (op.status || '').toLowerCase();
      if (statusLower === 'rejected' || statusLower === 'cancelled') continue;
      const arr = map.get(op.patientId);
      if (arr) arr.push(op);
      else map.set(op.patientId, [op]);
    }
    opsByPatientCache.set(operations, map);
  }
  return map;
}

const invsByPatientCache = new WeakMap<Invoice[], Map<string, Invoice[]>>();

function getInvoicesByPatientMap(invoices: Invoice[]): Map<string, Invoice[]> {
  let map = invsByPatientCache.get(invoices);
  if (!map) {
    map = new Map<string, Invoice[]>();
    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      if (!inv.patientId || inv.status === 'voided') continue;
      const arr = map.get(inv.patientId);
      if (arr) arr.push(inv);
      else map.set(inv.patientId, [inv]);
    }
    invsByPatientCache.set(invoices, map);
  }
  return map;
}

function compareApptsDesc(aDate: string, aTime: string, aCreated: string, bDate: string, bTime: string, bCreated: string): number {
  if (aDate !== bDate) return aDate > bDate ? 1 : -1;
  if (aTime !== bTime) return aTime > bTime ? 1 : -1;
  if (aCreated !== bCreated) return aCreated > bCreated ? 1 : -1;
  return 0;
}

interface IndexedAppt {
  appt: Appointment;
  patientId: string;
  apptYmd: string;
  createdYmd: string;
  createdMs: number;
  time: string;
  createdAt: string;
  status: Appointment['status'];
}

interface AppointmentIndex {
  byCreatedYmd: Map<string, IndexedAppt[]>;
  byDateYmd: Map<string, IndexedAppt[]>;
  completedByDateYmd: Map<string, IndexedAppt[]>;
  byPatientId: Map<string, IndexedAppt[]>;
  completedByPatientId: Map<string, IndexedAppt[]>;
  completedApptsByPatientRaw: Map<string, Appointment[]>;
  sortedDatesAsc: string[];
  sortedCompletedDatesDesc: string[];
}

const apptIndexCache = new WeakMap<Appointment[], AppointmentIndex>();

function getAppointmentIndex(appointments: Appointment[]): AppointmentIndex {
  const existing = apptIndexCache.get(appointments);
  if (existing) return existing;

  const byCreatedYmd = new Map<string, IndexedAppt[]>();
  const byDateYmd = new Map<string, IndexedAppt[]>();
  const completedByDateYmd = new Map<string, IndexedAppt[]>();
  const byPatientId = new Map<string, IndexedAppt[]>();
  const completedByPatientId = new Map<string, IndexedAppt[]>();
  const completedApptsByPatientRaw = new Map<string, Appointment[]>();

  for (let i = 0; i < appointments.length; i++) {
    const appt = appointments[i];
    if (!appt.patientId || appt.status === 'cancelled' || appt.status === 'no_show') continue;
    const apptYmd = (appt.date || '').trim().slice(0, 10);
    if (!apptYmd) continue;

    const createdAt = appt.createdAt || '';
    const createdYmd = getCairoDateStringFromIso(createdAt);
    const createdMs = createdAt ? Date.parse(createdAt) || 0 : 0;
    const item: IndexedAppt = {
      appt,
      patientId: appt.patientId,
      apptYmd,
      createdYmd,
      createdMs,
      time: appt.time || '00:00',
      createdAt,
      status: appt.status
    };

    if (createdYmd) {
      const arr = byCreatedYmd.get(createdYmd);
      if (arr) arr.push(item);
      else byCreatedYmd.set(createdYmd, [item]);
    }

    const dArr = byDateYmd.get(apptYmd);
    if (dArr) dArr.push(item);
    else byDateYmd.set(apptYmd, [item]);

    const pArr = byPatientId.get(appt.patientId);
    if (pArr) pArr.push(item);
    else byPatientId.set(appt.patientId, [item]);

    if (appt.status === 'completed') {
      const cdArr = completedByDateYmd.get(apptYmd);
      if (cdArr) cdArr.push(item);
      else completedByDateYmd.set(apptYmd, [item]);

      const cpArr = completedByPatientId.get(appt.patientId);
      if (cpArr) cpArr.push(item);
      else completedByPatientId.set(appt.patientId, [item]);

      const rawArr = completedApptsByPatientRaw.get(appt.patientId);
      if (rawArr) rawArr.push(appt);
      else completedApptsByPatientRaw.set(appt.patientId, [appt]);
    }
  }

  completedByPatientId.forEach(list => {
    if (list.length > 1) {
      list.sort((a, b) =>
        compareApptsDesc(b.apptYmd, b.time, b.createdAt, a.apptYmd, a.time, a.createdAt)
      );
    }
  });

  const sortedDatesAsc = Array.from(byDateYmd.keys()).sort();
  const sortedCompletedDatesDesc = Array.from(completedByDateYmd.keys()).sort((a, b) =>
    b.localeCompare(a)
  );

  const built: AppointmentIndex = {
    byCreatedYmd,
    byDateYmd,
    completedByDateYmd,
    byPatientId,
    completedByPatientId,
    completedApptsByPatientRaw,
    sortedDatesAsc,
    sortedCompletedDatesDesc
  };
  apptIndexCache.set(appointments, built);
  return built;
}

function lowerBoundDates(sortedDatesAsc: string[], target: string): number {
  let lo = 0;
  let hi = sortedDatesAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedDatesAsc[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface IndexedLog {
  log: PatientFollowUpLogEntry;
  patientId: string;
  actionYmd: string;
  ts: number;
}

interface FollowUpLogIndex {
  fwLogsByPatient: Map<string, IndexedLog[]>;
  fwLogsByDate: Map<string, IndexedLog[]>;
  externalLogsByDate: Map<string, IndexedLog[]>;
  rolloverTriggerDates: Set<string>;
}

const logIndexCache = new WeakMap<PatientFollowUpLogEntry[], FollowUpLogIndex>();

function getFollowUpLogIndex(logs: PatientFollowUpLogEntry[]): FollowUpLogIndex {
  const existing = logIndexCache.get(logs);
  if (existing) return existing;

  const fwLogsByPatient = new Map<string, IndexedLog[]>();
  const fwLogsByDate = new Map<string, IndexedLog[]>();
  const externalLogsByDate = new Map<string, IndexedLog[]>();
  const rolloverTriggerDates = new Set<string>();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.reverted || !log.patientId) continue;
    const actionYmd = (log.actionDate || getCairoDateStringFromIso(log.timestamp)).slice(0, 10);
    const ts = Date.parse(log.timestamp) || 0;
    const item: IndexedLog = {
      log,
      patientId: log.patientId,
      actionYmd,
      ts
    };

    if (log.taskType === 'finished_work' && log.finishedWorkAction) {
      rolloverTriggerDates.add(actionYmd);
      const pArr = fwLogsByPatient.get(log.patientId);
      if (pArr) pArr.push(item);
      else fwLogsByPatient.set(log.patientId, [item]);

      const dArr = fwLogsByDate.get(actionYmd);
      if (dArr) dArr.push(item);
      else fwLogsByDate.set(actionYmd, [item]);
    } else {
      const st = (log.newStatus || '').trim();
      if (
        st === FINISHED_WORK_STATUS_DONE ||
        st === FINISHED_WORK_STATUS_NOT_INTERESTED ||
        st === 'تم تحديد ميعاد'
      ) {
        rolloverTriggerDates.add(actionYmd);
      }
      const eArr = externalLogsByDate.get(actionYmd);
      if (eArr) eArr.push(item);
      else externalLogsByDate.set(actionYmd, [item]);
    }
  }

  fwLogsByPatient.forEach(arr => {
    if (arr.length > 1) arr.sort((a, b) => b.ts - a.ts);
  });
  externalLogsByDate.forEach(arr => {
    if (arr.length > 1) arr.sort((a, b) => a.ts - b.ts);
  });

  const built: FollowUpLogIndex = {
    fwLogsByPatient,
    fwLogsByDate,
    externalLogsByDate,
    rolloverTriggerDates
  };
  logIndexCache.set(logs, built);
  return built;
}

function isReactivationOrRescheduleLog(log: PatientFollowUpLogEntry): boolean {
  if ((log.newStatus || '').trim() !== 'تم تحديد ميعاد') return false;
  const notes = (log.notes || '').trim();
  return (
    notes.startsWith('تحديث تلقائي عند إعادة تفعيل الموعد') ||
    notes.startsWith('تحديث تلقائي عند تعديل الموعد')
  );
}

interface DirectDayStats {
  eligibleCount: number;
}

const directDayStatsCache = new WeakMap<
  Appointment[],
  WeakMap<PatientFollowUpLogEntry[], WeakMap<Patient[], Map<string, DirectDayStats>>>
>();

function getDirectDayStatsCacheMap(
  appointments: Appointment[],
  logs: PatientFollowUpLogEntry[],
  patients: Patient[]
): Map<string, DirectDayStats> {
  let l1 = directDayStatsCache.get(appointments);
  if (!l1) {
    l1 = new WeakMap();
    directDayStatsCache.set(appointments, l1);
  }
  let l2 = l1.get(logs);
  if (!l2) {
    l2 = new WeakMap();
    l1.set(logs, l2);
  }
  let l3 = l2.get(patients);
  if (!l3) {
    l3 = new Map();
    l2.set(patients, l3);
  }
  return l3;
}

/**
 * Computes direct eligible completion count (finished / booked_appt / closed_file) for `dayYmd`
 * in O(day activity) using pre-indexed appointment & log maps and caches the result.
 */
function computeDirectDayStatsIndexed(
  dayYmd: string,
  apptIndex: AppointmentIndex,
  logIndex: FollowUpLogIndex,
  patientById: Map<string, Patient>,
  dayCache: Map<string, DirectDayStats>
): DirectDayStats {
  const cached = dayCache.get(dayYmd);
  if (cached) return cached;

  const latestFwLogByPatient = new Map<string, IndexedLog>();
  const dayFwLogs = logIndex.fwLogsByDate.get(dayYmd);
  if (dayFwLogs) {
    for (let i = 0; i < dayFwLogs.length; i++) {
      const item = dayFwLogs[i];
      const prev = latestFwLogByPatient.get(item.patientId);
      if (!prev || item.ts >= prev.ts) {
        latestFwLogByPatient.set(item.patientId, item);
      }
    }
  }

  const bookedOnDaySet = new Set<string>();
  const createdTodayAppts = apptIndex.byCreatedYmd.get(dayYmd);
  if (createdTodayAppts) {
    for (let i = 0; i < createdTodayAppts.length; i++) {
      const a = createdTodayAppts[i];
      if (a.apptYmd >= dayYmd) {
        bookedOnDaySet.add(a.patientId);
      }
    }
  }

  const dayExternalLogs = logIndex.externalLogsByDate.get(dayYmd);
  const touchedPatientIds = new Set<string>();
  latestFwLogByPatient.forEach((_, pid) => touchedPatientIds.add(pid));
  bookedOnDaySet.forEach(pid => touchedPatientIds.add(pid));
  if (dayExternalLogs) {
    for (let i = 0; i < dayExternalLogs.length; i++) {
      touchedPatientIds.add(dayExternalLogs[i].patientId);
    }
  }

  if (touchedPatientIds.size === 0) {
    const zero = { eligibleCount: 0 };
    dayCache.set(dayYmd, zero);
    return zero;
  }

  // Evaluate appointment state ONLY for the small set of patients touched on `dayYmd`
  const prevWorkDayCompletedSet = new Set<string>();
  const upcomingOnDaySet = new Set<string>();
  const hadUpcomingCreatedBeforeDay = new Set<string>();

  touchedPatientIds.forEach(pid => {
    const pAppts = apptIndex.byPatientId.get(pid);
    if (!pAppts) return;
    for (let i = 0; i < pAppts.length; i++) {
      const a = pAppts[i];
      if (a.status === 'completed' && a.apptYmd < dayYmd) {
        prevWorkDayCompletedSet.add(pid);
      }
      const isFutureOrActiveOnDay =
        a.apptYmd > dayYmd ||
        (a.apptYmd === dayYmd && (a.status === 'booked' || a.status === 'confirmed' || a.status === 'arrived'));
      if (isFutureOrActiveOnDay) {
        upcomingOnDaySet.add(pid);
        if (!a.createdYmd || a.createdYmd < dayYmd) {
          hadUpcomingCreatedBeforeDay.add(pid);
        }
      }
    }
  });

  const externalFinishCandidateSet = new Set<string>();
  const externalClosedCandidateSet = new Set<string>();
  const externalRevertedToOpenSet = new Set<string>();
  const reactivatedOnDaySet = new Set<string>();

  if (dayExternalLogs) {
    for (let i = 0; i < dayExternalLogs.length; i++) {
      const { log, patientId } = dayExternalLogs[i];
      const nextSt = (log.newStatus || '').trim();
      const prevSt = (log.previousStatus || '').trim();

      if (isReactivationOrRescheduleLog(log) && upcomingOnDaySet.has(patientId)) {
        reactivatedOnDaySet.add(patientId);
      } else if (
        nextSt === FINISHED_WORK_STATUS_DONE &&
        prevSt !== FINISHED_WORK_STATUS_DONE &&
        prevWorkDayCompletedSet.has(patientId) &&
        !hadUpcomingCreatedBeforeDay.has(patientId)
      ) {
        if (patientById.has(patientId)) {
          externalFinishCandidateSet.add(patientId);
          externalClosedCandidateSet.delete(patientId);
          externalRevertedToOpenSet.delete(patientId);
        }
      } else if (
        nextSt === FINISHED_WORK_STATUS_NOT_INTERESTED &&
        prevSt !== FINISHED_WORK_STATUS_NOT_INTERESTED &&
        prevWorkDayCompletedSet.has(patientId) &&
        !hadUpcomingCreatedBeforeDay.has(patientId)
      ) {
        if (patientById.has(patientId)) {
          externalClosedCandidateSet.add(patientId);
          externalFinishCandidateSet.delete(patientId);
          externalRevertedToOpenSet.delete(patientId);
        }
      } else if (
        nextSt !== FINISHED_WORK_STATUS_DONE &&
        nextSt !== FINISHED_WORK_STATUS_NOT_INTERESTED &&
        nextSt !== 'تم تحديد ميعاد' &&
        nextSt !== 'حضر للعيادة'
      ) {
        externalFinishCandidateSet.delete(patientId);
        externalClosedCandidateSet.delete(patientId);
        externalRevertedToOpenSet.add(patientId);
      }
    }
  }

  const eligibleBookedSet = new Set<string>();
  bookedOnDaySet.forEach(pid => {
    if (!prevWorkDayCompletedSet.has(pid)) return;
    if (hadUpcomingCreatedBeforeDay.has(pid)) return;
    eligibleBookedSet.add(pid);
  });
  reactivatedOnDaySet.forEach(pid => {
    if (!prevWorkDayCompletedSet.has(pid)) return;
    eligibleBookedSet.add(pid);
  });

  let eligibleCount = 0;
  const allTouched = new Set<string>([
    ...latestFwLogByPatient.keys(),
    ...eligibleBookedSet,
    ...externalFinishCandidateSet,
    ...externalClosedCandidateSet
  ]);

  allTouched.forEach(pid => {
    const fwLog = latestFwLogByPatient.get(pid)?.log;
    if (fwLog?.finishedWorkAction === 'closed_file' || fwLog?.finishedWorkAction === 'finished') {
      eligibleCount += 1;
      return;
    }
    if (eligibleBookedSet.has(pid)) {
      eligibleCount += 1;
      return;
    }
    if (!externalRevertedToOpenSet.has(pid)) {
      if (externalClosedCandidateSet.has(pid) || externalFinishCandidateSet.has(pid)) {
        eligibleCount += 1;
      }
    }
  });

  const stats = { eligibleCount };
  dayCache.set(dayYmd, stats);
  return stats;
}

type FwResultCacheLevel6 = Map<string, FinishedWorkTaskProgress>;
type FwResultCacheLevel5 = WeakMap<PatientFollowUpLogEntry[], FwResultCacheLevel6>;
type FwResultCacheLevel4 = WeakMap<Invoice[], FwResultCacheLevel5>;
type FwResultCacheLevel3 = WeakMap<Operation[], FwResultCacheLevel4>;
type FwResultCacheLevel2 = WeakMap<Appointment[], FwResultCacheLevel3>;
type FwResultCacheLevel1 = WeakMap<Patient[], FwResultCacheLevel2>;
const fwResultCache = new WeakMap<WeekdaySetting[], FwResultCacheLevel1>();

export function computeFinishedWorkTaskProgress(
  evalDate: string,
  weekdaySettings: WeekdaySetting[],
  patients: Patient[],
  appointments: Appointment[],
  operations: Operation[],
  invoices: Invoice[],
  patientFollowUpLogs: PatientFollowUpLogEntry[],
  quotaLimit: number = FINISHED_WORK_DEFAULT_QUOTA
): FinishedWorkTaskProgress {
  const effectiveQuota = Math.max(FINISHED_WORK_DEFAULT_QUOTA, quotaLimit || FINISHED_WORK_DEFAULT_QUOTA);
  let l1 = fwResultCache.get(weekdaySettings);
  if (!l1) {
    l1 = new WeakMap();
    fwResultCache.set(weekdaySettings, l1);
  }
  let l2 = l1.get(patients);
  if (!l2) {
    l2 = new WeakMap();
    l1.set(patients, l2);
  }
  let l3 = l2.get(appointments);
  if (!l3) {
    l3 = new WeakMap();
    l2.set(appointments, l3);
  }
  let l4 = l3.get(operations);
  if (!l4) {
    l4 = new WeakMap();
    l3.set(operations, l4);
  }
  let l5 = l4.get(invoices);
  if (!l5) {
    l5 = new WeakMap();
    l4.set(invoices, l5);
  }
  let l6 = l5.get(patientFollowUpLogs);
  if (!l6) {
    l6 = new Map();
    l5.set(patientFollowUpLogs, l6);
  }
  const cacheKey = `${evalDate}::${effectiveQuota}`;
  const cached = l6.get(cacheKey);
  if (cached) return cached;

  const prevWorkDay = getPreviousWorkingDayYmd(evalDate, weekdaySettings);
  const patientById = getPatientByIdMap(patients);
  const apptIndex = getAppointmentIndex(appointments);
  const logIndex = getFollowUpLogIndex(patientFollowUpLogs);
  const dayStatsCache = getDirectDayStatsCacheMap(appointments, patientFollowUpLogs, patients);

  // 1. Compute surplus rollover from recent days (last ROLLOVER_LOOKBACK_DAYS days strictly before evalDate)
  let carryoverIn = 0;
  for (let offset = -ROLLOVER_LOOKBACK_DAYS; offset <= -1; offset++) {
    const dayYmd = addDaysToYmd(evalDate, offset);
    const hasActivity = logIndex.rolloverTriggerDates.has(dayYmd) || apptIndex.byCreatedYmd.has(dayYmd);
    if (carryoverIn === 0 && !hasActivity) continue;
    const stats = computeDirectDayStatsIndexed(dayYmd, apptIndex, logIndex, patientById, dayStatsCache);
    const offDay = isCairoOffDay(dayYmd, weekdaySettings);
    const dayRequiredQuota = offDay ? 0 : FINISHED_WORK_DEFAULT_QUOTA;
    carryoverIn = Math.max(0, carryoverIn + stats.eligibleCount - dayRequiredQuota);
  }

  // 2. Gather finished-work logs per patient <= evalDate and external status logs on evalDate in O(logs on day + touched patients)
  const finishedWorkLogsByPatient = new Map<string, PatientFollowUpLogEntry[]>();
  logIndex.fwLogsByPatient.forEach((arr, pid) => {
    let filtered: PatientFollowUpLogEntry[] | null = null;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].actionYmd <= evalDate) {
        if (filtered) filtered.push(arr[i].log);
      } else if (!filtered) {
        filtered = arr.slice(0, i).map(x => x.log);
      }
    }
    if (filtered) {
      if (filtered.length > 0) finishedWorkLogsByPatient.set(pid, filtered);
    } else if (arr.length > 0) {
      finishedWorkLogsByPatient.set(pid, arr.map(x => x.log));
    }
  });

  const externalFinishTodaySet = new Set<string>();
  const externalClosedTodaySet = new Set<string>();
  const externalRevertedTodaySet = new Set<string>();
  const reactivatedLogTodaySet = new Set<string>();

  const evalDateExternalLogs = logIndex.externalLogsByDate.get(evalDate);
  if (evalDateExternalLogs) {
    for (let i = 0; i < evalDateExternalLogs.length; i++) {
      const { log, patientId } = evalDateExternalLogs[i];
      const nextSt = (log.newStatus || '').trim();
      const prevSt = (log.previousStatus || '').trim();
      if (isReactivationOrRescheduleLog(log)) {
        reactivatedLogTodaySet.add(patientId);
      } else if (nextSt === FINISHED_WORK_STATUS_DONE && prevSt !== FINISHED_WORK_STATUS_DONE) {
        externalFinishTodaySet.add(patientId);
        externalClosedTodaySet.delete(patientId);
        externalRevertedTodaySet.delete(patientId);
      } else if (
        nextSt === FINISHED_WORK_STATUS_NOT_INTERESTED &&
        prevSt !== FINISHED_WORK_STATUS_NOT_INTERESTED
      ) {
        externalClosedTodaySet.add(patientId);
        externalFinishTodaySet.delete(patientId);
        externalRevertedTodaySet.delete(patientId);
      } else if (
        nextSt !== FINISHED_WORK_STATUS_DONE &&
        nextSt !== FINISHED_WORK_STATUS_NOT_INTERESTED &&
        nextSt !== 'تم تحديد ميعاد' &&
        nextSt !== 'حضر للعيادة'
      ) {
        externalFinishTodaySet.delete(patientId);
        externalClosedTodaySet.delete(patientId);
        externalRevertedTodaySet.add(patientId);
      }
    }
  }

  // 3A. Build upcoming / today-booked / visited-today sets using ONLY dates >= evalDate + createdOnEvalDate
  const upcomingPatientIdSet = new Set<string>();
  const upcomingBeforeTodaySet = new Set<string>();
  const bookedTodayPatientSet = new Set<string>();
  const visitedTodayCreatedBeforeSet = new Set<string>();

  const startFutureIdx = lowerBoundDates(apptIndex.sortedDatesAsc, evalDate);
  for (let dIdx = startFutureIdx; dIdx < apptIndex.sortedDatesAsc.length; dIdx++) {
    const dStr = apptIndex.sortedDatesAsc[dIdx];
    const dayAppts = apptIndex.byDateYmd.get(dStr);
    if (!dayAppts) continue;
    for (let i = 0; i < dayAppts.length; i++) {
      const a = dayAppts[i];
      const isFutureOrActiveToday =
        a.apptYmd > evalDate ||
        (a.apptYmd === evalDate &&
          (a.status === 'booked' || a.status === 'confirmed' || a.status === 'arrived'));

      if (isFutureOrActiveToday) {
        upcomingPatientIdSet.add(a.patientId);
      }

      if (a.apptYmd >= evalDate && a.createdYmd === evalDate) {
        bookedTodayPatientSet.add(a.patientId);
      } else if (isFutureOrActiveToday && (!a.createdYmd || a.createdYmd < evalDate)) {
        if (reactivatedLogTodaySet.has(a.patientId)) {
          bookedTodayPatientSet.add(a.patientId);
        } else {
          upcomingBeforeTodaySet.add(a.patientId);
        }
      } else if (
        a.status === 'completed' &&
        a.apptYmd === evalDate &&
        a.createdYmd &&
        a.createdYmd < evalDate
      ) {
        visitedTodayCreatedBeforeSet.add(a.patientId);
      }
    }
  }

  // 3B. Build recent completed visits (<= prevWorkDay) using ONLY the [recentCutoffYmd, prevWorkDay] date slice
  // plus specific touched patients' completed histories
  const recentCutoffRaw = addDaysToYmd(evalDate, -RECENT_WINDOW_DAYS);
  const recentCutoffYmd = prevWorkDay < recentCutoffRaw ? prevWorkDay : recentCutoffRaw;

  const recentCompletedByPatient = new Map<string, Appointment>();
  const upsertBestCompleted = (targetMap: Map<string, Appointment>, patientId: string, item: IndexedAppt) => {
    const prevBest = targetMap.get(patientId);
    if (
      !prevBest ||
      compareApptsDesc(
        item.apptYmd,
        item.time,
        item.createdAt,
        (prevBest.date || '').slice(0, 10),
        prevBest.time || '00:00',
        prevBest.createdAt || ''
      ) > 0
    ) {
      targetMap.set(patientId, item.appt);
    }
  };

  const recentStartIdx = lowerBoundDates(apptIndex.sortedDatesAsc, recentCutoffYmd);
  for (let dIdx = recentStartIdx; dIdx < apptIndex.sortedDatesAsc.length; dIdx++) {
    const dStr = apptIndex.sortedDatesAsc[dIdx];
    if (dStr > prevWorkDay) break;
    const completedDayAppts = apptIndex.completedByDateYmd.get(dStr);
    if (!completedDayAppts) continue;
    for (let i = 0; i < completedDayAppts.length; i++) {
      const item = completedDayAppts[i];
      upsertBestCompleted(recentCompletedByPatient, item.patientId, item);
    }
  }

  // Also include latest completed visit <= prevWorkDay for patients who have logs / today external statuses
  const specialPatients = new Set<string>([
    ...finishedWorkLogsByPatient.keys(),
    ...externalFinishTodaySet,
    ...externalClosedTodaySet
  ]);
  specialPatients.forEach(pid => {
    if (recentCompletedByPatient.has(pid)) return;
    const patCompleted = apptIndex.completedByPatientId.get(pid);
    if (!patCompleted) return;
    for (let i = 0; i < patCompleted.length; i++) {
      if (patCompleted[i].apptYmd <= prevWorkDay) {
        recentCompletedByPatient.set(pid, patCompleted[i].appt);
        break;
      }
    }
  });

  interface CandidateMeta {
    patientId: string;
    pat: Patient;
    latestCompletedAppt: Appointment;
    visitDate: string;
    visitTime: string;
    createdAt: string;
    isPrevWorkDay: boolean;
    unreachableAttempts: number;
    notInterestedAttempts: number;
    postponeWeekAttempts: number;
    currentCycleLogs: PatientFollowUpLogEntry[];
    lastDeferral: FinishedWorkDeferralInfo | null;
    isCurrentlySnoozed: boolean;
    todayLog?: PatientFollowUpLogEntry;
    resolvedTodayAction?: FinishedWorkActionType | 'booked_appt';
    isActiveCandidate: boolean;
  }

  const evaluateCandidate = (patientId: string, latestCompletedAppt: Appointment): CandidateMeta | null => {
    const pat = patientById.get(patientId);
    if (!pat) return null;

    const visitDate = (latestCompletedAppt.date || '').slice(0, 10);
    const hasUpcoming = upcomingPatientIdSet.has(patientId);
    const bookedToday =
      bookedTodayPatientSet.has(patientId) && !upcomingBeforeTodaySet.has(patientId);

    const allLogs = finishedWorkLogsByPatient.get(patientId);
    const patActiveAppts = allLogs && allLogs.length > 0 ? apptIndex.byPatientId.get(patientId) : undefined;

    const currentCycleLogs =
      !allLogs || allLogs.length === 0
        ? []
        : !patActiveAppts || patActiveAppts.length === 0
        ? allLogs
        : allLogs.filter(log => {
            const logDate = (log.actionDate || getCairoDateStringFromIso(log.timestamp)).slice(0, 10);
            const logMs = Date.parse(log.timestamp) || 0;
            const wasResetByNewerAppt = patActiveAppts.some(a => {
              if (a.status === 'completed') {
                if (a.apptYmd > logDate && a.apptYmd <= prevWorkDay) return true;
                if (a.apptYmd === logDate && a.apptYmd <= prevWorkDay) {
                  return a.createdMs > logMs;
                }
                return false;
              }
              if (!a.createdYmd || a.createdYmd > evalDate) return false;
              return a.apptYmd >= evalDate && a.createdMs > logMs;
            });
            return !wasResetByNewerAppt;
          });

    const todayLog =
      currentCycleLogs.length > 0
        ? currentCycleLogs.find(
            l => (l.actionDate || getCairoDateStringFromIso(l.timestamp)).slice(0, 10) === evalDate
          )
        : undefined;

    const priorLogs =
      currentCycleLogs.length > 0
        ? currentCycleLogs.filter(
            l => (l.actionDate || getCairoDateStringFromIso(l.timestamp)).slice(0, 10) < evalDate
          )
        : [];

    let unreachableAttempts = 0;
    let notInterestedAttempts = 0;
    let postponeWeekAttempts = 0;
    for (let k = 0; k < priorLogs.length; k++) {
      const act = priorLogs[k].finishedWorkAction;
      if (act === 'unreachable') unreachableAttempts += 1;
      else if (act === 'not_interested') notInterestedAttempts += 1;
      else if (act === 'postpone_week') postponeWeekAttempts += 1;
    }

    const latestPriorLog = priorLogs[0];
    let lastDeferral: FinishedWorkDeferralInfo | null = null;
    let isCurrentlySnoozed = false;

    if (
      latestPriorLog &&
      (latestPriorLog.finishedWorkAction === 'unreachable' ||
        latestPriorLog.finishedWorkAction === 'not_interested' ||
        latestPriorLog.finishedWorkAction === 'postpone_week')
    ) {
      const action = latestPriorLog.finishedWorkAction;
      const snoozeUntilDate = latestPriorLog.snoozeUntilDate || '';
      const actionDate = (
        latestPriorLog.actionDate || getCairoDateStringFromIso(latestPriorLog.timestamp)
      ).slice(0, 10);

      if (snoozeUntilDate && evalDate < snoozeUntilDate) {
        isCurrentlySnoozed = true;
      }

      const diffDays = actionDate && snoozeUntilDate ? getYmdDiffDays(actionDate, snoozeUntilDate) : 0;
      const daysLabel =
        action === 'unreachable'
          ? '٣ أيام'
          : action === 'postpone_week'
          ? diffDays >= 1
            ? formatPostponeDaysArabic(diffDays)
            : 'أسبوع'
          : 'أسبوع';

      lastDeferral = {
        action,
        attempt:
          action === 'unreachable'
            ? unreachableAttempts + 1
            : action === 'postpone_week'
            ? postponeWeekAttempts + 1
            : notInterestedAttempts + 1,
        daysLabel,
        ...(action === 'postpone_week' && diffDays >= 1 ? { daysCount: diffDays } : {}),
        actionDate,
        snoozeUntilDate
      };
    }

    const patStatusTrimmed = (pat.followUpStatus || '').trim();
    const hasExcludedStatus =
      patStatusTrimmed === FINISHED_WORK_STATUS_DONE ||
      patStatusTrimmed === FINISHED_WORK_STATUS_NOT_INTERESTED ||
      patStatusTrimmed === FINISHED_WORK_STATUS_PROSPECT;

    const hadPriorCycleCompletion = priorLogs.some(
      l => l.finishedWorkAction === 'finished' || l.finishedWorkAction === 'closed_file'
    );

    let resolvedTodayAction: FinishedWorkActionType | 'booked_appt' | undefined;
    if (todayLog?.finishedWorkAction === 'closed_file') {
      resolvedTodayAction = 'closed_file';
    } else if (todayLog?.finishedWorkAction === 'finished') {
      resolvedTodayAction = 'finished';
    } else if (bookedToday && !hadPriorCycleCompletion) {
      resolvedTodayAction = 'booked_appt';
    } else if (
      externalClosedTodaySet.has(patientId) &&
      !upcomingBeforeTodaySet.has(patientId) &&
      !hadPriorCycleCompletion
    ) {
      resolvedTodayAction = 'closed_file';
    } else if (
      externalFinishTodaySet.has(patientId) &&
      !upcomingBeforeTodaySet.has(patientId) &&
      !hadPriorCycleCompletion
    ) {
      resolvedTodayAction = 'finished';
    } else if (todayLog?.finishedWorkAction) {
      resolvedTodayAction = todayLog.finishedWorkAction;
    }

    const isActiveCandidate =
      !resolvedTodayAction &&
      !hasUpcoming &&
      !visitedTodayCreatedBeforeSet.has(patientId) &&
      !hasExcludedStatus &&
      !isCurrentlySnoozed &&
      !hadPriorCycleCompletion;

    if (!resolvedTodayAction && !isActiveCandidate) return null;

    return {
      patientId,
      pat,
      latestCompletedAppt,
      visitDate,
      visitTime: latestCompletedAppt.time || '00:00',
      createdAt: latestCompletedAppt.createdAt || '',
      isPrevWorkDay: visitDate === prevWorkDay,
      unreachableAttempts,
      notInterestedAttempts,
      postponeWeekAttempts,
      currentCycleLogs,
      lastDeferral,
      isCurrentlySnoozed,
      todayLog,
      resolvedTodayAction,
      isActiveCandidate
    };
  };

  const candidates: CandidateMeta[] = [];
  let activeCountInRecent = 0;
  recentCompletedByPatient.forEach((latestCompletedAppt, patientId) => {
    const meta = evaluateCandidate(patientId, latestCompletedAppt);
    if (meta) {
      candidates.push(meta);
      if (meta.isActiveCandidate) activeCountInRecent += 1;
    }
  });

  // Fallback walk strictly backwards in date ONLY if recent 45-day window has fewer active candidates than quota
  let hasMoreFallbackActive = false;
  if (activeCountInRecent < effectiveQuota) {
    const seenFallbackPatients = new Set<string>();
    let totalActiveFound = activeCountInRecent;
    let reachedQuotaThreshold = false;

    for (let dIdx = 0; dIdx < apptIndex.sortedCompletedDatesDesc.length; dIdx++) {
      const dStr = apptIndex.sortedCompletedDatesDesc[dIdx];
      if (dStr >= recentCutoffYmd || dStr > prevWorkDay) continue;

      if (reachedQuotaThreshold) {
        // Already satisfied effectiveQuota on a newer date; check if at least 1 more older active exists for hasMoreCandidates
        const dayAppts = apptIndex.completedByDateYmd.get(dStr);
        if (dayAppts) {
          for (let i = 0; i < dayAppts.length; i++) {
            const item = dayAppts[i];
            if (recentCompletedByPatient.has(item.patientId) || seenFallbackPatients.has(item.patientId)) continue;
            seenFallbackPatients.add(item.patientId);
            const meta = evaluateCandidate(item.patientId, item.appt);
            if (meta?.isActiveCandidate) {
              hasMoreFallbackActive = true;
              break;
            }
          }
        }
        if (hasMoreFallbackActive) break;
        continue;
      }

      const dayAppts = apptIndex.completedByDateYmd.get(dStr);
      if (!dayAppts || dayAppts.length === 0) continue;

      const dayBestByPatient = new Map<string, IndexedAppt>();
      for (let i = 0; i < dayAppts.length; i++) {
        const item = dayAppts[i];
        if (recentCompletedByPatient.has(item.patientId) || seenFallbackPatients.has(item.patientId)) continue;
        const prev = dayBestByPatient.get(item.patientId);
        if (
          !prev ||
          compareApptsDesc(item.apptYmd, item.time, item.createdAt, prev.apptYmd, prev.time, prev.createdAt) > 0
        ) {
          dayBestByPatient.set(item.patientId, item);
        }
      }

      dayBestByPatient.forEach((bestItem, pid) => {
        seenFallbackPatients.add(pid);
        const meta = evaluateCandidate(pid, bestItem.appt);
        if (meta) {
          candidates.push(meta);
          if (meta.isActiveCandidate) totalActiveFound += 1;
        }
      });

      if (totalActiveFound >= effectiveQuota) {
        reachedQuotaThreshold = true;
        if (totalActiveFound > effectiveQuota) {
          hasMoreFallbackActive = true;
          break;
        }
      }
    }
  }

  const sortDesc = (a: CandidateMeta, b: CandidateMeta) =>
    compareApptsDesc(b.visitDate, b.visitTime, b.createdAt, a.visitDate, a.visitTime, a.createdAt);

  candidates.sort(sortDesc);

  const actedTodayCandidates = candidates.filter(c => Boolean(c.resolvedTodayAction));
  const activeCandidates = candidates.filter(c => c.isActiveCandidate);

  // Tally direct today counts across ALL acted candidates on evalDate
  let finishedCount = 0;
  let bookedApptCount = 0;
  let closedFileCount = 0;
  let unreachableCount = 0;
  let notInterestedCount = 0;
  let postponeWeekCount = 0;

  for (let i = 0; i < actedTodayCandidates.length; i++) {
    const act = actedTodayCandidates[i].resolvedTodayAction;
    if (act === 'finished') finishedCount += 1;
    else if (act === 'booked_appt') bookedApptCount += 1;
    else if (act === 'closed_file') closedFileCount += 1;
    else if (act === 'unreachable') unreachableCount += 1;
    else if (act === 'not_interested') notInterestedCount += 1;
    else if (act === 'postpone_week') postponeWeekCount += 1;
  }

  const directEligibleCount = finishedCount + bookedApptCount + closedFileCount;
  const prevWorkDayActive = activeCandidates.filter(c => c.isPrevWorkDay);
  const olderActive = activeCandidates.filter(c => !c.isPrevWorkDay);
  const maxAchievable = activeCandidates.length + directEligibleCount + carryoverIn;
  const baseQuotaTarget = maxAchievable > 0 ? Math.min(effectiveQuota, maxAchievable) : 0;

  const carryoverCredit = Math.min(baseQuotaTarget, carryoverIn);
  const greenDoneCount = finishedCount + bookedApptCount + carryoverCredit;
  const redClosedCount = closedFileCount;
  const doneCount = greenDoneCount + redClosedCount;
  const deferredCount = unreachableCount + notInterestedCount + postponeWeekCount;

  // All eligible previous working day patients MUST remain active until processed, even if > 5.
  // Older candidates only backfill remaining slots below effectiveQuota.
  const remainingQuotaAfterDone = Math.max(0, effectiveQuota - doneCount);
  const neededOlderSlots = Math.max(0, remainingQuotaAfterDone - prevWorkDayActive.length);
  const chosenActive = [
    ...prevWorkDayActive,
    ...olderActive.slice(0, neededOlderSlots)
  ];
  const quotaTarget = Math.max(baseQuotaTarget, doneCount + prevWorkDayActive.length);
  const remainingCount = Math.max(0, quotaTarget - doneCount);
  const surplusCount = Math.max(0, directEligibleCount + carryoverIn - FINISHED_WORK_DEFAULT_QUOTA);
  const hasMoreCandidates = activeCandidates.length > chosenActive.length || hasMoreFallbackActive;

  const selectedPool = [...chosenActive, ...actedTodayCandidates].sort(sortDesc);

  const opsByPatient = getOperationsByPatientMap(operations);
  const invsByPatient = getInvoicesByPatientMap(invoices);

  const patientInfoById = new Map<string, FinishedWorkPatientInfo>();
  const orderedPatientIds: string[] = [];
  const activePatientIds: string[] = [];

  for (let i = 0; i < selectedPool.length; i++) {
    const item = selectedPool[i];
    const sessionMeta = getSessionProceduresForVisitIndexed(
      item.patientId,
      item.visitDate,
      apptIndex.completedApptsByPatientRaw,
      opsByPatient,
      invsByPatient
    );

    const info: FinishedWorkPatientInfo = {
      patientId: item.patientId,
      latestCompletedAppt: item.latestCompletedAppt,
      sessionProcedures: sessionMeta.procedures,
      doctorName:
        item.latestCompletedAppt.doctorName ||
        sessionMeta.doctorName ||
        item.pat.doctorName ||
        'غير محدد',
      branchName:
        item.latestCompletedAppt.unitName ||
        sessionMeta.branchName ||
        item.pat.branchName ||
        'غير محدد',
      visitDate: item.visitDate,
      visitDayName: getArabicWeekdayName(item.visitDate),
      unreachableAttempts: item.unreachableAttempts,
      notInterestedAttempts: item.notInterestedAttempts,
      postponeWeekAttempts: item.postponeWeekAttempts,
      currentCycleLogs: item.currentCycleLogs,
      lastDeferral: item.lastDeferral,
      isCurrentlySnoozed: item.isCurrentlySnoozed,
      todayAction: item.resolvedTodayAction,
      todayLogId: item.todayLog?.id,
      isPrevWorkDayVisit: item.isPrevWorkDay
    };

    patientInfoById.set(item.patientId, info);
    orderedPatientIds.push(item.patientId);

    if (item.isActiveCandidate && !upcomingPatientIdSet.has(item.patientId)) {
      activePatientIds.push(item.patientId);
    }
  }

  const result: FinishedWorkTaskProgress = {
    evalDate,
    prevWorkDay,
    quotaTarget,
    totalPatients: quotaTarget,
    finishedCount,
    bookedApptCount,
    closedFileCount,
    unreachableCount,
    notInterestedCount,
    postponeWeekCount,
    carryoverCredit,
    surplusCount,
    greenDoneCount,
    redClosedCount,
    doneCount,
    deferredCount,
    processedCount: doneCount,
    remainingCount,
    hasMoreCandidates,
    orderedPatientIds,
    activePatientIds,
    upcomingPatientIdSet,
    patientInfoById
  };
  l6.set(cacheKey, result);
  return result;
}
