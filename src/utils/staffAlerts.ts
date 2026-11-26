import {
  Appointment,
  AttendanceRecord,
  ClinicUnit,
  NotificationChannelMode,
  StaffAlertSettings,
  StaffAlertTargetMode,
  StaffMember,
  WeekdaySetting
} from '../types/clinic';
import { addDaysToYmd, formatCairoTime, getCairoNowParts } from './arabic';

export const DAY_OFF_UNIT_ID = '__off__';

export function isStaffExemptFromAttendanceOnDate(staff: StaffMember, dateStr: string): boolean {
  if (!staff) return false;
  if (staff.exemptFromAttendance) return true;
  if (Array.isArray(staff.attendanceExemptDates) && staff.attendanceExemptDates.includes(dateStr)) {
    return true;
  }
  if (dateStr && staff.defaultUnitByDay) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (y && m && d) {
      const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
      if (staff.defaultUnitByDay[dow] === DAY_OFF_UNIT_ID) {
        return true;
      }
    }
  }
  return false;
}

export function resolveEmployeeDefaultUnitForToday(
  staff: StaffMember,
  units: ClinicUnit[],
  weekdaySettings: WeekdaySetting[],
  nowDate: Date = new Date()
): ClinicUnit | undefined {
  const activeUnits = units.filter(u => !u.isDisabled);
  const baseUnits = activeUnits.length > 0 ? activeUnits : units;
  const restricted = staff.restrictedBranchId
    ? baseUnits.filter(u => u.id === staff.restrictedBranchId)
    : [];
  const selectableUnits = restricted.length > 0 ? restricted : baseUnits;
  const todayWeekday = getCairoNowParts(nowDate).weekday;

  const staffDayUnitId = staff.defaultUnitByDay?.[todayWeekday];
  if (staffDayUnitId === DAY_OFF_UNIT_ID) {
    return undefined;
  }
  if (staffDayUnitId) {
    const found = selectableUnits.find(u => u.id === staffDayUnitId);
    if (found) return found;
  }

  const weekdayUnitId = weekdaySettings.find(w => w.dayOfWeek === todayWeekday)?.defaultUnitId;
  if (weekdayUnitId) {
    const found = selectableUnits.find(u => u.id === weekdayUnitId);
    if (found) return found;
  }

  return selectableUnits[0];
}

export function getAlertNotificationChannel(
  settings: StaffAlertSettings,
  alertType: 'appointment' | 'shift'
): NotificationChannelMode {
  if (alertType === 'appointment') {
    return settings.appointmentNotificationChannel || settings.notificationChannel || 'website_only';
  }
  return settings.shiftNotificationChannel || settings.notificationChannel || 'website_only';
}

export function getEffectiveMobilePushChannel(settings: StaffAlertSettings): NotificationChannelMode {
  const apptMobile =
    settings.appointmentFollowUpEnabled &&
    getAlertNotificationChannel(settings, 'appointment') === 'mobile_and_website';
  const shiftMobile =
    settings.shiftReminderEnabled !== false &&
    getAlertNotificationChannel(settings, 'shift') === 'mobile_and_website';
  return apptMobile || shiftMobile ? 'mobile_and_website' : 'website_only';
}

export function isStaffTargetedForAlert(
  staffId: string | undefined,
  targetMode?: StaffAlertTargetMode,
  targetStaffIds?: string[]
): boolean {
  if (!staffId) return false;
  if (!targetMode || targetMode === 'all') return true;
  if (!Array.isArray(targetStaffIds)) return false;
  return targetStaffIds.includes(staffId);
}

export function parseAppointmentMinutes24(timeStr: string): number | null {
  if (!timeStr) return null;
  const upper = timeStr.toUpperCase();
  const isAM = upper.includes('AM');
  const isPM = upper.includes('PM');
  const clean = upper.replace(/[^0-9:]/g, '');
  const [hStr, mStr] = clean.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h) || isNaN(m)) return null;

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  return h * 60 + m;
}

