import {
  Appointment,
  Invoice,
  Operation,
  Patient,
  PatientFollowUpLogEntry,
  Task,
  WeekdaySetting
} from '../types/clinic';
import { getPreviousWorkingDayYmd } from './arabic';
import {
  computeFinishedWorkTaskProgress,
  FinishedWorkTaskProgress,
  getCairoDateStringFromIso,
  isFinishedWorkTaskTitle
} from './finishedWork';

export function isFeedbackTaskTitle(title?: string): boolean {
  if (!title) return false;
  const normalized = title.trim().toLowerCase();
  return normalized.includes('فيدباك') || normalized.includes('feedback');
}

export interface FeedbackTaskProgress {
  prevWorkDay: string;
  totalPatients: number;
  doneCount: number;
  notDoneCount: number;
  processedCount: number;
  remainingCount: number;
  patientOutcomes: Map<string, 'done' | 'not_done'>;
  patientIds: string[];
}

type FeedbackCacheL4 = Map<string, FeedbackTaskProgress>;
type FeedbackCacheL3 = WeakMap<Patient[], FeedbackCacheL4>;
type FeedbackCacheL2 = WeakMap<PatientFollowUpLogEntry[], FeedbackCacheL3>;
type FeedbackCacheL1 = WeakMap<Appointment[], FeedbackCacheL2>;
const feedbackProgressCache = new WeakMap<WeekdaySetting[], FeedbackCacheL1>();

const EMPTY_PATIENTS: Patient[] = [];

const completedApptsByDateCache = new WeakMap<Appointment[], Map<string, string[]>>();

function getCompletedPatientIdsByDateMap(appointments: Appointment[]): Map<string, string[]> {
  let byDate = completedApptsByDateCache.get(appointments);
  if (!byDate) {
    byDate = new Map<string, string[]>();
    const seenPerDate = new Map<string, Set<string>>();
    for (let i = 0; i < appointments.length; i++) {
      const a = appointments[i];
      if (a.status !== 'completed' || !a.patientId) continue;
      const apptYmd = (a.date || '').trim().slice(0, 10);
      if (!apptYmd) continue;
      let seen = seenPerDate.get(apptYmd);
      let list = byDate.get(apptYmd);
      if (!seen || !list) {
        seen = new Set<string>();
        list = [];
        seenPerDate.set(apptYmd, seen);
        byDate.set(apptYmd, list);
      }
      if (!seen.has(a.patientId)) {
        seen.add(a.patientId);
        list.push(a.patientId);
      }
    }
    completedApptsByDateCache.set(appointments, byDate);
  }
  return byDate;
}

const EMPTY_STRING_ARRAY: string[] = [];

function getCompletedPatientIdsForDate(appointments: Appointment[], targetDate: string): string[] {
  return getCompletedPatientIdsByDateMap(appointments).get(targetDate) || EMPTY_STRING_ARRAY;
}

interface IndexedFeedbackLogs {
  byFeedbackDate: Map<string, Array<{ log: PatientFollowUpLogEntry; ts: number }>>;
  fwRelevantByActionDate: Map<string, Array<{ log: PatientFollowUpLogEntry; ts: number }>>;
}

const feedbackLogIndexCache = new WeakMap<PatientFollowUpLogEntry[], IndexedFeedbackLogs>();

