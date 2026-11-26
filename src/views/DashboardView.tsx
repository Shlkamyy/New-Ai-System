import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  Phone,
  ArrowLeft,
  FileText,
  CreditCard,
  MessageCircle,
  Sparkles,
  X,
  RotateCcw,
  MoreVertical,
  Tag,
  Pencil,
  Trash2,
  MapPin,
  LogIn,
  LogOut,
  Check,
  StickyNote
} from 'lucide-react';
import { parseTimeTo12h, verifyUnitGeofence, getCairoNowParts, CLINIC_ATTENDANCE_RADIUS_METERS } from '../utils/arabic';
import { Appointment, AppointmentStatus } from '../types/clinic';
import { AnalogTimePickerModal } from '../components/AnalogTimePickerModal';
import { AddPatientNoteModal } from '../components/AddPatientNoteModal';
import { ColoredSelect, ColoredSelectOption } from '../components/ColoredSelect';
import { DashboardTasksCard } from '../components/DashboardTasksCard';
import {
  APPOINTMENT_STATUS_COLOR_HEX,
  getCustomColorActiveStyle,
  getCustomColorBadgeStyle,
  getFollowUpStatusColorHex
} from '../utils/colors';
import {
  computeFeedbackTaskProgress,
  doesTaskOccurOnDate,
  getTaskCompletionForDate,
  isFeedbackTaskTitle
} from '../utils/feedback';
import { DAY_OFF_UNIT_ID, isMidnightAutoEndedAttendance } from '../utils/staffAlerts';