export interface ShiftVarianceResult {
  expectedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  status: 'overtime' | 'deficit' | 'exact';
  label: string;
}

export function calculateShiftVariance(
  shiftStartTime?: string,
  shiftEndTime?: string,
  clockIn?: string,
  clockOut?: string
): ShiftVarianceResult | null {
  if (!shiftStartTime || !shiftEndTime || !clockIn || !clockOut) return null;
  const schedStart = parseAppointmentMinutes24(shiftStartTime);
  const schedEndRaw = parseAppointmentMinutes24(shiftEndTime);
  const actStart = parseAppointmentMinutes24(clockIn);
  const actEndRaw = parseAppointmentMinutes24(clockOut);

  if (schedStart === null || schedEndRaw === null || actStart === null || actEndRaw === null) {
    return null;
  }

  let schedEnd = schedEndRaw;
  if (schedEnd <= schedStart) schedEnd += 24 * 60;

  let actEnd = actEndRaw;
  if (actEnd < actStart) actEnd += 24 * 60;

  const expectedMinutes = Math.max(0, schedEnd - schedStart);
  const actualMinutes = Math.max(0, actEnd - actStart);
  const diffMinutes = actualMinutes - expectedMinutes;

  if (diffMinutes > 0) {
    return {
      expectedMinutes,
      actualMinutes,
      diffMinutes,
      status: 'overtime',
      label: `زيادة ${diffMinutes} دقيقة`
    };
  }
  if (diffMinutes < 0) {
    return {
      expectedMinutes,
      actualMinutes,
      diffMinutes,
      status: 'deficit',
      label: `نقص ${Math.abs(diffMinutes)} دقيقة`
    };
  }
  return {
    expectedMinutes,
    actualMinutes,
    diffMinutes: 0,
    status: 'exact',
    label: 'مكتمل بالضبط'
  };
}

export const MIDNIGHT_AUTO_END_REASON_PREFIX = 'إنهاء تلقائي عند منتصف الليل';

export function isMidnightAutoEndedAttendance(rec: Pick<AttendanceRecord, 'manualReason'>): boolean {
  return Boolean(rec.manualReason && rec.manualReason.startsWith(MIDNIGHT_AUTO_END_REASON_PREFIX));
}

export function findMidnightAutoEndCandidates(
  attendance: AttendanceRecord[],
  cairoTodayStr: string
): AttendanceRecord[] {
  if (!cairoTodayStr) return [];
  return attendance.filter(
    r => r.status === 'active' && Boolean(r.date) && r.date < cairoTodayStr
  );
}

export function isActiveShiftEndDue(
  activeShift: AttendanceRecord,
  todayStr: string,
  nowMinutes: number,
  startMin: number | null,
  endMin: number | null
): boolean {
  if (endMin === null || activeShift.status !== 'active') return false;
  const isOvernightSchedule = startMin !== null && endMin <= startMin;

  if (activeShift.date === todayStr) {
    // Overnight shift started today ends tomorrow at endMin, not earlier today
    if (isOvernightSchedule) return false;
    return nowMinutes >= endMin;
  }

  if (activeShift.date < todayStr) {
    if (isOvernightSchedule) {
      const yesterdayStr = addDaysToYmd(todayStr, -1);
      if (activeShift.date === yesterdayStr) {
        return nowMinutes >= endMin;
      }
      return true;
    }
    return true;
  }

  return false;
}

export interface ShiftGateEvaluation {
  todayStr: string;
  nowMinutes: number;
  isExemptToday: boolean;
  activeShift: AttendanceRecord | undefined;
  isStartGateDue: boolean;
  isEndGateDue: boolean;
}

