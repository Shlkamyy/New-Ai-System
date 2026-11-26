import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Clock,
  MapPin,
  AlertCircle,
  Plus,
  Calendar as CalendarIcon,
  User,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  LogIn,
  LogOut,
  Pencil,
  CheckCircle2,
  X,
  Trash2,
  RefreshCw,
  CloudOff
} from 'lucide-react';
import { getTodayDateString } from '../data/mockData';
import { addDaysToYmd, formatCairoTime, getArabicWeekdayName, verifyUnitGeofence, getCairoNowParts, CLINIC_ATTENDANCE_RADIUS_METERS } from '../utils/arabic';
import { AttendanceRecord, StaffMember } from '../types/clinic';
import { calculateShiftVariance, DAY_OFF_UNIT_ID, isMidnightAutoEndedAttendance } from '../utils/staffAlerts';

export const AttendanceView: React.FC = () => {
  const {
    attendance,
    clockIn,
    clockOut,
    editAttendanceRecord,
    deleteAttendanceRecord,
    pendingAttendanceIds,
    attendanceSyncErrors,
    retryAttendanceSync,
    refreshAttendanceFromServer,
    editingAttendanceId,
    clearEditingAttendanceId,
    staffAlertLogs,
    currentUser,
    staffMembers,
    hasPermission,
    units,
    weekdaySettings,
    isUnitAllowed,
    restrictedUnit,
    logAuditAction
  } = useClinic();

  const isAdmin = currentUser.role === 'admin';
  const activeUnits = useMemo(
    () => units.filter(u => !u.isDisabled && isUnitAllowed(u.id, u.name)),
    [units, isUnitAllowed]
  );
  const selectableUnits = activeUnits.length > 0 ? activeUnits : units.filter(u => isUnitAllowed(u.id, u.name));
  const activeStaff = staffMembers.filter(s => !s.isDisabled);
  const scopedActiveStaff = useMemo(
    () =>
      activeStaff.filter(
        s => !restrictedUnit || !s.restrictedBranchId || s.restrictedBranchId === restrictedUnit.id
      ),
    [activeStaff, restrictedUnit]
  );

  const todayStr = getTodayDateString();
  const todayWeekday = getCairoNowParts().weekday;

  const isClinicClosedToday = Boolean(weekdaySettings.find(w => w.dayOfWeek === todayWeekday)?.isClosed);
  const isGrantedLeaveToday = Boolean(currentUser.attendanceExemptDates?.includes(todayStr));
  const isWeeklyOffToday = currentUser.defaultUnitByDay?.[todayWeekday] === DAY_OFF_UNIT_ID;
  const isScheduledDayOffToday =
    isGrantedLeaveToday ||
    isWeeklyOffToday ||
    isClinicClosedToday;
  const closedWeekdaySet = useMemo(
    () => new Set(weekdaySettings.filter(w => w.isClosed).map(w => w.dayOfWeek)),
    [weekdaySettings]
  );
  const resolvedDefaultUnitId = useMemo(() => {
    const staffDayUnit = currentUser.defaultUnitByDay?.[todayWeekday];
    if (staffDayUnit === DAY_OFF_UNIT_ID) return selectableUnits[0]?.id || 'unit_1';
    if (staffDayUnit && selectableUnits.some(u => u.id === staffDayUnit)) return staffDayUnit;
    const weekdayUnit = weekdaySettings.find(w => w.dayOfWeek === todayWeekday)?.defaultUnitId;
    if (weekdayUnit && selectableUnits.some(u => u.id === weekdayUnit)) return weekdayUnit;
    return selectableUnits[0]?.id || 'unit_1';
  }, [currentUser.defaultUnitByDay, todayWeekday, weekdaySettings, selectableUnits]);

  const [selectedUnitId, setSelectedUnitId] = useState(resolvedDefaultUnitId);
  useEffect(() => {
    if (resolvedDefaultUnitId && (!selectedUnitId || !selectableUnits.some(u => u.id === selectedUnitId))) {
      setSelectedUnitId(resolvedDefaultUnitId);
    }
  }, [resolvedDefaultUnitId, selectableUnits, selectedUnitId]);

  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftMsg, setShiftMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [syncActionBusy, setSyncActionBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);

  const [showManualModal, setShowManualModal] = useState(false);

  // Admin Edit Shift Modal State
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editUnitId, setEditUnitId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'completed'>('completed');
  const [editReason, setEditReason] = useState('');

  // Interactive Attendance Report Calendar State (Admin only)
  const [selectedReportDate, setSelectedReportDate] = useState(todayStr);
  const [initY, initM] = todayStr.split('-').map(Number);
  const [calYear, setCalYear] = useState(initY);
  const [calMonth, setCalMonth] = useState(initM - 1);
  const shiftDetailRef = useRef<HTMLDivElement>(null);

  // Manual Punch Form State (Admin exception)
  const [manualUserId, setManualUserId] = useState(activeStaff[0]?.id || '');
  const [manualUnitId, setManualUnitId] = useState(selectableUnits[0]?.id || 'unit_1');
  const [manualDate, setManualDate] = useState(todayStr);
  const [manualTime, setManualTime] = useState(() => getCairoNowParts().timeStr);
  const [manualReason, setManualReason] = useState('');
  const [manualFormError, setManualFormError] = useState('');
  const [confirmDeleteShiftId, setConfirmDeleteShiftId] = useState<string | null>(null);

  // Check if current user has an active shift (prevent opening two shifts at once)
  const currentActiveShift = attendance.find(
    a => a.userId === currentUser.id && a.status === 'active'
  );

  // Strict 50m geofence verification using branch latitude/longitude
  const verifyBranchGPS = async (
    targetUnitId: string,
    action: 'shift_start' | 'shift_end'
  ): Promise<boolean> => {
    const unit = units.find(u => u.id === targetUnitId);
    const res = await verifyUnitGeofence(unit);
    if (!res.ok) {
      const msg = res.error || 'تعذر التحقق من موقع العيادة (GPS)';
      setShiftMsg({ type: 'error', text: msg });
      const maxMeters = res.maxRadiusMeters ?? CLINIC_ATTENDANCE_RADIUS_METERS;
      const distanceNote =
        typeof res.distanceMeters === 'number'
          ? ` (المسافة الفعلية: ${res.distanceMeters} متر — الحد المسموح: ${maxMeters} متر)`
          : '';
      const actionLabel = action === 'shift_start' ? 'تسجيل الحضور' : 'تسجيل الانصراف';
      logAuditAction(
        'status_change',
        'attendance',
        `failed_${action === 'shift_start' ? 'clockin' : 'clockout'}_${currentUser.id}_${Date.now()}`,
        currentUser.name,
        `محاولة فاشلة ل${actionLabel} (${currentUser.name}) من صفحة الحضور والانصراف: ${msg}${distanceNote}`,
        undefined,
        {
          unitId: unit?.id || targetUnitId,
          unitName: unit?.name || '',
          reason: msg,
          ...(typeof res.distanceMeters === 'number'
            ? { distanceMeters: res.distanceMeters, allowedRadiusMeters: maxMeters }
            : {})
        },
        'attendance'
      );
      return false;
    }
    return true;
  };

  const handleClockIn = async () => {
    const targetUnit = selectedUnitId || resolvedDefaultUnitId;
    if (!targetUnit) return;
    if (currentActiveShift) {
      setShiftMsg({ type: 'error', text: 'لديك شفت مفتوح بالفعل، يجب إنهاء الشفت الحالي أولاً.' });
      return;
    }
    setShiftMsg(null);
    setShiftBusy(true);
    const ok = await verifyBranchGPS(targetUnit, 'shift_start');
    setShiftBusy(false);
    if (!ok) return;
    const res = clockIn(targetUnit);
    if (!res.success) {
      setShiftMsg({ type: 'error', text: res.error || 'تعذر بدء الشفت' });
      return;
    }
    const uName = units.find(u => u.id === targetUnit)?.name || '';
    const syncRes = res.syncPromise ? await res.syncPromise : { syncedToCloud: true, queuedOffline: false };
    if (syncRes.permanentError) {
      setShiftMsg({
        type: 'error',
        text: `تم تسجيل بدء الشفت محلياً ولكن فشلت المزامنة للإدارة: ${syncRes.permanentError}`
      });
      return;
    }
    setShiftMsg({
      type: 'success',
      text: syncRes.queuedOffline
        ? `تم حفظ بدء الشفت محلياً (${uName}) بدون اتصال — سيتم إرساله للإدارة تلقائياً فور عودة الإنترنت`
        : `تم بدء الشفت بنجاح ومزامنته للإدارة (${uName})`
    });
  };

  const handleClockOut = async () => {
    if (!currentActiveShift) return;
    setShiftMsg(null);
    setShiftBusy(true);
    const ok = await verifyBranchGPS(currentActiveShift.unitId, 'shift_end');
    setShiftBusy(false);
    if (!ok) return;
    const outRes = clockOut(currentActiveShift.id);
    if (!outRes.success) {
      setShiftMsg({ type: 'error', text: outRes.error || 'تعذر إنهاء الشفت' });
      return;
    }
    const syncRes = outRes.syncPromise ? await outRes.syncPromise : { syncedToCloud: true, queuedOffline: false };
    if (syncRes.permanentError) {
      setShiftMsg({
        type: 'error',
        text: `تم تسجيل إنهاء الشفت محلياً ولكن فشلت المزامنة للإدارة: ${syncRes.permanentError}`
      });
      return;
    }
    setShiftMsg({
      type: 'success',
      text: syncRes.queuedOffline
        ? 'تم حفظ إنهاء الشفت محلياً بدون اتصال — سيتم إرساله للإدارة تلقائياً فور عودة الإنترنت'
        : 'تم إنهاء الشفت بنجاح ومزامنته للإدارة'
    });
  };

  const handleRetryAttendanceSync = async () => {
    if (syncActionBusy) return;
    setSyncActionBusy(true);
    try {
      const res = await retryAttendanceSync();
      if (res.success && res.failedCount === 0) {
        setShiftMsg({
          type: 'success',
          text:
            res.syncedCount > 0
              ? `تمت مزامنة ${res.syncedCount} سجل حضور بنجاح مع السحابة.`
              : 'جميع سجلات الحضور متزامنة حالياً.'
        });
      } else if (res.error) {
        setShiftMsg({ type: 'error', text: res.error });
      }
    } finally {
      setSyncActionBusy(false);
    }
  };

  const handleAdminRefreshFromServer = async () => {
    if (refreshBusy) return;
    setRefreshBusy(true);
    try {
      await refreshAttendanceFromServer(true);
    } finally {
      setRefreshBusy(false);
    }
  };

  const openEditShiftModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEditUnitId(rec.unitId);
    setEditDate(rec.date);
    setEditClockIn(rec.clockIn);
    setEditClockOut(rec.clockOut || '');
    setEditStatus(rec.status);
    setEditReason(isMidnightAutoEndedAttendance(rec) ? '' : rec.manualReason || '');
  };

  useEffect(() => {
    if (!editingAttendanceId || !isAdmin) return;
    const target = attendance.find(a => a.id === editingAttendanceId);
    if (!target) return;
    const [ty, tm] = target.date.split('-').map(Number);
    if (ty && tm) {
      setCalYear(ty);
      setCalMonth(tm - 1);
    }
    setSelectedReportDate(target.date);
    openEditShiftModal(target);
    clearEditingAttendanceId();
    window.setTimeout(() => {
      shiftDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }, [editingAttendanceId, isAdmin, attendance]);

  const adminActiveShifts = useMemo(() => {
    if (!isAdmin) return [];
    const existingStaffIds = new Set(staffMembers.map(s => s.id));
    return attendance.filter(
      a => a.status === 'active' && existingStaffIds.has(a.userId) && isUnitAllowed(a.unitId, a.unitName)
    );
  }, [isAdmin, attendance, staffMembers, isUnitAllowed]);

  const midnightAutoEndedAwaitingAdmin = useMemo(() => {
    if (!isAdmin) return [];
    const activeStaffIds = new Set(staffMembers.filter(s => !s.isDisabled).map(s => s.id));
    const resolvedIds = new Set(
      staffAlertLogs
        .filter(
          l =>
            l.status !== 'active' &&
            typeof l.targetKey === 'string' &&
            l.targetKey.startsWith('shift_auto_end_')
        )
        .map(l => l.targetKey.slice('shift_auto_end_'.length))
    );
    return attendance.filter(
      a =>
        activeStaffIds.has(a.userId) &&
        isUnitAllowed(a.unitId, a.unitName) &&
        isMidnightAutoEndedAttendance(a) &&
        !resolvedIds.has(a.id)
    );
  }, [isAdmin, attendance, staffAlertLogs, staffMembers, isUnitAllowed]);

  const handleSaveShiftEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const resolvedUnit = units.find(u => u.id === editUnitId);
    const defaultReason = isMidnightAutoEndedAttendance(editingRecord)
      ? 'تم تحديد وقت الانصراف الفعلي إدارياً بعد الإغلاق التلقائي منتصف الليل'
      : 'تعديل إداري لبيانات الشفت';
    editAttendanceRecord(editingRecord.id, {
      unitId: editUnitId,
      unitName: resolvedUnit ? resolvedUnit.name : editingRecord.unitName,
      date: editDate || editingRecord.date,
      clockIn: editClockIn || editingRecord.clockIn,
      clockOut: editStatus === 'completed' ? editClockOut || undefined : undefined,
      status: editStatus,
      manualReason: editReason.trim() || defaultReason
    });
    setEditingRecord(null);
  };

  const stepCalMonth = (delta: number) => {
    const next = new Date(calYear, calMonth + delta, 1);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());
  };

  const getDateDow = (dateStr: string): number | null => {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  };

  const getStaffLeaveReasonForDate = (staff: StaffMember, dateStr: string): string | null => {
    if (Array.isArray(staff.attendanceExemptDates) && staff.attendanceExemptDates.includes(dateStr)) {
      return 'إجازة ممنوحة من الإدارة';
    }
    if (staff.exemptFromAttendance) return null;
    const dow = getDateDow(dateStr);
    const clinicClosed = dow !== null && Boolean(weekdaySettings.find(w => w.dayOfWeek === dow)?.isClosed);
    if (clinicClosed) return 'إجازة رسمية للعيادة';
    if (dow !== null && staff.defaultUnitByDay?.[dow] === DAY_OFF_UNIT_ID) {
      return 'إجازة أسبوعية';
    }
    return null;
  };

  const calendarCells = useMemo(() => {
    if (!isAdmin) return [];
    const firstDay = new Date(calYear, calMonth, 1);
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
    const startIdx = (firstDay.getDay() + 1) % 7; // Saturday start
    const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-`;

    const recordsByDate = new Map<string, AttendanceRecord[]>();
    for (let i = 0; i < attendance.length; i++) {
      const a = attendance[i];
      if (!a.date || !a.date.startsWith(monthPrefix)) continue;
      if (!isUnitAllowed(a.unitId, a.unitName)) continue;
      let list = recordsByDate.get(a.date);
      if (!list) {
        list = [];
        recordsByDate.set(a.date, list);
      }
      list.push(a);
    }

    const cells: Array<{
      day: number | null;
      dateStr: string;
      count: number;
      hasActive: boolean;
      isClinicClosed: boolean;
      dayOffStaffCount: number;
    }> = [];
    for (let i = 0; i < startIdx; i++) {
      cells.push({ day: null, dateStr: '', count: 0, hasActive: false, isClinicClosed: false, dayOffStaffCount: 0 });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${monthPrefix}${String(d).padStart(2, '0')}`;
      const dow = new Date(calYear, calMonth, d, 12, 0, 0).getDay();
      const isClinicClosed = closedWeekdaySet.has(dow);
      const dayRecords = recordsByDate.get(dateStr) || [];
      const clockedUserIds = new Set(dayRecords.map(r => r.userId));
      let dayOffStaffCount = 0;
      for (let i = 0; i < scopedActiveStaff.length; i++) {
        const s = scopedActiveStaff[i];
        if (clockedUserIds.has(s.id)) continue;
        const hasSpecificExempt = Boolean(s.attendanceExemptDates?.includes(dateStr));
        if (hasSpecificExempt) {
          dayOffStaffCount += 1;
          continue;
        }
        if (s.exemptFromAttendance) continue;
        const hasWeeklyOff = s.defaultUnitByDay?.[dow] === DAY_OFF_UNIT_ID;
        if (isClinicClosed || hasWeeklyOff) {
          dayOffStaffCount += 1;
        }
      }
      cells.push({
        day: d,
        dateStr,
        count: dayRecords.length,
        hasActive: dayRecords.some(r => r.status === 'active'),
        isClinicClosed,
        dayOffStaffCount
      });
    }
    return cells;
  }, [isAdmin, calYear, calMonth, attendance, isUnitAllowed, closedWeekdaySet, scopedActiveStaff]);

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric'
  });

  const selectedDateRecords = useMemo(
    () =>
      attendance.filter(
        a => a.date === selectedReportDate && isUnitAllowed(a.unitId, a.unitName)
      ),
    [attendance, selectedReportDate, isUnitAllowed]
  );

  const selectedDateDayOffInfo = useMemo(() => {
    const dow = getDateDow(selectedReportDate);
    const isClinicClosed = dow !== null && Boolean(weekdaySettings.find(w => w.dayOfWeek === dow)?.isClosed);
    const clockedIds = new Set(selectedDateRecords.map(r => r.userId));
    const dayOffList: Array<{ staff: StaffMember; reason: string }> = [];
    for (let i = 0; i < scopedActiveStaff.length; i++) {
      const s = scopedActiveStaff[i];
      if (clockedIds.has(s.id)) continue;
      const reason = getStaffLeaveReasonForDate(s, selectedReportDate);
      if (reason) {
        dayOffList.push({ staff: s, reason });
      }
    }
    return { isClinicClosed, dayOffList };
  }, [selectedReportDate, selectedDateRecords, scopedActiveStaff, weekdaySettings]);

  const personalRecords = useMemo(
    () =>
      isAdmin
        ? []
        : attendance
            .filter(a => a.userId === currentUser.id)
            .sort((a, b) => (b.date + b.clockIn).localeCompare(a.date + a.clockIn)),
    [isAdmin, attendance, currentUser.id]
  );

  const personalEntries = useMemo(() => {
    if (isAdmin) return [];
    const shiftDates = new Set(personalRecords.map(r => r.date));
    const dayOffDates = new Map<string, { reason: string; isGranted: boolean }>();

    // Check explicit exempt/granted leave dates for currentUser
    (currentUser.attendanceExemptDates || []).forEach(d => {
      if (d && !shiftDates.has(d)) {
        dayOffDates.set(d, { reason: 'إجازة ممنوحة من الإدارة', isGranted: true });
      }
    });

    // Check past 30 days (including today) for weekly scheduled day off or closed clinic day
    for (let offset = 0; offset < 30; offset++) {
      const d = addDaysToYmd(todayStr, -offset);
      if (shiftDates.has(d) || dayOffDates.has(d)) continue;
      const reason = getStaffLeaveReasonForDate(currentUser, d);
      if (reason) {
        dayOffDates.set(d, { reason, isGranted: false });
      }
    }

    const entries: Array<
      | { kind: 'shift'; sortKey: string; record: AttendanceRecord }
      | { kind: 'leave'; sortKey: string; date: string; reason: string; isGranted: boolean }
    > = personalRecords.map(r => ({
      kind: 'shift',
      sortKey: `${r.date} ${r.clockIn}`,
      record: r
    }));

    dayOffDates.forEach(({ reason, isGranted }, date) => {
      entries.push({
        kind: 'leave',
        sortKey: `${date} 00:00`,
        date,
        reason,
        isGranted
      });
    });

    return entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [isAdmin, personalRecords, currentUser, todayStr, weekdaySettings]);

  const personalCalendarCells = useMemo(() => {
    if (isAdmin) return [];
    const firstDay = new Date(calYear, calMonth, 1);
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
    const startIdx = (firstDay.getDay() + 1) % 7; // Saturday start
    const shiftByDate = new Map<string, AttendanceRecord>();
    for (let i = 0; i < personalRecords.length; i++) {
      const rec = personalRecords[i];
      if (!shiftByDate.has(rec.date)) shiftByDate.set(rec.date, rec);
    }
    const exemptSet = new Set(currentUser.attendanceExemptDates || []);
    const cells: Array<{
      day: number | null;
      dateStr: string;
      shift?: AttendanceRecord;
      isClinicClosed: boolean;
      isGrantedLeave: boolean;
      isWeeklyOff: boolean;
    }> = [];
    for (let i = 0; i < startIdx; i++) {
      cells.push({
        day: null,
        dateStr: '',
        isClinicClosed: false,
        isGrantedLeave: false,
        isWeeklyOff: false
      });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(calYear, calMonth, d, 12, 0, 0).getDay();
      const isClinicClosed = closedWeekdaySet.has(dow);
      const isGrantedLeave = exemptSet.has(dateStr);
      const isWeeklyOff = !currentUser.exemptFromAttendance && currentUser.defaultUnitByDay?.[dow] === DAY_OFF_UNIT_ID;
      cells.push({
        day: d,
        dateStr,
        shift: shiftByDate.get(dateStr),
        isClinicClosed,
        isGrantedLeave,
        isWeeklyOff
      });
    }
    return cells;
  }, [calYear, calMonth, personalRecords, currentUser.attendanceExemptDates, currentUser.exemptFromAttendance, currentUser.defaultUnitByDay, closedWeekdaySet]);

  const personalLeaveCount = useMemo(
    () => personalEntries.filter(e => e.kind === 'leave').length,
    [personalEntries]
  );

  const manualSelectedStaffActiveShift = useMemo(
    () => attendance.find(a => a.userId === manualUserId && a.status === 'active'),
    [attendance, manualUserId]
  );

  const openManualModal = () => {
    setManualFormError('');
    setManualUserId(activeStaff[0]?.id || '');
    setManualUnitId(selectableUnits[0]?.id || 'unit_1');
    setManualDate(getTodayDateString());
    setManualTime(getCairoNowParts().timeStr);
    setManualReason('');
    setShowManualModal(true);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualFormError('');
    if (!manualUserId) {
      setManualFormError('يرجى اختيار الموظف أولاً');
      return;
    }
    if (!manualDate || !manualTime) {
      setManualFormError('يرجى تحديد التاريخ ووقت بدء الشفت');
      return;
    }
    if (!manualReason.trim()) {
      setManualFormError('يرجى توضيح سبب التسجيل اليدوي للتوثيق الإداري');
      return;
    }
    const targetStaff = activeStaff.find(s => s.id === manualUserId);
    const res = clockIn(manualUnitId, true, manualReason.trim(), {
      userId: manualUserId,
      userName: targetStaff?.name,
      date: manualDate,
      clockIn: manualTime
    });
    if (!res.success) {
      setManualFormError(res.error || 'تعذر تسجيل بدء الشفت لهذا الموظف');
      return;
    }
    const [my, mm] = manualDate.split('-').map(Number);
    if (my && mm) {
      setCalYear(my);
      setCalMonth(mm - 1);
    }
    setSelectedReportDate(manualDate);
    setShowManualModal(false);
    setManualReason('');
    const syncRes = res.syncPromise ? await res.syncPromise : { syncedToCloud: true, queuedOffline: false };
    if (syncRes.permanentError) {
      setShiftMsg({
        type: 'error',
        text: `تم تسجيل بدء الشفت يدوياً للموظف (${targetStaff?.name || ''}) محلياً ولكن فشلت المزامنة: ${syncRes.permanentError}`
      });
      return;
    }
    setShiftMsg({
      type: 'success',
      text: syncRes.queuedOffline
        ? `تم تسجيل بدء الشفت يدوياً للموظف (${targetStaff?.name || ''}) بتاريخ ${manualDate} محلياً وسيتم إرساله للسحابة تلقائياً`
        : `تم تسجيل بدء الشفت يدوياً للموظف (${targetStaff?.name || ''}) بتاريخ ${manualDate} الساعة ${formatCairoTime(manualTime)}`
    });
  };

  const pendingAttendanceSet = useMemo(() => new Set(pendingAttendanceIds), [pendingAttendanceIds]);
  const failedSyncEntries = useMemo(() => Object.entries(attendanceSyncErrors), [attendanceSyncErrors]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Header & Shift In/Out Card */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              بدأ الشفت - إنهاء الشفت
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <button
                type="button"
                onClick={handleAdminRefreshFromServer}
                disabled={refreshBusy}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshBusy ? 'animate-spin' : ''}`} />
                <span>{refreshBusy ? 'جاري التحديث...' : 'تحديث من السحابة'}</span>
              </button>
            )}

            {isAdmin && hasPermission('manualAttendance') && (
              <button
                type="button"
                onClick={openManualModal}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] font-bold text-xs flex items-center gap-1.5 border border-[#bfe2db] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>تسجيل يدوي</span>
              </button>
            )}
          </div>
        </div>

        {(pendingAttendanceIds.length > 0 || failedSyncEntries.length > 0) && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              failedSyncEntries.length > 0
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2">
              <CloudOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                {failedSyncEntries.length > 0 ? (
                  <p>
                    تعذر إرسال {failedSyncEntries.length} سجل حضور للإدارة:{' '}
                    {failedSyncEntries[0]?.[1]}
                  </p>
                ) : (
                  <p>
                    يوجد {pendingAttendanceIds.length} سجل حضور محفوظ محلياً بانتظار المزامنة مع السحابة.
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetryAttendanceSync}
              disabled={syncActionBusy}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-current/20 font-extrabold text-xs flex items-center gap-1.5 self-start sm:self-center cursor-pointer flex-shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncActionBusy ? 'animate-spin' : ''}`} />
              <span>{syncActionBusy ? 'جاري الإرسال...' : 'إعادة محاولة المزامنة'}</span>
            </button>
          </div>
        )}

        {shiftMsg && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
              shiftMsg.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {shiftMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{shiftMsg.text}</span>
          </div>
        )}

        {/* Current User Shift Status Box */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            !currentActiveShift && isClinicClosedToday
              ? 'bg-gradient-to-br from-rose-50/90 to-amber-50/50 border-rose-200'
              : !currentActiveShift && isScheduledDayOffToday
              ? 'bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-200'
              : 'bg-gradient-to-br from-[#f2f9f8] to-[#e4f3f0] border-[#bfe2db]'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                  currentActiveShift
                    ? 'bg-emerald-100 text-emerald-800'
                    : isGrantedLeaveToday
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : isClinicClosedToday
                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                    : isWeeklyOffToday
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {currentActiveShift
                  ? 'الشفت مفتوح الآن'
                  : isGrantedLeaveToday
                  ? 'إجازة اليوم (ممنوحة)'
                  : isClinicClosedToday
                  ? 'إجازة رسمية للعيادة'
                  : isWeeklyOffToday
                  ? 'إجازة أسبوعية'
                  : 'لم يبدأ الشفت'}
              </span>
            </div>
            <p className="text-sm font-extrabold text-[#172f3d]">
              {currentUser.name}
            </p>
            {currentActiveShift ? (
              <p className="text-xs text-slate-600 font-mono">
                بدأ الساعة: {formatCairoTime(currentActiveShift.clockIn)} · {currentActiveShift.unitName}
              </p>
            ) : isScheduledDayOffToday ? (
              <p className={`text-xs font-semibold ${isClinicClosedToday && !isGrantedLeaveToday ? 'text-rose-700' : 'text-amber-800'}`}>
                {isGrantedLeaveToday
                  ? 'تم منحك إجازة حضور لهذا اليوم من الإدارة'
                  : isClinicClosedToday
                  ? 'العيادة مغلقة اليوم كإجازة رسمية أسبوعية'
                  : 'يوم إجازة أسبوعية مجدولة في جدول الحضور'}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {!currentActiveShift ? (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedUnitId}
                  disabled={Boolean(restrictedUnit)}
                  onChange={e => setSelectedUnitId(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-[#bfe2db] bg-white text-xs font-semibold text-slate-800 disabled:bg-slate-50"
                >
                  {selectableUnits.map(u => (
                    <option key={u.id} value={u.id}>{u.name.split('-')[0]}</option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={shiftBusy}
                  onClick={handleClockIn}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-[#087e83]/20 flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                >
                  {shiftBusy ? <MapPin className="w-4 h-4 animate-pulse" /> : <LogIn className="w-4 h-4" />}
                  <span>{shiftBusy ? 'جاري التحقق من الموقع...' : 'بدأ الشفت'}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={shiftBusy}
                onClick={handleClockOut}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-rose-600/20 flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                {shiftBusy ? <MapPin className="w-4 h-4 animate-pulse" /> : <LogOut className="w-4 h-4" />}
                <span>{shiftBusy ? 'جاري التحقق من الموقع...' : 'إنهاء الشفت'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Non-Admin: Personal Calendar & Shift/Leave Records */}
      {!isAdmin && (
        <>
          <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#087e83]" />
                <h2 className="text-base font-extrabold text-[#172f3d]">
                  تقويم شفتاتي وإجازاتي
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepCalMonth(-1)}
                  className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer"
                  title="الشهر السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs sm:text-sm font-extrabold text-[#172f3d] min-w-[115px] text-center">
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => stepCalMonth(1)}
                  className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer"
                  title="الشهر القادم"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const [y, m] = todayStr.split('-').map(Number);
                    setCalYear(y);
                    setCalMonth(m - 1);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-[#e7f5f2] text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>اليوم</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold">
              {[
                { label: 'السبت', dow: 6 },
                { label: 'الأحد', dow: 0 },
                { label: 'الاثنين', dow: 1 },
                { label: 'الثلاثاء', dow: 2 },
                { label: 'الأربعاء', dow: 3 },
                { label: 'الخميس', dow: 4 },
                { label: 'الجمعة', dow: 5 }
              ].map(d => (
                <div
                  key={d.label}
                  className={`py-1 ${closedWeekdaySet.has(d.dow) ? 'text-rose-600 font-extrabold' : 'text-slate-400'}`}
                >
                  {d.label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {personalCalendarCells.map((cell, idx) => {
                if (!cell.day) {
                  return <div key={`pempty-${idx}`} className="min-h-[52px] rounded-xl bg-slate-50/40" />;
                }
                const isToday = cell.dateStr === todayStr;
                const hasShift = Boolean(cell.shift);
                const isPersonalLeave = cell.isGrantedLeave || cell.isWeeklyOff;
                return (
                  <div
                    key={cell.dateStr}
                    className={`min-h-[52px] py-1 px-0.5 rounded-xl border flex flex-col items-center justify-center font-mono text-xs font-bold ${
                      isToday
                        ? 'bg-[#e7f5f2] text-[#087e83] border-2 border-[#087e83]'
                        : cell.isClinicClosed && !hasShift
                        ? 'bg-rose-50/85 border-rose-200 text-rose-800'
                        : isPersonalLeave && !hasShift
                        ? 'bg-amber-50/85 border-amber-200 text-amber-800'
                        : hasShift
                        ? 'bg-emerald-50/70 border-emerald-200 text-[#172f3d]'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{cell.day}</span>
                    {hasShift ? (
                      <span className="text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight bg-emerald-100 text-emerald-800">
                        حضور
                      </span>
                    ) : cell.isGrantedLeave ? (
                      <span className="text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight bg-amber-100 text-amber-800">
                        إجازة
                      </span>
                    ) : cell.isClinicClosed ? (
                      <span className="text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight bg-rose-100 text-rose-700">
                        إجازة
                      </span>
                    ) : cell.isWeeklyOff ? (
                      <span className="text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight bg-amber-100 text-amber-800">
                        إجازة
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
              <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#087e83]" />
                <span>سجل شفتاتي وإجازاتي ({personalRecords.length} شفت · {personalLeaveCount} إجازة)</span>
              </h2>
            </div>

            {personalEntries.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {personalEntries.slice(0, 40).map(entry => {
                  if (entry.kind === 'leave') {
                    return (
                      <div key={`leave-${entry.date}`} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-[#172f3d]">{entry.date}</span>
                            <span className="text-[11px] font-bold text-slate-600">
                              {getArabicWeekdayName(entry.date)}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                entry.isGranted
                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                  : entry.reason.includes('رسمية')
                                  ? 'bg-rose-100 text-rose-700 border-rose-200'
                                  : 'bg-amber-100 text-amber-800 border-amber-200'
                              }`}
                            >
                              {entry.isGranted ? 'إجازة ممنوحة' : 'إجازة'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {entry.reason}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const rec = entry.record;
                  const staff = staffMembers.find(s => s.id === rec.userId || s.name === rec.userName);
                  const variance =
                    rec.status === 'completed'
                      ? calculateShiftVariance(staff?.shiftStartTime, staff?.shiftEndTime, rec.clockIn, rec.clockOut)
                      : null;
                  return (
                    <div key={rec.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[#172f3d]">{rec.date}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rec.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {rec.status === 'active' ? 'شفت نشط' : 'منتهي'}
                          </span>
                          {attendanceSyncErrors[rec.id] ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                              فشل المزامنة
                            </span>
                          ) : pendingAttendanceSet.has(rec.id) ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              محلي — بانتظار المزامنة
                            </span>
                          ) : null}
                          {variance && (
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                variance.status === 'overtime'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : variance.status === 'deficit'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {variance.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {rec.unitName} · بدء: {formatCairoTime(rec.clockIn)} {rec.clockOut ? `· إنهاء: ${formatCairoTime(rec.clockOut)}` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                لا توجد شفتات مسجلة لحسابك حتى الآن
              </div>
            )}
          </div>
        </>
      )}

      {/* 3. Admin Only: Active Shifts + Midnight Auto-End Alerts + Calendar & All-Staff Detail */}
      {isAdmin && (
        <>
          {midnightAutoEndedAwaitingAdmin.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  شفتات انتهت تلقائياً عند ١٢ منتصف الليل ({midnightAutoEndedAwaitingAdmin.length}) — يرجى تحديد ساعة الانصراف الفعلية
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {midnightAutoEndedAwaitingAdmin.map(rec => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-2xl bg-white border border-amber-200 flex items-center justify-between gap-2 flex-wrap"
                  >
                    <div>
                      <div className="text-xs font-extrabold text-[#172f3d]">{rec.userName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {rec.date} · {rec.unitName} · بدء: {formatCairoTime(rec.clockIn)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const [ry, rm] = rec.date.split('-').map(Number);
                        if (ry && rm) {
                          setCalYear(ry);
                          setCalMonth(rm - 1);
                        }
                        setSelectedReportDate(rec.date);
                        openEditShiftModal(rec);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تحديد وقت الانصراف الفعلي</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adminActiveShifts.length > 0 && (
            <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-extrabold text-[#172f3d]">
                    الشفتات النشطة حالياً على رأس العمل ({adminActiveShifts.length})
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {adminActiveShifts.map(rec => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-[#172f3d] truncate">{rec.userName}</div>
                      <div className="text-[11px] text-slate-600 font-mono truncate">
                        {rec.unitName} · {rec.date} · {formatCairoTime(rec.clockIn)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const [ry, rm] = rec.date.split('-').map(Number);
                        if (ry && rm) {
                          setCalYear(ry);
                          setCalMonth(rm - 1);
                        }
                        setSelectedReportDate(rec.date);
                        openEditShiftModal(rec);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-100 font-bold text-[11px] flex-shrink-0 cursor-pointer"
                    >
                      إدارة
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#087e83]" />
                <h2 className="text-base font-extrabold text-[#172f3d]">
                  تقويم تقارير الشفتات والحضور
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepCalMonth(-1)}
                  className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer"
                  title="الشهر السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs sm:text-sm font-extrabold text-[#172f3d] min-w-[115px] text-center">
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => stepCalMonth(1)}
                  className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer"
                  title="الشهر القادم"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {selectedReportDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = todayStr.split('-').map(Number);
                      setCalYear(y);
                      setCalMonth(m - 1);
                      setSelectedReportDate(todayStr);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-[#e7f5f2] text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>اليوم</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold">
              {[
                { label: 'السبت', dow: 6 },
                { label: 'الأحد', dow: 0 },
                { label: 'الاثنين', dow: 1 },
                { label: 'الثلاثاء', dow: 2 },
                { label: 'الأربعاء', dow: 3 },
                { label: 'الخميس', dow: 4 },
                { label: 'الجمعة', dow: 5 }
              ].map(d => (
                <div
                  key={d.label}
                  className={`py-1 ${closedWeekdaySet.has(d.dow) ? 'text-rose-600 font-extrabold' : 'text-slate-400'}`}
                >
                  {d.label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                if (!cell.day) {
                  return <div key={`empty-${idx}`} className="min-h-[54px] rounded-xl bg-slate-50/40" />;
                }
                const isSelected = cell.dateStr === selectedReportDate;
                const isToday = cell.dateStr === todayStr;
                const showLeaveBadge = cell.isClinicClosed || cell.dayOffStaffCount > 0;
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedReportDate(cell.dateStr);
                      shiftDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}
                    className={`min-h-[54px] py-1 px-0.5 rounded-xl border flex flex-col items-center justify-center relative font-mono text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#087e83] text-white border-[#087e83] shadow-sm'
                        : isToday
                        ? 'bg-[#e7f5f2] text-[#087e83] border-[#087e83]'
                        : cell.isClinicClosed
                        ? 'bg-rose-50/85 border-rose-200 hover:bg-rose-100/75 text-rose-800'
                        : 'bg-white border-slate-200 hover:bg-[#f0f6f5] text-slate-700'
                    }`}
                  >
                    <span>{cell.day}</span>
                    {cell.count > 0 && (
                      <span
                        className={`text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight ${
                          isSelected
                            ? 'bg-white/25 text-white'
                            : cell.hasActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-[#e7f5f2] text-[#087e83]'
                        }`}
                      >
                        {cell.count} شفت
                      </span>
                    )}
                    {showLeaveBadge && (
                      <span
                        className={`text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight ${
                          isSelected
                            ? cell.isClinicClosed
                              ? 'bg-rose-400/35 text-white'
                              : 'bg-amber-300/30 text-white'
                            : cell.isClinicClosed
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cell.isClinicClosed
                          ? 'إجازة'
                          : cell.count === 0
                          ? 'إجازة'
                          : `${cell.dayOffStaffCount} إجازة`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Admin Attendance Shift Detail Card Directly Below the Report Calendar */}
          <div
            ref={shiftDetailRef}
            className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
              <h2 className="text-base font-extrabold text-[#172f3d]">
                تفاصيل شفتات يوم <span className="font-mono text-[#087e83]">{selectedReportDate}</span> ({selectedDateRecords.length})
              </h2>
              <span className="text-xs text-slate-400">
                سجل بدء وإنهاء الشفت التفصيلي للطاقم
              </span>
            </div>

            {selectedDateRecords.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {selectedDateRecords.map(rec => {
                  const staff = staffMembers.find(s => s.id === rec.userId || s.name === rec.userName);
                  const variance =
                    rec.status === 'completed'
                      ? calculateShiftVariance(staff?.shiftStartTime, staff?.shiftEndTime, rec.clockIn, rec.clockOut)
                      : null;
                  return (
                  <div key={rec.id} className="py-3.5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                        <User className="w-5 h-5 text-[#087e83]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[#172f3d]">{rec.userName}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rec.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {rec.status === 'active' ? 'على رأس العمل' : 'اكتمل الشفت'}
                          </span>
                          {attendanceSyncErrors[rec.id] ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                              فشل المزامنة
                            </span>
                          ) : pendingAttendanceSet.has(rec.id) ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              محلي — بانتظار المزامنة
                            </span>
                          ) : null}
                          {variance && (
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                variance.status === 'overtime'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : variance.status === 'deficit'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {variance.label}
                            </span>
                          )}
                          {rec.isManual && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                              استثناء يدوي
                            </span>
                          )}
                          {isMidnightAutoEndedAttendance(rec) && (
                            <span className="text-[10px] bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full font-bold">
                              إنهاء تلقائي ١٢ ص — بانتظار تعديل الإدارة
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {rec.unitName} · بدء: {formatCairoTime(rec.clockIn)} {rec.clockOut ? `· إنهاء: ${formatCairoTime(rec.clockOut)}` : ''}
                          {staff?.shiftStartTime && staff?.shiftEndTime
                            ? ` (المقرر: ${formatCairoTime(staff.shiftStartTime)} - ${formatCairoTime(staff.shiftEndTime)})`
                            : ''}
                        </div>
                        {rec.manualReason && (
                          <p className="text-[11px] text-amber-700 italic mt-0.5">
                            السبب: "{rec.manualReason}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteShiftId(null);
                          openEditShiftModal(rec);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-700 hover:bg-blue-100 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>تعديل الشفت</span>
                      </button>
                      {rec.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteShiftId(null);
                            clockOut(rec.id);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 hover:bg-amber-100 font-bold cursor-pointer"
                        >
                          إنهاء إداري
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirmDeleteShiftId !== rec.id) {
                            setConfirmDeleteShiftId(rec.id);
                            return;
                          }
                          deleteAttendanceRecord(rec.id);
                          setConfirmDeleteShiftId(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          confirmDeleteShiftId === rec.id
                            ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
                            : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{confirmDeleteShiftId === rec.id ? 'تأكيد الحذف' : 'حذف الشفت'}</span>
                      </button>
                    </div>
                  </div>
                );
                })}
              </div>
            ) : selectedDateDayOffInfo.isClinicClosed || selectedDateDayOffInfo.dayOffList.length > 0 ? null : (
              <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                لا توجد شفتات مسجلة في هذا اليوم ({selectedReportDate})
              </div>
            )}

            {(selectedDateDayOffInfo.isClinicClosed || selectedDateDayOffInfo.dayOffList.length > 0) && (
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-amber-800 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">
                      اجازة
                    </span>
                    <span>
                      {selectedDateDayOffInfo.isClinicClosed
                        ? `يوم اجازة رسمية للعيادة (${getArabicWeekdayName(selectedReportDate)})`
                        : `الموظفون في اجازة (${selectedDateDayOffInfo.dayOffList.length})`}
                    </span>
                  </span>
                </div>

                {selectedDateDayOffInfo.dayOffList.length > 0 && (
                  <div className="divide-y divide-slate-100 rounded-2xl border border-amber-200/80 bg-amber-50/40 px-3">
                    {selectedDateDayOffInfo.dayOffList.map(({ staff, reason }) => (
                      <div key={`off-${staff.id}`} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs sm:text-sm text-[#172f3d]">{staff.name}</span>
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                اجازة
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 block">{reason}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Manual Exception Modal */}
      {showManualModal && isAdmin && (
        <div
          onClick={() => setShowManualModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">
                تسجيل استثناء شفت يدوي (صلاحية الإدارة)
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} noValidate className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">الموظف</label>
                <select
                  value={manualUserId}
                  onChange={e => {
                    setManualUserId(e.target.value);
                    setManualFormError('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
                >
                  {activeStaff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.jobTitle})
                    </option>
                  ))}
                </select>
                {manualSelectedStaffActiveShift && (
                  <div className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      تنبيه: هذا الموظف لديه شفت مفتوح حالياً ({manualSelectedStaffActiveShift.date} · {formatCairoTime(manualSelectedStaffActiveShift.clockIn)}) ويجب إنهاؤه أولاً.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">الوحدة / الفرع</label>
                <select
                  value={manualUnitId}
                  onChange={e => setManualUnitId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
                >
                  {selectableUnits.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">التاريخ</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">وقت البدء</label>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={e => setManualTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  سبب الاستثناء اليدوي (إلزامي للتدقيق والرقابة) *
                </label>
                <textarea
                  value={manualReason}
                  onChange={e => {
                    setManualReason(e.target.value);
                    setManualFormError('');
                  }}
                  placeholder="مثال: عطل في إشارة GPS / انقطاع شبكة الهاتف / تكليف خارجي..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs min-h-[70px]"
                  required
                />
              </div>

              {manualFormError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{manualFormError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-[#087e83] hover:bg-[#06686c] text-white rounded-xl font-bold cursor-pointer"
              >
                اعتماد وتوثيق بدء الشفت اليدوي
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Shift Modal */}
      {editingRecord && isAdmin && (
        <div
          onClick={() => setEditingRecord(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-[#172f3d]">تعديل بيانات الشفت</h3>
                <p className="text-[11px] text-slate-500">{editingRecord.userName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveShiftEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">الفرع / الوحدة</label>
                <select
                  value={editUnitId}
                  onChange={e => setEditUnitId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
                >
                  {selectableUnits.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">التاريخ</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">الحالة</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as 'active' | 'completed')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    <option value="active">على رأس العمل (نشط)</option>
                    <option value="completed">اكتمل الشفت</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">وقت بدء الشفت</label>
                  <input
                    type="time"
                    value={editClockIn}
                    onChange={e => setEditClockIn(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">وقت إنهاء الشفت</label>
                  <input
                    type="time"
                    disabled={editStatus === 'active'}
                    value={editClockOut}
                    onChange={e => setEditClockOut(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">ملاحظة التعديل الإداري</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder="سبب تعديل التوقيت أو الفرع..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold cursor-pointer"
                >
                  حفظ تعديل الشفت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