export const DashboardView: React.FC = () => {
  const {
    currentDate,
    cairoTodayStr,
    setCurrentDate,
    resetToToday,
    stepDate,
    appointments,
    updateAppointment,
    updateAppointmentStatus,
    deleteAppointment,
    patients,
    operations,
    invoices,
    updatePatient,
    patientTags,
    addPatientTag,
    patientFollowUpStatuses,
    changePatientFollowUpStatus,
    listItemColors,
    patientFollowUpLogs,
    tasks,
    toggleTask,
    adminCompleteTask,
    staffMembers,
    goToPatient,
    setActiveView,
    navigateToPatientFollowUp,
    setIsQuickActionOpen,
    currentUser,
    hasPermission,
    isUnitAllowed,
    attendance,
    clockIn,
    clockOut,
    openAttendanceShiftEdit,
    staffAlertLogs,
    units,
    weekdaySettings,
    staffComments,
    logAuditAction
  } = useClinic();

  const currentUserComments = useMemo(() => {
    const nowMs = Date.now();
    return staffComments.filter(c => {
      if (c.staffId !== 'all' && c.staffId !== currentUser.id) return false;
      if (c.isHidden) return false;
      if (c.expiresAt) {
        const expMs = Date.parse(c.expiresAt);
        if (!isNaN(expMs) && nowMs >= expMs) return false;
      }
      return true;
    });
  }, [staffComments, currentUser.id]);


  const canAddAppointments = hasPermission('addAppointments');
  const canEditAppointments = hasPermission('editAppointments');
  const canDeleteAppointments = hasPermission('deleteAppointments');
  const canAddPatients = hasPermission('addPatients');
  const canEditPatients = hasPermission('editPatients');
  const canViewClinicalNotes = hasPermission('viewClinicalNotes');
  const canAddClinicalNotes = hasPermission('addClinicalNotes');
  const canAddTasks = hasPermission('addTasks');
  const canEditTasks = hasPermission('editTasks');
  const canAddInvoicesPayments = hasPermission('addInvoicesPayments');

  const apptListRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);

  const todayStr = cairoTodayStr;
  const isApptToday = currentDate === todayStr;

  // Shift card state & GPS check
  const activeUnits = useMemo(() => units.filter(u => !u.isDisabled), [units]);
  const selectableUnits = useMemo(() => {
    const allowedActive = activeUnits.filter(u => isUnitAllowed(u.id, u.name));
    if (allowedActive.length > 0) return allowedActive;
    const allowedAll = units.filter(u => isUnitAllowed(u.id, u.name));
    if (allowedAll.length > 0) return allowedAll;
    return activeUnits.length > 0 ? activeUnits : units;
  }, [activeUnits, units, isUnitAllowed]);
  const todayWeekday = getCairoNowParts().weekday;
  const isGrantedLeaveToday = Boolean(currentUser.attendanceExemptDates?.includes(todayStr));
  const isClinicClosedToday = Boolean(weekdaySettings.find(w => w.dayOfWeek === todayWeekday)?.isClosed);
  const isWeeklyOffToday = currentUser.defaultUnitByDay?.[todayWeekday] === DAY_OFF_UNIT_ID;
  const isScheduledDayOffToday = isGrantedLeaveToday || isWeeklyOffToday || isClinicClosedToday;
  const resolvedDefaultUnitId = useMemo(() => {
    const staffDayUnit = currentUser.defaultUnitByDay?.[todayWeekday];
    if (staffDayUnit === DAY_OFF_UNIT_ID) return selectableUnits[0]?.id || '';
    if (staffDayUnit && selectableUnits.some(u => u.id === staffDayUnit)) return staffDayUnit;
    const weekdayUnit = weekdaySettings.find(w => w.dayOfWeek === todayWeekday)?.defaultUnitId;
    if (weekdayUnit && selectableUnits.some(u => u.id === weekdayUnit)) return weekdayUnit;
    return selectableUnits[0]?.id || '';
  }, [currentUser.defaultUnitByDay, todayWeekday, weekdaySettings, selectableUnits]);

  const [shiftUnitId, setShiftUnitId] = useState(resolvedDefaultUnitId);
  useEffect(() => {
    if (resolvedDefaultUnitId && !selectableUnits.some(u => u.id === shiftUnitId)) {
      setShiftUnitId(resolvedDefaultUnitId);
    } else if (!shiftUnitId && resolvedDefaultUnitId) {
      setShiftUnitId(resolvedDefaultUnitId);
    }
  }, [resolvedDefaultUnitId, selectableUnits, shiftUnitId]);

  const myActiveShift = useMemo(
    () => attendance.find(a => a.userId === currentUser.id && a.status === 'active'),
    [attendance, currentUser.id]
  );
  const activeShiftsList = useMemo(() => {
    const existingStaffIds = new Set(staffMembers.map(s => s.id));
    return attendance.filter(
      a => a.status === 'active' && existingStaffIds.has(a.userId) && isUnitAllowed(a.unitId, a.unitName)
    );
  }, [attendance, staffMembers, isUnitAllowed]);
  const activeTodayShiftsCount = activeShiftsList.length;

  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftMsg, setShiftMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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
        `محاولة فاشلة ل${actionLabel} (${currentUser.name}) من الشاشة الرئيسية: ${msg}${distanceNote}`,
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

  const handleDashboardClockIn = async () => {
    const targetUnit = shiftUnitId || resolvedDefaultUnitId;
    if (!targetUnit) return;
    if (myActiveShift) {
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
        ? `تم حفظ بدء الشفت محلياً (${uName}) بدون اتصال — سيتم إرساله للإدارة فور عودة الإنترنت`
        : `تم تسجيل بدء الشفت بنجاح ومزامنته للإدارة (${uName})`
    });
  };

  const handleDashboardClockOut = async () => {
    if (!myActiveShift) return;
    setShiftMsg(null);
    setShiftBusy(true);
    const ok = await verifyBranchGPS(myActiveShift.unitId, 'shift_end');
    setShiftBusy(false);
    if (!ok) return;
    const outRes = clockOut(myActiveShift.id);
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
        ? 'تم حفظ إنهاء الشفت محلياً بدون اتصال — سيتم إرساله للإدارة فور عودة الإنترنت'
        : 'تم تسجيل إنهاء الشفت بنجاح ومزامنته للإدارة'
    });
  };

  const isAdmin = currentUser.role === 'admin';
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
  const effectiveCanEditTasks = canEditTasks || isAdmin;
  const effectiveCanAddTasks = canAddTasks || isAdmin;

  const [taskDate, setTaskDate] = useState<string>(todayStr);
  const prevCairoTodayRef = useRef<string>(todayStr);
  useEffect(() => {
    if (prevCairoTodayRef.current !== cairoTodayStr) {
      const oldToday = prevCairoTodayRef.current;
      prevCairoTodayRef.current = cairoTodayStr;
      setTaskDate(prev => (prev === oldToday ? cairoTodayStr : prev));
    }
  }, [cairoTodayStr]);
  const [taskStaffFilter, setTaskStaffFilter] = useState<string>('all');
  const activeTaskDate = isAdmin ? taskDate : todayStr;
  const isTaskToday = activeTaskDate === todayStr;

  const stepTaskDate = useCallback((days: number) => {
    if (!isAdmin) return;
    setTaskDate(prev => {
      const [ty, tm, td] = prev.split('-').map(Number);
      const d = new Date(ty, tm - 1, td + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    });
  }, [isAdmin]);

  const resetTaskToToday = useCallback(() => {
    setTaskDate(cairoTodayStr);
  }, [cairoTodayStr]);

  // Scope appointments by single-branch restriction and doctor appointmentsOwnOnly permission
  const patientById = useMemo(() => {
    const map = new Map<string, (typeof patients)[number]>();
    patients.forEach(p => map.set(p.id, p));
    return map;
  }, [patients]);

  const scopedAppointments = useMemo(() => {
    return appointments.filter(a => {
      if (!isUnitAllowed(a.unitId, a.unitName)) return false;
      if (currentUser.permissions?.appointmentsOwnOnly) {
        if (!currentUser.doctorId || a.doctorId !== currentUser.doctorId) return false;
      }
      return true;
    });
  }, [appointments, currentUser, isUnitAllowed]);

  // Filter appointments for currently selected appointments date
  const selectedDateAppts = useMemo(
    () =>
      scopedAppointments
        .filter(a => a.date === currentDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [scopedAppointments, currentDate]
  );

  const [apptGroupBy, setApptGroupBy] = useState<'none' | 'doctor' | 'unit'>('none');

  const groupedAppointments = useMemo(() => {
    if (apptGroupBy === 'none') {
      return [{ groupTitle: '', appts: selectedDateAppts }];
    }
    const map = new Map<string, typeof selectedDateAppts>();
    selectedDateAppts.forEach(appt => {
      let key = 'أخرى';
      if (apptGroupBy === 'doctor') {
        key = appt.doctorName || 'طبيب غير محدد';
      } else if (apptGroupBy === 'unit') {
        key = appt.unitName || 'عيادة غير محددة';
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    });
    return Array.from(map.entries()).map(([groupTitle, appts]) => ({ groupTitle, appts }));
  }, [selectedDateAppts, apptGroupBy]);

  // Admin sees all employees' tasks (or chosen employee); Staff see only their own tasks
  const scopedTasks = useMemo(() => {
    if (isAdmin) {
      if (taskStaffFilter === 'all') return tasks;
      return tasks.filter(t => t.assignedTo === taskStaffFilter);
    }
    return tasks.filter(t => t.assignedTo === currentUser.name);
  }, [tasks, isAdmin, taskStaffFilter, currentUser.name]);

  const taskEvalCtx = useMemo(
    () => ({ weekdaySettings, appointments, patientFollowUpLogs, patients, operations, invoices }),
    [weekdaySettings, appointments, patientFollowUpLogs, patients, operations, invoices]
  );

  const selectedDateTasks = useMemo(
    () => scopedTasks.filter(t => doesTaskOccurOnDate(t, activeTaskDate)),
    [scopedTasks, activeTaskDate]
  );

  const overdueTasks = useMemo(
    () =>
      scopedTasks.filter(
        t =>
          (t.recurrence || 'once') === 'once' &&
          !getTaskCompletionForDate(t, t.dueDate, taskEvalCtx).isCompleted &&
          t.dueDate < todayStr
      ),
    [scopedTasks, taskEvalCtx, todayStr]
  );

  const feedbackProgress = useMemo(() => {
    if (!scopedTasks.some(t => isFeedbackTaskTitle(t.title))) {
      return {
        prevWorkDay: activeTaskDate,
        totalPatients: 0,
        processedCount: 0,
        doneCount: 0,
        notDoneCount: 0
      };
    }
    return computeFeedbackTaskProgress(activeTaskDate, weekdaySettings, appointments, patientFollowUpLogs, patients);
  }, [scopedTasks, activeTaskDate, weekdaySettings, appointments, patientFollowUpLogs, patients]);

  const openFeedbackFollowUp = useCallback((e?: React.MouseEvent, anchorYmd?: string) => {
    if (e) e.stopPropagation();
    navigateToPatientFollowUp({
      periodUnit: 'day',
      dateBasis: 'last_appointment',
      anchorDate: anchorYmd || feedbackProgress.prevWorkDay,
      selectedAppointmentStatuses: ['completed'],
      excludeFollowUpStatuses: ['فيدباك'],
      feedbackMode: true,
      scrollToFirstCard: true
    });
  }, [navigateToPatientFollowUp, feedbackProgress.prevWorkDay]);

  const openFinishedWorkFollowUp = useCallback((e?: React.MouseEvent, evalYmd?: string) => {
    if (e) e.stopPropagation();
    navigateToPatientFollowUp({
      periodUnit: 'all',
      dateBasis: 'last_appointment',
      anchorDate: evalYmd || activeTaskDate,
      finishedWorkMode: true,
      scrollToFirstCard: true
    });
  }, [navigateToPatientFollowUp, activeTaskDate]);

  // Stats for each card's selected date
  const completedApptsCount = useMemo(
    () => selectedDateAppts.filter(a => a.status === 'completed' || a.status === 'arrived').length,
    [selectedDateAppts]
  );
  const pendingTasksCount = useMemo(
    () => selectedDateTasks.filter(t => !getTaskCompletionForDate(t, activeTaskDate, taskEvalCtx).isCompleted).length,
    [selectedDateTasks, activeTaskDate, taskEvalCtx]
  );

  // Format date display in Arabic using local date parts (avoids UTC shift)
  const [apptY, apptM, apptD] = currentDate.split('-').map(Number);
  const apptDateObj = new Date(apptY, apptM - 1, apptD);
  const apptWeekdayName = apptDateObj.toLocaleDateString('ar-EG', { weekday: 'long' });
  const apptDaySlashMonth = `${apptD}/${apptM}`;

  const [taskY, taskM, taskD] = activeTaskDate.split('-').map(Number);
  const taskDateObj = new Date(taskY, taskM - 1, taskD);
  const taskWeekdayName = taskDateObj.toLocaleDateString('ar-EG', { weekday: 'long' });
  const taskDaySlashMonth = `${taskD}/${taskM}`;

  // Interactive Month Calendar Picker State (shared modal UI, independent target)
  const [calendarTarget, setCalendarTarget] = useState<'appointments' | 'tasks' | null>(null);
  const [pickerYear, setPickerYear] = useState(apptY);
  const [pickerMonth, setPickerMonth] = useState(apptM - 1); // 0-indexed

  const openCalendarPicker = useCallback((target: 'appointments' | 'tasks') => {
    if (target === 'tasks' && !isAdmin) return;
    if (target === 'appointments') {
      setPickerYear(apptY);
      setPickerMonth(apptM - 1);
    } else {
      setPickerYear(taskY);
      setPickerMonth(taskM - 1);
    }
    setCalendarTarget(target);
  }, [isAdmin, apptY, apptM, taskY, taskM]);

  const openTasksCalendar = useCallback(() => openCalendarPicker('tasks'), [openCalendarPicker]);

  const stepPickerMonth = (delta: number) => {
    const next = new Date(pickerYear, pickerMonth + delta, 1);
    setPickerYear(next.getFullYear());
    setPickerMonth(next.getMonth());
  };

  const closedWeekdaySet = useMemo(
    () => new Set(weekdaySettings.filter(w => w.isClosed).map(w => w.dayOfWeek)),
    [weekdaySettings]
  );

  const calendarCells = useMemo(() => {
    if (!calendarTarget) return [];
    const firstDay = new Date(pickerYear, pickerMonth, 1);
    const totalDays = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    // Saturday = 0 in Arabic clinic week (Sat..Fri)
    const startIdx = (firstDay.getDay() + 1) % 7;
    const monthPrefix = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-`;

    const apptCountByDate = new Map<string, number>();
    if (calendarTarget === 'appointments') {
      for (let i = 0; i < scopedAppointments.length; i++) {
        const dStr = scopedAppointments[i].date;
        if (dStr && dStr.startsWith(monthPrefix)) {
          apptCountByDate.set(dStr, (apptCountByDate.get(dStr) || 0) + 1);
        }
      }
    }

    const cells: Array<{
      day: number | null;
      dateStr: string;
      count: number;
      isClinicHoliday: boolean;
      isPersonalLeave: boolean;
    }> = [];
    for (let i = 0; i < startIdx; i++) {
      cells.push({ day: null, dateStr: '', count: 0, isClinicHoliday: false, isPersonalLeave: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${monthPrefix}${String(d).padStart(2, '0')}`;
      const dow = new Date(pickerYear, pickerMonth, d, 12, 0, 0).getDay();
      const isClinicHoliday = closedWeekdaySet.has(dow);
      const isPersonalLeave =
        currentUser.role !== 'admin' &&
        (Boolean(currentUser.attendanceExemptDates?.includes(dateStr)) ||
          currentUser.defaultUnitByDay?.[dow] === DAY_OFF_UNIT_ID);
      const count =
        calendarTarget === 'tasks'
          ? scopedTasks.filter(t => doesTaskOccurOnDate(t, dateStr)).length
          : apptCountByDate.get(dateStr) || 0;
      cells.push({ day: d, dateStr, count, isClinicHoliday, isPersonalLeave });
    }
    return cells;
  }, [pickerYear, pickerMonth, calendarTarget, scopedAppointments, scopedTasks, closedWeekdaySet, currentUser]);

  const pickerMonthLabel = new Date(pickerYear, pickerMonth, 1).toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric'
  });

  // Three-dots menu, Analog Clock Picker & Tag modal state
  const [openApptMenuId, setOpenApptMenuId] = useState<string | null>(null);
  const [confirmDeleteApptId, setConfirmDeleteApptId] = useState<string | null>(null);
  const [tagModalPatientId, setTagModalPatientId] = useState<string | null>(null);
  const [customTagInput, setCustomTagInput] = useState('');
  const [noteModalTarget, setNoteModalTarget] = useState<{ patientId: string; patientName: string } | null>(null);
  const [clockPickerAppt, setClockPickerAppt] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!openApptMenuId) return;
    const handleDocClick = () => {
      setOpenApptMenuId(null);
      setConfirmDeleteApptId(null);
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [openApptMenuId]);

  const tagModalPatient = useMemo(
    () => (tagModalPatientId ? patients.find(p => p.id === tagModalPatientId) || null : null),
    [tagModalPatientId, patients]
  );

  const handleTogglePatientTag = (patientId: string, tag: string) => {
    const pat = patients.find(p => p.id === patientId);
    if (!pat) return;
    const currentTags = pat.tags || [];
    const exists = currentTags.includes(tag);
    const nextTags = exists ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
    updatePatient(patientId, { tags: nextTags });
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customTagInput.trim();
    if (!trimmed || !tagModalPatient) return;
    addPatientTag(trimmed);
    const currentTags = tagModalPatient.tags || [];
    if (!currentTags.includes(trimmed)) {
      updatePatient(tagModalPatient.id, { tags: [...currentTags, trimmed] });
    }
    setCustomTagInput('');
  };

  // Status mapping (includes individual full card background & border colors)
  const statusLabels: Record<
    AppointmentStatus,
    { label: string; bg: string; text: string; cardClass: string }
  > = useMemo(
    () => ({
      booked: {
        label: 'محجوز',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        cardClass: 'bg-slate-50/75 border-slate-200 hover:border-slate-300'
      },
      confirmed: {
        label: 'مؤكد',
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        cardClass: 'bg-blue-50/75 border-blue-200 hover:border-blue-300'
      },
      arrived: {
        label: 'وصل العيادة',
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        cardClass: 'bg-amber-50/80 border-amber-200 hover:border-amber-300'
      },
      completed: {
        label: 'تمت الزيارة',
        bg: 'bg-emerald-100',
        text: 'text-emerald-800',
        cardClass: 'bg-emerald-50/80 border-emerald-200 hover:border-emerald-300'
      },
      cancelled: {
        label: 'ملغي',
        bg: 'bg-rose-100',
        text: 'text-rose-700',
        cardClass: 'bg-rose-50/80 border-rose-200 hover:border-rose-300'
      },
      no_show: {
        label: 'لم يحضر',
        bg: 'bg-red-100',
        text: 'text-red-700',
        cardClass: 'bg-red-50/80 border-red-200 hover:border-red-300'
      }
    }),
    []
  );

  const apptStatusOptions: ColoredSelectOption[] = useMemo(
    () =>
      (['booked', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show'] as AppointmentStatus[]).map(s => ({
        value: s,
        label: statusLabels[s].label,
        colorHex: APPOINTMENT_STATUS_COLOR_HEX[s]?.hex,
        badgeClass: `${statusLabels[s].bg} ${statusLabels[s].text}`
      })),
    [statusLabels]
  );

  const appointmentsCardSection = useMemo(
    () => (
      <div ref={apptListRef} className="@container bg-white border border-[#dce8eb] rounded-3xl p-3.5 sm:p-5 shadow-sm space-y-4 min-w-0 [overflow-anchor:none]">
        <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-100 min-w-0">
          {/* Responsive Header: 2 clean rows on mobile/phone-frame, 3-column grid on wide container */}
          <div className="flex flex-col gap-2.5 w-full min-w-0 @xl:grid @xl:grid-cols-[1fr_auto_1fr] @xl:items-center @xl:gap-2">
            {/* Mobile Row 1 (becomes left/right grid columns at @xl) */}
            <div className="flex items-center justify-between gap-2 w-full @xl:contents">
              {/* Right side: Group-by + All link */}
              <div className="flex items-center justify-start gap-2 min-w-0 @xl:order-1">
                <select
                  value={apptGroupBy}
                  onChange={e => setApptGroupBy(e.target.value as 'none' | 'doctor' | 'unit')}
                  className="text-[11px] font-bold bg-[#f0f6f5] text-[#087e83] border border-[#d6e5e8] rounded-xl px-2.5 py-1.5 cursor-pointer focus:outline-none max-w-[130px] @xl:max-w-none truncate touch-manipulation"
                  title="تجميع المواعيد حسب"
                >
                  <option value="none">بدون تجميع</option>
                  <option value="doctor">حسب الطبيب</option>
                  <option value="unit">حسب العيادة</option>
                </select>
                <button
                  type="button"
                  onClick={() => setActiveView('appointments')}
                  className="inline-flex text-[11px] sm:text-xs font-bold text-[#087e83] hover:underline items-center gap-1 cursor-pointer whitespace-nowrap touch-manipulation select-none [-webkit-tap-highlight-color:transparent]"
                >
                  <span className="pointer-events-none">كل المواعيد</span>
                  <ArrowLeft className="w-3.5 h-3.5 pointer-events-none" />
                </button>
              </div>

              {/* Physical Left (RTL end): Create Button (Cursor Date) */}
              <div className="flex items-center justify-end gap-1.5 shrink-0 @xl:order-3">
                {canAddAppointments && (
                  <button
                    type="button"
                    onClick={() => setIsQuickActionOpen(true, 'appointment', { date: currentDate })}
                    className="px-3 py-1.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                    title="حجز موعد جديد بتاريخ اليوم المحدد"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5] pointer-events-none" />
                    <span className="pointer-events-none">حجز</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Row 2 / Desktop Center: Date Navigation Pager */}
            <div className="flex flex-col items-center justify-center gap-1.5 min-w-0 w-full @xl:w-auto @xl:order-2">
              <div className="flex items-center justify-between gap-1 sm:gap-2 w-full @xl:w-auto @xl:justify-center">
                <button
                  type="button"
                  onClick={() => stepDate(-1)}
                  className="shrink-0 px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#172f3d] font-bold text-[11px] sm:text-xs flex items-center gap-0.5 transition-colors cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                  title="اليوم السابق"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-[#087e83] pointer-events-none" />
                  <span className="pointer-events-none">السابق</span>
                </button>

                <button
                  type="button"
                  onClick={() => openCalendarPicker('appointments')}
                  className="min-w-0 flex-1 @xl:flex-initial text-[11px] sm:text-sm md:text-base font-extrabold text-[#172f3d] hover:text-[#087e83] bg-[#f0f6f5] hover:bg-[#e2efec] border border-[#bfe2db] hover:border-[#087e83] shadow-2xs active:scale-[0.98] px-2 sm:px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 leading-snug text-center whitespace-nowrap touch-manipulation select-none [-webkit-tap-highlight-color:transparent]"
                  title="اضغط لاختيار يوم من التقويم"
                >
                  <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#087e83] shrink-0 pointer-events-none" />
                  <span className="pointer-events-none">مواعيد</span>
                  <span className="truncate pointer-events-none">
                    {apptWeekdayName} {apptDaySlashMonth}
                  </span>
                  <span className="text-[#087e83] font-mono shrink-0 bg-white/80 px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs border border-[#bfe2db] pointer-events-none">
                    {selectedDateAppts.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => stepDate(1)}
                  className="shrink-0 px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#172f3d] font-bold text-[11px] sm:text-xs flex items-center gap-0.5 transition-colors cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                  title="اليوم القادم"
                >
                  <span className="pointer-events-none">القادم</span>
                  <ChevronLeft className="w-3.5 h-3.5 text-[#087e83] pointer-events-none" />
                </button>
              </div>

              {!isApptToday && (
                <button
                  type="button"
                  onClick={resetToToday}
                  className="px-3.5 py-1 rounded-full bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-[11px] shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent]"
                >
                  <RotateCcw className="w-3 h-3 pointer-events-none" />
                  <span className="pointer-events-none">العودة لليوم</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {selectedDateAppts.length > 0 ? (
          <div className="space-y-3">
            {groupedAppointments.map(({ groupTitle, appts }) => (
              <div key={groupTitle || 'all'} className="space-y-2.5">
                {apptGroupBy !== 'none' && (
                  <div className="bg-[#f0f8f6] border-r-4 border-[#087e83] px-3 py-1.5 rounded-xl flex items-center justify-between text-xs font-extrabold text-[#087e83] my-1">
                    <span>{groupTitle}</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded-full text-[11px] shadow-2xs">({appts.length})</span>
                  </div>
                )}
                <div className="space-y-2.5">
                  {appts.map(appt => {
                    const status = statusLabels[appt.status];
                    const isMenuOpen = openApptMenuId === appt.id;
                    const pat = patientById.get(appt.patientId);
                    const patTags = (pat?.tags || []).filter(tag => patientTags.includes(tag));
                    return (
                      <div
                        key={appt.id}
                        className={`min-h-[92px] p-2.5 sm:p-3 rounded-2xl border flex items-center justify-between gap-2 transition-colors ${status.cardClass}`}
                      >
                  {/* Right side: Clickable Compact Time Pill & Details */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {(() => {
                      const { hour12, minute, period } = parseTimeTo12h(appt.time);
                      if (canEditAppointments) {
                        return (
                          <button
                            type="button"
                            onClick={() => setClockPickerAppt(appt)}
                            title="اضغط لتعديل ميعاد الساعة (AM/PM)"
                            className="w-12 sm:w-14 h-12 py-1 rounded-xl bg-white/90 hover:bg-[#e7f5f2] border border-[#c2e4dd] hover:border-[#087e83] flex flex-col items-center justify-center flex-shrink-0 font-bold text-[#087e83] leading-tight shadow-2xs transition-all active:scale-95 cursor-pointer"
                          >
                            <span className="text-[11px] font-mono font-extrabold tracking-tight">{hour12}:{minute}</span>
                            <span className="text-[9px] font-extrabold text-[#087e83] tracking-wider uppercase">
                              {period}
                            </span>
                          </button>
                        );
                      }
                      return (
                        <div className="w-12 sm:w-14 h-12 py-1 rounded-xl bg-white/80 border border-[#c2e4dd] flex flex-col items-center justify-center flex-shrink-0 font-bold text-[#087e83] leading-tight shadow-2xs">
                          <span className="text-[11px] font-mono font-extrabold tracking-tight">{hour12}:{minute}</span>
                          <span className="text-[9px] font-extrabold text-[#087e83] tracking-wider uppercase">
                            {period}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Line 1: Patient Name + Duration + Phone */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0 leading-snug">
                        <button
                          type="button"
                          onClick={() => goToPatient(appt.patientId)}
                          className="font-bold text-slate-800 text-xs sm:text-sm hover:text-[#087e83] hover:underline text-right cursor-pointer break-words"
                        >
                          {appt.patientName}
                        </button>
                        <span className="text-[10px] bg-white/80 text-slate-600 border border-slate-200/80 px-1.5 py-0.2 rounded-full font-semibold flex-shrink-0">
                          {appt.durationMinutes} د
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-slate-400 font-mono text-[10px] flex-shrink-0" dir="ltr">
                          <Phone className="w-2.5 h-2.5 text-slate-400" />
                          <span>{appt.patientPhone}</span>
                        </span>
                      </div>

                      {/* Line 2: Full Doctor Name · Full Clinic/Unit Name */}
                      <div className="text-slate-600 text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 leading-snug">
                        <span className="font-semibold break-words">{appt.doctorName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold break-words">{appt.unitName}</span>
                      </div>

                      {/* Line 3: Fixed row for Appointment Status & Follow-up Status Dropdowns */}
                      <div className="flex items-center gap-2 mt-1 flex-nowrap min-w-0">
                        {canEditAppointments ? (
                          <ColoredSelect
                            size="xs"
                            stopPropagation
                            value={appt.status}
                            options={apptStatusOptions}
                            onChange={val => updateAppointmentStatus(appt.id, val as AppointmentStatus)}
                            ariaLabel="حالة الموعد"
                            className="flex-shrink-0"
                          />
                        ) : (
                          <span className={`text-[10px] font-bold rounded-lg px-1.5 py-0.5 flex-shrink-0 ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                        )}
                        {pat && (
                          <ColoredSelect
                            size="xs"
                            stopPropagation
                            value={
                              pat.followUpStatus && patientFollowUpStatuses.includes(pat.followUpStatus)
                                ? pat.followUpStatus
                                : ''
                            }
                            placeholder="متابعة..."
                            options={patientFollowUpStatuses.map(st => ({
                              value: st,
                              label: st,
                              colorHex: getFollowUpStatusColorHex(st, listItemColors.followUpStatuses)
                            }))}
                            onChange={val => {
                              if (val) changePatientFollowUpStatus(pat.id, val);
                            }}
                            ariaLabel="حالة متابعة المريض"
                            className="flex-shrink-0"
                          />
                        )}
                      </div>

                      {/* Line 3: Compact Wrapping Tags Strip */}
                      {patTags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {patTags.slice(0, 3).map(tag => (
                            <span
                              key={tag}
                              style={getCustomColorBadgeStyle(listItemColors.patientTags?.[tag])}
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border whitespace-nowrap ${
                                listItemColors.patientTags?.[tag]
                                  ? ''
                                  : tag === 'VIP'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-white/90 text-[#087e83] border-[#bfe2db]'
                              }`}
                            >
                              #{tag}
                            </span>
                          ))}
                          {patTags.length > 3 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-white/80 text-slate-500 border border-slate-200 whitespace-nowrap">
                              +{patTags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Left side: Three Dots Action Menu */}
                  {(canAddInvoicesPayments || canEditPatients || canViewClinicalNotes || canAddClinicalNotes || canAddAppointments || canEditAppointments || canDeleteAppointments) && (
                    <div
                      className="relative flex-shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteApptId(null);
                          setOpenApptMenuId(isMenuOpen ? null : appt.id);
                        }}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                          isMenuOpen
                            ? 'bg-[#e7f5f2] text-[#087e83]'
                            : 'text-slate-400 hover:text-[#087e83] hover:bg-slate-100'
                        }`}
                        title="خيارات الموعد"
                        aria-label="خيارات الموعد"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute left-0 top-9 z-40 w-48 bg-white border border-[#d6e5e8] rounded-2xl shadow-xl py-1.5 text-xs font-bold text-[#172f3d] animate-in fade-in duration-100">
                          {canAddInvoicesPayments && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenApptMenuId(null);
                                  setIsQuickActionOpen(true, 'invoice', { patientId: appt.patientId });
                                }}
                                className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#087e83]" />
                                <span>إضافة فاتورة</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenApptMenuId(null);
                                  setIsQuickActionOpen(true, 'payment', { patientId: appt.patientId });
                                }}
                                className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                                <span>إضافة دفع</span>
                              </button>
                            </>
                          )}

                          {canAddClinicalNotes && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenApptMenuId(null);
                                setNoteModalTarget({ patientId: appt.patientId, patientName: appt.patientName });
                              }}
                              className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <StickyNote className="w-3.5 h-3.5 text-teal-600" />
                              <span>إضافة ملاحظة</span>
                            </button>
                          )}

                          {canAddAppointments && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenApptMenuId(null);
                                setIsQuickActionOpen(true, 'appointment', { patientId: appt.patientId });
                              }}
                              className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <CalendarIcon className="w-3.5 h-3.5 text-[#087e83]" />
                              <span>إنشاء ميعاد</span>
                            </button>
                          )}

                          {canEditPatients && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenApptMenuId(null);
                                setCustomTagInput('');
                                setTagModalPatientId(appt.patientId);
                              }}
                              className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Tag className="w-3.5 h-3.5 text-amber-600" />
                              <span>إضافة تاج</span>
                            </button>
                          )}

                          {(canViewClinicalNotes || canAddClinicalNotes || canEditAppointments || canDeleteAppointments) && (canAddInvoicesPayments || canEditPatients || canAddClinicalNotes || canAddAppointments) && (
                            <div className="my-1 border-t border-slate-100" />
                          )}

                          {(canViewClinicalNotes || canAddClinicalNotes) && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenApptMenuId(null);
                                goToPatient(appt.patientId, { focusNotes: true });
                              }}
                              className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <StickyNote className="w-3.5 h-3.5 text-[#087e83]" />
                              <span>فتح الملاحظات</span>
                            </button>
                          )}

                          {canEditAppointments && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenApptMenuId(null);
                                setIsQuickActionOpen(true, 'appointment', { appointmentId: appt.id });
                              }}
                              className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5 text-blue-600" />
                              <span>تعديل الميعاد</span>
                            </button>
                          )}

                          {canDeleteAppointments && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirmDeleteApptId !== appt.id) {
                                  setConfirmDeleteApptId(appt.id);
                                  return;
                                }
                                deleteAppointment(appt.id);
                                setConfirmDeleteApptId(null);
                                setOpenApptMenuId(null);
                              }}
                              className={`w-full px-3 py-2 text-right flex items-center gap-2 transition-colors cursor-pointer ${
                                confirmDeleteApptId === appt.id
                                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                                  : 'text-rose-600 hover:bg-rose-50'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{confirmDeleteApptId === appt.id ? 'تأكيد حذف الموعد' : 'حذف الموعد'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 space-y-2">
            <CalendarIcon className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-500 text-xs">لا توجد مواعيد</p>
            {canAddAppointments && (
              <button
                type="button"
                onClick={() => setIsQuickActionOpen(true, 'appointment', { date: currentDate })}
                className="text-xs font-bold text-[#087e83] underline cursor-pointer"
              >
                + حجز موعد
              </button>
            )}
          </div>
        )}
      </div>
    ),
    [
      apptGroupBy,
      apptStatusOptions,
      apptWeekdayName,
      apptDaySlashMonth,
      canAddAppointments,
      canAddClinicalNotes,
      canAddInvoicesPayments,
      canDeleteAppointments,
      canEditAppointments,
      canEditPatients,
      canViewClinicalNotes,
      changePatientFollowUpStatus,
      confirmDeleteApptId,
      currentDate,
      deleteAppointment,
      goToPatient,
      groupedAppointments,
      isApptToday,
      listItemColors,
      openApptMenuId,
      openCalendarPicker,
      patientById,
      patientFollowUpStatuses,
      patientTags,
      resetToToday,
      selectedDateAppts.length,
      setActiveView,
      setIsQuickActionOpen,
      statusLabels,
      stepDate,
      updateAppointmentStatus
    ]
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Staff Comments / Alerts for current user (appears above welcome card) */}
      {currentUserComments.length > 0 && (
        <div className="space-y-2">
          {currentUserComments.map(comment => {
            const count = comment.repeatCount || 1;
            const isBlue = count === 1;
            const isOrange = count === 2;
            const isRed = count >= 3;

            const cardBg = isBlue
              ? 'bg-blue-50 border-blue-200 text-blue-950'
              : isOrange
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-rose-50 border-rose-300 text-rose-950';

            return (
              <div key={comment.id} className={`p-3 rounded-2xl border ${cardBg} flex items-center justify-between gap-2 shadow-2xs text-xs font-bold`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base flex-shrink-0" title="إنذار أو توجيه">⚠️</span>
                  <div className="min-w-0">
                    <p className="truncate">{comment.content}</p>
                    <p className="text-[10px] opacity-75 font-mono">
                      {comment.staffName} · تكرار: {count}
                      {comment.durationLabel ? ` · المدة: ${comment.durationLabel}` : ''}
                    </p>
                  </div>
                </div>
                {count > 1 && (
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full flex-shrink-0 ${isBlue ? 'bg-blue-100 text-blue-800' : isOrange ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                    تكرار {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Compact Greeting & Quick Primary Actions */}
      <div className="rounded-3xl bg-gradient-to-r from-[#12303c] via-[#104853] to-[#087e83] text-white px-5 py-4 shadow-md shadow-[#12303c]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-[#bce7d9] flex-shrink-0" />
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
            أهلاً، {currentUser.name}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canAddAppointments && (
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'appointment')}
              className="px-3.5 py-2 rounded-xl bg-white text-[#087e83] font-bold text-xs hover:bg-[#e6f6f2] shadow-sm flex items-center gap-1.5 transition-transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>حجز موعد</span>
            </button>
          )}
          {canAddPatients && (
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'patient')}
              className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs border border-white/20 transition-colors"
            >
              + مريض جديد
            </button>
          )}
        </div>
      </div>

      {/* 1.5 Quick Shift Card (بدأ الشفت - إنهاء الشفت) directly below Greeting */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 shadow-sm space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                myActiveShift ? 'bg-emerald-100 text-emerald-700' : 'bg-[#e7f5f2] text-[#087e83]'
              }`}
            >
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-extrabold text-[#172f3d]">بدأ الشفت - إنهاء الشفت</h2>
                {myActiveShift ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    متواجد منذ {parseTimeTo12h(myActiveShift.clockIn).formatted}
                  </span>
                ) : isGrantedLeaveToday ? (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    إجازة اليوم (ممنوحة)
                  </span>
                ) : isScheduledDayOffToday ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    إجازة اليوم
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    لم يبدأ الشفت بعد
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {myActiveShift
                  ? `الفرع: ${myActiveShift.unitName}`
                  : isGrantedLeaveToday
                  ? 'تم منحك إجازة حضور لهذا اليوم من الإدارة'
                  : isClinicClosedToday
                  ? 'اليوم إجازة رسمية للعيادة'
                  : isWeeklyOffToday
                  ? 'اليوم إجازة أسبوعية مقررة'
                  : 'سجّل بدء أو إنهاء شفتك مباشرة من الشاشة الرئيسية'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!myActiveShift && (
              <select
                value={shiftUnitId}
                onChange={e => setShiftUnitId(e.target.value)}
                className="px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-[#172f3d] focus:border-[#087e83] focus:outline-none"
              >
                {selectableUnits.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}

            {myActiveShift ? (
              <button
                type="button"
                disabled={shiftBusy}
                onClick={handleDashboardClockOut}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{shiftBusy ? 'جاري التحقق من الموقع...' : 'إنهاء الشفت'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={shiftBusy || !shiftUnitId}
                onClick={handleDashboardClockIn}
                className="px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{shiftBusy ? 'جاري التحقق من الموقع...' : 'بدأ الشفت'}</span>
              </button>
            )}
          </div>
        </div>

        {shiftMsg && (
          <div
            className={`px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 ${
              shiftMsg.type === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{shiftMsg.text}</span>
          </div>
        )}
      </div>

      {/* Midnight Auto-End Admin Alert Banner */}
      {isAdmin && midnightAutoEndedAwaitingAdmin.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs sm:text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                شفتات أُغلقت تلقائياً بعد ١٢ منتصف الليل ({midnightAutoEndedAwaitingAdmin.length}) — يرجى تحديد وقت الانصراف الفعلي
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {midnightAutoEndedAwaitingAdmin.map(rec => (
              <div
                key={rec.id}
                className="p-3 rounded-2xl bg-white border border-amber-200 flex items-center justify-between gap-2 flex-wrap"
              >
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#172f3d]">{rec.userName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {rec.date} · {rec.unitName} · بدء: {parseTimeTo12h(rec.clockIn).formatted}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openAttendanceShiftEdit(rec.id)}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer flex-shrink-0"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>تحديد وقت الانصراف</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Actionable KPI Summary Metric Cards (Admin only) */}
      {isAdmin && (
      <div
        className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4"
      >
        {/* Card 1: Appointments */}
        <button
          type="button"
          onClick={() => apptListRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="text-right p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-1.5">
            <span>مواعيد اليوم</span>
            <div className="w-7 h-7 rounded-lg bg-[#e7f5f2] text-[#087e83] flex items-center justify-center group-hover:scale-110 transition-transform">
              <CalendarIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#172f3d] tabular-nums">
            {selectedDateAppts.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {completedApptsCount} مكتمل / واصل
          </div>
        </button>

        {/* Card 2: Active Shifts (Admin only) */}
        <button
          type="button"
          onClick={() => setActiveView('attendance')}
          className="text-right p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-1.5">
            <span>الشفت النشط</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#172f3d] tabular-nums">
            {activeTodayShiftsCount}
          </div>
          <div className="text-[11px] text-emerald-700 font-bold mt-0.5 truncate" title={activeShiftsList.map(s => s.userName).join('، ')}>
            {activeShiftsList.length > 0
              ? activeShiftsList.map(s => s.userName).join('، ')
              : 'لا يوجد موظفون نشطون'}
          </div>
        </button>

        {/* Card 3: Tasks */}
        <button
          type="button"
          onClick={() => taskListRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="text-right p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-1.5">
            <span>مهام اليوم</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#172f3d] tabular-nums">
            {pendingTasksCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            من {selectedDateTasks.length}
          </div>
        </button>

        {/* Card 4: Overdue Alert (Admin only) */}
        <button
          type="button"
          onClick={() => setActiveView('tasks')}
          className="text-right p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-amber-400 transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-1.5">
            <span>مهام متأخرة</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 tabular-nums">
            {overdueTasks.length}
          </div>
          <div className="text-[11px] text-amber-700 font-bold mt-0.5">
            مراجعة
          </div>
        </button>
      </div>
      )}

      {/* 3. Appointments Section for Selected Date (memoized so task paging skips re-rendering) */}
      {appointmentsCardSection}

      {/* 4. Tasks for Selected Date & Overdue (isolated memoized component) */}
      <DashboardTasksCard
        taskListRef={taskListRef}
        isAdmin={isAdmin}
        effectiveCanAddTasks={effectiveCanAddTasks}
        effectiveCanEditTasks={effectiveCanEditTasks}
        taskStaffFilter={taskStaffFilter}
        setTaskStaffFilter={setTaskStaffFilter}
        activeTaskDate={activeTaskDate}
        taskWeekdayName={taskWeekdayName}
        taskDaySlashMonth={taskDaySlashMonth}
        isTaskToday={isTaskToday}
        stepTaskDate={stepTaskDate}
        resetTaskToToday={resetTaskToToday}
        openTasksCalendar={openTasksCalendar}
        selectedDateTasks={selectedDateTasks}
        overdueTasks={overdueTasks}
        taskEvalCtx={taskEvalCtx}
        feedbackProgress={feedbackProgress}
        staffMembers={staffMembers}
        toggleTask={toggleTask}
        adminCompleteTask={adminCompleteTask}
        setActiveView={setActiveView}
        setIsQuickActionOpen={setIsQuickActionOpen}
        openFeedbackFollowUp={openFeedbackFollowUp}
        openFinishedWorkFollowUp={openFinishedWorkFollowUp}
      />

      {/* 6. Quick Operation Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {canAddInvoicesPayments && (
          <>
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'invoice')}
              className="p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col items-center justify-center text-center gap-2"
            >
              <div className="w-10 h-10 rounded-xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#172f3d]">فاتورة جديدة</span>
            </button>

            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'payment')}
              className="p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col items-center justify-center text-center gap-2"
            >
              <div className="w-10 h-10 rounded-xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#172f3d]">دفعة</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setActiveView('whatsapp')}
          className="p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col items-center justify-center text-center gap-2"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-[#172f3d]">واتساب</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('attendance')}
          className="p-4 rounded-2xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col items-center justify-center text-center gap-2"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-[#172f3d]">الشفت</span>
        </button>
      </div>

      {/* Interactive Month Calendar Modal */}
      {calendarTarget && (
        <div
          onClick={() => setCalendarTarget(null)}
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4"
          >
            {/* Calendar Month Navigation */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepPickerMonth(-1)}
                  className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] transition-colors cursor-pointer"
                  title="الشهر السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-sm font-extrabold text-[#172f3d] px-2 min-w-[120px] text-center">
                  {pickerMonthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => stepPickerMonth(1)}
                  className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] transition-colors cursor-pointer"
                  title="الشهر القادم"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCalendarTarget(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday Names */}
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400">
              {[
                { dow: 6, label: 'سبت' },
                { dow: 0, label: 'أحد' },
                { dow: 1, label: 'إثنين' },
                { dow: 2, label: 'ثلاثاء' },
                { dow: 3, label: 'أربعاء' },
                { dow: 4, label: 'خميس' },
                { dow: 5, label: 'جمعة' }
              ].map(d => (
                <div
                  key={d.label}
                  className={`py-1 ${closedWeekdaySet.has(d.dow) ? 'text-rose-600 font-extrabold' : ''}`}
                >
                  {d.label}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                if (!cell.day) {
                  return <div key={`empty-${idx}`} className="h-11" />;
                }
                const activeTargetDate = calendarTarget === 'tasks' ? taskDate : currentDate;
                const isSelected = cell.dateStr === activeTargetDate;
                const isToday = cell.dateStr === todayStr;
                const isHoliday = cell.isClinicHoliday;
                const isLeave = cell.isPersonalLeave;
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => {
                      if (calendarTarget === 'tasks') {
                        setTaskDate(cell.dateStr);
                      } else {
                        setCurrentDate(cell.dateStr);
                      }
                      setCalendarTarget(null);
                    }}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center relative font-mono text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#087e83] text-white shadow-sm'
                        : isToday
                        ? 'bg-[#e7f5f2] text-[#087e83] border-2 border-[#087e83]'
                        : isHoliday
                        ? 'bg-rose-50/90 border border-rose-200 hover:bg-rose-100/80 text-rose-700'
                        : isLeave
                        ? 'bg-amber-50/90 border border-amber-200 hover:bg-amber-100/80 text-amber-800'
                        : 'hover:bg-[#f0f6f5] text-slate-700'
                    }`}
                  >
                    <span className="leading-none">{cell.day}</span>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {(isHoliday || isLeave) && (
                        <span
                          className={`text-[8px] font-sans font-extrabold leading-none ${
                            isSelected ? 'text-rose-200' : isHoliday ? 'text-rose-600' : 'text-amber-700'
                          }`}
                        >
                          إجازة
                        </span>
                      )}
                      {cell.count > 0 && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-[#087e83]'
                          }`}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (calendarTarget === 'tasks') {
                    resetTaskToToday();
                  } else {
                    resetToToday();
                  }
                  setCalendarTarget(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>العودة لليوم</span>
              </button>

              <button
                type="button"
                onClick={() => setCalendarTarget(null)}
                className="px-3.5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-bold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Patient Tags Quick Editor Modal */}
      {tagModalPatient && (
        <div
          onClick={() => setTagModalPatientId(null)}
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#172f3d]">وسوم / تاجات المريض</h3>
                  <p className="text-[11px] text-slate-500 font-semibold">{tagModalPatient.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTagModalPatientId(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(tagModalPatient.tags || []).filter(tag => patientTags.includes(tag)).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 block">التاجات الحالية للمريض (اضغط × للإزالة):</span>
                <div className="flex flex-wrap gap-1.5">
                  {(tagModalPatient.tags || []).filter(tag => patientTags.includes(tag)).map(tag => (
                    <span
                      key={tag}
                      style={getCustomColorBadgeStyle(listItemColors.patientTags?.[tag])}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db]"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleTogglePatientTag(tagModalPatient.id, tag)}
                        className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center transition-colors cursor-pointer"
                        title="إزالة التاج من المريض"
                        aria-label={`إزالة ${tag}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500">اختر من الوسوم الجاهزة:</span>
                <button
                  type="button"
                  onClick={() => {
                    setTagModalPatientId(null);
                    setActiveView('settings');
                  }}
                  className="text-[11px] font-bold text-[#087e83] hover:underline cursor-pointer"
                >
                  حذف / تعديل التاجات في الإعدادات
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {patientTags.map(tag => {
                  const isActive = (tagModalPatient.tags || []).includes(tag);
                  const tagColor = listItemColors.patientTags?.[tag];
                  const chipStyle = tagColor
                    ? isActive
                      ? getCustomColorActiveStyle(tagColor)
                      : getCustomColorBadgeStyle(tagColor)
                    : undefined;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTogglePatientTag(tagModalPatient.id, tag)}
                      style={chipStyle}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                        isActive
                          ? 'bg-[#087e83] text-white border-[#087e83]'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#087e83]'
                      }`}
                    >
                      {isActive ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleAddCustomTag} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={customTagInput}
                onChange={e => setCustomTagInput(e.target.value)}
                placeholder="أو اكتب تاج مخصص جديد..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={!customTagInput.trim()}
                className="px-3.5 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] disabled:opacity-50 text-[#087e83] font-bold text-xs cursor-pointer"
              >
                إضافة
              </button>
            </form>

            <button
              type="button"
              onClick={() => setTagModalPatientId(null)}
              className="w-full py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
            >
              تم
            </button>
          </div>
        </div>
      )}

      {/* Analog AM/PM Time Picker Modal */}
      <AnalogTimePickerModal
        isOpen={!!clockPickerAppt}
        initialTime24={clockPickerAppt?.time || '14:00'}
        patientName={clockPickerAppt?.patientName}
        onClose={() => setClockPickerAppt(null)}
        onConfirm={newTime24 => {
          if (clockPickerAppt) {
            updateAppointment(clockPickerAppt.id, { time: newTime24 });
          }
        }}
      />

      {/* Quick Patient Clinical Note Modal (Text + Voice + Tooth Chart) */}
      <AddPatientNoteModal
        isOpen={!!noteModalTarget}
        patientId={noteModalTarget?.patientId || null}
        patientName={noteModalTarget?.patientName || ''}
        onClose={() => setNoteModalTarget(null)}
      />
    </div>
  );
};