export function evaluateShiftGateState(params: {
  currentUser: StaffMember;
  attendance: AttendanceRecord[];
  nowDate?: Date;
  shiftStartSnoozeUntil?: number | null;
  shiftEndSnoozeUntil?: number | null;
  waitForCloudAttendance?: boolean;
  completedShiftDateForUser?: string | null;
}): ShiftGateEvaluation {
  const {
    currentUser,
    attendance,
    nowDate = new Date(),
    shiftStartSnoozeUntil = null,
    shiftEndSnoozeUntil = null,
    waitForCloudAttendance = false,
    completedShiftDateForUser = null
  } = params;

  const nowMs = nowDate.getTime();
  const cairo = getCairoNowParts(nowDate);
  const todayStr = cairo.dateStr;
  const nowMinutes = cairo.hour * 60 + cairo.minute;
  const isExemptToday =
    currentUser.role === 'admin' || isStaffExemptFromAttendanceOnDate(currentUser, todayStr);

  const userRecords = attendance.filter(r => r.userId === currentUser.id);
  const activeShift =
    userRecords.find(r => r.status === 'active' && r.date === todayStr) ||
    userRecords.find(r => r.status === 'active');

  if (isExemptToday) {
    return {
      todayStr,
      nowMinutes,
      isExemptToday: true,
      activeShift,
      isStartGateDue: false,
      isEndGateDue: false
    };
  }

  const startMin = currentUser.shiftStartTime
    ? parseAppointmentMinutes24(currentUser.shiftStartTime)
    : null;
  const endMin = currentUser.shiftEndTime
    ? parseAppointmentMinutes24(currentUser.shiftEndTime)
    : null;

  const todayRecords = userRecords.filter(r => r.date === todayStr);
  const hasAnyShiftRecordToday =
    todayRecords.length > 0 || completedShiftDateForUser === todayStr;

  // Never show the Green Start Gate if:
  // - user already has an active shift (today or unclosed previous day)
  // - user already started or completed a shift for todayStr
  // - cloud attendance snapshot is still loading on startup (prevents flashing green after red)
  // - start time hasn't arrived yet or is snoozed
  const isStartGateDue =
    !waitForCloudAttendance &&
    !activeShift &&
    !hasAnyShiftRecordToday &&
    startMin !== null &&
    nowMinutes >= startMin &&
    !(shiftStartSnoozeUntil && nowMs < shiftStartSnoozeUntil);

  const isEndGateDue =
    !isStartGateDue &&
    Boolean(activeShift) &&
    isActiveShiftEndDue(activeShift!, todayStr, nowMinutes, startMin, endMin) &&
    !(shiftEndSnoozeUntil && nowMs < shiftEndSnoozeUntil);

  return {
    todayStr,
    nowMinutes,
    isExemptToday: false,
    activeShift,
    isStartGateDue,
    isEndGateDue
  };
}

export const SHIFT_REMINDER_INTERVAL_MINUTES = 5;

export interface StaffShiftReminderAlert {
  id: string;
  type: 'shift_start' | 'shift_end';
  scheduledTime: string;
  title: string;
  message: string;
  unitId?: string;
  unitName?: string;
  reminderStep: number;
  overdueMinutes: number;
}