function getFeedbackLogIndex(logs: PatientFollowUpLogEntry[]): IndexedFeedbackLogs {
  let idx = feedbackLogIndexCache.get(logs);
  if (!idx) {
    const byFeedbackDate = new Map<string, Array<{ log: PatientFollowUpLogEntry; ts: number }>>();
    const fwRelevantByActionDate = new Map<string, Array<{ log: PatientFollowUpLogEntry; ts: number }>>();

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.reverted) continue;
      const ts = Date.parse(log.timestamp) || 0;

      if (
        log.feedbackDate &&
        (log.feedbackOutcome === 'done' || log.feedbackOutcome === 'not_done')
      ) {
        const arr = byFeedbackDate.get(log.feedbackDate);
        if (arr) arr.push({ log, ts });
        else byFeedbackDate.set(log.feedbackDate, [{ log, ts }]);
      }

      const st = (log.newStatus || '').trim();
      if (
        log.taskType === 'finished_work' ||
        st === 'خلص شغل' ||
        st === 'غير مهتم' ||
        st === 'تم تحديد ميعاد'
      ) {
        const logDate = (log.actionDate || getCairoDateStringFromIso(log.timestamp)).slice(0, 10);
        if (logDate) {
          const arr = fwRelevantByActionDate.get(logDate);
          if (arr) arr.push({ log, ts });
          else fwRelevantByActionDate.set(logDate, [{ log, ts }]);
        }
      }
    }

    idx = { byFeedbackDate, fwRelevantByActionDate };
    feedbackLogIndexCache.set(logs, idx);
  }
  return idx;
}

/**
 * Resolves explicit Feedback outcomes (`done` / `not_done`) for all patients with completed
 * appointments on `visitDateYmd`.
 */
export function computeFeedbackOutcomesForVisitDate(
  visitDateYmd: string,
  appointments: Appointment[],
  patientFollowUpLogs: PatientFollowUpLogEntry[],
  _patients?: Patient[]
): {
  patientIds: string[];
  patientOutcomes: Map<string, 'done' | 'not_done'>;
} {
  const patientIds = getCompletedPatientIdsForDate(appointments, visitDateYmd);
  const patientOutcomes = new Map<string, 'done' | 'not_done'>();
  if (patientIds.length === 0) {
    return { patientIds, patientOutcomes };
  }

  const logIndex = getFeedbackLogIndex(patientFollowUpLogs);
  const dateLogs = logIndex.byFeedbackDate.get(visitDateYmd);
  if (!dateLogs || dateLogs.length === 0) {
    return { patientIds, patientOutcomes };
  }

  const uniquePatientIdsSet = new Set(patientIds);
  const latestLogTsByPatient = new Map<string, number>();

  for (let i = 0; i < dateLogs.length; i++) {
    const { log, ts } = dateLogs[i];
    if (!uniquePatientIdsSet.has(log.patientId)) continue;

    const prevTs = latestLogTsByPatient.get(log.patientId);
    if (prevTs === undefined || ts >= prevTs) {
      latestLogTsByPatient.set(log.patientId, ts);
      patientOutcomes.set(log.patientId, log.feedbackOutcome as 'done' | 'not_done');
    }
  }

  return { patientIds, patientOutcomes };
}

export function computeFeedbackTaskProgress(
  todayStr: string,
  weekdaySettings: WeekdaySetting[],
  appointments: Appointment[],
  patientFollowUpLogs: PatientFollowUpLogEntry[],
  patients?: Patient[]
): FeedbackTaskProgress {
  const patientsKey = patients || EMPTY_PATIENTS;
  let l1 = feedbackProgressCache.get(weekdaySettings);
  if (!l1) {
    l1 = new WeakMap();
    feedbackProgressCache.set(weekdaySettings, l1);
  }
  let l2 = l1.get(appointments);
  if (!l2) {
    l2 = new WeakMap();
    l1.set(appointments, l2);
  }
  let l3 = l2.get(patientFollowUpLogs);
  if (!l3) {
    l3 = new WeakMap();
    l2.set(patientFollowUpLogs, l3);
  }
  let l4 = l3.get(patientsKey);
  if (!l4) {
    l4 = new Map();
    l3.set(patientsKey, l4);
  }
  const cached = l4.get(todayStr);
  if (cached) return cached;

  const prevWorkDay = getPreviousWorkingDayYmd(todayStr, weekdaySettings);
  const { patientIds, patientOutcomes } = computeFeedbackOutcomesForVisitDate(
    prevWorkDay,
    appointments,
    patientFollowUpLogs,
    patients
  );

  let doneCount = 0;
  let notDoneCount = 0;
  patientOutcomes.forEach(outcome => {
    if (outcome === 'done') doneCount += 1;
    else if (outcome === 'not_done') notDoneCount += 1;
  });

  const totalPatients = patientIds.length;
  const processedCount = doneCount + notDoneCount;
  const remainingCount = Math.max(0, totalPatients - processedCount);

  const result: FeedbackTaskProgress = {
    prevWorkDay,
    totalPatients,
    doneCount,
    notDoneCount,
    processedCount,
    remainingCount,
    patientOutcomes,
    patientIds
  };
  l4.set(todayStr, result);
  return result;
}

