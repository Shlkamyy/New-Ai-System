import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Users,
  Search,
  Phone,
  MessageCircle,
  Eye,
  Building2,
  Stethoscope,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  History,
  SlidersHorizontal,
  Calendar,
  RotateCcw,
  X,
  Mic,
  Square,
  AlertCircle,
  XCircle,
  Tag,
  Lock,
  PhoneOff,
  FileCheck2,
  Clock,
  Plus,
  Pencil,
  Save
} from 'lucide-react';
import {
  addDaysToYmd,
  convertArabicDigitsToWestern,
  formatRelativeCalendarDaysArabic,
  formatTimeToArabicPeriod,
  getArabicWeekdayName,
  getCairoNowParts,
  getRelativeTimeBadgeClass,
  matchArabicTerms,
  matchPhone,
  scoreArabicTextMatch,
  scorePatientSearchMatch,
  scorePhoneMatch
} from '../utils/arabic';
import {
  buildWhatsAppUrl,
  CLINIC_DISPLAY_NAME,
  getPreferredPatientWhatsAppPhone,
  isPreferredWhatsAppMissing,
  openWhatsAppChat,
  renderWhatsAppTemplate
} from '../utils/whatsapp';
import {
  getCustomColorActiveStyle,
  getCustomColorBadgeStyle,
  getFollowUpStatusColorHex,
  getPatientTagColorHex
} from '../utils/colors';
import {
  FINISHED_WORK_DEFAULT_QUOTA,
  FINISHED_WORK_TASK_TITLE,
  computeFinishedWorkTaskProgress,
  formatPostponeDaysArabic,
  getCairoDateStringFromIso
} from '../utils/finishedWork';
import { computeFeedbackOutcomesForVisitDate } from '../utils/feedback';
import {
  Appointment,
  AppointmentStatus,
  FinishedWorkActionType,
  FollowUpActionSource,
  PatientFollowUpLogEntry
} from '../types/clinic';
import { ColoredSelect } from '../components/ColoredSelect';
import { RegisterWhatsAppModal } from '../components/RegisterWhatsAppModal';

type PeriodUnit = 'all' | 'day' | 'week' | 'month';
type DateBasis = 'last_appointment' | 'file_created';

const APPOINTMENT_STATUS_OPTIONS: Array<{ value: AppointmentStatus; label: string; dotClass: string }> = [
  { value: 'booked', label: 'محجوز', dotClass: 'bg-slate-400' },
  { value: 'confirmed', label: 'مؤكد', dotClass: 'bg-sky-500' },
  { value: 'arrived', label: 'وصل العيادة', dotClass: 'bg-amber-500' },
  { value: 'completed', label: 'تمت الزيارة (مكتمل)', dotClass: 'bg-emerald-500' },
  { value: 'cancelled', label: 'ملغي', dotClass: 'bg-slate-500' },
  { value: 'no_show', label: 'لم يحضر', dotClass: 'bg-rose-500' }
];

const ARABIC_MONTH_NAMES = [
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

function getWeekBoundsSaturdayToFriday(anchorYmd: string): { start: string; end: string } {
  const [y, m, d] = anchorYmd.split('-').map(Number);
  if (!y || !m || !d) return { start: anchorYmd, end: anchorYmd };
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const dow = dt.getDay(); // 0 Sun ... 6 Sat
  const diffFromSat = (dow + 1) % 7; // Sat => 0, Sun => 1, ..., Fri => 6
  const start = addDaysToYmd(anchorYmd, -diffFromSat);
  const end = addDaysToYmd(start, 6);
  return { start, end };
}

function getMonthBounds(anchorYmd: string): { start: string; end: string; label: string } {
  const [y, m] = anchorYmd.split('-').map(Number);
  if (!y || !m) return { start: anchorYmd, end: anchorYmd, label: anchorYmd };
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    label: `${ARABIC_MONTH_NAMES[m - 1] || mm} ${y}`
  };
}

function shiftAnchorByMonth(anchorYmd: string, deltaMonths: number): string {
  const [y, m, d] = anchorYmd.split('-').map(Number);
  if (!y || !m) return anchorYmd;
  const targetFirst = new Date(y, m - 1 + deltaMonths, 1, 12, 0, 0);
  const maxDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(d || 1, maxDay);
  const outY = targetFirst.getFullYear();
  const outM = String(targetFirst.getMonth() + 1).padStart(2, '0');
  const outD = String(clampedDay).padStart(2, '0');
  return `${outY}-${outM}-${outD}`;
}

function isSystemAutoFollowUpNote(note?: string): boolean {
  const trimmed = (note || '').trim();
  if (!trimmed) return true;
  if (trimmed === 'تم التواصل — خلص شغل') return true;
  if (trimmed === 'إغلاق الملف — غير مهتم') return true;
  if (trimmed.startsWith('لا يمكن التواصل — تأجيل')) return true;
  if (trimmed.startsWith('تحديث تلقائي')) return true;
  return false;
}

function formatCairoCompletionDateTime(
  isoTimestamp?: string,
  fallbackYmd?: string
): string {
  if (isoTimestamp) {
    const dt = new Date(isoTimestamp);
    if (!isNaN(dt.getTime())) {
      const cairo = getCairoNowParts(dt);
      const weekday = getArabicWeekdayName(cairo.dateStr);
      const timeAr = formatTimeToArabicPeriod(cairo.timeStr);
      return `${weekday ? `${weekday} ` : ''}${cairo.dateStr} · الساعة ${timeAr}`;
    }
  }
  const cleanYmd = (fallbackYmd || '').trim().slice(0, 10);
  if (cleanYmd) {
    const weekday = getArabicWeekdayName(cleanYmd);
    return `${weekday ? `${weekday} ` : ''}${cleanYmd}`;
  }
  return '';
}

function resolveActionOriginBadge(
  source: FollowUpActionSource | undefined,
  fwInfo: any,
  todayLogEntry: PatientFollowUpLogEntry | undefined,
  feedbackOutcome: string | undefined
): { label: string; tone: 'inside' | 'outside' | 'legacy' } {
  switch (source) {
    case 'task_card_button':
      return { label: 'من زرار داخل كارت المهمة', tone: 'inside' };
    case 'task_card_dropdown':
      return { label: 'من قائمة الحالة داخل كارت المهمة', tone: 'inside' };
    case 'appointments_schedule':
      return { label: 'من برا صفحة المهمة · جدول المواعيد', tone: 'outside' };
    case 'dashboard_schedule':
      return { label: 'من برا صفحة المهمة · لوحة التحكم', tone: 'outside' };
    case 'patients_list':
      return { label: 'من برا صفحة المهمة · قائمة المرضى', tone: 'outside' };
    case 'patient_detail':
      return { label: 'من برا صفحة المهمة · ملف المريض', tone: 'outside' };
    case 'followup_outside':
      return { label: 'من برا صفحة المهمة · حالات المتابعة', tone: 'outside' };
    case 'staff_alerts':
      return { label: 'من برا صفحة المهمة · تنبيهات الموظفين', tone: 'outside' };
    case 'quick_action':
      return { label: 'من برا صفحة المهمة · الإضافة السريعة', tone: 'outside' };
    default:
      break;
  }

  if (fwInfo?.todayAction) {
    if (todayLogEntry?.taskType === 'finished_work') {
      return { label: 'من زرار داخل كارت المهمة', tone: 'inside' };
    }
    if (fwInfo.todayAction === 'booked_appt') {
      const notes = (todayLogEntry?.notes || '').trim();
      if (
        notes.startsWith('تحديث تلقائي عند إعادة تفعيل الموعد') ||
        notes.startsWith('تحديث تلقائي عند تعديل الموعد')
      ) {
        return { label: 'من برا صفحة المهمة · جدول المواعيد', tone: 'outside' };
      }
      return { label: 'تحديد ميعاد جديد (سجل سابق)', tone: 'legacy' };
    }
    if (fwInfo.todayAction === 'finished' || fwInfo.todayAction === 'closed_file') {
      return { label: 'من برا صفحة المهمة · حالات المتابعة', tone: 'outside' };
    }
  }

  if (feedbackOutcome === 'done' || feedbackOutcome === 'not_done') {
    return { label: 'من زرار داخل كارت المهمة', tone: 'inside' };
  }

  return { label: 'من صفحة حالات المتابعة', tone: 'outside' };
}

function getStaffActionDescription(
  patId: string,
  fwInfo: any,
  feedbackOutcome: string | undefined,
  todayLogEntry: PatientFollowUpLogEntry | undefined,
  todayBookedApptOverride: Appointment | undefined,
  appointments: Appointment[],
  anchorDate: string
): {
  title: string;
  detail: string;
  employeeName?: string;
  completedDateTime: string;
  originLabel: string;
  originTone: 'inside' | 'outside' | 'legacy';
  userNote?: string;
  editableLogId?: string;
} | null {
  const todayBookedAppt =
    todayBookedApptOverride ||
    appointments
      .filter(
        a =>
          a.patientId === patId &&
          a.status !== 'cancelled' &&
          a.status !== 'no_show' &&
          ((a.createdAt &&
            getCairoDateStringFromIso(a.createdAt) === anchorDate &&
            (a.date || '').slice(0, 10) >= anchorDate) ||
            (a.date || '').slice(0, 10) > anchorDate)
      )
      .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0))[0];

  const effectiveSource: FollowUpActionSource | undefined =
    todayLogEntry?.actionSource || todayBookedAppt?.bookingSource;
  const origin = resolveActionOriginBadge(effectiveSource, fwInfo, todayLogEntry, feedbackOutcome);
  const employeeName = todayLogEntry?.changedBy || todayBookedAppt?.createdBy;
  const rawNote = (todayLogEntry?.notes || '').trim();
  const userNote = rawNote && !isSystemAutoFollowUpNote(rawNote) ? rawNote : undefined;
  const completedDateTime = formatCairoCompletionDateTime(
    todayLogEntry?.timestamp || todayBookedAppt?.createdAt,
    todayLogEntry?.actionDate || anchorDate
  );

  const isFromInsideButton = origin.tone === 'inside' && effectiveSource !== 'task_card_dropdown';

  if (fwInfo?.todayAction === 'finished') {
    return {
      title: isFromInsideButton ? 'خلص شغل (زر الكارت)' : 'تغيير الحالة إلى (خلص شغل)',
      detail: 'تم إنجاز متابعة المريض وإنهاء مهمته',
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry?.id
    };
  }
  if (fwInfo?.todayAction === 'closed_file' || fwInfo?.todayAction === 'not_interested') {
    return {
      title: isFromInsideButton ? 'إغلاق الملف / غير مهتم (زر الكارت)' : 'تغيير الحالة إلى (غير مهتم)',
      detail: 'تم إغلاق ملف المريض',
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry?.id
    };
  }
  if (fwInfo?.todayAction === 'postpone_week') {
    const daysLabel = fwInfo.lastDeferral?.daysLabel || 'أسبوع';
    return {
      title: 'تأجيل المتابعة (زر الكارت)',
      detail: `تم تحديد تأجيل لمدة ${daysLabel}`,
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry?.id
    };
  }
  if (fwInfo?.todayAction === 'unreachable') {
    const attempt = fwInfo.unreachableAttempts || 1;
    return {
      title: 'لا يمكن التواصل (زر الكارت)',
      detail: `تأجيل ٣ أيام (المحاولة رقم ${attempt.toLocaleString('ar-EG')})`,
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry?.id
    };
  }
  if (fwInfo?.todayAction === 'booked_appt' || todayBookedAppt) {
    const apptDate = todayBookedAppt?.date || anchorDate;
    const apptTime = todayBookedAppt?.time
      ? ` الساعة ${formatTimeToArabicPeriod(todayBookedAppt.time)}`
      : '';
    const proc = todayBookedAppt?.procedureType ? ` (${todayBookedAppt.procedureType})` : '';
    return {
      title:
        effectiveSource === 'task_card_button'
          ? 'تحديد ميعاد جديد (من الكارت)'
          : 'تحديد ميعاد جديد',
      detail: `تم حجز موعد بتاريخ ${apptDate}${apptTime}${proc}`,
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry?.id
    };
  }
  if (feedbackOutcome === 'done') {
    return {
      title: 'تم الفيدباك',
      detail: 'تم إتمام فيدباك الزيارة',
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry?.id
    };
  }
  if (feedbackOutcome === 'not_done') {
    return {
      title: 'لم تتم المهمة',
      detail: 'تم تسجيل عدم إتمام المهمة',
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry?.id
    };
  }
  if (todayLogEntry) {
    return {
      title: `تحديث الحالة إلى: ${todayLogEntry.newStatus || 'تحديث'}`,
      detail: todayLogEntry.previousStatus
        ? `من (${todayLogEntry.previousStatus}) إلى (${todayLogEntry.newStatus})`
        : 'تم تحديث حالة المريض',
      employeeName,
      completedDateTime,
      originLabel: origin.label,
      originTone: origin.tone,
      userNote,
      editableLogId: todayLogEntry.id
    };
  }
  return null;
}