export function getDueStaffShiftAlerts(
  currentUser: StaffMember,
  attendance: AttendanceRecord[],
  settings: StaffAlertSettings,
  nowDate: Date = new Date(),
  units?: ClinicUnit[],
  weekdaySettings?: WeekdaySetting[]
): StaffShiftReminderAlert[] {
  if (settings.shiftReminderEnabled === false) return [];
  if (!isStaffTargetedForAlert(currentUser.id, settings.shiftTargetMode, settings.shiftTargetStaffIds)) {
    return [];
  }
  const cairo = getCairoNowParts(nowDate);
  if (isStaffExemptFromAttendanceOnDate(currentUser, cairo.dateStr)) {
    return [];
  }
  const startStr = currentUser.shiftStartTime;
  const endStr = currentUser.shiftEndTime;
  if (!startStr && !endStr) return [];

  const nowMinutes = cairo.hour * 60 + cairo.minute;
  const startMin = startStr ? parseAppointmentMinutes24(startStr) : null;
  const endMin = endStr ? parseAppointmentMinutes24(endStr) : null;

  const userRecords = attendance.filter(r => r.userId === currentUser.id);
  const todayRecords = userRecords.filter(r => r.date === cairo.dateStr);
  const activeRecord =
    userRecords.find(r => r.status === 'active' && r.date === cairo.dateStr) ||
    userRecords.find(r => r.status === 'active');

  const due: StaffShiftReminderAlert[] = [];

  if (startStr && !activeRecord && todayRecords.length === 0) {
    if (startMin !== null && nowMinutes >= startMin) {
      const overdueMinutes = Math.max(0, nowMinutes - startMin);
      const reminderStep = Math.floor(overdueMinutes / SHIFT_REMINDER_INTERVAL_MINUTES);
      const defaultUnit =
        units && weekdaySettings
          ? resolveEmployeeDefaultUnitForToday(currentUser, units, weekdaySettings, nowDate)
          : undefined;
      due.push({
        id: `shift_start_${currentUser.id}_${cairo.dateStr}`,
        type: 'shift_start',
        scheduledTime: startStr,
        title: 'تذكير بدء الشفت',
        message: `${formatCairoTime(startStr)}${overdueMinutes >= 5 ? ` · متأخر ${overdueMinutes} د` : ''}${defaultUnit?.name ? ` · ${defaultUnit.name}` : ''}`,
        unitId: defaultUnit?.id,
        unitName: defaultUnit?.name,
        reminderStep,
        overdueMinutes
      });
    }
  }

  if (endStr && activeRecord) {
    if (isActiveShiftEndDue(activeRecord, cairo.dateStr, nowMinutes, startMin, endMin)) {
      const rawOverdue =
        endMin !== null
          ? activeRecord.date === cairo.dateStr
            ? Math.max(0, nowMinutes - endMin)
            : Math.max(0, nowMinutes + 1440 - endMin)
          : 0;
      const reminderStep = Math.floor(rawOverdue / SHIFT_REMINDER_INTERVAL_MINUTES);
      due.push({
        id: `shift_end_${currentUser.id}_${activeRecord.date}`,
        type: 'shift_end',
        scheduledTime: endStr,
        title: 'تذكير إنهاء الشفت',
        message: `${formatCairoTime(endStr)}${rawOverdue >= 5 ? ` · بعد الموعد بـ ${rawOverdue} د` : ''}${activeRecord.unitName ? ` · ${activeRecord.unitName}` : ''}`,
        unitId: activeRecord.unitId,
        unitName: activeRecord.unitName,
        reminderStep,
        overdueMinutes: rawOverdue
      });
    }
  }

  return due;
}

export function getDueStaffAppointmentAlerts(
  appointments: Appointment[],
  settings: StaffAlertSettings,
  currentUser: StaffMember,
  nowDate: Date = new Date()
): Appointment[] {
  if (!settings.appointmentFollowUpEnabled) return [];
  if (
    !isStaffTargetedForAlert(
      currentUser.id,
      settings.appointmentTargetMode,
      settings.appointmentTargetStaffIds
    )
  ) {
    return [];
  }

  const cairo = getCairoNowParts(nowDate);
  const nowMinutes = cairo.hour * 60 + cairo.minute;
  const delayMinutes = Math.max(0, Number(settings.appointmentDelayMinutes) || 0);

  return appointments
    .filter(appt => {
      if (appt.date !== cairo.dateStr) return false;
      if (
        appt.status === 'cancelled' ||
        appt.status === 'no_show' ||
        appt.status === 'arrived' ||
        appt.status === 'completed'
      ) {
        return false;
      }
      if (currentUser.permissions?.appointmentsOwnOnly) {
        if (!currentUser.doctorId || appt.doctorId !== currentUser.doctorId) return false;
      }

      const startMin = parseAppointmentMinutes24(appt.time);
      if (startMin === null) return false;
      return nowMinutes >= startMin + delayMinutes;
    })
    .sort((a, b) => {
      const aMin = parseAppointmentMinutes24(a.time) ?? 0;
      const bMin = parseAppointmentMinutes24(b.time) ?? 0;
      return aMin - bMin;
    });
}