function parseYmdParts(ymd: string): { y: number; m: number; d: number } | null {
  const parts = (ymd || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function doesTaskOccurOnDate(task: Task, dateStr: string): boolean {
  if (!task?.dueDate || !dateStr) return false;
  const recurrence = task.recurrence || 'once';
  if (recurrence === 'once') {
    return task.dueDate === dateStr;
  }
  if (dateStr < task.dueDate) {
    return false;
  }
  if (recurrence === 'daily') {
    return true;
  }
  const startParts = parseYmdParts(task.dueDate);
  const targetParts = parseYmdParts(dateStr);
  if (!startParts || !targetParts) return task.dueDate === dateStr;

  if (recurrence === 'weekly') {
    const startDow = new Date(startParts.y, startParts.m - 1, startParts.d, 12, 0, 0).getDay();
    const targetDow = new Date(targetParts.y, targetParts.m - 1, targetParts.d, 12, 0, 0).getDay();
    return startDow === targetDow;
  }

  if (recurrence === 'monthly') {
    const daysInTargetMonth = new Date(targetParts.y, targetParts.m, 0).getDate();
    const expectedDay = Math.min(startParts.d, daysInTargetMonth);
    return targetParts.d === expectedDay;
  }

  return task.dueDate === dateStr;
}

export interface TaskEvaluationContext {
  weekdaySettings: WeekdaySetting[];
  appointments: Appointment[];
  patientFollowUpLogs: PatientFollowUpLogEntry[];
  patients?: Patient[];
  operations?: Operation[];
  invoices?: Invoice[];
}

export interface TaskDateEvaluation {
  isCompleted: boolean;
  adminCompleted?: boolean;
  completedAt?: string;
  completedBy?: string;
  completionSource?: string;
  feedbackProgress?: FeedbackTaskProgress;
  finishedWorkProgress?: FinishedWorkTaskProgress;
}

export function getTaskCompletionForDate(
  task: Task,
  dateStr: string,
  ctx: TaskEvaluationContext
): TaskDateEvaluation {
  const evalDate = dateStr || task.dueDate;
  const recurrence = task.recurrence || 'once';
  const storedEntry = recurrence !== 'once' ? task.completedDates?.[evalDate] : undefined;
  const isAdminCompleted =
    recurrence === 'once'
      ? Boolean(task.isCompleted && task.adminCompleted)
      : Boolean(storedEntry?.adminCompleted);

  if (isFeedbackTaskTitle(task.title)) {
    const progress = computeFeedbackTaskProgress(
      evalDate,
      ctx.weekdaySettings,
      ctx.appointments,
      ctx.patientFollowUpLogs,
      ctx.patients
    );

    if (isAdminCompleted) {
      return {
        isCompleted: true,
        adminCompleted: true,
        completedAt: recurrence === 'once' ? task.completedAt : storedEntry?.completedAt,
        completedBy: recurrence === 'once' ? task.completedBy : storedEntry?.completedBy,
        feedbackProgress: progress
      };
    }

    const isCompleted = progress.totalPatients > 0 && progress.remainingCount === 0;
    if (!isCompleted) {
      return {
        isCompleted: false,
        feedbackProgress: progress
      };
    }

    let completedBy = recurrence === 'once' ? task.completedBy : storedEntry?.completedBy;
    if (!completedBy) {
      let bestTs = -Infinity;
      const prevSet = new Set(progress.patientIds);
      const fbLogs = getFeedbackLogIndex(ctx.patientFollowUpLogs).byFeedbackDate.get(progress.prevWorkDay);
      if (fbLogs) {
        for (let i = 0; i < fbLogs.length; i++) {
          const { log: l, ts } = fbLogs[i];
          if (!prevSet.has(l.patientId)) continue;
          if (ts > bestTs) {
            bestTs = ts;
            completedBy = l.changedBy;
          }
        }
      }
      if (!completedBy) {
        completedBy = 'تحديث تلقائي';
      }
    }

    return {
      isCompleted: true,
      completedAt: recurrence === 'once' ? task.completedAt : storedEntry?.completedAt,
      completedBy,
      feedbackProgress: progress
    };
  }

  if (isFinishedWorkTaskTitle(task.title)) {
    const fwProgress = computeFinishedWorkTaskProgress(
      evalDate,
      ctx.weekdaySettings,
      ctx.patients || [],
      ctx.appointments,
      ctx.operations || [],
      ctx.invoices || [],
      ctx.patientFollowUpLogs
    );

    if (isAdminCompleted) {
      return {
        isCompleted: true,
        adminCompleted: true,
        completedAt: recurrence === 'once' ? task.completedAt : storedEntry?.completedAt,
        completedBy: recurrence === 'once' ? task.completedBy : storedEntry?.completedBy,
        finishedWorkProgress: fwProgress
      };
    }

    const isCompleted = fwProgress.totalPatients > 0 && fwProgress.remainingCount === 0;
    if (!isCompleted) {
      return {
        isCompleted: false,
        finishedWorkProgress: fwProgress
      };
    }

    let completedBy = recurrence === 'once' ? task.completedBy : storedEntry?.completedBy;
    if (!completedBy) {
      let bestTs = -Infinity;
      const actionLogs = getFeedbackLogIndex(ctx.patientFollowUpLogs).fwRelevantByActionDate.get(evalDate);
      if (actionLogs) {
        for (let i = 0; i < actionLogs.length; i++) {
          const { log: l, ts } = actionLogs[i];
          if (ts > bestTs) {
            bestTs = ts;
            completedBy = l.changedBy;
          }
        }
      }
      if (!completedBy && fwProgress.carryoverCredit >= fwProgress.quotaTarget) {
        completedBy = 'ترحيل رصيد من يوم سابق';
      } else if (!completedBy) {
        completedBy = 'تحديث تلقائي';
      }
    }

    return {
      isCompleted: true,
      completedAt: recurrence === 'once' ? task.completedAt : storedEntry?.completedAt,
      completedBy,
      finishedWorkProgress: fwProgress
    };
  }

  if (recurrence === 'once') {
    return {
      isCompleted: Boolean(task.isCompleted),
      adminCompleted: Boolean(task.adminCompleted),
      completedAt: task.completedAt,
      completedBy: task.completedBy,
      completionSource: task.completionSource || (task.adminCompleted ? 'إتمام إداري' : 'من كارت المهمة مباشرة')
    };
  }

  if (task.completedDates) {
    if (storedEntry) {
      return {
        isCompleted: true,
        adminCompleted: Boolean(storedEntry.adminCompleted),
        completedAt: storedEntry.completedAt,
        completedBy: storedEntry.completedBy,
        completionSource: storedEntry.completionSource || (storedEntry.adminCompleted ? 'إتمام إداري' : 'من كارت المهمة مباشرة')
      };
    }
    return { isCompleted: false };
  }

  if (task.isCompleted && evalDate === task.dueDate) {
    return {
      isCompleted: true,
      adminCompleted: Boolean(task.adminCompleted),
      completedAt: task.completedAt,
      completedBy: task.completedBy,
      completionSource: task.completionSource || (task.adminCompleted ? 'إتمام إداري' : 'من كارت المهمة مباشرة')
    };
  }

  return { isCompleted: false };
}