export const PatientFollowUpView: React.FC = () => {
  const {
    patients,
    appointments,
    operations,
    invoices,
    patientTags,
    patientFollowUpStatuses,
    patientFollowUpLogs,
    weekdaySettings,
    whatsappTemplates,
    units,
    listItemColors,
    changePatientFollowUpStatus,
    updatePatientFollowUpLog,
    revertPatientFollowUpLog,
    setPatientPhoneNoWhatsApp,
    cairoTodayStr,
    goToPatient,
    setActiveView,
    setIsQuickActionOpen,
    currentUser,
    followUpViewPrefill,
    clearFollowUpViewPrefill
  } = useClinic();

  const todayYmd = cairoTodayStr;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Period + Basis + Anchor Date navigation
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>('all');
  const [dateBasis, setDateBasis] = useState<DateBasis>('last_appointment');
  const [anchorDate, setAnchorDate] = useState<string>(todayYmd);

  const prevTodayYmdRef = useRef(todayYmd);
  useEffect(() => {
    if (prevTodayYmdRef.current !== todayYmd) {
      const prevDay = prevTodayYmdRef.current;
      prevTodayYmdRef.current = todayYmd;
      setAnchorDate(prev => (prev === prevDay ? todayYmd : prev));
    }
  }, [todayYmd]);

  // Multi-select Checkboxes
  const [selectedFollowUpStatuses, setSelectedFollowUpStatuses] = useState<string[]>([]);
  const [selectedAppointmentStatuses, setSelectedAppointmentStatuses] = useState<AppointmentStatus[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagFilterMode, setTagFilterMode] = useState<'include' | 'exclude'>('include');
  const isAdmin = currentUser.role === 'admin';
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [finishedWorkMode, setFinishedWorkMode] = useState(false);
  const [showCompletedForDay, setShowCompletedForDay] = useState(false);

  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [justUpdatedId, setJustUpdatedId] = useState<string | null>(null);
  const [editingLogNoteId, setEditingLogNoteId] = useState<string | null>(null);
  const [editingLogNoteDraft, setEditingLogNoteDraft] = useState('');
  const [registerWaPatientId, setRegisterWaPatientId] = useState<string | null>(null);
  const registerWaPatient = useMemo(
    () => (registerWaPatientId ? patients.find(p => p.id === registerWaPatientId) || null : null),
    [registerWaPatientId, patients]
  );

  // 5-second undo window for Finished Work actions before card disappears
  const [pendingUndoMap, setPendingUndoMap] = useState<
    Record<string, { action: FinishedWorkActionType; logId: string; secondsLeft: number }>
  >({});
  const undoTimersRef = useRef<Record<string, number>>({});

  // Per-date expanded quota for Finished Work ("إظهار خمسة آخرون")
  const [fwExtraQuotaByDate, setFwExtraQuotaByDate] = useState<Record<string, number>>(() => {
    try {
      const raw = window.localStorage.getItem('clinicflow_fw_extra_quota_by_date');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });

  // Modal state shared for Feedback (done / not_done) and Finished Work (postpone_week / close_file)
  const [feedbackModal, setFeedbackModal] = useState<{
    patientId: string;
    patientName: string;
    currentStatus: string;
    mode: 'done' | 'not_done' | 'fw_postpone_week' | 'fw_close_file';
    createdLogId?: string;
    visitDate?: string;
    attemptNumber?: number;
  } | null>(null);
  const [feedbackNoteText, setFeedbackNoteText] = useState('');
  const [postponeDaysInput, setPostponeDaysInput] = useState('7');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | undefined>(undefined);
  const [recordedDuration, setRecordedDuration] = useState<number | undefined>(undefined);
  const [recordingError, setRecordingError] = useState('');

  const parsedPostponeDays = useMemo(() => {
    const normalized = convertArabicDigitsToWestern(postponeDaysInput).trim();
    if (!/^\d+$/.test(normalized)) return NaN;
    return parseInt(normalized, 10);
  }, [postponeDaysInput]);

  const isValidPostponeDays =
    Number.isInteger(parsedPostponeDays) && parsedPostponeDays >= 1 && parsedPostponeDays <= 365;

  const patientCardsRef = useRef<HTMLDivElement | null>(null);
  const [pendingAutoScroll, setPendingAutoScroll] = useState(false);
  const [justAddedFwPatientId, setJustAddedFwPatientId] = useState<string | null>(null);
  const justAddedFwTimerRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSecsRef = useRef<number>(0);

  const cleanupMedia = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore stop errors
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      cleanupMedia();
      Object.values(undoTimersRef.current).forEach(id => window.clearInterval(id));
      undoTimersRef.current = {};
      if (justAddedFwTimerRef.current) {
        window.clearTimeout(justAddedFwTimerRef.current);
        justAddedFwTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!followUpViewPrefill) return;
    setPeriodUnit(followUpViewPrefill.periodUnit);
    setDateBasis(followUpViewPrefill.dateBasis);
    setAnchorDate(followUpViewPrefill.anchorDate);
    setSelectedAppointmentStatuses(followUpViewPrefill.selectedAppointmentStatuses || []);
    if (followUpViewPrefill.selectedFollowUpStatuses) {
      setSelectedFollowUpStatuses(followUpViewPrefill.selectedFollowUpStatuses);
    } else if (
      followUpViewPrefill.excludeFollowUpStatuses &&
      followUpViewPrefill.excludeFollowUpStatuses.length > 0
    ) {
      const excluded = new Set(followUpViewPrefill.excludeFollowUpStatuses.map(s => s.trim()));
      setSelectedFollowUpStatuses(
        patientFollowUpStatuses.filter(s => !excluded.has(s.trim()))
      );
    } else {
      setSelectedFollowUpStatuses([]);
    }
    if (followUpViewPrefill.selectedTags && followUpViewPrefill.selectedTags.length > 0) {
      setSelectedTags(followUpViewPrefill.selectedTags);
      setTagFilterMode('include');
    } else if (followUpViewPrefill.excludeTags && followUpViewPrefill.excludeTags.length > 0) {
      setSelectedTags(followUpViewPrefill.excludeTags);
      setTagFilterMode('exclude');
    } else {
      setSelectedTags([]);
      setTagFilterMode('include');
    }
    setFeedbackMode(Boolean(followUpViewPrefill.feedbackMode));
    setFinishedWorkMode(Boolean(followUpViewPrefill.finishedWorkMode));
    setCurrentPage(1);
    if (
      followUpViewPrefill.scrollToFirstCard ||
      followUpViewPrefill.feedbackMode ||
      followUpViewPrefill.finishedWorkMode
    ) {
      setPendingAutoScroll(true);
    }
    clearFollowUpViewPrefill();
  }, [followUpViewPrefill, clearFollowUpViewPrefill, patientFollowUpStatuses]);

  useEffect(() => {
    if (!pendingAutoScroll) return;
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        patientCardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setPendingAutoScroll(false);
      });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [pendingAutoScroll]);

  const followUpColorsMap = listItemColors.followUpStatuses || {};
  const tagColorsMap = listItemColors.patientTags || {};

  // Precompute latest appointment per patient
  const latestAppointmentByPatient = useMemo(() => {
    const map = new Map<string, Appointment>();
    appointments.forEach(appt => {
      if (!appt.patientId) return;
      const existing = map.get(appt.patientId);
      const apptSort = `${appt.date || ''} ${appt.time || ''}`;
      const existingSort = existing ? `${existing.date || ''} ${existing.time || ''}` : '';
      if (!existing || apptSort > existingSort) {
        map.set(appt.patientId, appt);
      }
    });
    return map;
  }, [appointments]);

  // Feedback outcome per patient for anchorDate (only explicit feedback outcomes)
  const feedbackOutcomeByPatient = useMemo(() => {
    return computeFeedbackOutcomesForVisitDate(
      anchorDate,
      appointments,
      patientFollowUpLogs
    ).patientOutcomes;
  }, [anchorDate, appointments, patientFollowUpLogs]);

  const allStatusOptions = useMemo(() => {
    return patientFollowUpStatuses;
  }, [patientFollowUpStatuses]);

  // Single-pass aggregate counts over patients instead of 3 separate loops
  const { statusCounts, appointmentStatusCounts, tagCounts, patientById } = useMemo(() => {
    const sCounts: Record<string, number> = {};
    const aCounts: Record<string, number> = {};
    const tCounts: Record<string, number> = {};
    const byId = new Map<string, (typeof patients)[number]>();

    for (let i = 0; i < patients.length; i++) {
      const p = patients[i];
      byId.set(p.id, p);

      const sKey = p.followUpStatus || '';
      sCounts[sKey] = (sCounts[sKey] || 0) + 1;

      const latest = latestAppointmentByPatient.get(p.id);
      if (latest?.status) {
        aCounts[latest.status] = (aCounts[latest.status] || 0) + 1;
      }

      const tags = p.tags;
      if (tags && tags.length > 0) {
        for (let j = 0; j < tags.length; j++) {
          const tag = tags[j];
          tCounts[tag] = (tCounts[tag] || 0) + 1;
        }
      }
    }

    return {
      statusCounts: sCounts,
      appointmentStatusCounts: aCounts,
      tagCounts: tCounts,
      patientById: byId
    };
  }, [patients, latestAppointmentByPatient]);

  const fwEvalDate = anchorDate || todayYmd;
  const fwQuotaLimit = Math.max(
    FINISHED_WORK_DEFAULT_QUOTA,
    fwExtraQuotaByDate[fwEvalDate] || FINISHED_WORK_DEFAULT_QUOTA
  );

  const finishedWorkProgress = useMemo(() => {
    if (!finishedWorkMode) return null;
    return computeFinishedWorkTaskProgress(
      fwEvalDate,
      weekdaySettings,
      patients,
      appointments,
      operations,
      invoices,
      patientFollowUpLogs,
      fwQuotaLimit
    );
  }, [
    finishedWorkMode,
    fwEvalDate,
    weekdaySettings,
    patients,
    appointments,
    operations,
    invoices,
    patientFollowUpLogs,
    fwQuotaLimit
  ]);

  const handleAddExtraFinishedWorkCard = () => {
    if (!finishedWorkProgress || !finishedWorkProgress.hasMoreCandidates) return;

    let nextLimit = Math.max(fwQuotaLimit, finishedWorkProgress.totalPatients) + 1;
    let nextProgress = computeFinishedWorkTaskProgress(
      fwEvalDate,
      weekdaySettings,
      patients,
      appointments,
      operations,
      invoices,
      patientFollowUpLogs,
      nextLimit
    );

    while (
      nextProgress.activePatientIds.length <= finishedWorkProgress.activePatientIds.length &&
      nextProgress.hasMoreCandidates
    ) {
      nextLimit += 1;
      nextProgress = computeFinishedWorkTaskProgress(
        fwEvalDate,
        weekdaySettings,
        patients,
        appointments,
        operations,
        invoices,
        patientFollowUpLogs,
        nextLimit
      );
    }

    const prevActiveSet = new Set(finishedWorkProgress.activePatientIds);
    const newlyAddedId =
      nextProgress.activePatientIds.find(id => !prevActiveSet.has(id)) || null;

    setFwExtraQuotaByDate(prev => {
      const updated = { ...prev, [fwEvalDate]: nextLimit };
      try {
        window.localStorage.setItem('clinicflow_fw_extra_quota_by_date', JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });

    const targetPage = Math.max(1, Math.ceil(nextProgress.activePatientIds.length / pageSize));
    setCurrentPage(targetPage);

    if (newlyAddedId) {
      if (justAddedFwTimerRef.current) {
        window.clearTimeout(justAddedFwTimerRef.current);
      }
      setJustAddedFwPatientId(newlyAddedId);
      justAddedFwTimerRef.current = window.setTimeout(() => {
        setJustAddedFwPatientId(prev => (prev === newlyAddedId ? null : prev));
      }, 4500);
    }
  };

  const handleShowFiveMoreFinishedWork = () => {
    if (!finishedWorkProgress) return;
    const nextLimit =
      Math.max(fwQuotaLimit, finishedWorkProgress.totalPatients) + FINISHED_WORK_DEFAULT_QUOTA;
    setFwExtraQuotaByDate(prev => {
      const updated = { ...prev, [fwEvalDate]: nextLimit };
      try {
        window.localStorage.setItem('clinicflow_fw_extra_quota_by_date', JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });
    setCurrentPage(1);
  };

  const periodRange = useMemo(() => {
    if (periodUnit === 'day') {
      return { start: anchorDate, end: anchorDate, label: `يوم ${anchorDate}` };
    }
    if (periodUnit === 'week') {
      const bounds = getWeekBoundsSaturdayToFriday(anchorDate);
      return {
        start: bounds.start,
        end: bounds.end,
        label: `أسبوع ${bounds.start} ← ${bounds.end}`
      };
    }
    if (periodUnit === 'month') {
      const bounds = getMonthBounds(anchorDate);
      return {
        start: bounds.start,
        end: bounds.end,
        label: `شهر ${bounds.label}`
      };
    }
    return null;
  }, [periodUnit, anchorDate]);

  const handleShiftPeriod = (direction: 'prev' | 'next') => {
    const step = direction === 'prev' ? -1 : 1;
    if (periodUnit === 'day' || periodUnit === 'all') {
      if (periodUnit === 'all') setPeriodUnit('day');
      setAnchorDate(prev => addDaysToYmd(prev, step));
    } else if (periodUnit === 'week') {
      setAnchorDate(prev => addDaysToYmd(prev, step * 7));
    } else if (periodUnit === 'month') {
      setAnchorDate(prev => shiftAnchorByMonth(prev, step));
    }
    setCurrentPage(1);
  };

  const toggleFollowUpStatusCheckbox = (status: string) => {
    setSelectedFollowUpStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
    setCurrentPage(1);
  };

  const toggleAppointmentStatusCheckbox = (status: AppointmentStatus) => {
    setSelectedAppointmentStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
    setCurrentPage(1);
  };

  const toggleTagCheckbox = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    setCurrentPage(1);
  };

  const activeFilterCount =
    (periodUnit !== 'all' ? 1 : 0) +
    selectedFollowUpStatuses.length +
    selectedAppointmentStatuses.length +
    selectedTags.length +
    (finishedWorkMode ? 1 : 0);

  const resetAllFilters = () => {
    setPeriodUnit('all');
    setDateBasis('last_appointment');
    setAnchorDate(todayYmd);
    setSelectedFollowUpStatuses([]);
    setSelectedAppointmentStatuses([]);
    setSelectedTags([]);
    setTagFilterMode('include');
    setFeedbackMode(false);
    setFinishedWorkMode(false);
    setShowCompletedForDay(false);
    setCurrentPage(1);
  };

  // Match appointments in periodRange when filtering by appointment date + status (so future bookings do not hide yesterday's completed visit)
  const matchingPeriodAppointmentByPatient = useMemo(() => {
    if (!periodRange || dateBasis !== 'last_appointment' || selectedAppointmentStatuses.length === 0) {
      return null;
    }
    const map = new Map<string, Appointment>();
    appointments.forEach(appt => {
      if (!appt.patientId) return;
      const d = (appt.date || '').slice(0, 10);
      if (!d || d < periodRange.start || d > periodRange.end) return;
      if (!selectedAppointmentStatuses.includes(appt.status)) return;
      const existing = map.get(appt.patientId);
      const apptSort = `${appt.date || ''} ${appt.time || ''}`;
      const existingSort = existing ? `${existing.date || ''} ${existing.time || ''}` : '';
      if (!existing || apptSort > existingSort) {
        map.set(appt.patientId, appt);
      }
    });
    return map;
  }, [appointments, periodRange, dateBasis, selectedAppointmentStatuses]);

  const nonFeedbackStatuses = useMemo(
    () => patientFollowUpStatuses.filter(s => s.trim() !== 'فيدباك'),
    [patientFollowUpStatuses]
  );

  const isAllNonFeedbackSelected =
    feedbackMode &&
    selectedFollowUpStatuses.length > 0 &&
    !selectedFollowUpStatuses.some(s => s.trim() === 'فيدباك') &&
    nonFeedbackStatuses.every(s => selectedFollowUpStatuses.includes(s));

  const followUpLogById = useMemo(
    () => new Map(patientFollowUpLogs.map(l => [l.id, l])),
    [patientFollowUpLogs]
  );

  const appointmentById = useMemo(
    () => new Map(appointments.map(a => [a.id, a])),
    [appointments]
  );

  const feedbackLogByPatientForAnchor = useMemo(() => {
    const map = new Map<string, PatientFollowUpLogEntry>();
    if (!anchorDate) return map;
    const bestTsByPat = new Map<string, number>();
    for (let i = 0; i < patientFollowUpLogs.length; i++) {
      const log = patientFollowUpLogs[i];
      if (log.reverted || !log.patientId) continue;
      if (log.feedbackDate !== anchorDate) continue;
      if (log.feedbackOutcome !== 'done' && log.feedbackOutcome !== 'not_done') continue;
      const ts = Date.parse(log.timestamp) || 0;
      const prevTs = bestTsByPat.get(log.patientId);
      if (prevTs === undefined || ts >= prevTs) {
        bestTsByPat.set(log.patientId, ts);
        map.set(log.patientId, log);
      }
    }
    return map;
  }, [patientFollowUpLogs, anchorDate]);

  const canEditLogNote = (log?: PatientFollowUpLogEntry): boolean => {
    if (!log || currentUser.isDisabled) return false;
    return Boolean(
      isAdmin || currentUser.permissions?.editPatients || log.changedById === currentUser.id
    );
  };

  const handleStartEditLogNote = (log: PatientFollowUpLogEntry) => {
    if (!canEditLogNote(log)) return;
    setEditingLogNoteId(log.id);
    setEditingLogNoteDraft(log.notes || '');
  };

  const handleSaveEditedLogNote = (logId: string, patientId: string) => {
    updatePatientFollowUpLog(logId, { notes: editingLogNoteDraft });
    setEditingLogNoteId(null);
    setEditingLogNoteDraft('');
    setJustUpdatedId(patientId);
    window.setTimeout(() => {
      setJustUpdatedId(prev => (prev === patientId ? null : prev));
    }, 1800);
  };

  const fwCompletedForDayCount = useMemo(() => {
    if (!finishedWorkMode || !finishedWorkProgress) return 0;
    let count = 0;
    finishedWorkProgress.orderedPatientIds.forEach(patId => {
      const info = finishedWorkProgress.patientInfoById.get(patId);
      if (info?.todayAction) count += 1;
    });
    return count;
  }, [finishedWorkMode, finishedWorkProgress]);

  const feedbackCompletedForDayCount = useMemo(() => {
    if (!feedbackMode || finishedWorkMode) return 0;
    let count = 0;
    feedbackOutcomeByPatient.forEach(outcome => {
      if (outcome === 'done') count += 1;
    });
    return count;
  }, [feedbackMode, finishedWorkMode, feedbackOutcomeByPatient]);

  const filteredPatients = useMemo(() => {
    const searchQ = debouncedSearchQuery.trim();
    if (finishedWorkMode && finishedWorkProgress) {
      const activeSet = new Set(finishedWorkProgress.activePatientIds);
      const result: typeof patients = [];

      finishedWorkProgress.orderedPatientIds.forEach(patId => {
        const info = finishedWorkProgress.patientInfoById.get(patId);
        const hasPendingUndo = Boolean(pendingUndoMap[patId]);
        const isCompletedForDay = Boolean(info?.todayAction);
        const allowCompleted = isAdmin && showCompletedForDay && isCompletedForDay;

        if (!activeSet.has(patId) && !hasPendingUndo && !allowCompleted) return;
        // If patient now has an upcoming booking (not pending undo / not explicitly viewing completed), hide immediately
        if (finishedWorkProgress.upcomingPatientIdSet.has(patId) && !hasPendingUndo && !allowCompleted) return;

        const pat = patientById.get(patId);
        if (!pat) return;

        // Apply optional manual tag/status filters if user selects them in advanced filters
        if (selectedTags.length > 0) {
          const pTags = pat.tags || [];
          if (tagFilterMode === 'include') {
            if (!selectedTags.some(t => pTags.includes(t))) return;
          } else {
            if (selectedTags.some(t => pTags.includes(t))) return;
          }
        }
        if (selectedFollowUpStatuses.length > 0 && !selectedFollowUpStatuses.includes(pat.followUpStatus || '')) {
          return;
        }
        if (searchQ) {
          const procText = info?.sessionProcedures.join(' ') || '';
          const combinedTarget = `${pat.name} ${pat.patientCode || ''} ${info?.doctorName || pat.doctorName || ''} ${info?.branchName || pat.branchName || ''} ${pat.followUpStatus || ''} ${procText}`;
          const textMatch = matchArabicTerms(combinedTarget, searchQ);
          const phoneMatch =
            matchPhone(pat.phone, searchQ) ||
            matchPhone(pat.secondaryPhone, searchQ);
          if (!textMatch && !phoneMatch) return;
        }
        result.push(pat);
      });

      if (searchQ) {
        const scoreMap = new Map<string, number>();
        result.forEach(pat => {
          const info = finishedWorkProgress.patientInfoById.get(pat.id);
          const procText = info?.sessionProcedures.join(' ') || '';
          const score = Math.max(
            scorePatientSearchMatch(
              {
                name: pat.name,
                phone: pat.phone,
                patientCode: pat.patientCode,
                doctorName: info?.doctorName || pat.doctorName
              },
              searchQ
            ),
            scorePhoneMatch(pat.secondaryPhone, searchQ) * 5,
            scoreArabicTextMatch(`${info?.branchName || pat.branchName || ''} ${procText}`, searchQ)
          );
          scoreMap.set(pat.id, score);
        });
        result.sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0));
      }

      return result;
    }

    const matched = patients
      .filter(pat => {
        // Multi-select follow-up statuses
        if (selectedFollowUpStatuses.length > 0) {
          const patStatus = (pat.followUpStatus || '').trim();
          const feedbackOutcome = feedbackOutcomeByPatient.get(pat.id);
          if (isAllNonFeedbackSelected) {
            if (feedbackOutcome === 'done' && !(isAdmin && showCompletedForDay)) return false;
            if (!feedbackOutcome && patStatus === 'فيدباك' && !matchingPeriodAppointmentByPatient?.has(pat.id)) {
              return false;
            }
            if (
              !(isAdmin && showCompletedForDay && feedbackOutcome === 'done') &&
              patStatus &&
              patStatus !== 'فيدباك' &&
              patientFollowUpStatuses.includes(pat.followUpStatus) &&
              !selectedFollowUpStatuses.includes(pat.followUpStatus)
            ) {
              return false;
            }
          } else if (!selectedFollowUpStatuses.includes(pat.followUpStatus || '')) {
            return false;
          }
        }

        // Patient tags filter (include / exclude)
        if (selectedTags.length > 0) {
          const patTags = pat.tags || [];
          if (tagFilterMode === 'include') {
            if (!selectedTags.some(t => patTags.includes(t))) return false;
          } else {
            if (selectedTags.some(t => patTags.includes(t))) return false;
          }
        }

        const latestAppt = latestAppointmentByPatient.get(pat.id);

        if (matchingPeriodAppointmentByPatient) {
          if (!matchingPeriodAppointmentByPatient.has(pat.id)) {
            return false;
          }
        } else {
          // Multi-select latest appointment statuses
          if (selectedAppointmentStatuses.length > 0) {
            if (!latestAppt || !selectedAppointmentStatuses.includes(latestAppt.status)) {
              return false;
            }
          }

          // Date range filter (Day / Week / Month) by Last Appointment or File Creation Date
          if (periodRange) {
            const targetDate =
              dateBasis === 'last_appointment'
                ? latestAppt?.date || pat.lastVisitDate || ''
                : pat.registeredDate || (pat.createdAt ? pat.createdAt.slice(0, 10) : '');
            const normalizedYmd = targetDate.slice(0, 10);
            if (!normalizedYmd || normalizedYmd < periodRange.start || normalizedYmd > periodRange.end) {
              return false;
            }
          }
        }

        if (searchQ) {
          const combinedTarget = `${pat.name} ${pat.patientCode || ''} ${pat.doctorName || ''} ${pat.branchName || ''} ${pat.followUpStatus || ''} ${(pat.tags || []).join(' ')}`;
          const textMatch = matchArabicTerms(combinedTarget, searchQ);
          const phoneMatch =
            matchPhone(pat.phone, searchQ) ||
            matchPhone(pat.secondaryPhone, searchQ);
          if (!textMatch && !phoneMatch) return false;
        }
        return true;
      });

    const relevanceMap = new Map<string, number>();
    if (searchQ) {
      matched.forEach(pat => {
        const s = Math.max(
          scorePatientSearchMatch(
            {
              name: pat.name,
              phone: pat.phone,
              patientCode: pat.patientCode,
              address: pat.address,
              doctorName: pat.doctorName
            },
            searchQ
          ),
          scorePhoneMatch(pat.secondaryPhone, searchQ) * 5,
          scoreArabicTextMatch(`${pat.branchName || ''} ${pat.followUpStatus || ''} ${(pat.tags || []).join(' ')}`, searchQ)
        );
        relevanceMap.set(pat.id, s);
      });
    }

    return matched.sort((a, b) => {
      if (searchQ) {
        const diff = (relevanceMap.get(b.id) || 0) - (relevanceMap.get(a.id) || 0);
        if (diff !== 0) return diff;
      }
      if (dateBasis === 'last_appointment') {
        const aDate =
          matchingPeriodAppointmentByPatient?.get(a.id)?.date ||
          latestAppointmentByPatient.get(a.id)?.date ||
          a.lastVisitDate ||
          a.registeredDate ||
          '';
        const bDate =
          matchingPeriodAppointmentByPatient?.get(b.id)?.date ||
          latestAppointmentByPatient.get(b.id)?.date ||
          b.lastVisitDate ||
          b.registeredDate ||
          '';
        if (bDate !== aDate) return bDate > aDate ? 1 : -1;
      }
      const aReg = a.registeredDate || '';
      const bReg = b.registeredDate || '';
      return bReg === aReg ? 0 : bReg > aReg ? 1 : -1;
    });
  }, [
    patients,
    patientById,
    finishedWorkMode,
    finishedWorkProgress,
    pendingUndoMap,
    isAdmin,
    showCompletedForDay,
    patientFollowUpStatuses,
    selectedFollowUpStatuses,
    selectedTags,
    tagFilterMode,
    isAllNonFeedbackSelected,
    feedbackOutcomeByPatient,
    selectedAppointmentStatuses,
    latestAppointmentByPatient,
    matchingPeriodAppointmentByPatient,
    periodRange,
    dateBasis,
    debouncedSearchQuery
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredPatients.length);
  const paginatedPatients = filteredPatients.slice(startIndex, endIndex);

  const handleStatusChange = (patientId: string, nextStatus: string) => {
    const trimmedNext = nextStatus.trim();
    if (finishedWorkMode && (trimmedNext === 'خلص شغل' || trimmedNext === 'غير مهتم')) {
      const fwAction: FinishedWorkActionType = trimmedNext === 'خلص شغل' ? 'finished' : 'closed_file';
      const logId = changePatientFollowUpStatus(patientId, nextStatus, {
        taskType: 'finished_work',
        finishedWorkAction: fwAction,
        actionDate: anchorDate || todayYmd,
        actionSource: 'task_card_dropdown',
        notes:
          fwAction === 'finished'
            ? 'تم التواصل — خلص شغل'
            : 'إغلاق الملف — غير مهتم'
      });
      if (logId) {
        triggerUndoWindow(patientId, fwAction, logId);
      }
    } else if (finishedWorkMode) {
      changePatientFollowUpStatus(patientId, nextStatus, {
        actionDate: anchorDate || todayYmd,
        actionSource: 'task_card_dropdown'
      });
    } else {
      changePatientFollowUpStatus(patientId, nextStatus, {
        actionSource: 'followup_outside'
      });
    }
    setJustUpdatedId(patientId);
    window.setTimeout(() => {
      setJustUpdatedId(prev => (prev === patientId ? null : prev));
    }, 1800);
  };

  const getAppointmentStatusLabel = (status?: AppointmentStatus) => {
    if (!status) return null;
    return APPOINTMENT_STATUS_OPTIONS.find(o => o.value === status)?.label || status;
  };

  const triggerUndoWindow = (patientId: string, action: FinishedWorkActionType, logId: string) => {
    if (undoTimersRef.current[patientId]) {
      window.clearInterval(undoTimersRef.current[patientId]);
      delete undoTimersRef.current[patientId];
    }
    setPendingUndoMap(prev => ({
      ...prev,
      [patientId]: { action, logId, secondsLeft: 5 }
    }));
    const intervalId = window.setInterval(() => {
      setPendingUndoMap(prev => {
        const cur = prev[patientId];
        if (!cur || cur.logId !== logId) {
          window.clearInterval(intervalId);
          delete undoTimersRef.current[patientId];
          return prev;
        }
        if (cur.secondsLeft <= 1) {
          window.clearInterval(intervalId);
          delete undoTimersRef.current[patientId];
          const copy = { ...prev };
          delete copy[patientId];
          return copy;
        }
        return {
          ...prev,
          [patientId]: { ...cur, secondsLeft: cur.secondsLeft - 1 }
        };
      });
    }, 1000);
    undoTimersRef.current[patientId] = intervalId;
  };

  const handleUndoFinishedWorkAction = (patientId: string) => {
    const pending = pendingUndoMap[patientId];
    if (!pending) return;
    if (undoTimersRef.current[patientId]) {
      window.clearInterval(undoTimersRef.current[patientId]);
      delete undoTimersRef.current[patientId];
    }
    setPendingUndoMap(prev => {
      const copy = { ...prev };
      delete copy[patientId];
      return copy;
    });
    revertPatientFollowUpLog(pending.logId);
  };

  const handleFinishedWorkDoneClick = (patientId: string) => {
    const logId = changePatientFollowUpStatus(patientId, 'خلص شغل', {
      taskType: 'finished_work',
      finishedWorkAction: 'finished',
      actionDate: anchorDate || todayYmd,
      actionSource: 'task_card_button',
      notes: 'تم التواصل — خلص شغل'
    });
    if (logId) {
      triggerUndoWindow(patientId, 'finished', logId);
    }
  };

  const handleFinishedWorkUnreachableClick = (patientId: string, attemptNumber: number) => {
    const evalYmd = anchorDate || todayYmd;
    const snoozeUntilDate = addDaysToYmd(evalYmd, 3);
    const logId = changePatientFollowUpStatus(patientId, 'قيد المتابعة', {
      taskType: 'finished_work',
      finishedWorkAction: 'unreachable',
      finishedWorkAttempt: attemptNumber,
      snoozeUntilDate,
      actionDate: evalYmd,
      actionSource: 'task_card_button',
      notes: `لا يمكن التواصل — تأجيل ٣ أيام (المحاولة رقم ${attemptNumber.toLocaleString('ar-EG')})`
    });
    if (logId) {
      triggerUndoWindow(patientId, 'unreachable', logId);
    }
  };

  const openFeedbackModal = (
    patientId: string,
    patientName: string,
    currentStatus: string,
    mode: 'done' | 'not_done' | 'fw_postpone_week' | 'fw_close_file',
    createdLogId?: string,
    extra?: { visitDate?: string; attemptNumber?: number }
  ) => {
    cleanupMedia();
    setFeedbackNoteText('');
    setPostponeDaysInput('7');
    setRecordedAudioUrl(undefined);
    setRecordedDuration(undefined);
    setRecordingSeconds(0);
    setRecordingError('');
    setFeedbackModal({
      patientId,
      patientName,
      currentStatus,
      mode,
      createdLogId,
      visitDate: extra?.visitDate,
      attemptNumber: extra?.attemptNumber
    });
  };

  const closeFeedbackModal = () => {
    const shouldScrollAfterDone = feedbackModal?.mode === 'done';
    cleanupMedia();
    setFeedbackModal(null);
    if (shouldScrollAfterDone) {
      setPendingAutoScroll(true);
    }
  };

  const handleDoneFeedbackClick = (
    patientId: string,
    patientName: string,
    currentStatus: string
  ) => {
    const createdLogId = changePatientFollowUpStatus(patientId, 'فيدباك', {
      feedbackOutcome: 'done',
      feedbackDate: anchorDate,
      actionSource: 'task_card_button'
    });
    setJustUpdatedId(patientId);
    window.setTimeout(() => {
      setJustUpdatedId(prev => (prev === patientId ? null : prev));
    }, 1800);
    openFeedbackModal(patientId, patientName, currentStatus, 'done', createdLogId);
  };

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const startAudioRecording = async () => {
    setRecordingError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('المتصفح الحالي لا يدعم التسجيل الصوتي المباشر');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeOptions = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const supportedMime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, {
        ...(supportedMime ? { mimeType: supportedMime } : {}),
        audioBitsPerSecond: 16000
      });
      audioChunksRef.current = [];
      recordingSecsRef.current = 0;
      setRecordingSeconds(0);

      recorder.ondataavailable = ev => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const dur = Math.max(1, recordingSecsRef.current);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setRecordedAudioUrl(reader.result);
            setRecordedDuration(dur);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      recordingTimerRef.current = window.setInterval(() => {
        recordingSecsRef.current += 1;
        setRecordingSeconds(recordingSecsRef.current);
        if (recordingSecsRef.current >= 60) {
          stopVoiceRecording();
        }
      }, 1000);
    } catch (err) {
      const errName = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setRecordingError('لم يتم العثور على ميكروفون متصل بالجهاز');
      } else {
        setRecordingError('يرجى السماح بصلاحية الميكروفون من إعدادات المتصفح لبدء التسجيل الصوتي');
      }
    }
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      stopVoiceRecording();
      return;
    }
    await startAudioRecording();
  };

  const handleSaveFeedbackModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackModal) return;
    const trimmed = feedbackNoteText.trim();
    const isMandatory =
      feedbackModal.mode === 'not_done' ||
      feedbackModal.mode === 'fw_postpone_week' ||
      feedbackModal.mode === 'fw_close_file';
    if (isMandatory && !trimmed && !recordedAudioUrl) return;

    const noteContent =
      trimmed ||
      (recordedAudioUrl ? `تسجيل صوتي (${recordedDuration || 1} ثانية)` : '');

    if (feedbackModal.mode === 'done') {
      if (feedbackModal.createdLogId && (noteContent || recordedAudioUrl)) {
        updatePatientFollowUpLog(feedbackModal.createdLogId, {
          ...(noteContent ? { notes: noteContent } : {}),
          ...(recordedAudioUrl
            ? { audioDataUrl: recordedAudioUrl, audioDurationSeconds: recordedDuration }
            : {})
        });
      } else if (!feedbackModal.createdLogId) {
        changePatientFollowUpStatus(feedbackModal.patientId, 'فيدباك', {
          notes: noteContent || undefined,
          audioDataUrl: recordedAudioUrl,
          audioDurationSeconds: recordedDuration,
          feedbackOutcome: 'done',
          feedbackDate: anchorDate,
          actionSource: 'task_card_button'
        });
      }
    } else if (feedbackModal.mode === 'fw_postpone_week') {
      if (!isValidPostponeDays) return;
      const evalYmd = anchorDate || todayYmd;
      const snoozeUntilDate = addDaysToYmd(evalYmd, parsedPostponeDays);
      const attempt = feedbackModal.attemptNumber || 1;
      const createdId = changePatientFollowUpStatus(
        feedbackModal.patientId,
        'قيد المتابعة',
        {
          notes: noteContent,
          audioDataUrl: recordedAudioUrl,
          audioDurationSeconds: recordedDuration,
          taskType: 'finished_work',
          finishedWorkAction: 'postpone_week',
          finishedWorkAttempt: attempt,
          snoozeUntilDate,
          actionDate: evalYmd,
          actionSource: 'task_card_button'
        }
      );
      if (createdId) {
        triggerUndoWindow(feedbackModal.patientId, 'postpone_week', createdId);
      }
    } else if (feedbackModal.mode === 'fw_close_file') {
      const evalYmd = anchorDate || todayYmd;
      const attempt = feedbackModal.attemptNumber || 1;
      const createdId = changePatientFollowUpStatus(
        feedbackModal.patientId,
        'غير مهتم',
        {
          notes: noteContent,
          audioDataUrl: recordedAudioUrl,
          audioDurationSeconds: recordedDuration,
          taskType: 'finished_work',
          finishedWorkAction: 'closed_file',
          finishedWorkAttempt: attempt,
          actionDate: evalYmd,
          actionSource: 'task_card_button'
        }
      );
      if (createdId) {
        triggerUndoWindow(feedbackModal.patientId, 'closed_file', createdId);
      }
    } else {
      changePatientFollowUpStatus(
        feedbackModal.patientId,
        feedbackModal.currentStatus || 'عميل محتمل',
        {
          notes: noteContent,
          audioDataUrl: recordedAudioUrl,
          audioDurationSeconds: recordedDuration,
          feedbackOutcome: 'not_done',
          feedbackDate: anchorDate,
          actionSource: 'task_card_button',
          keepCurrentStatus: true
        }
      );
    }

    const updatedId = feedbackModal.patientId;
    closeFeedbackModal();
    setJustUpdatedId(updatedId);
    window.setTimeout(() => {
      setJustUpdatedId(prev => (prev === updatedId ? null : prev));
    }, 1800);
  };

  const handleSendFeedbackWhatsApp = (patientId: string) => {
    const pat = patients.find(p => p.id === patientId);
    if (!pat) return;
    const appt =
      matchingPeriodAppointmentByPatient?.get(pat.id) ||
      latestAppointmentByPatient.get(pat.id);

    const feedbackTemplate =
      whatsappTemplates.find(
        t => t.isActive && (t.title.includes('فيدباك') || t.title.toLowerCase().includes('feedback'))
      ) ||
      whatsappTemplates.find(
        t => t.title.includes('فيدباك') || t.title.toLowerCase().includes('feedback') || t.title.includes('تقييم')
      );

    const message = feedbackTemplate
      ? renderWhatsAppTemplate(
          feedbackTemplate.messageTemplate,
          {
            patientName: pat.name,
            unitId: appt?.unitId,
            unitName: appt?.unitName || pat.branchName,
            date: appt?.date,
            dayName: appt?.date ? getArabicWeekdayName(appt.date) : undefined,
            time: appt?.time,
            doctorName: appt?.doctorName || pat.doctorName,
            procedure: appt?.procedureType
          },
          units
        )
      : `أهلاً بحضرتك أ/ ${pat.name}، نتمنى تكون بخير بعد زيارتك في ${CLINIC_DISPLAY_NAME}. يهمنا جداً نعرف تقييمك وملاحظاتك عن الخدمة الطبية.`;

    const targetPhone = getPreferredPatientWhatsAppPhone(pat) || pat.phone;
    openWhatsAppChat(targetPhone, message);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header Card */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">متابعة المرضى</h1>
              <p className="text-xs text-slate-500 font-semibold">
                تحديث حالة متابعة المرضى مباشرة من القائمة ({patients.length.toLocaleString('ar-EG')} مريض)
              </p>
            </div>
          </div>

          {currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={() => setActiveView('follow_up_logs')}
              className="px-3.5 py-2 rounded-xl bg-[#eef7f8] hover:bg-[#dff0f2] text-[#087e83] border border-[#cfe5e7] text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition-colors"
            >
              <History className="w-4 h-4" />
              <span>سجل متابعة المرضى</span>
            </button>
          )}
        </div>

        {/* Search Input + Filter Toggle Arrow Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ابحث بالاسم، رقم الموبايل، كود المريض، الطبيب، أو الفرع..."
              className="w-full pr-10 pl-9 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/60 text-xs sm:text-sm font-semibold focus:bg-white focus:border-[#087e83] focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                aria-label="مسح البحث"
                className="w-6 h-6 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsFiltersOpen(prev => !prev)}
            className={`px-4 py-2.5 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer flex-shrink-0 ${
              isFiltersOpen || activeFilterCount > 0
                ? 'bg-[#e7f5f2] text-[#087e83] border-[#087e83]/40'
                : 'bg-slate-50 text-[#172f3d] border-slate-200 hover:border-[#087e83]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>الفلاتر</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#087e83] text-white text-[10px] font-mono leading-none">
                {activeFilterCount}
              </span>
            )}
            {isFiltersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Collapsible Filters Panel (Hidden by Default Behind Filter Arrow) */}
        {isFiltersOpen && (
          <div className="p-4 rounded-2xl bg-[#f8fbfa] border border-[#dce8eb] space-y-4 animate-in fade-in duration-150">
            {/* Period Section: Day / Week / Month + Basis (Last Appt / File Created) + Prev/Next */}
            <div className="space-y-3 pb-3 border-b border-slate-200/80">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-[#172f3d] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#087e83]" />
                  <span>تحديد الفترة الزمنية</span>
                </span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                )}
              </div>

              {/* 3 Top Buttons: يوم | أسبوع | شهر (+ كل الفترات) */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'day', label: 'يوم' },
                    { key: 'week', label: 'أسبوع' },
                    { key: 'month', label: 'شهر' }
                  ] as const
                ).map(btn => {
                  const active = periodUnit === btn.key;
                  return (
                    <button
                      key={btn.key}
                      type="button"
                      onClick={() => {
                        setPeriodUnit(prev => (prev === btn.key ? 'all' : btn.key));
                        setCurrentPage(1);
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#087e83] text-white border-[#087e83] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#087e83]'
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              {/* 2 Underneath Buttons: آخر ميعاد | إنشاء الملف */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDateBasis('last_appointment');
                    setCurrentPage(1);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
                    dateBasis === 'last_appointment'
                      ? 'bg-[#172f3d] text-white border-[#172f3d]'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  آخر ميعاد
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateBasis('file_created');
                    setCurrentPage(1);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer ${
                    dateBasis === 'file_created'
                      ? 'bg-[#172f3d] text-white border-[#172f3d]'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  إنشاء الملف
                </button>
              </div>

              {/* Right / Left Period Shift Arrows (السابق / القادم) */}
              <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-1.5">
                <button
                  type="button"
                  onClick={() => handleShiftPeriod('prev')}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-[#e7f5f2] text-[#172f3d] hover:text-[#087e83] border border-slate-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>السابق</span>
                </button>

                <div className="text-center min-w-0 flex-1 px-2">
                  <div className="text-xs font-extrabold text-[#087e83] truncate">
                    {periodRange ? periodRange.label : 'كل الفترات (بدون تقييد تاريخ)'}
                  </div>
                  {periodRange && (
                    <div className="text-[10px] text-slate-400 font-semibold">
                      حسب: {dateBasis === 'last_appointment' ? 'تاريخ آخر ميعاد' : 'تاريخ إنشاء الملف'}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleShiftPeriod('next')}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-[#e7f5f2] text-[#172f3d] hover:text-[#087e83] border border-slate-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>القادم</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Multi-select Checkboxes: حالات المتابعة */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#172f3d]">حالات المتابعة (يمكن اختيار أكثر من حالة)</span>
                {selectedFollowUpStatuses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFollowUpStatuses([]);
                      setCurrentPage(1);
                    }}
                    className="text-[11px] font-bold text-[#087e83] hover:underline cursor-pointer"
                  >
                    عرض الكل
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {allStatusOptions.map(status => {
                  const checked = selectedFollowUpStatuses.includes(status);
                  const customHex = getFollowUpStatusColorHex(status, followUpColorsMap);
                  const activeStyle = checked && customHex ? getCustomColorActiveStyle(customHex) : undefined;
                  const badgeStyle = !checked && customHex ? getCustomColorBadgeStyle(customHex) : undefined;

                  return (
                    <label
                      key={status}
                      style={checked ? activeStyle : badgeStyle}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                        checked && !activeStyle
                          ? 'bg-[#087e83] text-white border-[#087e83]'
                          : !checked && !badgeStyle
                          ? 'bg-white text-slate-700 border-slate-200 hover:border-[#087e83]'
                          : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFollowUpStatusCheckbox(status)}
                          className="w-4 h-4 accent-[#087e83] rounded cursor-pointer flex-shrink-0"
                        />
                        {customHex && !checked && (
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: customHex }}
                          />
                        )}
                        <span className="truncate">{status}</span>
                      </span>
                      <span className="text-[10px] font-mono opacity-80">
                        ({(statusCounts[status] || 0).toLocaleString('ar-EG')})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Multi-select Checkboxes: حالات الميعاد */}
            <div className="space-y-2 pt-2 border-t border-slate-200/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#172f3d]">حالات الميعاد (حسب آخر موعد للمريض)</span>
                {selectedAppointmentStatuses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAppointmentStatuses([]);
                      setCurrentPage(1);
                    }}
                    className="text-[11px] font-bold text-[#087e83] hover:underline cursor-pointer"
                  >
                    عرض الكل
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {APPOINTMENT_STATUS_OPTIONS.map(opt => {
                  const checked = selectedAppointmentStatuses.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#087e83] text-white border-[#087e83]'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#087e83]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAppointmentStatusCheckbox(opt.value)}
                          className="w-4 h-4 accent-[#087e83] rounded cursor-pointer flex-shrink-0"
                        />
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            checked ? 'bg-white' : opt.dotClass
                          }`}
                        />
                        <span className="truncate">{opt.label}</span>
                      </span>
                      <span className="text-[10px] font-mono opacity-80">
                        ({(appointmentStatusCounts[opt.value] || 0).toLocaleString('ar-EG')})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Multi-select Checkboxes: تاجات / أوسمة المرضى */}
            <div className="space-y-2 pt-2 border-t border-slate-200/80">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-[#172f3d] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#087e83]" />
                  <span>التاجات / الأوسمة (Tags)</span>
                </span>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setTagFilterMode('include');
                        setCurrentPage(1);
                      }}
                      className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                        tagFilterMode === 'include' ? 'bg-white text-[#087e83] shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      يحتوي على
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTagFilterMode('exclude');
                        setCurrentPage(1);
                      }}
                      className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                        tagFilterMode === 'exclude' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      استبعاد
                    </button>
                  </div>
                  {selectedTags.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTags([]);
                        setCurrentPage(1);
                      }}
                      className="text-[11px] font-bold text-[#087e83] hover:underline cursor-pointer"
                    >
                      عرض الكل
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {patientTags.map(tag => {
                  const checked = selectedTags.includes(tag);
                  const customHex = getPatientTagColorHex(tag, tagColorsMap);
                  const activeStyle = checked && customHex ? getCustomColorActiveStyle(customHex) : undefined;
                  const badgeStyle = !checked && customHex ? getCustomColorBadgeStyle(customHex) : undefined;
                  return (
                    <label
                      key={tag}
                      style={checked ? activeStyle : badgeStyle}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                        checked && !activeStyle
                          ? 'bg-[#087e83] text-white border-[#087e83]'
                          : !checked && !badgeStyle
                          ? 'bg-white text-slate-700 border-slate-200 hover:border-[#087e83]'
                          : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTagCheckbox(tag)}
                          className="w-4 h-4 accent-[#087e83] rounded cursor-pointer flex-shrink-0"
                        />
                        {customHex && !checked && (
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: customHex }}
                          />
                        )}
                        <span className="truncate">#{tag}</span>
                      </span>
                      <span className="text-[10px] font-mono opacity-80">
                        ({(tagCounts[tag] || 0).toLocaleString('ar-EG')})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Pagination Summary & Page Size */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            {filteredPatients.length > 0 ? (
              <span>
                عرض <strong className="text-[#172f3d]">{(startIndex + 1).toLocaleString('ar-EG')}</strong> إلى{' '}
                <strong className="text-[#172f3d]">{endIndex.toLocaleString('ar-EG')}</strong> من{' '}
                <strong className="text-[#087e83]">{filteredPatients.length.toLocaleString('ar-EG')}</strong> مريض
              </span>
            ) : (
              <span>لا توجد نتائج مطابقة</span>
            )}
            {periodRange && (
              <span className="px-2 py-0.5 rounded-lg bg-[#e7f5f2] text-[#087e83] text-[11px] font-bold">
                {periodRange.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">عدد النتائج:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Finished Work Task Banner */}
      {finishedWorkMode && finishedWorkProgress && (
        <div className="bg-gradient-to-l from-[#e7f5f2] via-white to-[#f0f9f7] border border-[#b4ded6] rounded-3xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-[#087e83] text-white text-[10px] font-extrabold">
                مهمة يومية · {finishedWorkProgress.evalDate}
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-[#172f3d]">
                {FINISHED_WORK_TASK_TITLE}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <div className="px-3 py-1.5 rounded-xl bg-white border border-[#cfe5e7] text-xs font-extrabold text-[#172f3d]">
                الإنجاز:{' '}
                <span className="font-mono text-[#087e83]" dir="ltr">
                  {finishedWorkProgress.doneCount}/{finishedWorkProgress.quotaTarget}
                </span>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCompletedForDay(prev => !prev);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showCompletedForDay
                      ? 'bg-[#087e83] text-white border-[#087e83] shadow-xs'
                      : 'bg-white text-[#087e83] border-[#b4ded6] hover:bg-[#e7f5f2]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {showCompletedForDay
                      ? 'إخفاء الحالات المنتهية'
                      : `إظهار المهام المنتهية في هذا اليوم (${fwCompletedForDayCount.toLocaleString('ar-EG')})`}
                  </span>
                </button>
              )}
              {finishedWorkProgress.deferredCount > 0 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-extrabold text-amber-800">
                  مؤجل {finishedWorkProgress.deferredCount.toLocaleString('ar-EG')} بيشنت
                </div>
              )}
              {finishedWorkProgress.carryoverCredit > 0 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-extrabold text-emerald-700">
                  +{finishedWorkProgress.carryoverCredit.toLocaleString('ar-EG')} مرحّل من سابق
                </div>
              )}
              {finishedWorkProgress.surplusCount > 0 && (
                <div className="px-2.5 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-[11px] font-extrabold text-sky-700">
                  +{finishedWorkProgress.surplusCount.toLocaleString('ar-EG')} فائض للغد
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Feedback Task Banner with Completed Toggle */}
      {feedbackMode && !finishedWorkMode && isAdmin && (
        <div className="bg-gradient-to-l from-[#e7f5f2] via-white to-[#f0f9f7] border border-[#b4ded6] rounded-3xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-[#087e83] text-white text-[10px] font-extrabold">
                مهمة الفيدباك · {periodRange?.label || anchorDate}
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-[#172f3d]">
                متابعة مرضى الفيدباك
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCompletedForDay(prev => !prev);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto ${
                showCompletedForDay
                  ? 'bg-[#087e83] text-white border-[#087e83] shadow-xs'
                  : 'bg-white text-[#087e83] border-[#b4ded6] hover:bg-[#e7f5f2]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {showCompletedForDay
                  ? 'إخفاء الحالات المنتهية'
                  : `إظهار المهام المنتهية في هذا اليوم (${feedbackCompletedForDayCount.toLocaleString('ar-EG')})`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Patient Follow-Up Cards */}
      <div ref={patientCardsRef} className="space-y-2.5 scroll-mt-16">
        {paginatedPatients.length > 0 ? (
          paginatedPatients.map(pat => {
            const isConfiguredStatus = Boolean(
              pat.followUpStatus && patientFollowUpStatuses.includes(pat.followUpStatus)
            );
            const isJustUpdated = justUpdatedId === pat.id;
            const fwInfo = finishedWorkMode
              ? finishedWorkProgress?.patientInfoById.get(pat.id)
              : undefined;
            const pendingUndo = pendingUndoMap[pat.id];
            const displayedAppt =
              fwInfo?.latestCompletedAppt ||
              matchingPeriodAppointmentByPatient?.get(pat.id) ||
              latestAppointmentByPatient.get(pat.id);
            const feedbackOutcome = feedbackOutcomeByPatient.get(pat.id);
            const preferredWaPhone = getPreferredPatientWhatsAppPhone(pat) || pat.phone;
            const isWaMissing = isPreferredWhatsAppMissing(pat, preferredWaPhone);

            const isJustAddedFw = finishedWorkMode && justAddedFwPatientId === pat.id;

            return (
              <div
                key={pat.id}
                className={`p-4 rounded-3xl bg-white border shadow-sm hover:border-[#087e83] transition-all space-y-3 ${
                  isJustAddedFw
                    ? 'border-[#087e83] ring-2 ring-[#087e83]/20'
                    : 'border-[#dce8eb]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                  {/* Patient Info */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#e6f4f1] to-[#c2e4dd] text-[#087e83] font-bold text-base flex items-center justify-center flex-shrink-0">
                      {pat.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => goToPatient(pat.id)}
                          className="font-extrabold text-[#172f3d] text-sm sm:text-base hover:text-[#087e83] hover:underline truncate cursor-pointer"
                        >
                          {pat.name}
                        </button>
                        {pat.patientCode && (
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">
                            {pat.patientCode}
                          </span>
                        )}
                        {isJustAddedFw && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-[#e7f5f2] text-[#087e83] border border-[#087e83]/30 px-2 py-0.5 rounded-full">
                            <Plus className="w-3 h-3" />
                            كارت إضافي · عليه الدور
                          </span>
                        )}
                        {fwInfo?.todayAction && (() => {
                          const todayLogEntry = fwInfo.todayLogId ? followUpLogById.get(fwInfo.todayLogId) : undefined;
                          const todayApptEntry = fwInfo.todayApptId ? appointmentById.get(fwInfo.todayApptId) : undefined;
                          const actorName = todayLogEntry?.changedBy || todayApptEntry?.createdBy;
                          const actionBadgeMap: Record<string, { label: string; cls: string }> = {
                            finished: { label: 'منتهية: خلص شغل', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                            booked_appt: { label: 'منتهية: تم تحديد ميعاد جديد', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
                            closed_file: { label: 'منتهية: إغلاق الملف', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
                            postpone_week: { label: 'مؤجل: تأجيل المتابعة', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                            unreachable: { label: 'مؤجل: لا يمكن التواصل', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
                            not_interested: { label: 'مؤجل: غير مهتم', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
                          };
                          const meta = actionBadgeMap[fwInfo.todayAction];
                          if (!meta) return null;
                          return (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold border px-2.5 py-0.5 rounded-full ${meta.cls}`}>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{meta.label}</span>
                              {actorName && (
                                <span className="opacity-80">· {actorName}</span>
                              )}
                            </span>
                          );
                        })()}
                        {feedbackOutcome === 'done' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            تم الفيدباك
                          </span>
                        )}
                        {feedbackOutcome === 'not_done' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" />
                            لم تتم المهمة
                          </span>
                        )}
                        {isJustUpdated && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            تم التحديث
                          </span>
                        )}
                      </div>

                      {/* Staff Performed Action Details Box */}
                      {(() => {
                        const todayLogEntry = fwInfo?.todayLogId
                          ? followUpLogById.get(fwInfo.todayLogId)
                          : feedbackMode && !finishedWorkMode
                          ? feedbackLogByPatientForAnchor.get(pat.id)
                          : undefined;
                        const todayApptEntry = fwInfo?.todayApptId
                          ? appointmentById.get(fwInfo.todayApptId)
                          : undefined;
                        const staffActionInfo = getStaffActionDescription(
                          pat.id,
                          fwInfo,
                          feedbackOutcome,
                          todayLogEntry,
                          todayApptEntry,
                          appointments,
                          anchorDate
                        );
                        if (!staffActionInfo) return null;
                        const originBadgeCls =
                          staffActionInfo.originTone === 'inside'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : staffActionInfo.originTone === 'outside'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-slate-100 text-slate-700 border-slate-200';
                        const isEditingThisNote =
                          Boolean(staffActionInfo.editableLogId) &&
                          editingLogNoteId === staffActionInfo.editableLogId;

                        return (
                          <div className="p-3 rounded-2xl bg-[#e7f5f2]/80 border border-[#b4ded6] text-xs space-y-1.5 mt-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap font-extrabold text-[#087e83]">
                              <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>إجراء الموظفة: {staffActionInfo.title}</span>
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${originBadgeCls}`}
                                >
                                  {staffActionInfo.originLabel}
                                </span>
                                {staffActionInfo.employeeName && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-700 border border-[#b4ded6]">
                                    بواسطة: {staffActionInfo.employeeName}
                                  </span>
                                )}
                              </div>
                            </div>

                            {staffActionInfo.completedDateTime && (
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#087e83] pr-5">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>تاريخ وساعة الإنجاز: {staffActionInfo.completedDateTime}</span>
                              </div>
                            )}

                            <p className="text-slate-800 font-bold pr-5">
                              {staffActionInfo.detail}
                            </p>

                            {staffActionInfo.userNote && todayLogEntry && (
                              <div className="mt-1 mr-5 p-2.5 rounded-xl bg-white/95 border border-[#b4ded6] space-y-2">
                                {isEditingThisNote ? (
                                  <div className="space-y-2">
                                    <label className="block text-[10px] font-extrabold text-[#087e83]">
                                      تعديل نوت الموظفة:
                                    </label>
                                    <textarea
                                      value={editingLogNoteDraft}
                                      onChange={e => setEditingLogNoteDraft(e.target.value)}
                                      rows={2}
                                      maxLength={1000}
                                      placeholder="اكتب الملاحظة..."
                                      className="w-full px-3 py-2 rounded-xl border border-[#b4ded6] bg-white text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#087e83]/30"
                                    />
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingLogNoteId(null);
                                          setEditingLogNoteDraft('');
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                        <span>إلغاء</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSaveEditedLogNote(todayLogEntry.id, pat.id)
                                        }
                                        className="px-2.5 py-1 rounded-lg bg-[#087e83] hover:bg-[#06686c] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                      >
                                        <Save className="w-3 h-3" />
                                        <span>حفظ التعديل</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-slate-800 font-semibold leading-relaxed">
                                      <span className="text-[#087e83] font-extrabold">نوت الموظفة: </span>
                                      &quot;{staffActionInfo.userNote}&quot;
                                    </p>
                                    {canEditLogNote(todayLogEntry) && (
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditLogNote(todayLogEntry)}
                                        className="px-2 py-1 rounded-lg bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-[10px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        <span>تعديل النوت</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <a
                          href={`tel:${pat.phone}`}
                          dir="ltr"
                          className="font-mono font-semibold hover:text-[#087e83] flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{pat.phone}</span>
                        </a>
                        {(displayedAppt?.doctorName || fwInfo?.doctorName || pat.doctorName) && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="w-3 h-3 text-[#087e83]" />
                            <span>{fwInfo?.doctorName || displayedAppt?.doctorName || pat.doctorName}</span>
                          </span>
                        )}
                        {(displayedAppt?.unitName || fwInfo?.branchName || pat.branchName) && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Building2 className="w-3 h-3" />
                            <span>{fwInfo?.branchName || displayedAppt?.unitName || pat.branchName}</span>
                          </span>
                        )}
                        {displayedAppt && (
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            {matchingPeriodAppointmentByPatient ? 'الموعد: ' : 'آخر ميعاد: '}
                            {fwInfo ? `${fwInfo.visitDayName} · ${fwInfo.visitDate}` : `${displayedAppt.date} (${getAppointmentStatusLabel(displayedAppt.status)})`}
                          </span>
                        )}
                        {pat.registeredDate && (
                          <span className="text-[11px] font-semibold text-slate-400">
                            الملف: {pat.registeredDate}
                          </span>
                        )}
                      </div>

                      {/* Visible Patient Tags */}
                      {pat.tags && pat.tags.filter(t => patientTags.includes(t)).length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {pat.tags.filter(t => patientTags.includes(t)).map(tag => {
                            const tagHex = getPatientTagColorHex(tag, tagColorsMap);
                            return (
                              <span
                                key={tag}
                                style={getCustomColorBadgeStyle(tagHex)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  tagHex ? '' : 'bg-[#e7f5f2] text-[#087e83] border-[#bfe2db]'
                                }`}
                              >
                                #{tag}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Follow-Up Dropdown & Quick Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                      <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                        متابعة المريض:
                      </label>
                      <ColoredSelect
                        value={isConfiguredStatus ? pat.followUpStatus : ''}
                        onChange={val => {
                          if (!val) return;
                          handleStatusChange(pat.id, val);
                        }}
                        placeholder="-- اختر حالة المتابعة --"
                        options={patientFollowUpStatuses.map(st => ({
                          value: st,
                          label: st,
                          colorHex: getFollowUpStatusColorHex(st, followUpColorsMap)
                        }))}
                        className="flex-1 sm:w-44"
                        ariaLabel="تغيير حالة متابعة المريض"
                      />
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2 justify-end">
                        <a
                          href={buildWhatsAppUrl(preferredWaPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                            isWaMissing
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 hover:opacity-80'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                          }`}
                          title={
                            isWaMissing
                              ? `لا يوجد واتساب على هذا الرقم (${preferredWaPhone}) — اضغط للتحقق في واتساب`
                              : 'فتح محادثة واتساب'
                          }
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                        <a
                          href={`tel:${pat.phone}`}
                          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shadow-sm"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => goToPatient(pat.id)}
                          className="px-3 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>فتح الملف</span>
                        </button>
                      </div>
                      {isWaMissing && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
                          <span>لا يوجد واتساب على هذا الرقم</span>
                          <button
                            type="button"
                            onClick={() => setRegisterWaPatientId(pat.id)}
                            className="text-[#087e83] underline hover:text-[#06686c] cursor-pointer"
                          >
                            (تسجيل رقم واتساب)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Finished Work Session Details, Deferral Badges, Notes & Controls */}
                {finishedWorkMode && fwInfo && (
                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    {/* Last visit session procedures, doctor, branch & weekday */}
                    <div className="p-3 rounded-2xl bg-[#f8fbfa] border border-[#dce8eb] space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-[#172f3d]">
                            آخر زيارة: {fwInfo.visitDayName} ({fwInfo.visitDate})
                          </span>
                          {fwInfo.visitDate && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRelativeTimeBadgeClass(
                                fwInfo.visitDate
                              )}`}
                            >
                              {formatRelativeCalendarDaysArabic(fwInfo.visitDate, todayYmd)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[11px] font-bold text-slate-600 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Stethoscope className="w-3.5 h-3.5 text-[#087e83]" />
                            {fwInfo.doctorName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            {fwInfo.branchName}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-extrabold text-slate-500">الإجراءات في الجلسة:</span>
                        {fwInfo.sessionProcedures.length > 0 ? (
                          fwInfo.sessionProcedures.map((proc, idx) => (
                            <span
                              key={`${proc}-${idx}`}
                              className="px-2.5 py-1 rounded-xl bg-white border border-[#bfe2db] text-[#087e83] text-[11px] font-extrabold shadow-2xs"
                            >
                              {proc}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400">زيارة عيادة</span>
                        )}
                      </div>

                      {/* Prior deferral badge */}
                      {fwInfo.lastDeferral && (
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-extrabold border ${
                            fwInfo.lastDeferral.action === 'unreachable'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : fwInfo.lastDeferral.action === 'postpone_week'
                              ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                              : 'bg-rose-50 text-rose-900 border-rose-200'
                          }`}
                        >
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            {fwInfo.lastDeferral.action === 'unreachable'
                              ? `مؤجل من ٣ أيام (المحاولة رقم ${fwInfo.lastDeferral.attempt.toLocaleString('ar-EG')} (لا يمكن التواصل))`
                              : fwInfo.lastDeferral.action === 'postpone_week'
                              ? `مؤجل من ${fwInfo.lastDeferral.daysLabel} (المحاولة رقم ${fwInfo.lastDeferral.attempt.toLocaleString('ar-EG')} (تأجيل))`
                              : `مؤجل من أسبوع (المحاولة رقم ${fwInfo.lastDeferral.attempt.toLocaleString('ar-EG')} (غير مهتم))`}
                          </span>
                        </div>
                      )}

                      {/* Previous notes and voice notes in current cycle */}
                      {fwInfo.currentCycleLogs.filter(l => l.notes || l.audioDataUrl).length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-200/70">
                          <span className="text-[10px] font-extrabold text-slate-500 block">
                            ملاحظات وتسجيلات سابقة:
                          </span>
                          {fwInfo.currentCycleLogs
                            .filter(l => l.notes || l.audioDataUrl)
                            .map(log => {
                              const isEditingCycleNote = editingLogNoteId === log.id;
                              const cycleDateTime = formatCairoCompletionDateTime(
                                log.timestamp,
                                log.actionDate
                              );
                              return (
                                <div
                                  key={log.id}
                                  className="p-2 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 font-bold flex-wrap">
                                    <span>{log.changedBy}</span>
                                    <span className="font-mono">
                                      {cycleDateTime || log.actionDate || log.timestamp.slice(0, 10)}
                                    </span>
                                  </div>
                                  {isEditingCycleNote ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={editingLogNoteDraft}
                                        onChange={e => setEditingLogNoteDraft(e.target.value)}
                                        rows={2}
                                        maxLength={1000}
                                        className="w-full px-2.5 py-1.5 rounded-xl border border-[#b4ded6] bg-white text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#087e83]/30"
                                      />
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingLogNoteId(null);
                                            setEditingLogNoteDraft('');
                                          }}
                                          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                          <X className="w-3 h-3" />
                                          <span>إلغاء</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveEditedLogNote(log.id, pat.id)}
                                          className="px-2 py-1 rounded-lg bg-[#087e83] hover:bg-[#06686c] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                          <Save className="w-3 h-3" />
                                          <span>حفظ التعديل</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    log.notes && (
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-slate-700 font-semibold">{log.notes}</p>
                                        {canEditLogNote(log) && !isSystemAutoFollowUpNote(log.notes) && (
                                          <button
                                            type="button"
                                            onClick={() => handleStartEditLogNote(log)}
                                            className="px-2 py-0.5 rounded-lg bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-[10px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                                          >
                                            <Pencil className="w-2.5 h-2.5" />
                                            <span>تعديل</span>
                                          </button>
                                        )}
                                      </div>
                                    )
                                  )}
                                  {log.audioDataUrl && (
                                    <div className="flex items-center gap-2">
                                      <audio controls src={log.audioDataUrl} className="h-8 w-full max-w-xs" />
                                      {log.audioDurationSeconds !== undefined && (
                                        <span className="text-[10px] font-mono font-bold text-[#087e83] whitespace-nowrap">
                                          ({log.audioDurationSeconds} ث)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Row 1: Big Green Call Button + Small WhatsApp Button */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${pat.phone}`}
                          className="flex-1 py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                          <span>اتصال ({pat.phone})</span>
                        </a>
                        <a
                          href={buildWhatsAppUrl(preferredWaPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={
                            isWaMissing
                              ? `لا يوجد واتساب على هذا الرقم (${preferredWaPhone}) — اضغط للتحقق في واتساب`
                              : 'فتح محادثة واتساب'
                          }
                          aria-label="واتساب"
                          className={`w-11 h-[42px] rounded-2xl border flex items-center justify-center flex-shrink-0 shadow-xs transition-all ${
                            isWaMissing
                              ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-50 hover:opacity-80'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          <MessageCircle className="w-5 h-5" />
                        </a>
                      </div>
                      {isWaMissing && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl">
                          <span>لا يوجد واتساب على هذا الرقم</span>
                          <button
                            type="button"
                            onClick={() => setRegisterWaPatientId(pat.id)}
                            className="text-[#087e83] underline hover:text-[#06686c] cursor-pointer"
                          >
                            (تسجيل رقم واتساب)
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Row 2: Finished Work (or 5s Undo) + Book New Appointment */}
                    <div className="grid grid-cols-2 gap-2">
                      {pendingUndo?.action === 'finished' ? (
                        <button
                          type="button"
                          onClick={() => handleUndoFinishedWorkAction(pat.id)}
                          className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer animate-pulse"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>تراجع ({pendingUndo.secondsLeft})</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(pendingUndo)}
                          onClick={() => handleFinishedWorkDoneClick(pat.id)}
                          className="py-2.5 px-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <FileCheck2 className="w-4 h-4 flex-shrink-0" />
                          <span>خلص شغل</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setIsQuickActionOpen(true, 'appointment', {
                            patientId: pat.id,
                            source: 'task_card_button'
                          })
                        }
                        className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <Calendar className="w-4 h-4 flex-shrink-0" />
                        <span>تحديد ميعاد جديد</span>
                      </button>
                    </div>

                    {/* Row 3: Unreachable (3 days) + Postpone 1 Week (mandatory note/voice note) */}
                    <div className="grid grid-cols-2 gap-2">
                      {pendingUndo?.action === 'unreachable' ? (
                        <button
                          type="button"
                          onClick={() => handleUndoFinishedWorkAction(pat.id)}
                          className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer animate-pulse"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>تراجع ({pendingUndo.secondsLeft})</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(pendingUndo)}
                          onClick={() =>
                            handleFinishedWorkUnreachableClick(
                              pat.id,
                              fwInfo.unreachableAttempts + 1
                            )
                          }
                          className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <PhoneOff className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>لا يمكن التواصل</span>
                        </button>
                      )}

                      {pendingUndo?.action === 'postpone_week' ? (
                        <button
                          type="button"
                          onClick={() => handleUndoFinishedWorkAction(pat.id)}
                          className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer animate-pulse"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>تراجع ({pendingUndo.secondsLeft})</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(pendingUndo)}
                          onClick={() =>
                            openFeedbackModal(
                              pat.id,
                              pat.name,
                              pat.followUpStatus || 'عميل محتمل',
                              'fw_postpone_week',
                              undefined,
                              {
                                visitDate: fwInfo.visitDate,
                                attemptNumber: fwInfo.postponeWeekAttempts + 1
                              }
                            )
                          }
                          className="py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-800 border border-indigo-200 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>تأجيل المتابعة</span>
                        </button>
                      )}
                    </div>

                    {/* Row 4: Always-Visible Wide Close File Button (mandatory note/voice -> غير مهتم) */}
                    {pendingUndo?.action === 'closed_file' ? (
                      <button
                        type="button"
                        onClick={() => handleUndoFinishedWorkAction(pat.id)}
                        className="w-full py-2.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer animate-pulse"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>تراجع ({pendingUndo.secondsLeft})</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(pendingUndo)}
                        onClick={() =>
                          openFeedbackModal(
                            pat.id,
                            pat.name,
                            pat.followUpStatus || 'عميل محتمل',
                            'fw_close_file',
                            undefined,
                            {
                              visitDate: fwInfo.visitDate,
                              attemptNumber: fwInfo.notInterestedAttempts + 1
                            }
                          )
                        }
                        className="w-full py-2.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-800 border border-rose-300 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                      >
                        <Lock className="w-4 h-4 flex-shrink-0" />
                        <span>إغلاق الملف</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Linked Feedback Task Controls */}
                {feedbackMode && !finishedWorkMode && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    {/* Row 1: Big Send Feedback button */}
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => handleSendFeedbackWhatsApp(pat.id)}
                        className={`w-full py-2.5 px-4 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          isWaMissing
                            ? 'bg-slate-200 hover:bg-slate-300 text-slate-600 opacity-65 border border-slate-300'
                            : 'bg-[#087e83] hover:bg-[#06686c] text-white shadow-sm'
                        }`}
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>إرسال فيدباك</span>
                      </button>
                      {isWaMissing && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl">
                          <span>لا يوجد واتساب على هذا الرقم</span>
                          <button
                            type="button"
                            onClick={() => setRegisterWaPatientId(pat.id)}
                            className="text-[#087e83] underline hover:text-[#06686c] cursor-pointer"
                          >
                            (تسجيل رقم واتساب)
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Row 2: 3 outcome/contact buttons in one horizontal row */}
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleDoneFeedbackClick(
                            pat.id,
                            pat.name,
                            pat.followUpStatus || 'عميل محتمل'
                          )
                        }
                        className="py-2 px-1.5 sm:px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] sm:text-xs flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer text-center leading-tight"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span>تم الفيدباك</span>
                      </button>

                      <a
                        href={`tel:${pat.phone}`}
                        onClick={() => {
                          if (preferredWaPhone) {
                            setPatientPhoneNoWhatsApp(pat.id, preferredWaPhone, true);
                          }
                        }}
                        className="py-2 px-1.5 sm:px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-[10px] sm:text-xs flex items-center justify-center gap-1 shadow-xs transition-colors text-center leading-tight"
                      >
                        <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span>لا يوجد واتساب (اتصال)</span>
                      </a>

                      <button
                        type="button"
                        onClick={() =>
                          openFeedbackModal(
                            pat.id,
                            pat.name,
                            pat.followUpStatus || 'عميل محتمل',
                            'not_done'
                          )
                        }
                        className="py-2 px-1.5 sm:px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] sm:text-xs flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer text-center leading-tight"
                      >
                        <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span>لم تتم المهمة</span>
                      </button>
                    </div>

                    {/* Row 3: Big green Book Next Appointment button */}
                    <button
                      type="button"
                      onClick={() =>
                        setIsQuickActionOpen(true, 'appointment', { patientId: pat.id })
                      }
                      className="w-full py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>حجز ميعاد قادم</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : finishedWorkMode && finishedWorkProgress ? (
          <div className="bg-white border border-[#b4ded6] rounded-3xl p-8 sm:p-10 text-center space-y-3 shadow-sm">
            <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
            <p className="text-sm sm:text-base font-extrabold text-[#172f3d]">
              {finishedWorkProgress.totalPatients > 0
                ? 'تم إنجاز جميع الحالات الحالية في مهمة خلص شغل'
                : 'لا توجد حالات مستحقة في مهمة خلص شغل حالياً'}
            </p>
            {isAdmin && fwCompletedForDayCount > 0 && !showCompletedForDay && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCompletedForDay(true);
                    setCurrentPage(1);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border border-[#b4ded6] font-extrabold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    إظهار المهام المنتهية في هذا اليوم ({fwCompletedForDayCount.toLocaleString('ar-EG')})
                  </span>
                </button>
              </div>
            )}
            {finishedWorkProgress.hasMoreCandidates && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAddExtraFinishedWorkCard}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-[#087e83] hover:bg-[#06686c] text-white font-extrabold text-xs sm:text-sm shadow-sm transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة كارت إضافي</span>
                </button>
                {finishedWorkProgress.remainingCount === 0 && (
                  <button
                    type="button"
                    onClick={handleShowFiveMoreFinishedWork}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border border-[#b4ded6] font-extrabold text-xs sm:text-sm transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إظهار خمسة آخرون</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#dce8eb] rounded-3xl p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-500">لا يوجد مرضى مطابقين لخيارات البحث الحالية</p>
          </div>
        )}

        {finishedWorkMode && paginatedPatients.length > 0 && finishedWorkProgress && (
          <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              type="button"
              disabled={!finishedWorkProgress.hasMoreCandidates}
              onClick={handleAddExtraFinishedWorkCard}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#087e83] hover:bg-[#06686c] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-extrabold text-xs sm:text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>
                {finishedWorkProgress.hasMoreCandidates
                  ? 'إضافة كارت إضافي'
                  : 'إضافة كارت إضافي (لا توجد حالات أخرى عليها الدور)'}
              </span>
            </button>
            {finishedWorkProgress.remainingCount === 0 && finishedWorkProgress.hasMoreCandidates && (
              <button
                type="button"
                onClick={handleShowFiveMoreFinishedWork}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border border-[#b4ded6] font-extrabold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إظهار خمسة آخرون</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 disabled:opacity-40 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
            <span>السابق</span>
          </button>
          <span className="text-xs font-bold text-slate-600 px-2">
            صفحة {safePage.toLocaleString('ar-EG')} من {totalPages.toLocaleString('ar-EG')}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 disabled:opacity-40 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <span>التالي</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Feedback Outcome Note + Voice Note Modal */}
      {feedbackModal && (
        <div
          onClick={closeFeedbackModal}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    feedbackModal.mode === 'done'
                      ? 'bg-emerald-50 text-emerald-700'
                      : feedbackModal.mode === 'fw_postpone_week'
                      ? 'bg-violet-50 text-violet-700'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {feedbackModal.mode === 'done' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : feedbackModal.mode === 'fw_postpone_week' ? (
                    <Clock className="w-5 h-5" />
                  ) : feedbackModal.mode === 'fw_close_file' ? (
                    <Lock className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-[#172f3d]">
                    {feedbackModal.mode === 'done'
                      ? 'ملاحظة تم الفيدباك (اختياري)'
                      : feedbackModal.mode === 'fw_postpone_week'
                      ? 'تأجيل المتابعة — قيد المتابعة (إلزامي)'
                      : feedbackModal.mode === 'fw_close_file'
                      ? 'إغلاق الملف — غير مهتم (إلزامي)'
                      : 'سبب عدم إتمام المهمة (إلزامي)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold truncate">
                    {feedbackModal.patientName} · زيارة {feedbackModal.visitDate || anchorDate}
                    {(feedbackModal.mode === 'fw_postpone_week' || feedbackModal.mode === 'fw_close_file') &&
                    feedbackModal.attemptNumber
                      ? ` · المحاولة رقم ${feedbackModal.attemptNumber.toLocaleString('ar-EG')}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeFeedbackModal}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFeedbackModal} className="space-y-3.5">
              {(feedbackModal.mode === 'not_done' ||
                feedbackModal.mode === 'fw_postpone_week' ||
                feedbackModal.mode === 'fw_close_file') && (
                <div
                  className={`p-2.5 rounded-xl border text-[11px] font-bold ${
                    feedbackModal.mode === 'fw_postpone_week'
                      ? 'bg-violet-50 border-violet-200 text-violet-900'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {feedbackModal.mode === 'fw_postpone_week'
                    ? 'حدد عدد أيام التأجيل واكتب ملاحظة أو سجل فويس نوت لتحويل حالة المريض إلى «قيد المتابعة».'
                    : feedbackModal.mode === 'fw_close_file'
                    ? 'يجب كتابة سبب إغلاق الملف أو تسجيل فويس نوت قبل تحويل الحالة إلى «غير مهتم».'
                    : 'يجب كتابة سبب عدم إتمام المهمة أو تسجيل ملاحظة صوتية قبل الحفظ.'}
                </div>
              )}

              {feedbackModal.mode === 'fw_postpone_week' && (() => {
                const evalYmd = anchorDate || todayYmd;
                const targetReturnYmd = isValidPostponeDays
                  ? addDaysToYmd(evalYmd, parsedPostponeDays)
                  : '';
                const targetWeekday = targetReturnYmd ? getArabicWeekdayName(targetReturnYmd) : '';
                return (
                  <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <label
                        htmlFor="fw-postpone-days-input"
                        className="text-xs font-extrabold text-indigo-950"
                      >
                        عدد أيام التأجيل
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[3, 7, 14, 30].map(preset => {
                          const isSelected = isValidPostponeDays && parsedPostponeDays === preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setPostponeDaysInput(String(preset))}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              {preset.toLocaleString('ar-EG')} {preset <= 10 ? 'أيام' : 'يوم'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="fw-postpone-days-input"
                        type="text"
                        inputMode="numeric"
                        value={postponeDaysInput}
                        onChange={e => setPostponeDaysInput(e.target.value)}
                        placeholder="أدخل عدد الأيام (مثال: 7)"
                        className="w-28 px-3 py-2 rounded-xl border border-indigo-300 bg-white text-center font-mono font-extrabold text-sm text-[#172f3d] focus:border-indigo-600 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-indigo-900">
                        {isValidPostponeDays ? formatPostponeDaysArabic(parsedPostponeDays) : 'يوم'}
                      </span>
                    </div>

                    {isValidPostponeDays ? (
                      <p className="text-[11px] font-bold text-indigo-800">
                        سيظهر المريض مجدداً يوم {targetWeekday} ({targetReturnYmd})
                      </p>
                    ) : (
                      <p className="text-[11px] font-bold text-rose-600">
                        يرجى إدخال عدد أيام صحيح من ١ إلى ٣٦٥ يوم
                      </p>
                    )}
                  </div>
                );
              })()}

              <textarea
                value={feedbackNoteText}
                onChange={e => setFeedbackNoteText(e.target.value)}
                rows={3}
                placeholder={
                  feedbackModal.mode === 'done'
                    ? 'أضف ملاحظة الفيدباك (اختياري)...'
                    : feedbackModal.mode === 'fw_postpone_week'
                    ? 'اكتب سبب التأجيل أو ما تم في المكالمة (إلزامي)...'
                    : feedbackModal.mode === 'fw_close_file'
                    ? 'اكتب سبب إغلاق الملف أو عدم الاهتمام (إلزامي)...'
                    : 'اكتب سبب عدم إتمام الفيدباك (إلزامي)...'
                }
                className="w-full p-3 rounded-2xl border border-slate-200 bg-[#fbfdfd] text-xs sm:text-sm font-medium focus:border-[#087e83] focus:outline-none"
                autoFocus
              />

              {recordedAudioUrl && (
                <div className="p-2.5 rounded-2xl bg-[#f0f8f6] border border-[#bfe2db] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <audio controls src={recordedAudioUrl} className="h-8 w-full max-w-xs" />
                    <span className="text-[11px] font-mono font-bold text-[#087e83] whitespace-nowrap">
                      ({recordedDuration || 1} ث)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRecordedAudioUrl(undefined);
                      setRecordedDuration(undefined);
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:underline self-end sm:self-center cursor-pointer"
                  >
                    حذف التسجيل
                  </button>
                </div>
              )}

              {recordingError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{recordingError}</span>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="submit"
                  disabled={
                    (feedbackModal.mode === 'fw_postpone_week' && !isValidPostponeDays) ||
                    ((feedbackModal.mode === 'not_done' ||
                      feedbackModal.mode === 'fw_postpone_week' ||
                      feedbackModal.mode === 'fw_close_file') &&
                      !feedbackNoteText.trim() &&
                      !recordedAudioUrl)
                  }
                  className={`flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-xs shadow-sm cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    feedbackModal.mode === 'done'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : feedbackModal.mode === 'fw_postpone_week'
                      ? 'bg-violet-600 hover:bg-violet-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  حفظ
                </button>

                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isRecording
                      ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-3.5 h-3.5 fill-rose-600" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isRecording
                      ? `إيقاف (0:${String(recordingSeconds).padStart(2, '0')} / 1:00)`
                      : 'تسجيل فويس نوت'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={closeFeedbackModal}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  {feedbackModal.mode === 'done' ? 'تخطي وإغلاق' : 'إلغاء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {registerWaPatient && (
        <RegisterWhatsAppModal
          patient={registerWaPatient}
          onClose={() => setRegisterWaPatientId(null)}
        />
      )}
    </div>
  );
};
