import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreVertical,
  FileText,
  CreditCard,
  Tag,
  Pencil,
  Check,
  X,
  MoveVertical,
  GripHorizontal,
  Trash2,
  StickyNote,
  Calendar,
  RotateCcw
} from 'lucide-react';
import { formatCairoTime, parseTimeTo12h, getCairoNowParts, getArabicWeekdayName } from '../utils/arabic';

import { getTodayDateString } from '../data/mockData';
import { AppointmentStatus, Appointment } from '../types/clinic';
import { AnalogTimePickerModal } from '../components/AnalogTimePickerModal';
import { AddPatientNoteModal } from '../components/AddPatientNoteModal';
import { ColoredSelect, ColoredSelectOption } from '../components/ColoredSelect';
import { APPOINTMENT_STATUS_COLOR_HEX, getCustomColorActiveStyle, getCustomColorBadgeStyle } from '../utils/colors';
import { DAY_OFF_UNIT_ID } from '../utils/staffAlerts';

interface DragSession {
  apptId: string;
  mode: 'move' | 'resize';
  originClientY: number;
  initialStartMin: number;
  initialDurationMin: number;
  liveStartMin: number;
  liveDurationMin: number;
}

interface DraftApptEdit {
  apptId: string;
  originalStartMin: number;
  originalDurationMin: number;
  draftStartMin: number;
  draftDurationMin: number;
}

const parseYmdNoon = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0);
};

