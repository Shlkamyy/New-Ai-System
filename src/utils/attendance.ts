import { AttendanceRecord } from '../types/clinic';

export function sortAttendanceRecordsDesc(records: AttendanceRecord[]): AttendanceRecord[] {
  return [...records].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    const clockInCmp = (b.clockIn || '').localeCompare(a.clockIn || '');
    if (clockInCmp !== 0) return clockInCmp;
    return (b.id || '').localeCompare(a.id || '');
  });
}

export function findActiveShiftForUser(
  records: AttendanceRecord[],
  userId: string
): AttendanceRecord | undefined {
  if (!userId) return undefined;
  const activeMatches = records.filter(r => r.userId === userId && r.status === 'active');
  if (activeMatches.length === 0) return undefined;
  if (activeMatches.length === 1) return activeMatches[0];
  return sortAttendanceRecordsDesc(activeMatches)[0];
}

export function createDeterministicAttendanceId(
  userId: string,
  dateStr: string,
  existingRecords: AttendanceRecord[]
): string {
  const cleanUser = String(userId || 'user')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64) || 'user';
  const cleanDate = String(dateStr || '')
    .trim()
    .replace(/[^0-9-]/g, '') || 'date';
  const prefix = `att_${cleanUser}_${cleanDate}_s`;

  const existingIds = new Set(existingRecords.map(r => r.id));
  let seq = 1;
  while (existingIds.has(`${prefix}${seq}`) && seq < 100) {
    seq += 1;
  }
  return `${prefix}${seq}`.slice(0, 128);
}

function choosePreferredAttendanceRecord(a: AttendanceRecord, b: AttendanceRecord): AttendanceRecord {
  if (a.status !== b.status) {
    return a.status === 'completed' ? a : b;
  }
  if (Boolean(a.clockOut) !== Boolean(b.clockOut)) {
    return a.clockOut ? a : b;
  }
  if ((a.clockOut || '') !== (b.clockOut || '')) {
    return (a.clockOut || '') > (b.clockOut || '') ? a : b;
  }
  return a;
}

export function reconcileAttendanceRecords(records: AttendanceRecord[]): AttendanceRecord[] {
  const byId = new Map<string, AttendanceRecord>();
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec || !rec.id) continue;
    const prev = byId.get(rec.id);
    if (!prev) {
      byId.set(rec.id, rec);
    } else {
      byId.set(rec.id, choosePreferredAttendanceRecord(prev, rec));
    }
  }
  return sortAttendanceRecordsDesc(Array.from(byId.values()));
}

export function canRunMidnightAutoEndForRecord(params: {
  record: AttendanceRecord;
  cairoDateStr: string;
  cairoHour: number;
  cairoMinute: number;
  currentUserId: string;
  isAdmin: boolean;
  graceMinutesAfterMidnight?: number;
}): boolean {
  const {
    record,
    cairoDateStr,
    cairoHour,
    cairoMinute,
    currentUserId,
    isAdmin,
    graceMinutesAfterMidnight = 5
  } = params;

  if (!record || record.status !== 'active') return false;
  if (!record.date || !cairoDateStr || record.date >= cairoDateStr) return false;

  const minutesSinceMidnight = cairoHour * 60 + cairoMinute;
  if (minutesSinceMidnight < graceMinutesAfterMidnight) {
    return false;
  }

  if (isAdmin) return true;
  return Boolean(currentUserId) && record.userId === currentUserId;
}

export function isValidAttendanceRecordShape(record: Partial<AttendanceRecord>): boolean {
  if (!record) return false;
  if (!record.id || !record.userId || !record.unitId) return false;
  if (!record.date || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return false;
  if (!record.clockIn || typeof record.clockIn !== 'string') return false;
  return true;
}