const formatYmdLocal = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const AppointmentsView: React.FC = () => {
  const {
    appointments,
    updateAppointmentStatus,
    updateAppointment,
    deleteAppointment,
    patients,
    updatePatient,
    patientTags,
    addPatientTag,
    listItemColors,
    hasPermission,
    currentDate,
    setCurrentDate,
    stepDate,
    resetToToday,
    units,
    doctors,
    setIsQuickActionOpen,
    setActiveView,
    goToPatient,
    currentUser,
    weekdaySettings,
    isUnitAllowed,
    restrictedUnit
  } = useClinic();

  const closedWeekdaySet = useMemo(
    () => new Set(weekdaySettings.filter(w => w.isClosed).map(w => w.dayOfWeek)),
    [weekdaySettings]
  );
  const isDateClinicHoliday = (ymd: string): boolean => closedWeekdaySet.has(parseYmdNoon(ymd).getDay());

  const canAddAppointments = hasPermission('addAppointments');
  const canEditAppointments = hasPermission('editAppointments');
  const canDeleteAppointments = hasPermission('deleteAppointments');
  const canAddInvoicesPayments = hasPermission('addInvoicesPayments');
  const canEditPatients = hasPermission('editPatients');
  const canAddClinicalNotes = hasPermission('addClinicalNotes');

  const [calendarMode, setCalendarMode] = useState<'day' | 'week' | 'month'>('day');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('all');
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState('all');
  const [selectedMonthDay, setSelectedMonthDay] = useState(currentDate);

  // Three-dots menu & Patient Tags modal state
  const [openApptMenuKey, setOpenApptMenuKey] = useState<string | null>(null);
  const [confirmDeleteApptKey, setConfirmDeleteApptKey] = useState<string | null>(null);
  const [tagModalPatientId, setTagModalPatientId] = useState<string | null>(null);
  const [customTagInput, setCustomTagInput] = useState('');
  const [noteModalTarget, setNoteModalTarget] = useState<{ patientId: string; patientName: string } | null>(null);
  const [clockPickerAppt, setClockPickerAppt] = useState<Appointment | null>(null);
  const [isDateCalendarOpen, setIsDateCalendarOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<{ year: number; month: number }>(() => {
    const [y, m] = currentDate.split('-').map(Number);
    return { year: y || 2026, month: m || 1 };
  });

  // Long-press interactive move & scale state (Day Planner)
  const [unlockedApptId, setUnlockedApptId] = useState<string | null>(null);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [draftApptEdit, setDraftApptEdit] = useState<DraftApptEdit | null>(null);

  // Long-press empty-space minute-precision booking line state
  const [slotPickerMinute, setSlotPickerMinute] = useState<number | null>(null);

  const timelineCanvasRef = useRef<HTMLDivElement | null>(null);
  const liveLineRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrollKeyRef = useRef<string>('');
  const dragSessionRef = useRef<DragSession | null>(null);
  const draftApptEditRef = useRef<DraftApptEdit | null>(null);
  const slotPickerMinuteRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const pendingLongPressRef = useRef<{
    timerId: number;
    apptId: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    latestY: number;
    initialStartMin: number;
    initialDurationMin: number;
  } | null>(null);
  const pendingSlotLongPressRef = useRef<{
    timerId: number;
    startX: number;
    startY: number;
    latestY: number;
  } | null>(null);

  useEffect(() => {
    dragSessionRef.current = dragSession;
  }, [dragSession]);

  useEffect(() => {
    draftApptEditRef.current = draftApptEdit;
  }, [draftApptEdit]);

  useEffect(() => {
    slotPickerMinuteRef.current = slotPickerMinute;
  }, [slotPickerMinute]);

  const commitUnlockEdit = () => {
    const draft = draftApptEditRef.current;
    if (
      draft &&
      (draft.draftStartMin !== draft.originalStartMin ||
        draft.draftDurationMin !== draft.originalDurationMin)
    ) {
      const clamped = Math.max(0, Math.min(24 * 60 - 1, draft.draftStartMin));
      const h = Math.floor(clamped / 60);
      const m = clamped % 60;
      const time24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      updateAppointment(draft.apptId, {
        time: time24,
        durationMinutes: draft.draftDurationMin
      });
    }
    draftApptEditRef.current = null;
    setDraftApptEdit(null);
    dragSessionRef.current = null;
    setDragSession(null);
    setUnlockedApptId(null);
  };

  const cancelUnlockEdit = () => {
    if (pendingLongPressRef.current) {
      window.clearTimeout(pendingLongPressRef.current.timerId);
      pendingLongPressRef.current = null;
    }
    draftApptEditRef.current = null;
    setDraftApptEdit(null);
    dragSessionRef.current = null;
    setDragSession(null);
    setUnlockedApptId(null);
  };

  // Close 3-dots menu or commit unlocked card when clicking outside
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (Date.now() < suppressClickUntilRef.current) return;
      const target = e.target as HTMLElement | null;
      if (openApptMenuKey && !target?.closest('[data-appt-menu-root="true"]')) {
        setOpenApptMenuKey(null);
        setConfirmDeleteApptKey(null);
      }
      if (unlockedApptId && !target?.closest(`[data-appt-card-id="${unlockedApptId}"]`) && !target?.closest('[data-no-drag="true"]')) {
        commitUnlockEdit();
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [openApptMenuKey, unlockedApptId]);

  // Current time marker in Egypt time (Africa/Cairo)
  const [nowTime, setNowTime] = useState<{ hour: number; minute: number; timeStr: string }>(() => {
    const cairo = getCairoNowParts();
    return {
      hour: cairo.hour,
      minute: cairo.minute,
      timeStr: cairo.timeStr
    };
  });

  useEffect(() => {
    const updateTime = () => {
      const cairo = getCairoNowParts();
      setNowTime(prev =>
        prev.timeStr === cairo.timeStr
          ? prev
          : {
              hour: cairo.hour,
              minute: cairo.minute,
              timeStr: cairo.timeStr
            }
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 15000);
    return () => clearInterval(timer);
  }, []);

  // Filtered appointments (respecting single-branch restriction and appointmentsOwnOnly)
  const filteredAppointments = useMemo(
    () =>
      appointments.filter(a => {
        if (!isUnitAllowed(a.unitId, a.unitName)) return false;
        if (currentUser.permissions?.appointmentsOwnOnly) {
          if (!currentUser.doctorId || a.doctorId !== currentUser.doctorId) return false;
        }
        if (!restrictedUnit && selectedUnitFilter !== 'all' && a.unitId !== selectedUnitFilter) return false;
        if (selectedDoctorFilter !== 'all' && a.doctorId !== selectedDoctorFilter) return false;
        return true;
      }),
    [appointments, isUnitAllowed, currentUser.permissions?.appointmentsOwnOnly, currentUser.doctorId, restrictedUnit, selectedUnitFilter, selectedDoctorFilter]
  );

  const todayStr = getTodayDateString();

  // Status mapping (opaque backgrounds so the live time line beneath cards stays visually underneath)
  const statusMeta: Record<AppointmentStatus, { label: string; badgeClass: string; borderClass: string; bgClass: string }> = {
    booked: { label: 'محجوز', badgeClass: 'bg-slate-100 text-slate-800', borderClass: 'border-r-slate-400', bgClass: 'bg-white' },
    confirmed: { label: 'مؤكد', badgeClass: 'bg-blue-100 text-blue-800', borderClass: 'border-r-blue-500', bgClass: 'bg-blue-50' },
    arrived: { label: 'وصل العيادة', badgeClass: 'bg-amber-100 text-amber-800', borderClass: 'border-r-amber-500', bgClass: 'bg-amber-50' },
    completed: { label: 'تمت الزيارة', badgeClass: 'bg-emerald-100 text-emerald-800', borderClass: 'border-r-emerald-500', bgClass: 'bg-emerald-50' },
    cancelled: { label: 'ملغي', badgeClass: 'bg-rose-100 text-rose-800', borderClass: 'border-r-rose-400', bgClass: 'bg-rose-50' },
    no_show: { label: 'لم يحضر', badgeClass: 'bg-red-100 text-red-800', borderClass: 'border-r-red-500', bgClass: 'bg-red-50' }
  };

  const apptStatusOptions: ColoredSelectOption[] = (
    ['booked', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show'] as AppointmentStatus[]
  ).map(s => ({
    value: s,
    label: statusMeta[s].label,
    colorHex: APPOINTMENT_STATUS_COLOR_HEX[s]?.hex,
    badgeClass: statusMeta[s].badgeClass
  }));

  // Day Hours: default 1:00 PM (13) to 11:00 PM (23), expanding earlier if needed
  const { dayAppointments, DAY_HOURS } = useMemo(() => {
    const dayAppts = filteredAppointments.filter(a => a.date === currentDate);
    let minHour = 13;
    let maxEndHour = 23;
    for (let i = 0; i < dayAppts.length; i++) {
      const a = dayAppts[i];
      const [hStr, mStr] = (a.time || '').split(':');
      const h = parseInt(hStr, 10);
      if (!isNaN(h)) {
        if (h < minHour) minHour = h;
        const m = parseInt(mStr, 10) || 0;
        const endHour = Math.floor((h * 60 + m + (a.durationMinutes || 30) - 1) / 60);
        if (endHour > maxEndHour) maxEndHour = Math.min(23, endHour);
      }
    }
    const hours: number[] = [];
    for (let h = Math.max(8, minHour); h <= Math.max(23, maxEndHour); h++) {
      hours.push(h);
    }
    return { dayAppointments: dayAppts, DAY_HOURS: hours };
  }, [filteredAppointments, currentDate]);

  const HOUR_HEIGHT_PX = 160;
  const gridStartMinutes = DAY_HOURS[0] * 60;
  const gridEndMinutes = (DAY_HOURS[DAY_HOURS.length - 1] + 1) * 60;

  const parseMinutes = (timeStr: string): number => {
    const [hStr, mStr] = (timeStr || '13:00').split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    return (isNaN(h) ? 13 : h) * 60 + (isNaN(m) ? 0 : m);
  };

  const minutesToTime24 = (totalMins: number): string => {
    const clamped = Math.max(0, Math.min(24 * 60 - 1, totalMins));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const clearPendingLongPress = () => {
    if (pendingLongPressRef.current) {
      window.clearTimeout(pendingLongPressRef.current.timerId);
      pendingLongPressRef.current = null;
    }
  };

  const clearPendingSlotLongPress = () => {
    if (pendingSlotLongPressRef.current) {
      window.clearTimeout(pendingSlotLongPressRef.current.timerId);
      pendingSlotLongPressRef.current = null;
    }
  };

  const snapToQuarterHour = (mins: number): number => Math.round(mins / 15) * 15;

  const computeMagneticMinuteFromClientY = (clientY: number): number => {
    const rect = timelineCanvasRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0 || DAY_HOURS.length === 0) return gridStartMinutes;
    const clampedRelY = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
    const totalGridMinutes = DAY_HOURS.length * 60;
    const rawTotalMinutes = gridStartMinutes + (clampedRelY / rect.height) * totalGridMinutes;
    const snapped = snapToQuarterHour(rawTotalMinutes);
    return Math.max(gridStartMinutes, Math.min(gridEndMinutes - 15, snapped));
  };

  // Global pointer tracking during pending long-press, card move/scale drag, and empty-slot magnetic 15-min line drag
  useEffect(() => {
    const getRenderedHourPx = () => {
      const rect = timelineCanvasRef.current?.getBoundingClientRect();
      if (rect && rect.height > 0 && DAY_HOURS.length > 0) {
        return rect.height / DAY_HOURS.length;
      }
      return HOUR_HEIGHT_PX;
    };

    const autoScrollNearEdges = (clientY: number) => {
      const scrollHost = timelineCanvasRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
      if (!scrollHost) {
        if (clientY < 60) window.scrollBy(0, -10);
        else if (clientY > window.innerHeight - 60) window.scrollBy(0, 10);
        return;
      }
      const hostRect = scrollHost.getBoundingClientRect();
      if (clientY < hostRect.top + 52) {
        scrollHost.scrollTop -= 10;
      } else if (clientY > hostRect.bottom - 52) {
        scrollHost.scrollTop += 10;
      }
    };

    const triggerMagneticTick = () => {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (pendingLongPressRef.current) {
        const dx = Math.abs(e.clientX - pendingLongPressRef.current.startX);
        const dy = Math.abs(e.clientY - pendingLongPressRef.current.startY);
        pendingLongPressRef.current.latestY = e.clientY;
        if (dx > 8 || dy > 8) {
          clearPendingLongPress();
        }
      }

      if (pendingSlotLongPressRef.current) {
        const dx = Math.abs(e.clientX - pendingSlotLongPressRef.current.startX);
        const dy = Math.abs(e.clientY - pendingSlotLongPressRef.current.startY);
        pendingSlotLongPressRef.current.latestY = e.clientY;
        if (dx > 8 || dy > 8) {
          clearPendingSlotLongPress();
        }
      }

      // 1. Empty-space magnetic 15-minute time-picker line drag (:00, :15, :30, :45)
      if (slotPickerMinuteRef.current !== null) {
        autoScrollNearEdges(e.clientY);
        const nextMin = computeMagneticMinuteFromClientY(e.clientY);
        if (nextMin !== slotPickerMinuteRef.current) {
          slotPickerMinuteRef.current = nextMin;
          setSlotPickerMinute(nextMin);
          triggerMagneticTick();
        }
        return;
      }

      // 2. Existing appointment card move / resize drag (magnetic on every 15 minutes)
      const active = dragSessionRef.current;
      if (!active) return;

      autoScrollNearEdges(e.clientY);
      const renderedHourPx = getRenderedHourPx();
      const deltaMinutesRaw = ((e.clientY - active.originClientY) / renderedHourPx) * 60;

      if (active.mode === 'move') {
        const rawTargetStart = active.initialStartMin + deltaMinutesRaw;
        const snappedStart = snapToQuarterHour(rawTargetStart);
        const maxStart = Math.max(gridStartMinutes, gridEndMinutes - active.initialDurationMin);
        const nextStart = Math.max(gridStartMinutes, Math.min(maxStart, snappedStart));
        if (nextStart !== active.liveStartMin) {
          const updated: DragSession = { ...active, liveStartMin: nextStart };
          dragSessionRef.current = updated;
          setDragSession(updated);
          triggerMagneticTick();
        }
      } else {
        const rawTargetEnd = active.initialStartMin + active.initialDurationMin + deltaMinutesRaw;
        const snappedEnd = snapToQuarterHour(rawTargetEnd);
        const maxDuration = Math.max(15, Math.min(360, gridEndMinutes - active.initialStartMin));
        const nextDuration = Math.max(
          15,
          Math.min(maxDuration, snappedEnd - active.initialStartMin)
        );
        if (nextDuration !== active.liveDurationMin) {
          const updated: DragSession = { ...active, liveDurationMin: nextDuration };
          dragSessionRef.current = updated;
          setDragSession(updated);
          triggerMagneticTick();
        }
      }
    };

    const handleWindowPointerUp = () => {
      clearPendingLongPress();
      clearPendingSlotLongPress();

      // Commit empty-slot precision line -> open appointment modal at exact HH:MM
      if (slotPickerMinuteRef.current !== null) {
        const chosenMinute = slotPickerMinuteRef.current;
        slotPickerMinuteRef.current = null;
        setSlotPickerMinute(null);
        suppressClickUntilRef.current = Date.now() + 400;

        setIsQuickActionOpen(true, 'appointment', {
          date: currentDate,
          time: minutesToTime24(chosenMinute),
          unitId: selectedUnitFilter !== 'all' ? selectedUnitFilter : undefined,
          doctorId: selectedDoctorFilter !== 'all' ? selectedDoctorFilter : undefined
        });
        return;
      }

      const active = dragSessionRef.current;
      if (!active) return;

      suppressClickUntilRef.current = Date.now() + 280;
      dragSessionRef.current = null;
      setDragSession(null);

      // Hold the updated time/duration in draft until user presses "تم" (or reverts on "إلغاء")
      const prevDraft = draftApptEditRef.current;
      const nextDraft: DraftApptEdit = {
        apptId: active.apptId,
        originalStartMin:
          prevDraft && prevDraft.apptId === active.apptId
            ? prevDraft.originalStartMin
            : active.initialStartMin,
        originalDurationMin:
          prevDraft && prevDraft.apptId === active.apptId
            ? prevDraft.originalDurationMin
            : active.initialDurationMin,
        draftStartMin: active.liveStartMin,
        draftDurationMin: active.liveDurationMin
      };
      draftApptEditRef.current = nextDraft;
      setDraftApptEdit(nextDraft);
    };

    const handleWindowPointerCancel = () => {
      clearPendingLongPress();
      clearPendingSlotLongPress();
      if (slotPickerMinuteRef.current !== null) {
        slotPickerMinuteRef.current = null;
        setSlotPickerMinute(null);
      }
      if (dragSessionRef.current) {
        dragSessionRef.current = null;
        setDragSession(null);
      }
    };

    const handleTouchMovePreventScroll = (e: TouchEvent) => {
      if (dragSessionRef.current || slotPickerMinuteRef.current !== null) {
        e.preventDefault();
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);
    window.addEventListener('touchmove', handleTouchMovePreventScroll, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
      window.removeEventListener('touchmove', handleTouchMovePreventScroll);
    };
  }, [
    DAY_HOURS.length,
    gridStartMinutes,
    gridEndMinutes,
    currentDate,
    selectedUnitFilter,
    selectedDoctorFilter,
    setIsQuickActionOpen,
    updateAppointment
  ]);

  const handleEmptyCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canAddAppointments) return;
    if (e.button !== undefined && e.button !== 0) return;

    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('[data-appt-card-id]') || targetEl?.closest('[data-no-drag="true"]')) {
      return;
    }

    clearPendingLongPress();
    clearPendingSlotLongPress();

    const startX = e.clientX;
    const startY = e.clientY;

    const timerId = window.setTimeout(() => {
      const pending = pendingSlotLongPressRef.current;
      if (!pending) return;
      pendingSlotLongPressRef.current = null;

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }

      setOpenApptMenuKey(null);
      if (draftApptEditRef.current) {
        commitUnlockEdit();
      } else {
        setUnlockedApptId(null);
      }
      suppressClickUntilRef.current = Date.now() + 450;

      const initialSnappedMin = computeMagneticMinuteFromClientY(pending.latestY);
      slotPickerMinuteRef.current = initialSnappedMin;
      setSlotPickerMinute(initialSnappedMin);
    }, 260);

    pendingSlotLongPressRef.current = {
      timerId,
      startX,
      startY,
      latestY: startY
    };
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    appt: Appointment,
    forcedMode?: 'resize'
  ) => {
    if (!canEditAppointments) return;
    if (e.button !== undefined && e.button !== 0) return;

    const targetEl = e.target as HTMLElement | null;
    if (!forcedMode && targetEl?.closest('[data-no-drag="true"]')) {
      return;
    }

    const baseStartMin = parseMinutes(appt.time);
    const baseDurationMin = Math.max(15, appt.durationMinutes || 30);
    const activeDraft =
      draftApptEditRef.current && draftApptEditRef.current.apptId === appt.id
        ? draftApptEditRef.current
        : null;
    const initialStartMin = activeDraft ? activeDraft.draftStartMin : baseStartMin;
    const initialDurationMin = activeDraft ? activeDraft.draftDurationMin : baseDurationMin;

    // Detect if user pressed near the bottom 12px edge of the card
    const cardRect = e.currentTarget.getBoundingClientRect();
    const isNearBottomEdge = forcedMode === 'resize' || cardRect.bottom - e.clientY <= 12;
    const desiredMode: 'move' | 'resize' = isNearBottomEdge ? 'resize' : 'move';

    // If already unlocked (or explicitly grabbing the resize handle), begin dragging immediately
    if (unlockedApptId === appt.id || forcedMode === 'resize') {
      e.stopPropagation();
      setOpenApptMenuKey(null);
      if (draftApptEditRef.current && draftApptEditRef.current.apptId !== appt.id) {
        commitUnlockEdit();
      }
      if (!draftApptEditRef.current || draftApptEditRef.current.apptId !== appt.id) {
        const initDraft: DraftApptEdit = {
          apptId: appt.id,
          originalStartMin: baseStartMin,
          originalDurationMin: baseDurationMin,
          draftStartMin: initialStartMin,
          draftDurationMin: initialDurationMin
        };
        draftApptEditRef.current = initDraft;
        setDraftApptEdit(initDraft);
      }
      setUnlockedApptId(appt.id);
      suppressClickUntilRef.current = Date.now() + 280;
      const immediateSession: DragSession = {
        apptId: appt.id,
        mode: desiredMode,
        originClientY: e.clientY,
        initialStartMin,
        initialDurationMin,
        liveStartMin: initialStartMin,
        liveDurationMin: initialDurationMin
      };
      dragSessionRef.current = immediateSession;
      setDragSession(immediateSession);
      return;
    }

    // Otherwise start ~280ms long-press detection so quick taps & vertical page scroll still work normally
    clearPendingLongPress();
    const startX = e.clientX;
    const startY = e.clientY;
    const timerId = window.setTimeout(() => {
      const pending = pendingLongPressRef.current;
      if (!pending || pending.apptId !== appt.id) return;
      pendingLongPressRef.current = null;

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }

      setOpenApptMenuKey(null);
      if (draftApptEditRef.current && draftApptEditRef.current.apptId !== appt.id) {
        commitUnlockEdit();
      }
      const initDraft: DraftApptEdit = {
        apptId: appt.id,
        originalStartMin: baseStartMin,
        originalDurationMin: baseDurationMin,
        draftStartMin: pending.initialStartMin,
        draftDurationMin: pending.initialDurationMin
      };
      draftApptEditRef.current = initDraft;
      setDraftApptEdit(initDraft);
      setUnlockedApptId(appt.id);
      suppressClickUntilRef.current = Date.now() + 350;

      const activatedSession: DragSession = {
        apptId: appt.id,
        mode: pending.mode,
        originClientY: pending.latestY,
        initialStartMin: pending.initialStartMin,
        initialDurationMin: pending.initialDurationMin,
        liveStartMin: pending.initialStartMin,
        liveDurationMin: pending.initialDurationMin
      };
      dragSessionRef.current = activatedSession;
      setDragSession(activatedSession);
    }, 280);

    pendingLongPressRef.current = {
      timerId,
      apptId: appt.id,
      mode: desiredMode,
      startX,
      startY,
      latestY: startY,
      initialStartMin,
      initialDurationMin
    };
  };

  // Patient Tags quick modal helpers
  const tagModalPatient = tagModalPatientId
    ? patients.find(p => p.id === tagModalPatientId) || null
    : null;

  const handleTogglePatientTag = (patientId: string, tag: string) => {
    const target = patients.find(p => p.id === patientId);
    if (!target) return;
    const existing = target.tags || [];
    const nextTags = existing.includes(tag)
      ? existing.filter(t => t !== tag)
      : [...existing, tag];
    updatePatient(patientId, { tags: nextTags });
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagModalPatient || !customTagInput.trim()) return;
    const clean = customTagInput.trim();
    addPatientTag(clean);
    const existing = tagModalPatient.tags || [];
    if (!existing.includes(clean)) {
      updatePatient(tagModalPatient.id, { tags: [...existing, clean] });
    }
    setCustomTagInput('');
  };

  const renderApptThreeDotsMenu = (
    appt: Appointment,
    menuKey: string,
    openUpward = false
  ) => {
    const hasAnyMenuAction =
      canAddInvoicesPayments || canEditPatients || canAddClinicalNotes || canEditAppointments || canDeleteAppointments;
    if (!hasAnyMenuAction) return null;

    const isMenuOpen = openApptMenuKey === menuKey;
    const isConfirmingDelete = confirmDeleteApptKey === menuKey;
    return (
      <div
        data-no-drag="true"
        data-appt-menu-root="true"
        onClick={e => e.stopPropagation()}
        className="relative flex-shrink-0"
      >
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            setConfirmDeleteApptKey(null);
            setOpenApptMenuKey(prev => (prev === menuKey ? null : menuKey));
          }}
          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            isMenuOpen
              ? 'bg-[#087e83] text-white shadow-xs'
              : 'text-slate-500 hover:text-[#087e83] hover:bg-white/90'
          }`}
          title="خيارات الموعد"
          aria-label="خيارات الموعد"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        {isMenuOpen && (
          <div
            className={`absolute left-0 ${
              openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            } z-[999] w-48 bg-white border border-[#d6e5e8] rounded-2xl shadow-2xl py-1.5 text-xs font-bold text-[#172f3d] animate-in fade-in duration-100`}
          >
            {canAddInvoicesPayments && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOpenApptMenuKey(null);
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
                    setOpenApptMenuKey(null);
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
                  setOpenApptMenuKey(null);
                  setNoteModalTarget({ patientId: appt.patientId, patientName: appt.patientName });
                }}
                className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
              >
                <StickyNote className="w-3.5 h-3.5 text-teal-600" />
                <span>إضافة ملاحظة</span>
              </button>
            )}

            {canEditPatients && (
              <button
                type="button"
                onClick={() => {
                  setOpenApptMenuKey(null);
                  setCustomTagInput('');
                  setTagModalPatientId(appt.patientId);
                }}
                className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5 text-amber-600" />
                <span>إضافة تاج</span>
              </button>
            )}

            {(canEditAppointments || canDeleteAppointments) && (canAddInvoicesPayments || canEditPatients || canAddClinicalNotes) && (
              <div className="my-1 border-t border-slate-100" />
            )}

            {canEditAppointments && (
              <button
                type="button"
                onClick={() => {
                  setOpenApptMenuKey(null);
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
                  if (!isConfirmingDelete) {
                    setConfirmDeleteApptKey(menuKey);
                    return;
                  }
                  deleteAppointment(appt.id);
                  setConfirmDeleteApptKey(null);
                  setOpenApptMenuKey(null);
                }}
                className={`w-full px-3 py-2 text-right flex items-center gap-2 transition-colors cursor-pointer ${
                  isConfirmingDelete
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'text-rose-600 hover:bg-rose-50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isConfirmingDelete ? 'اضغط مرة أخرى لتأكيد الحذف' : 'حذف الموعد'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  interface PositionedAppt {
    appt: Appointment;
    startMin: number;
    endMin: number;
    durationMin: number;
    topPx: number;
    heightPx: number;
    colIndex: number;
    totalCols: number;
  }

  const positionedDayAppointments: PositionedAppt[] = useMemo(() => {
    if (calendarMode !== 'day') return [];
    const items = dayAppointments
      .map(appt => {
        const startMin = parseMinutes(appt.time);
        const dur = Math.max(15, appt.durationMinutes || 30);
        const endMin = startMin + dur;
        return { appt, startMin, endMin };
      })
      .sort((a, b) => (a.startMin !== b.startMin ? a.startMin - b.startMin : a.endMin - b.endMin));

    // Group overlapping appointments into clusters and assign columns
    const clusters: Array<Array<{ appt: Appointment; startMin: number; endMin: number; colIndex: number }>> = [];
    let currentCluster: Array<{ appt: Appointment; startMin: number; endMin: number; colIndex: number }> = [];
    let clusterMaxEnd = -1;

    for (const item of items) {
      if (currentCluster.length === 0 || item.startMin < clusterMaxEnd) {
        currentCluster.push({ ...item, colIndex: 0 });
        clusterMaxEnd = Math.max(clusterMaxEnd, item.endMin);
      } else {
        clusters.push(currentCluster);
        currentCluster = [{ ...item, colIndex: 0 }];
        clusterMaxEnd = item.endMin;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    const result: PositionedAppt[] = [];
    for (const cluster of clusters) {
      const colEnds: number[] = [];
      for (const node of cluster) {
        let assignedCol = colEnds.findIndex(endT => endT <= node.startMin);
        if (assignedCol === -1) {
          assignedCol = colEnds.length;
          colEnds.push(node.endMin);
        } else {
          colEnds[assignedCol] = node.endMin;
        }
        node.colIndex = assignedCol;
      }
      const totalCols = Math.max(1, colEnds.length);

      for (const node of cluster) {
        const isBeingDragged = dragSession?.apptId === node.appt.id;
        const hasDraft = draftApptEdit?.apptId === node.appt.id;
        const effectiveStart = isBeingDragged
          ? dragSession.liveStartMin
          : hasDraft
          ? draftApptEdit.draftStartMin
          : node.startMin;
        const effectiveDuration = isBeingDragged
          ? dragSession.liveDurationMin
          : hasDraft
          ? draftApptEdit.draftDurationMin
          : Math.max(15, node.appt.durationMinutes || 30);
        const effectiveEnd = effectiveStart + effectiveDuration;

        const clampedStart = Math.max(gridStartMinutes, effectiveStart);
        const clampedEnd = Math.min(gridEndMinutes, Math.max(clampedStart + 15, effectiveEnd));
        const topPx = ((clampedStart - gridStartMinutes) / 60) * HOUR_HEIGHT_PX + 2;
        const heightPx = Math.max(totalCols > 1 ? 56 : 36, ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT_PX - 4);
        result.push({
          appt: node.appt,
          startMin: effectiveStart,
          endMin: effectiveEnd,
          durationMin: effectiveDuration,
          topPx,
          heightPx,
          colIndex: node.colIndex,
          totalCols
        });
      }
    }
    return result;
  }, [calendarMode, dayAppointments, dragSession, draftApptEdit, gridStartMinutes, gridEndMinutes]);

  // Jump to hour chips
  const busyHours = useMemo(() => {
    if (calendarMode !== 'day') return [];
    const countsByHour = new Map<number, number>();
    for (let i = 0; i < dayAppointments.length; i++) {
      const h = parseInt((dayAppointments[i].time || '').split(':')[0], 10);
      if (!isNaN(h)) countsByHour.set(h, (countsByHour.get(h) || 0) + 1);
    }
    return DAY_HOURS.map(hour => ({ hour, count: countsByHour.get(hour) || 0 })).filter(h => h.count > 0);
  }, [calendarMode, DAY_HOURS, dayAppointments]);

  // Week Days (Saturday to Friday)
  const weekDays = useMemo(() => {
    if (calendarMode !== 'week') return [];
    const base = parseYmdNoon(currentDate);
    // Egyptian week starts on Saturday (day 6)
    const dayOfWeek = base.getDay();
    const diffToSaturday = (dayOfWeek + 1) % 7;
    const saturday = new Date(base);
    saturday.setDate(base.getDate() - diffToSaturday);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(saturday);
      d.setDate(saturday.getDate() + i);
      const iso = formatYmdLocal(d);
      const name = d.toLocaleDateString('ar-EG', { weekday: 'short' });
      const dayNum = d.getDate();
      days.push({ iso, name, dayNum });
    }
    return days;
  }, [calendarMode, currentDate]);

  // Month Grid Calculation (computed only in month view with O(1) date lookup)
  const monthGrid = useMemo(() => {
    if (calendarMode !== 'month') return [];
    const base = parseYmdNoon(currentDate);
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDay = new Date(year, month, 1, 12, 0, 0);
    const lastDay = new Date(year, month + 1, 0, 12, 0, 0);
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;

    const countsByDate = new Map<string, number>();
    for (let i = 0; i < filteredAppointments.length; i++) {
      const dStr = filteredAppointments[i].date;
      if (dStr && dStr.startsWith(monthPrefix)) {
        countsByDate.set(dStr, (countsByDate.get(dStr) || 0) + 1);
      }
    }

    // Padding for Saturday start
    const startDayIndex = (firstDay.getDay() + 1) % 7;
    const totalDays = lastDay.getDate();

    const cells: Array<{ isCurrentMonth: boolean; dayNum: number | string; dateStr: string; count?: number }> = [];
    // Prev month padding
    for (let i = 0; i < startDayIndex; i++) {
      cells.push({ isCurrentMonth: false, dayNum: '', dateStr: '' });
    }
    // Days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${monthPrefix}${String(d).padStart(2, '0')}`;
      cells.push({ isCurrentMonth: true, dayNum: d, dateStr, count: countsByDate.get(dateStr) || 0 });
    }
    return cells;
  }, [calendarMode, currentDate, filteredAppointments]);

  const currentMonthName = useMemo(
    () => parseYmdNoon(currentDate).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
    [currentDate]
  );

  const nowTotalMinutes = nowTime.hour * 60 + nowTime.minute;
  const showLiveLine =
    currentDate === todayStr &&
    nowTotalMinutes >= gridStartMinutes &&
    nowTotalMinutes <= gridEndMinutes;
  const liveLineTopPx = ((nowTotalMinutes - gridStartMinutes) / 60) * HOUR_HEIGHT_PX;

  // Auto-scroll smoothly to the red current-time line when opening Day Planner
  useEffect(() => {
    if (calendarMode !== 'day') {
      lastAutoScrollKeyRef.current = '';
      return;
    }
    if (!showLiveLine) return;
    const scrollKey = `day:${currentDate}`;
    if (lastAutoScrollKeyRef.current === scrollKey) return;
    lastAutoScrollKeyRef.current = scrollKey;

    const timerId = window.setTimeout(() => {
      liveLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
    return () => window.clearTimeout(timerId);
  }, [calendarMode, currentDate, showLiveLine]);

  return (
    <div className="space-y-4 animate-in fade-in duration-150 overflow-x-hidden">
      {/* 1. Header Toolbar & View Switcher */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#edf4f5] border border-[#dce8eb] rounded-2xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setCalendarMode('day')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              calendarMode === 'day' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            اليومي (Day)
          </button>
          <button
            type="button"
            onClick={() => setCalendarMode('week')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              calendarMode === 'week' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            الأسبوعي (Week)
          </button>
          <button
            type="button"
            onClick={() => setCalendarMode('month')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              calendarMode === 'month' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            الشهري (Month)
          </button>
        </div>

        {/* Date Pager */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => stepDate(-1)}
            className="px-2.5 py-1.5 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#172f3d] font-bold text-xs flex items-center gap-1 cursor-pointer"
            title="اليوم السابق"
          >
            <ChevronRight className="w-4 h-4 text-[#087e83]" />
            <span>السابق</span>
          </button>

          <button
            type="button"
            onClick={resetToToday}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              currentDate === todayStr
                ? 'bg-[#e7f5f2] border-[#bfe2db] text-[#087e83]'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {currentDate === todayStr ? 'اليوم' : 'الرجوع لليوم'}
          </button>

          <button
            type="button"
            onClick={() => {
              const [y, m] = currentDate.split('-').map(Number);
              setPickerMonth({ year: y || 2026, month: m || 1 });
              setIsDateCalendarOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-[#f8fbfb] hover:bg-[#e7f5f2] border border-[#dce8eb] hover:border-[#087e83] text-[#172f3d] font-bold text-xs sm:text-sm min-w-[115px] flex items-center justify-center gap-1.5 font-mono transition-colors cursor-pointer"
            title="اضغط لاختيار اليوم من التقويم"
          >
            <Calendar className="w-3.5 h-3.5 text-[#087e83] flex-shrink-0" />
            <span>{currentDate}</span>
          </button>

          <button
            type="button"
            onClick={() => stepDate(1)}
            className="px-2.5 py-1.5 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#172f3d] font-bold text-xs flex items-center gap-1 cursor-pointer"
            title="اليوم القادم"
          >
            <span>القادم</span>
            <ChevronLeft className="w-4 h-4 text-[#087e83]" />
          </button>
        </div>

        {/* Filters & Action */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={restrictedUnit ? restrictedUnit.id : selectedUnitFilter}
            onChange={e => setSelectedUnitFilter(e.target.value)}
            disabled={Boolean(restrictedUnit)}
            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] disabled:bg-slate-50"
          >
            {!restrictedUnit && <option value="all">جميع العيادات</option>}
            {units
              .filter(u => isUnitAllowed(u.id, u.name))
              .map(u => (
                <option key={u.id} value={u.id}>
                  {u.name.split('-')[0]}{u.isDisabled ? ' (معطّل)' : ''}
                </option>
              ))}
          </select>

          {!currentUser.permissions?.appointmentsOwnOnly && (
            <select
              value={selectedDoctorFilter}
              onChange={e => setSelectedDoctorFilter(e.target.value)}
              className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
            >
              <option value="all">جميع الأطباء</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.isDisabled ? ' (معطّل)' : ''}
                </option>
              ))}
            </select>
          )}

          {canAddAppointments && (
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'appointment', { date: currentDate })}
              className="px-3.5 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">حجز موعد</span>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Arabic Weekday Title Banner (below filters, above calendar) */}
      <div className="bg-white border border-[#dce8eb] rounded-2xl px-4 py-3 shadow-xs flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
            {getArabicWeekdayName(currentDate)}
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold text-[#087e83] bg-[#e7f5f2] border border-[#bfe2db] px-2.5 py-0.5 rounded-lg" dir="ltr">
            {currentDate}
          </span>
          {isDateClinicHoliday(currentDate) && (
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
              إجازة
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-slate-500">
          {dayAppointments.length} موعد
        </span>
      </div>

      {/* 2. MODE: DAY PLANNER (Proportional hour & minute grid directly under toolbar) */}
      {calendarMode === 'day' && (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-3 sm:p-4 shadow-sm space-y-3">
          {/* Active Unlocked Card Banner */}
          {unlockedApptId && (
            <div
              data-no-drag="true"
              className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-2xl bg-[#e7f5f2] border-2 border-[#087e83] text-xs font-bold text-[#087e83] shadow-sm flex-wrap"
            >
              <span className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                <MoveVertical className="w-4 h-4 flex-shrink-0" />
                <span>وضع تعديل الموعد مفعل (يثبت كل ١٥ دقيقة) — اسحب الكارت لتحريك البداية أو المقبض السفلي لتطويل الجلسة</span>
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    cancelUnlockEdit();
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs sm:text-sm font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer transition-transform"
                >
                  <X className="w-4 h-4 stroke-[3]" />
                  <span>إلغاء</span>
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    commitUnlockEdit();
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs sm:text-sm font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer transition-transform"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>تم</span>
                </button>
              </div>
            </div>
          )}

          {/* Sticky Floating Done / Cancel Bar on Screen when a Card is Unlocked */}
          {unlockedApptId && !dragSession && (
            <div
              data-no-drag="true"
              className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#172f3d] text-white pl-2 pr-3.5 py-2 rounded-2xl shadow-2xl border-2 border-emerald-400 animate-in fade-in duration-150"
            >
              <span className="text-xs font-bold text-slate-100 whitespace-nowrap hidden sm:inline">
                انتهيت من ضبط الميعاد؟
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  cancelUnlockEdit();
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs sm:text-sm font-extrabold shadow-lg flex items-center gap-1 cursor-pointer transition-transform"
              >
                <X className="w-4 h-4 stroke-[3]" />
                <span>إلغاء</span>
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  commitUnlockEdit();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs sm:text-sm font-extrabold shadow-lg flex items-center gap-1 cursor-pointer transition-transform"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>تم</span>
              </button>
            </div>
          )}

          {/* Proportional Hourly Timeline */}
          <div className="relative border-2 border-[#94b2b9] rounded-2xl flex bg-white">
            {/* Live Proportional Red Time Line spanning across the calendar underneath appointment cards */}
            {showLiveLine && (
              <div
                ref={liveLineRef}
                className={`absolute left-0 right-0 z-[15] pointer-events-none flex items-center ${
                  nowTotalMinutes - gridStartMinutes < 8 ? 'translate-y-0' : '-translate-y-1/2'
                }`}
                style={{ top: `${liveLineTopPx}px` }}
              >
                <div className="w-24 sm:w-28 flex justify-end pl-1.5 flex-shrink-0">
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white font-mono text-[10px] font-extrabold shadow-sm leading-none whitespace-nowrap">
                    {formatCairoTime(nowTime.timeStr)}
                  </span>
                </div>
                <div className="flex-1 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white shadow-sm -mr-1.5 flex-shrink-0" />
                  <div className="flex-1 h-[2px] bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.45)]" />
                </div>
              </div>
            )}

            {/* Long-Press Empty-Space Draggable Minute-Precision Booking Line */}
            {slotPickerMinute !== null && (() => {
              const pickerTopPx = ((slotPickerMinute - gridStartMinutes) / 60) * HOUR_HEIGHT_PX;
              const pickerTime24 = minutesToTime24(slotPickerMinute);
              const pickerCairoStr = formatCairoTime(pickerTime24);
              const previewDurMin = Math.min(30, gridEndMinutes - slotPickerMinute);
              const previewHeightPx = Math.max(18, (previewDurMin / 60) * HOUR_HEIGHT_PX);
              const showBadgeBelow = slotPickerMinute - gridStartMinutes < 22;

              return (
                <div
                  className="absolute left-0 right-0 z-50 pointer-events-none select-none"
                  style={{ top: `${pickerTopPx}px` }}
                >
                  {/* Exact time line spanning right axis + canvas */}
                  <div className="flex items-center -translate-y-1/2">
                    <div className="w-24 sm:w-28 flex justify-end pl-1.5 flex-shrink-0">
                      <span
                        dir="ltr"
                        className="px-1.5 py-0.5 rounded-md bg-[#087e83] text-white font-mono text-[10px] font-extrabold shadow-md ring-2 ring-white leading-none whitespace-nowrap"
                      >
                        {pickerCairoStr}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center relative">
                      <span className="w-3 h-3 rounded-full bg-[#087e83] ring-2 ring-white shadow-md -mr-1.5 flex-shrink-0" />
                      <div className="flex-1 h-[2.5px] bg-[#087e83] shadow-[0_0_10px_rgba(8,126,131,0.65)]" />

                      {/* Floating prominent exact hour:minute callout above finger */}
                      <div
                        className={`absolute right-2 sm:right-5 ${
                          showBadgeBelow ? 'top-3' : '-top-10'
                        } bg-[#172f3d] text-white border border-[#087e83] px-3 py-1 rounded-xl shadow-2xl flex items-center gap-2 whitespace-nowrap`}
                      >
                        <Clock className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
                        <span dir="ltr" className="font-mono text-xs sm:text-sm font-extrabold text-emerald-300">
                          {pickerCairoStr}
                        </span>
                        <span className="text-[10px] font-bold text-slate-200">
                          افلت لحجز الموعد
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Subtle 30-min ghost preview block below the line */}
                  <div className="flex">
                    <div className="w-24 sm:w-28 flex-shrink-0" />
                    <div className="flex-1 px-1.5 -mt-1.5">
                      <div
                        style={{ height: `${previewHeightPx}px` }}
                        className="w-full rounded-xl bg-[#087e83]/12 border border-dashed border-[#087e83]/50"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Right Column: Fixed Hour Labels + "حجز جديد" Buttons */}
            <div className="w-24 sm:w-28 flex-shrink-0 border-l-2 border-[#94b2b9] bg-[#f4f9f9] rounded-r-[14px] divide-y-2 divide-[#94b2b9] relative z-10 select-none">
              {DAY_HOURS.map(hour => {
                const hourTimeStr = `${String(hour).padStart(2, '0')}:00`;
                return (
                  <div
                    key={hour}
                    id={`hour-row-${hour}`}
                    style={{ height: `${HOUR_HEIGHT_PX}px` }}
                    className="p-2.5 sm:p-3 flex flex-col justify-start gap-2"
                  >
                    <span className="font-mono font-bold text-xs sm:text-sm text-[#087e83]">
                      {hour > 12 ? `${String(hour - 12).padStart(2, '0')}:00` : hour === 0 ? '12:00' : `${String(hour).padStart(2, '0')}:00`}
                      <span className="text-[10px] text-slate-500 mr-1 uppercase">
                        {hour >= 12 ? 'PM' : 'AM'}
                      </span>
                    </span>

                    {canAddAppointments && (
                      <button
                        type="button"
                        onClick={() =>
                          setIsQuickActionOpen(true, 'appointment', {
                            date: currentDate,
                            time: hourTimeStr,
                            unitId: selectedUnitFilter !== 'all' ? selectedUnitFilter : undefined,
                            doctorId: selectedDoctorFilter !== 'all' ? selectedDoctorFilter : undefined
                          })
                        }
                        className="w-full text-[11px] text-[#087e83] hover:text-white font-bold bg-[#e7f5f2] hover:bg-[#087e83] border border-[#c7e6de] py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                        <span>حجز جديد</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Left Canvas: Hour Background Slots (:00 & :30 guides) + Proportional Appointment Blocks */}
            <div
              ref={timelineCanvasRef}
              onPointerDown={handleEmptyCanvasPointerDown}
              className={`flex-1 relative min-w-0 rounded-l-[14px] ${
                slotPickerMinute !== null ? 'touch-none cursor-ns-resize' : ''
              }`}
              style={{ height: `${DAY_HOURS.length * HOUR_HEIGHT_PX}px` }}
            >
              {/* Background Hour Rows with visual 15-minute magnetic guides (NO single-click creation) */}
              <div className="divide-y-2 divide-[#94b2b9] h-full rounded-l-[14px] overflow-hidden select-none">
                {DAY_HOURS.map(hour => (
                  <div
                    key={hour}
                    style={{ height: `${HOUR_HEIGHT_PX}px` }}
                    className="flex flex-col relative"
                  >
                    {/* :00 -> :15 */}
                    <div className="flex-1 border-b border-dotted border-slate-200/80" />
                    {/* :15 -> :30 */}
                    <div className="flex-1 border-b border-dashed border-[#b8ced3]" />
                    {/* :30 -> :45 */}
                    <div className="flex-1 border-b border-dotted border-slate-200/80" />
                    {/* :45 -> :00 */}
                    <div className="flex-1" />
                  </div>
                ))}
              </div>

              {/* Proportional Appointment Cards Overlay */}
              {positionedDayAppointments.map(({ appt, startMin, endMin, durationMin, topPx, heightPx, colIndex, totalCols }) => {
                const meta = statusMeta[appt.status];
                const isSideBySide = totalCols > 1;
                const isCompact = heightPx < 68;
                const isMedium = heightPx >= 68 && heightPx < 108;
                const startTimeStr = minutesToTime24(startMin);
                const endTimeStr = minutesToTime24(endMin);
                const menuKey = `day:${appt.id}`;
                const isMenuOpen = openApptMenuKey === menuKey;
                const isUnlocked = unlockedApptId === appt.id;
                const isDraggingThis = dragSession?.apptId === appt.id;
                const openMenuUpward = endMin >= gridEndMinutes - 100;
                const patTags = (patients.find(p => p.id === appt.patientId)?.tags || []).filter(t => patientTags.includes(t));

                const statusSelectEl = canEditAppointments ? (
                  <ColoredSelect
                    size="xs"
                    stopPropagation
                    value={appt.status}
                    options={apptStatusOptions}
                    onChange={val => updateAppointmentStatus(appt.id, val as AppointmentStatus)}
                    ariaLabel="حالة الموعد"
                    className="max-w-[92px] sm:max-w-none flex-shrink-0"
                  />
                ) : (
                  <span
                    className={`text-[10px] font-extrabold rounded-lg px-1.5 py-0.5 border border-black/10 flex-shrink-0 max-w-[82px] sm:max-w-none truncate ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>
                );

                return (
                  <div
                    key={appt.id}
                    data-appt-card-id={appt.id}
                    onClick={e => e.stopPropagation()}
                    onPointerDown={e => handleCardPointerDown(e, appt)}
                    style={{
                      top: `${topPx}px`,
                      height: `${heightPx}px`,
                      right: `calc(${(colIndex / totalCols) * 100}% + 4px)`,
                      width: `calc(${100 / totalCols}% - 8px)`
                    }}
                    className={`absolute rounded-xl border border-r-4 ${meta.borderClass} ${meta.bgClass} select-none flex flex-col justify-between ${
                      isCompact || isSideBySide ? 'px-2 py-1' : isMedium ? 'px-2.5 py-1.5' : 'p-2.5'
                    } ${
                      isDraggingThis
                        ? 'z-50 border-[#087e83] ring-2 ring-[#087e83] shadow-2xl cursor-grabbing touch-none'
                        : isUnlocked
                        ? 'z-40 border-[#087e83] ring-2 ring-[#087e83]/80 shadow-xl cursor-grab touch-none'
                        : isMenuOpen
                        ? 'z-50 border-[#087e83] shadow-lg'
                        : 'z-20 border-[#c8dce0] shadow-sm hover:shadow-md hover:z-30 transition-shadow'
                    }`}
                  >
                    {/* Floating Live Time & Duration Pill + Cancel (إلغاء) & Done (تم) Buttons anchored left-0 so it overlaps hour column on the right instead of shifting the page left */}
                    {(isUnlocked || isDraggingThis) && (
                      <div
                        data-no-drag="true"
                        className={`absolute ${
                          startMin - gridStartMinutes < 25 ? 'top-full mt-3.5' : '-top-12'
                        } left-0 z-50 flex items-center gap-1.5 bg-[#172f3d] text-white px-2.5 py-1.5 rounded-2xl shadow-2xl border-2 border-[#087e83] whitespace-nowrap max-w-[calc(100vw-2rem)]`}
                      >
                        <span className="font-mono text-[11px] sm:text-xs font-extrabold" dir="ltr">
                          {formatCairoTime(startTimeStr)} - {formatCairoTime(endTimeStr)}
                        </span>
                        <span className="text-emerald-300 text-[11px] sm:text-xs font-extrabold">({durationMin} د)</span>
                        {!isDraggingThis && (
                          <>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                cancelUnlockEdit();
                              }}
                              className="mr-0.5 px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-extrabold shadow-md flex items-center gap-1 cursor-pointer transition-transform"
                            >
                              <X className="w-3.5 h-3.5 stroke-[3]" />
                              <span>إلغاء</span>
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                commitUnlockEdit();
                              }}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-extrabold shadow-md flex items-center gap-1 cursor-pointer transition-transform"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>تم</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Inner Card Content — Strictly contained within card height & width without clipping the 3-dots dropdown */}
                    <div className="flex flex-col justify-between h-full min-w-0">
                      {isSideBySide ? (
                        /* SIDE-BY-SIDE CARDS: Patient Name top row, Status + 3 Dots below */
                        <div className="flex flex-col justify-between h-full min-w-0 gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (Date.now() < suppressClickUntilRef.current || isUnlocked) return;
                              goToPatient(appt.patientId);
                            }}
                            title={`${appt.patientName} (${formatCairoTime(startTimeStr)} - ${formatCairoTime(endTimeStr)})`}
                            className="w-full font-bold text-slate-900 text-[11px] sm:text-xs hover:text-[#087e83] hover:underline truncate text-right cursor-pointer leading-tight overflow-hidden"
                          >
                            {appt.patientName}
                          </button>
                          <div className="flex items-center justify-between gap-1 min-w-0 flex-shrink-0" data-no-drag="true">
                            <div className="min-w-0 overflow-hidden">{statusSelectEl}</div>
                            {renderApptThreeDotsMenu(appt, menuKey, openMenuUpward)}
                          </div>
                          {heightPx >= 94 && (
                            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-600 min-w-0 overflow-hidden">
                              <span className="font-mono font-bold text-[#087e83] truncate" dir="ltr">
                                {formatCairoTime(startTimeStr)}
                              </span>
                              {patTags.length > 0 && (
                                <span
                                  style={getCustomColorBadgeStyle(listItemColors.patientTags?.[patTags[0]])}
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white text-[#087e83] border border-[#bfe2db] truncate max-w-[65%]"
                                >
                                  #{patTags[0]}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : isCompact ? (
                        /* SMALL SINGLE-COL CARD: Strictly prioritizes 1) Patient Name, 2) Status, 3) 3 Dots */
                        <div className="flex items-center justify-between gap-1.5 h-full min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (Date.now() < suppressClickUntilRef.current || isUnlocked) return;
                              goToPatient(appt.patientId);
                            }}
                            title={`${appt.patientName} (${formatCairoTime(startTimeStr)} - ${formatCairoTime(endTimeStr)})`}
                            className="flex-1 min-w-0 overflow-hidden font-bold text-slate-900 text-xs hover:text-[#087e83] hover:underline truncate text-right cursor-pointer"
                          >
                            {appt.patientName}
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0" data-no-drag="true">
                            {statusSelectEl}
                            {renderApptThreeDotsMenu(appt, menuKey, openMenuUpward)}
                          </div>
                        </div>
                      ) : isMedium ? (
                        /* MEDIUM CARD (e.g. 30 min): Row 1 = Name + Status + 3 Dots, Row 2 = Time, Tags & Unit (single clipped line) */
                        <div className="flex flex-col justify-between h-full min-w-0 gap-1">
                          <div className="flex items-center justify-between gap-1.5 min-w-0 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (Date.now() < suppressClickUntilRef.current || isUnlocked) return;
                                goToPatient(appt.patientId);
                              }}
                              className="flex-1 min-w-0 overflow-hidden font-bold text-slate-900 text-xs sm:text-sm hover:text-[#087e83] hover:underline truncate text-right cursor-pointer"
                            >
                              {appt.patientName}
                            </button>
                            <div className="flex items-center gap-1 flex-shrink-0" data-no-drag="true">
                              {statusSelectEl}
                              {renderApptThreeDotsMenu(appt, menuKey, openMenuUpward)}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-1.5 text-[10px] text-slate-600 min-w-0 flex-1 overflow-hidden leading-tight">
                            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-[#087e83] whitespace-nowrap flex-shrink-0" dir="ltr">
                                <Clock className="w-3 h-3 inline" />
                                {formatCairoTime(startTimeStr)} - {formatCairoTime(endTimeStr)}
                              </span>
                              {patTags.slice(0, 1).map(tag => (
                                <span
                                  key={tag}
                                  style={getCustomColorBadgeStyle(listItemColors.patientTags?.[tag])}
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border truncate max-w-[72px] ${
                                    listItemColors.patientTags?.[tag]
                                      ? ''
                                      : tag === 'VIP'
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : 'bg-white text-[#087e83] border-[#bfe2db]'
                                  }`}
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                            <span className="text-slate-500 font-semibold truncate max-w-[45%] text-left">
                              {appt.doctorName} · {appt.unitName}
                            </span>
                          </div>
                        </div>
                      ) : (
                        /* TALL CARD (45+ min): Bounded header + clipped body + single-line footer */
                        <div className="flex flex-col justify-between h-full min-w-0 gap-1">
                          <div className="flex items-center justify-between gap-1.5 min-w-0 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (Date.now() < suppressClickUntilRef.current || isUnlocked) return;
                                goToPatient(appt.patientId);
                              }}
                              className="flex-1 min-w-0 overflow-hidden font-bold text-slate-900 text-xs sm:text-sm hover:text-[#087e83] hover:underline text-right truncate cursor-pointer"
                            >
                              {appt.patientName}
                            </button>

                            <div className="flex items-center gap-1 flex-shrink-0" data-no-drag="true">
                              {statusSelectEl}
                              <button
                                type="button"
                                onClick={() => goToPatient(appt.patientId)}
                                className="p-1 rounded-lg text-slate-400 hover:text-[#087e83] hover:bg-white flex-shrink-0 cursor-pointer hidden sm:inline-flex"
                                title="فتح ملف المريض"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {renderApptThreeDotsMenu(appt, menuKey, openMenuUpward)}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-start gap-1">
                            <div className="text-[11px] text-slate-600 flex items-center gap-1.5 min-w-0 overflow-hidden">
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-[#087e83] whitespace-nowrap" dir="ltr">
                                <Clock className="w-3 h-3 inline" />
                                {formatCairoTime(startTimeStr)} - {formatCairoTime(endTimeStr)}
                              </span>
                              <span className="text-slate-400 whitespace-nowrap">({durationMin} د)</span>
                            </div>

                            {(appt.procedureType || patTags.length > 0) && (
                              <div className="flex items-center gap-1 flex-wrap max-h-6 overflow-hidden">
                                {appt.procedureType && (
                                  <span className="bg-emerald-100/80 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-md truncate max-w-full">
                                    {appt.procedureType}
                                  </span>
                                )}
                                {patTags.slice(0, 3).map(tag => (
                                  <span
                                    key={tag}
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border truncate max-w-[100px] ${
                                      tag === 'VIP'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : 'bg-white text-[#087e83] border-[#bfe2db]'
                                    }`}
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {appt.notes && heightPx >= 140 && (
                              <p className="text-[10px] text-slate-500 truncate">{appt.notes}</p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[10px] pt-1 border-t border-slate-200/60 flex-shrink-0 overflow-hidden min-w-0">
                            <span className="text-slate-500 font-semibold leading-tight truncate block w-full">
                              {appt.doctorName} · {appt.unitName}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Scale / Resize Handle when Unlocked (plus subtle edge target) */}
                    {canEditAppointments && (
                      <div
                        onPointerDown={e => handleCardPointerDown(e, appt, 'resize')}
                        title="اسحب لأسفل أو لأعلى لتعديل مدة الجلسة"
                        className={`absolute left-2 right-2 flex items-center justify-center cursor-ns-resize touch-none transition-all ${
                          isUnlocked || isDraggingThis
                            ? '-bottom-2.5 h-5 z-50'
                            : 'bottom-0 h-2 opacity-0 hover:opacity-100'
                        }`}
                      >
                        <div
                          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 shadow-sm ${
                            isUnlocked || isDraggingThis
                              ? 'bg-[#087e83] text-white border border-white text-[9px] font-bold'
                              : 'bg-slate-400/70 w-10 h-1'
                          }`}
                        >
                          {(isUnlocked || isDraggingThis) && (
                            <>
                              <GripHorizontal className="w-3 h-3" />
                              <span>اسحب لتطويل الجلسة</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. MODE: WEEK PLANNER (7 Days Grid) */}
      {calendarMode === 'week' && (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 shadow-sm overflow-x-auto">
          <div className="min-w-[850px] space-y-2">
            {/* Week Header */}
            <div className="grid grid-cols-7 gap-2 pb-2 border-b border-slate-200 text-center font-bold text-xs">
              {weekDays.map(day => {
                const isSelected = day.iso === currentDate;
                const isToday = day.iso === todayStr;
                const isHoliday = isDateClinicHoliday(day.iso);
                return (
                  <button
                    key={day.iso}
                    type="button"
                    onClick={() => {
                      setCurrentDate(day.iso);
                      setCalendarMode('day');
                    }}
                    className={`p-2.5 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-[#087e83] text-white border-[#087e83] shadow-md'
                        : isToday
                        ? 'bg-[#e7f5f2] border-[#bfe2db] text-[#087e83]'
                        : isHoliday
                        ? 'bg-rose-50/90 border-rose-200 text-rose-700 hover:bg-rose-100/80'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] flex items-center justify-center gap-1">
                      <span>{day.name}</span>
                      {isHoliday && (
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full ${
                            isSelected ? 'bg-rose-400/40 text-white' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          إجازة
                        </span>
                      )}
                    </div>
                    <div className="text-base font-mono font-bold mt-0.5">{day.dayNum}</div>
                  </button>
                );
              })}
            </div>

            {/* Week Columns */}
            <div className="grid grid-cols-7 gap-2 min-h-[450px]">
              {weekDays.map(day => {
                const dayAppts = filteredAppointments.filter(a => a.date === day.iso);
                const isHoliday = isDateClinicHoliday(day.iso);
                return (
                  <div
                    key={day.iso}
                    className={`border rounded-2xl p-2 flex flex-col justify-between space-y-2 ${
                      isHoliday
                        ? 'border-rose-200 bg-rose-50/40'
                        : 'border-slate-200 bg-[#fbfdfd]'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      {dayAppts.length > 0 ? (
                        dayAppts.map(appt => {
                          const meta = statusMeta[appt.status];
                          const weekMenuKey = `week:${appt.id}`;
                          return (
                            <div
                              key={appt.id}
                              onClick={() => goToPatient(appt.patientId)}
                              className={`relative p-2 rounded-xl border border-slate-200 border-r-2 ${meta.borderClass} ${meta.bgClass} text-right cursor-pointer hover:shadow-sm transition-all text-[11px] space-y-1 ${
                                openApptMenuKey === weekMenuKey ? 'z-40' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 min-w-0">
                                <div className="font-bold text-slate-800 truncate flex-1 min-w-0 overflow-hidden">{appt.patientName}</div>
                                {renderApptThreeDotsMenu(appt, weekMenuKey)}
                              </div>
                              <div className="flex items-center justify-between gap-1 min-w-0 overflow-hidden">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full truncate ${meta.badgeClass}`}>
                                  {meta.label}
                                </span>
                                <span className="font-mono text-[10px] font-bold text-slate-600 whitespace-nowrap flex-shrink-0" dir="ltr">
                                  {formatCairoTime(appt.time)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className={`text-center text-[11px] py-8 ${isHoliday ? 'text-rose-500 font-bold' : 'text-slate-300'}`}>
                          {isHoliday ? 'يوم إجازة' : 'لا مواعيد'}
                        </div>
                      )}
                    </div>

                    {canAddAppointments && (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentDate(day.iso);
                          setIsQuickActionOpen(true, 'appointment', { date: day.iso });
                        }}
                        className="w-full py-1 text-[10px] font-bold text-[#087e83] hover:bg-[#e7f5f2] rounded-lg border border-dashed border-[#bfe2db]"
                      >
                        + حجز
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. MODE: MONTH CALENDAR (Compact grid with status dots) */}
      {calendarMode === 'month' && (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-[#172f3d]">
              تقويم شهر {currentMonthName}
            </h2>
            <span className="text-xs text-slate-400">انقر على أي يوم لعرض مواعيده وتفاصيل الزيارات</span>
          </div>

          {/* 7-column Weekday Headers */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 py-1">
            {[
              { label: 'السبت', dow: 6 },
              { label: 'الأحد', dow: 0 },
              { label: 'الاثنين', dow: 1 },
              { label: 'الثلاثاء', dow: 2 },
              { label: 'الأربعاء', dow: 3 },
              { label: 'الخميس', dow: 4 },
              { label: 'الجمعة', dow: 5 }
            ].map(d => (
              <span
                key={d.label}
                className={closedWeekdaySet.has(d.dow) ? 'text-rose-600 font-extrabold' : ''}
              >
                {closedWeekdaySet.has(d.dow) ? `${d.label} (إجازة)` : d.label}
              </span>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-2">
            {monthGrid.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return <div key={idx} className="h-20 bg-slate-50/50 rounded-2xl border border-transparent" />;
              }

              const isSelected = cell.dateStr === currentDate;
              const isToday = cell.dateStr === todayStr;
              const isHoliday = isDateClinicHoliday(cell.dateStr);
              const apptsForDay = filteredAppointments.filter(a => a.date === cell.dateStr);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setCurrentDate(cell.dateStr);
                    setSelectedMonthDay(cell.dateStr);
                  }}
                  className={`h-20 sm:h-24 p-2 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#e7f5f2] border-[#087e83] shadow-md ring-2 ring-[#087e83]/20'
                      : isToday
                      ? 'bg-amber-50/50 border-amber-300'
                      : isHoliday
                      ? 'bg-rose-50/85 border-rose-200 hover:border-rose-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-bold font-mono ${
                        isSelected ? 'text-[#087e83]' : isHoliday ? 'text-rose-700' : 'text-slate-700'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {apptsForDay.length > 0 ? (
                      <span className="text-[10px] font-bold bg-[#087e83] text-white w-4 h-4 rounded-full flex items-center justify-center">
                        {apptsForDay.length}
                      </span>
                    ) : isHoliday ? (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700">
                        إجازة
                      </span>
                    ) : null}
                  </div>

                  {/* Micro dots / holiday badge */}
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <div className="flex items-center gap-1 flex-wrap">
                      {apptsForDay.slice(0, 3).map((a, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            a.status === 'completed'
                              ? 'bg-emerald-500'
                              : a.status === 'confirmed'
                              ? 'bg-blue-500'
                              : a.status === 'arrived'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                      ))}
                    </div>
                    {isHoliday && apptsForDay.length > 0 && (
                      <span className="text-[8px] font-extrabold px-1 rounded bg-rose-100 text-rose-700">
                        إجازة
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Month Day Preview Panel */}
          {selectedMonthDay && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">
                  مواعيد يوم {selectedMonthDay}:
                </h3>
                <button
                  type="button"
                  onClick={() => setCalendarMode('day')}
                  className="text-xs font-bold text-[#087e83] hover:underline"
                >
                  فتح الجدول الزمني الكامل لهذا اليوم →
                </button>
              </div>

              {filteredAppointments.filter(a => a.date === selectedMonthDay).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredAppointments
                    .filter(a => a.date === selectedMonthDay)
                    .map(a => {
                      const monthMenuKey = `month:${a.id}`;
                      return (
                        <div
                          key={a.id}
                          onClick={() => goToPatient(a.patientId)}
                          className={`relative p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 cursor-pointer hover:bg-[#e7f5f2] ${
                            openApptMenuKey === monthMenuKey ? 'z-40' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="font-bold text-slate-900 text-xs truncate">{a.patientName}</div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{formatCairoTime(a.time)} ({a.durationMinutes} دقيقة) · {a.doctorName} · {a.unitName}</div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200">
                              {statusMeta[a.status].label}
                            </span>
                            {renderApptThreeDotsMenu(a, monthMenuKey)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-slate-400">لا توجد مواعيد مسجلة في هذا اليوم</p>
              )}
            </div>
          )}
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

      {/* Appointment Cards below calendar grid */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 shadow-sm space-y-3 mt-6">
        <h3 className="text-sm font-extrabold text-[#172f3d] flex items-center justify-between">
          <span>كروت المواعيد (لليوم المحدد: {currentDate})</span>
          <span className="text-xs font-mono font-bold bg-[#e7f5f2] text-[#087e83] px-2.5 py-0.5 rounded-full">
            {dayAppointments.length} موعد
          </span>
        </h3>

        {dayAppointments.length > 0 ? (
          <div className="space-y-2.5">
            {dayAppointments.map(appt => {
              const status = statusMeta[appt.status] || statusMeta.booked;
              const pat = patients.find(p => p.id === appt.patientId);
              const patTags = (pat?.tags || []).filter(t => patientTags.includes(t));
              const { hour12, minute, period } = parseTimeTo12h(appt.time);
              return (
                <div
                  key={appt.id}
                  className={`min-h-[92px] p-2.5 sm:p-3 rounded-2xl border flex items-center justify-between gap-2 transition-colors ${status.bgClass} border-r-4 ${status.borderClass}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {canEditAppointments ? (
                      <button
                        type="button"
                        onClick={() => setClockPickerAppt(appt)}
                        title="اضغط لتعديل ميعاد الساعة (AM/PM)"
                        className="w-12 sm:w-14 h-12 py-1 rounded-xl bg-white hover:bg-[#e7f5f2] border border-[#c2e4dd] hover:border-[#087e83] flex flex-col items-center justify-center flex-shrink-0 font-bold text-[#087e83] leading-tight shadow-2xs transition-all active:scale-95 cursor-pointer"
                      >
                        <span className="text-[11px] font-mono font-extrabold tracking-tight">{hour12}:{minute}</span>
                        <span className="text-[9px] font-extrabold text-[#087e83] tracking-wider uppercase">{period}</span>
                      </button>
                    ) : (
                      <div className="w-12 sm:w-14 h-12 py-1 rounded-xl bg-white border border-[#c2e4dd] flex flex-col items-center justify-center flex-shrink-0 font-bold text-[#087e83] leading-tight shadow-2xs">
                        <span className="text-[11px] font-mono font-extrabold tracking-tight">{hour12}:{minute}</span>
                        <span className="text-[9px] font-extrabold text-[#087e83] tracking-wider uppercase">{period}</span>
                      </div>
                    )}

                    <div className="min-w-0 flex-1 overflow-hidden space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0 leading-snug">
                        <button
                          type="button"
                          onClick={() => goToPatient(appt.patientId)}
                          className="font-bold text-slate-800 text-xs sm:text-sm hover:text-[#087e83] hover:underline text-right cursor-pointer break-words"
                        >
                          {appt.patientName}
                        </button>
                        <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded-full font-semibold flex-shrink-0">
                          {appt.durationMinutes} د
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-slate-400 font-mono text-[10px] flex-shrink-0" dir="ltr">
                          <span>{appt.patientPhone}</span>
                        </span>
                      </div>

                      <div className="text-slate-600 text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 leading-snug">
                        <span className="font-semibold break-words">{appt.doctorName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold break-words">{appt.unitName}</span>
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
                          <span className={`text-[10px] font-bold rounded-lg px-1.5 py-0.5 flex-shrink-0 ${status.badgeClass}`}>
                            {status.label}
                          </span>
                        )}
                      </div>

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

                  {renderApptThreeDotsMenu(appt, 'bottom_card_' + appt.id, true)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-slate-400 text-xs">
            لا توجد مواعيد مسجلة في هذا اليوم
          </div>
        )}
      </div>

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

      {/* Interactive Month Calendar Picker Modal */}
      {isDateCalendarOpen && (() => {
        const arabicMonths = [
          'يناير',
          'فبراير',
          'مارس',
          'أبريل',
          'مايو',
          'يونيو',
          'يوليو',
          'أغسطس',
          'سبتمبر',
          'أكتوبر',
          'نوفمبر',
          'ديسمبر'
        ];
        const pickerMonthLabel = `${arabicMonths[(pickerMonth.month - 1) % 12]} ${pickerMonth.year}`;
        const stepPickerMonth = (delta: number) => {
          setPickerMonth(prev => {
            const d = new Date(prev.year, prev.month - 1 + delta, 1);
            return { year: d.getFullYear(), month: d.getMonth() + 1 };
          });
        };
        const firstDay = new Date(pickerMonth.year, pickerMonth.month - 1, 1);
        const daysInMonth = new Date(pickerMonth.year, pickerMonth.month, 0).getDate();
        const leadingBlanks = (firstDay.getDay() + 1) % 7;
        const cells: Array<{
          day: number | null;
          dateStr: string;
          count: number;
          isClinicHoliday: boolean;
          isPersonalLeave: boolean;
        }> = [];
        for (let i = 0; i < leadingBlanks; i++) {
          cells.push({ day: null, dateStr: '', count: 0, isClinicHoliday: false, isPersonalLeave: false });
        }
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${pickerMonth.year}-${String(pickerMonth.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dow = new Date(pickerMonth.year, pickerMonth.month - 1, d, 12, 0, 0).getDay();
          const isClinicHoliday = closedWeekdaySet.has(dow);
          const isPersonalLeave =
            currentUser.role !== 'admin' &&
            (Boolean(currentUser.attendanceExemptDates?.includes(dateStr)) ||
              (!currentUser.exemptFromAttendance && currentUser.defaultUnitByDay?.[dow] === DAY_OFF_UNIT_ID));
          const count = appointments.filter(
            a => a.date === dateStr && a.status !== 'cancelled' && isUnitAllowed(a.unitId, a.unitName)
          ).length;
          cells.push({ day: d, dateStr, count, isClinicHoliday, isPersonalLeave });
        }

        return (
          <div
            onClick={() => setIsDateCalendarOpen(false)}
            className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4"
            >
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
                  onClick={() => setIsDateCalendarOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold">
                {[
                  { label: 'سبت', dow: 6 },
                  { label: 'أحد', dow: 0 },
                  { label: 'إثنين', dow: 1 },
                  { label: 'ثلاثاء', dow: 2 },
                  { label: 'أربعاء', dow: 3 },
                  { label: 'خميس', dow: 4 },
                  { label: 'جمعة', dow: 5 }
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
                {cells.map((cell, idx) => {
                  if (!cell.day) {
                    return <div key={`empty-${idx}`} className="h-11" />;
                  }
                  const isSelected = cell.dateStr === currentDate;
                  const isToday = cell.dateStr === todayStr;
                  const isHoliday = cell.isClinicHoliday;
                  const isLeave = cell.isPersonalLeave;
                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => {
                        setCurrentDate(cell.dateStr);
                        setSelectedMonthDay(cell.dateStr);
                        setIsDateCalendarOpen(false);
                      }}
                      className={`h-11 rounded-xl flex flex-col items-center justify-center relative font-mono text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#087e83] text-white shadow-sm'
                          : isToday
                          ? 'bg-[#e7f5f2] text-[#087e83] border-2 border-[#087e83]'
                          : isHoliday
                          ? 'bg-rose-50/85 border border-rose-200 hover:bg-rose-100/75 text-rose-800'
                          : isLeave
                          ? 'bg-amber-50/85 border border-amber-200 hover:bg-amber-100/75 text-amber-800'
                          : 'hover:bg-[#f0f6f5] text-slate-700'
                      }`}
                    >
                      <span>{cell.day}</span>
                      {(isHoliday || isLeave) ? (
                        <span
                          className={`text-[8px] font-sans font-extrabold leading-none mt-0.5 ${
                            isSelected
                              ? 'text-white/90'
                              : isHoliday
                              ? 'text-rose-600'
                              : 'text-amber-700'
                          }`}
                        >
                          إجازة
                        </span>
                      ) : cell.count > 0 ? (
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                            isSelected ? 'bg-white' : 'bg-[#087e83]'
                          }`}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    resetToToday();
                    setSelectedMonthDay(todayStr);
                    setIsDateCalendarOpen(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>العودة لليوم</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsDateCalendarOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-bold text-xs cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};


