import React, { useState, useEffect, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  ArrowRight,
  Phone,
  MessageCircle,
  Calendar,
  FileText,
  CreditCard,
  Plus,
  Trash2,
  Mic,
  Square,
  Activity,
  Edit3,
  Tag,
  X,
  Check,
  AlertCircle,
  MoreVertical,
  Pencil,
  ExternalLink,
  ShieldAlert,
  Send,
  History,
  ArrowLeft,
  Copy
} from 'lucide-react';
import { formatCairoTime, formatRelativeTimeArabic, getRelativeTimeBadgeClass, getArabicWeekdayName } from '../utils/arabic';
import {
  buildWhatsAppUrl,
  getPreferredPatientWhatsAppPhone,
  hasAnyNoWhatsAppPhone,
  isPhoneMarkedNoWhatsApp,
  isPreferredWhatsAppMissing,
  openWhatsAppChat,
  renderWhatsAppTemplate,
  resolveClinicAddress
} from '../utils/whatsapp';
import { Invoice, InvoiceItem, Payment } from '../types/clinic';
import { ToothIcon } from '../components/ToothIcon';
import { ColoredSelect } from '../components/ColoredSelect';
import { RegisterWhatsAppModal } from '../components/RegisterWhatsAppModal';
import { getCustomColorActiveStyle, getCustomColorBadgeStyle, getFollowUpStatusColorHex, getPatientTagColorHex } from '../utils/colors';

export const PatientDetailView: React.FC = () => {
  const {
    selectedPatientId,
    patients,
    appointments,
    invoices,
    payments,
    operations,
    setActiveView,
    goBack,
    scrollToTop,
    setIsQuickActionOpen,
    patientDetailFocusNotes,
    clearPatientDetailFocusNotes,
    addPatientNote,
    updatePatientNote,
    deletePatientNote,
    togglePalmerTooth,
    updatePatient,
    setPatientDefaultWhatsAppPhone,
    setPatientPhoneNoWhatsApp,
    deletePatient,
    updateInvoice,
    voidInvoice,
    updatePayment,
    voidPayment,
    deleteAppointment,
    patientTags,
    addPatientTag,
    whatsappTemplates,
    units,
    patientFollowUpStatuses,
    patientFollowUpLogs,
    changePatientFollowUpStatus,
    updatePatientFollowUpLog,
    deletePatientFollowUpLog,
    listItemColors,
    staffMembers,
    currentUser,
    hasPermission
  } = useClinic();

  const canEditPatients = hasPermission('editPatients');
  const canDeletePatients = hasPermission('deletePatients');
  const canAddAppointments = hasPermission('addAppointments');
  const canEditAppointments = hasPermission('editAppointments');
  const canDeleteAppointments = hasPermission('deleteAppointments');
  const canViewInvoicesPayments = hasPermission('viewInvoicesPayments');
  const canAddInvoicesPayments = hasPermission('addInvoicesPayments');
  const canEditInvoicesPayments = hasPermission('editInvoicesPayments');
  const canDeleteInvoicesPayments = hasPermission('deleteInvoicesPayments');
  const canViewFinancialReports = hasPermission('viewFinancialReports');
  const canViewFinancialDetails = canViewInvoicesPayments || canViewFinancialReports;
  const canViewClinicalNotes = hasPermission('viewClinicalNotes');
  const canAddClinicalNotes = hasPermission('addClinicalNotes');
  const canEditClinicalNotes = hasPermission('editClinicalNotes');
  const canDeleteClinicalNotes = hasPermission('deleteClinicalNotes');
  const shouldHideAdminNotes = currentUser.role !== 'admin' && hasPermission('hideAdminNotes');
  const canShowPalmerChart = currentUser.role === 'admin' || currentUser.role === 'doctor';

  const [activeTimelineTab, setActiveTimelineTab] = useState<'hidden' | 'all' | 'appointments' | 'invoices' | 'payments'>('hidden');
  const [newNoteText, setNewNoteText] = useState('');
  const [selectedTeethForNote, setSelectedTeethForNote] = useState<number[]>([]);
  const [isToothModalOpen, setIsToothModalOpen] = useState(false);
  const [inspectedToothCode, setInspectedToothCode] = useState<number | null>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isRegisterWaModalOpen, setIsRegisterWaModalOpen] = useState(false);
  const [isFollowUpLogModalOpen, setIsFollowUpLogModalOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState('');
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [editFollowUpPrevStatus, setEditFollowUpPrevStatus] = useState('');
  const [editFollowUpNewStatus, setEditFollowUpNewStatus] = useState('');
  const [editFollowUpNotes, setEditFollowUpNotes] = useState('');
  const [confirmDeleteFollowUpId, setConfirmDeleteFollowUpId] = useState<string | null>(null);
  const [followUpModalNotice, setFollowUpModalNotice] = useState<string | null>(null);

  const toggleToothForNote = (code: number) => {
    setSelectedTeethForNote(prev =>
      prev.includes(code) ? prev.filter(t => t !== code) : [...prev, code]
    );
  };

  // Real Audio Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | undefined>(undefined);
  const [recordedDuration, setRecordedDuration] = useState<number | undefined>(undefined);
  const [recordingError, setRecordingError] = useState('');
  const [micPermissionModal, setMicPermissionModal] = useState<{
    status: 'prompt' | 'denied' | 'iframe_blocked' | 'no_device' | 'unsupported';
    detail?: string;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSecsRef = useRef<number>(0);
  const clinicalNotesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!patientDetailFocusNotes) {
      scrollToTop();
    }
    setActiveTimelineTab('hidden');
    setIsFollowUpLogModalOpen(false);
    setInspectedToothCode(null);
    setEditingFollowUpId(null);
    setConfirmDeleteFollowUpId(null);
  }, [selectedPatientId, scrollToTop, patientDetailFocusNotes]);

  useEffect(() => {
    if (patientDetailFocusNotes && selectedPatientId) {
      const timer = window.setTimeout(() => {
        clinicalNotesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        clearPatientDetailFocusNotes();
      }, 140);
      return () => window.clearTimeout(timer);
    }
  }, [patientDetailFocusNotes, selectedPatientId, clearPatientDetailFocusNotes]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Edit Patient Modal & Delete Confirm state
  const [isEditPatientOpen, setIsEditPatientOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSecondaryPhone, setEditSecondaryPhone] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState<'ذكر' | 'أنثى'>('أنثى');
  const [editAddress, setEditAddress] = useState('');
  const [editFollowUpStatus, setEditFollowUpStatus] = useState<string>('');
  const [confirmDeletePatient, setConfirmDeletePatient] = useState(false);

  // WhatsApp Template Modal & Inline Follow-Up feedback state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplateUnitId, setSelectedTemplateUnitId] = useState('');
  const [templatePreviewText, setTemplatePreviewText] = useState('');
  const [followUpSavedNotice, setFollowUpSavedNotice] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Edit / Delete Clinical Note state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);

  // Timeline Three-dots menu + Invoice/Payment Edit Modal state
  const [openTimelineMenuKey, setOpenTimelineMenuKey] = useState<string | null>(null);
  const [confirmDeleteTimelineKey, setConfirmDeleteTimelineKey] = useState<string | null>(null);

  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editInvItems, setEditInvItems] = useState<InvoiceItem[]>([]);
  const [editInvDiscount, setEditInvDiscount] = useState(0);
  const [editInvNotes, setEditInvNotes] = useState('');

  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState(0);
  const [editPayMethod, setEditPayMethod] = useState<Payment['paymentMethod']>('cash');
  const [editPayDate, setEditPayDate] = useState('');
  const [editPayNotes, setEditPayNotes] = useState('');

  useEffect(() => {
    if (!openTimelineMenuKey) return;
    const handleDocClick = () => {
      setOpenTimelineMenuKey(null);
      setConfirmDeleteTimelineKey(null);
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [openTimelineMenuKey]);

  const patient = patients.find(p => p.id === selectedPatientId);

  if (!patient) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-3">
        <p className="text-slate-500 font-bold">لم يتم تحديد مريض أو تم حذف الملف</p>
        <button
          type="button"
          onClick={() => setActiveView('patients')}
          className="px-4 py-2 bg-[#087e83] text-white rounded-xl text-xs font-bold"
        >
          الرجوع لقائمة المرضى
        </button>
      </div>
    );
  }

  // Patient data (respecting appointmentsOwnOnly if enabled)
  const patAppointments = appointments.filter(a => {
    if (a.patientId !== patient.id) return false;
    if (currentUser.permissions?.appointmentsOwnOnly) {
      return !!currentUser.doctorId && a.doctorId === currentUser.doctorId;
    }
    return true;
  });
  const patInvoices = invoices.filter(i => i.patientId === patient.id && i.status !== 'voided');
  const patPayments = payments.filter(p => p.patientId === patient.id && p.status !== 'voided');
  const hasLiveLedger = patInvoices.length > 0 || patPayments.length > 0;
  const computedBilled = patInvoices.reduce((s, inv) => s + (inv.netTotal || 0), 0);
  const computedPaid = patPayments.reduce((s, pay) => s + (pay.amount || 0), 0);
  const displayTotalBilled = hasLiveLedger ? computedBilled : (patient.totalBilled || 0);
  const displayTotalPaid = hasLiveLedger ? computedPaid : (patient.totalPaid || 0);
  const displayOutstanding = hasLiveLedger
    ? Math.max(0, computedBilled - computedPaid)
    : (patient.outstandingBalance || 0);

  const isNoteWrittenByAdmin = (note: { authorName: string; isAdminAuthored?: boolean }) => {
    const matchedStaff = staffMembers.find(s => s.name === note.authorName);
    if (matchedStaff) return matchedStaff.role === 'admin';
    return Boolean(note.isAdminAuthored);
  };
  const patNotes = (patient.notes || []).filter(n => !(shouldHideAdminNotes && isNoteWrittenByAdmin(n)));
  const patOperations = operations.filter(op => op.patientId === patient.id);

  const parseToothCodes = (raw?: string): number[] => {
    if (!raw) return [];
    const codes = new Set<number>();
    const upper = raw.toUpperCase();
    const palmerRegex = /\b(UR|UL|LL|LR)\s*([1-8])\b/g;
    let m: RegExpExecArray | null;
    while ((m = palmerRegex.exec(upper)) !== null) {
      const quad = m[1];
      const num = Number(m[2]);
      const base = quad === 'UR' ? 10 : quad === 'UL' ? 20 : quad === 'LL' ? 30 : 40;
      codes.add(base + num);
    }
    const fdiRegex = /\b([1-4][1-8])\b/g;
    while ((m = fdiRegex.exec(upper)) !== null) {
      codes.add(Number(m[1]));
    }
    return Array.from(codes);
  };

  const getToothLinkedData = (code: number) => {
    const linkedNotes = patNotes
      .filter(n => n.toothNumbers?.includes(code) || n.toothNumber === code)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const linkedInvoiceItems = patInvoices.flatMap(inv =>
      inv.items
        .filter(it => it.toothNumbers?.includes(code))
        .map(it => ({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          date: inv.date,
          item: it
        }))
    );

    const linkedOperations = patOperations.filter(op => parseToothCodes(op.tooth).includes(code));

    return {
      notes: linkedNotes,
      invoiceItems: linkedInvoiceItems,
      operations: linkedOperations,
      hasAny: linkedNotes.length > 0 || linkedInvoiceItems.length > 0 || linkedOperations.length > 0
    };
  };

  const getToothArabicQuadrantLabel = (code: number) => {
    const quad = Math.floor(code / 10);
    const num = code % 10;
    const quadName =
      quad === 1
        ? 'علوي يمين (UR)'
        : quad === 2
        ? 'علوي يسار (UL)'
        : quad === 3
        ? 'سفلي يسار (LL)'
        : 'سفلي يمين (LR)';
    return `السن ${num} · ${quadName}`;
  };

  const buildPatientTemplatePreview = (templateId: string, unitId: string) => {
    const tmpl = whatsappTemplates.find(t => t.id === templateId);
    if (!tmpl) return '';
    const latestAppt = [...patAppointments].sort((a, b) => b.date.localeCompare(a.date))[0];
    const resolvedUnit =
      units.find(u => u.id === unitId) ||
      units.find(u => patient.branchName && (u.name === patient.branchName || patient.branchName.includes(u.name))) ||
      units.find(u => !u.isDisabled) ||
      units[0];
    return renderWhatsAppTemplate(
      tmpl.messageTemplate,
      {
        patientName: patient.name,
        unitId: resolvedUnit?.id || latestAppt?.unitId,
        unitName: resolvedUnit?.name || latestAppt?.unitName || patient.branchName || '',
        date: latestAppt?.date || '',
        dayName: latestAppt?.date ? getArabicWeekdayName(latestAppt.date) : '',
        time: latestAppt?.time || '',
        doctorName: patient.doctorName || latestAppt?.doctorName || '',
        amount: displayTotalPaid,
        balance: displayOutstanding
      },
      units
    );
  };

  const openWhatsAppTemplateModal = () => {
    const firstTmpl = whatsappTemplates[0];
    const latestAppt = [...patAppointments].sort((a, b) => b.date.localeCompare(a.date))[0];
    const defaultUnit =
      units.find(u => latestAppt?.unitId && u.id === latestAppt.unitId) ||
      units.find(u => patient.branchName && (u.name === patient.branchName || patient.branchName.includes(u.name))) ||
      units.find(u => !u.isDisabled) ||
      units[0];
    const tmplId = firstTmpl?.id || '';
    const unitId = defaultUnit?.id || '';
    setSelectedTemplateId(tmplId);
    setSelectedTemplateUnitId(unitId);
    setTemplatePreviewText(buildPatientTemplatePreview(tmplId, unitId));
    setIsTemplateModalOpen(true);
  };

  // Combine chronological timeline
  interface TimelineEvent {
    id: string;
    type: 'appointment' | 'invoice' | 'payment';
    date: string;
    rawTime: string;
    sortKey: number;
    title: string;
    subtitle: string;
    badge?: string;
    badgeColor?: string;
    details?: string;
    audioDataUrl?: string;
    audioDurationSeconds?: number;
    financials?: {
      netTotal: number;
      paidAmount: number;
      outstandingBalance: number;
    };
  }

  const parseTimestampMs = (dateStr: string, createdAt?: string, timeStr?: string): number => {
    if (createdAt) {
      const t = new Date(createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    const base = dateStr || '1970-01-01';
    const time = timeStr || '12:00';
    const t = new Date(`${base}T${time}`).getTime();
    return isNaN(t) ? new Date(base).getTime() || 0 : t;
  };

  const timelineEvents: TimelineEvent[] = [];

  patAppointments.forEach(a => {
    const statusLabels: Record<string, { label: string; color: string }> = {
      completed: { label: 'تمت الزيارة', color: 'bg-emerald-100 text-emerald-800' },
      confirmed: { label: 'مؤكد', color: 'bg-blue-100 text-blue-800' },
      arrived: { label: 'وصل العيادة', color: 'bg-amber-100 text-amber-800' },
      booked: { label: 'محجوز', color: 'bg-slate-100 text-slate-800' },
      cancelled: { label: 'ملغي', color: 'bg-rose-100 text-rose-800 font-bold' },
      no_show: { label: 'لم يحضر', color: 'bg-red-100 text-red-800 font-bold' }
    };
    const currentMeta = statusLabels[a.status] || { label: 'موعد', color: 'bg-slate-100 text-slate-800' };

    timelineEvents.push({
      id: a.id,
      type: 'appointment',
      date: a.date,
      rawTime: a.date,
      sortKey: parseTimestampMs(a.date, undefined, a.time),
      title: a.procedureType ? `موعد: ${a.procedureType} (${a.doctorName})` : `موعد عيادة: ${a.doctorName}`,
      subtitle: `${a.unitName} · توقيت ${formatCairoTime(a.time)} (${a.durationMinutes} دقيقة)`,
      badge: currentMeta.label,
      badgeColor: currentMeta.color,
      details: a.cancellationReason ? `سبب الإلغاء: ${a.cancellationReason} · ${a.notes || ''}` : a.notes
    });
  });

  patInvoices.forEach(i => {
    const procTitle = i.items.map(it => it.procedureName).filter(Boolean).join('، ') || 'إجراء علاجي';
    const itemsSummary = i.items
      .map(
        it =>
          `${it.procedureName}${it.toothNumbers && it.toothNumbers.length > 0 ? ` [سن ${it.toothNumbers.join('، ')}]` : ''} (${it.quantity}×)`
      )
      .join('، ');
    timelineEvents.push({
      id: i.id,
      type: 'invoice',
      date: i.date,
      rawTime: i.createdAt || i.date,
      sortKey: parseTimestampMs(i.date, i.createdAt),
      title: procTitle,
      subtitle: itemsSummary || 'فاتورة علاجية',
      badge: i.status === 'paid' ? 'مسددة بالكامل' : i.status === 'partial' ? 'سداد جزئي' : 'غير مسددة',
      badgeColor: i.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800 font-bold',
      details: i.notes,
      financials: {
        netTotal: i.netTotal,
        paidAmount: i.paidAmount,
        outstandingBalance: i.outstandingBalance
      }
    });
  });

  const paymentMethodArabic: Record<Payment['paymentMethod'], string> = {
    cash: 'كاش نقدي',
    card: 'فيزا/ماستركارد',
    wallet: 'فودافون كاش',
    bank_transfer: 'تحويل بنكي'
  };

  patPayments.forEach(p => {
    const linkedInv =
      patInvoices.find(inv => (p.invoiceId && inv.id === p.invoiceId) || (p.invoiceNumber && inv.invoiceNumber === p.invoiceNumber)) ||
      invoices.find(inv => (p.invoiceId && inv.id === p.invoiceId) || (p.invoiceNumber && inv.invoiceNumber === p.invoiceNumber));
    const procTitle =
      linkedInv?.items?.map(it => it.procedureName).filter(Boolean).join('، ') ||
      p.notes ||
      'دفعة علاجية';

    timelineEvents.push({
      id: p.id,
      type: 'payment',
      date: p.date,
      rawTime: p.createdAt || p.date,
      sortKey: parseTimestampMs(p.date, p.createdAt),
      title: procTitle,
      subtitle: `سداد · طريقة الدفع: ${paymentMethodArabic[p.paymentMethod]} · مستلم: ${p.receivedBy}`,
      badge: `${p.amount.toLocaleString()} ج.م`,
      badgeColor: 'bg-emerald-50 border border-emerald-300 text-emerald-700 font-extrabold',
      details: p.notes
    });
  });

  // Sort timeline newest first
  timelineEvents.sort((a, b) => b.sortKey - a.sortKey);

  // Sorted clinical notes (newest first)
  const sortedClinicalNotes = [...patNotes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Filtered timeline
  const filteredTimeline =
    activeTimelineTab === 'hidden'
      ? []
      : timelineEvents.filter(e => {
          if (activeTimelineTab === 'all') return true;
          if (activeTimelineTab === 'appointments') return e.type === 'appointment';
          if (activeTimelineTab === 'invoices') return e.type === 'invoice';
          if (activeTimelineTab === 'payments') return e.type === 'payment';
          return true;
        });

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
      setMicPermissionModal({
        status: 'unsupported',
        detail: 'المتصفح الحالي لا يدعم واجهة تسجيل الصوت أو الصفحة لا تعمل عبر اتصال آمن (HTTPS).'
      });
      setRecordingError('المتصفح الحالي لا يدعم التسجيل الصوتي المباشر');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionModal(null);
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
      const errMsg = err instanceof Error ? err.message : '';
      const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setMicPermissionModal({
          status: 'no_device',
          detail: 'لم يتم العثور على ميكروفون متصل بهذا الجهاز.'
        });
        setRecordingError('لم يتم العثور على ميكروفون متصل بالجهاز');
      } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
        setMicPermissionModal({
          status: isEmbedded ? 'iframe_blocked' : 'denied',
          detail: errMsg || 'تم حظر إذن الميكروفون من المتصفح أو من النافذة المدمجة.'
        });
        setRecordingError('يرجى السماح بصلاحية الميكروفون لبدء التسجيل الصوتي');
      } else {
        setMicPermissionModal({
          status: isEmbedded ? 'iframe_blocked' : 'denied',
          detail: errMsg || 'تعذر تشغيل الميكروفون.'
        });
        setRecordingError('تعذر الوصول للميكروفون — اضغط لفتح إعدادات السماح');
      }
    }
  };

  const toggleVoiceRecording = async () => {
    setRecordingError('');
    if (isRecording) {
      stopVoiceRecording();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicPermissionModal({
        status: 'unsupported',
        detail: 'المتصفح الحالي لا يدعم واجهة التسجيل الصوتي المباشر.'
      });
      setRecordingError('المتصفح الحالي لا يدعم التسجيل الصوتي المباشر');
      return;
    }

    let permState: PermissionState | null = null;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const res = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permState = res.state;
      }
    } catch {
      permState = null;
    }

    if (permState === 'prompt') {
      setMicPermissionModal({ status: 'prompt' });
      return;
    }
    if (permState === 'denied') {
      const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
      setMicPermissionModal({ status: isEmbedded ? 'iframe_blocked' : 'denied' });
      return;
    }

    await startAudioRecording();
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddClinicalNotes) return;
    if (!newNoteText.trim() && !recordedAudioUrl) return;
    const contentToSave = newNoteText.trim() || `تسجيل صوتي سريري (${recordedDuration || 1} ثانية)`;
    addPatientNote(
      patient.id,
      contentToSave,
      selectedTeethForNote.length > 0 ? selectedTeethForNote : undefined,
      recordedAudioUrl,
      recordedDuration
    );
    setNewNoteText('');
    setSelectedTeethForNote([]);
    setRecordedAudioUrl(undefined);
    setRecordedDuration(undefined);
    setRecordingError('');
  };

  const openEditPatientModal = () => {
    setEditName(patient.name);
    setEditPhone(patient.phone);
    setEditSecondaryPhone(patient.secondaryPhone || '');
    setEditAge(patient.age ? String(patient.age) : '');
    setEditGender(patient.gender || 'أنثى');
    setEditAddress(patient.address || '');
    setEditFollowUpStatus(patientFollowUpStatuses.includes(patient.followUpStatus) ? patient.followUpStatus : '');
    setIsEditPatientOpen(true);
  };

  const handleSavePatientEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditPatients || !editName.trim() || !editPhone.trim()) return;
    const statusChanged = editFollowUpStatus !== patient.followUpStatus;
    updatePatient(patient.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      secondaryPhone: editSecondaryPhone.trim() || undefined,
      age: editAge ? Number(editAge) : undefined,
      gender: editGender,
      address: editAddress.trim() || undefined,
      ...(statusChanged && !editFollowUpStatus ? { followUpStatus: '' } : {})
    });
    if (statusChanged && editFollowUpStatus) {
      changePatientFollowUpStatus(patient.id, editFollowUpStatus, {
        notes: 'تحديث من نافذة تعديل بيانات المريض',
        actionSource: 'patient_detail'
      });
    }
    setIsEditPatientOpen(false);
  };

  const openEditInvoiceModal = (inv: Invoice) => {
    if (!canEditInvoicesPayments) return;
    setEditingInvoice(inv);
    setEditInvItems(inv.items.map(it => ({ ...it })));
    setEditInvDiscount(inv.discountAmount || 0);
    setEditInvNotes(inv.notes || '');
  };

  const handleSaveInvoiceEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditInvoicesPayments || !editingInvoice) return;
    const recalcItems = editInvItems.map(it => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const price = Math.max(0, Number(it.unitPrice) || 0);
      return {
        ...it,
        quantity: qty,
        unitPrice: price,
        lineTotal: qty * price
      };
    });
    const subtotal = recalcItems.reduce((s, it) => s + it.lineTotal, 0);
    const discountAmount = Math.max(0, Number(editInvDiscount) || 0);
    const netTotal = Math.max(0, subtotal - discountAmount);
    const paid = editingInvoice.paidAmount || 0;
    const outstanding = Math.max(0, netTotal - paid);
    const status: Invoice['status'] =
      outstanding <= 0 && netTotal > 0 ? 'paid' : paid > 0 && outstanding > 0 ? 'partial' : netTotal === 0 ? 'paid' : 'unpaid';

    updateInvoice(editingInvoice.id, {
      items: recalcItems,
      subtotal,
      discountType: discountAmount > 0 ? 'fixed' : 'none',
      discountValue: discountAmount,
      discountAmount,
      netTotal,
      outstandingBalance: outstanding,
      status,
      notes: editInvNotes.trim() || undefined
    });
    setEditingInvoice(null);
  };

  const openEditPaymentModal = (pay: Payment) => {
    if (!canEditInvoicesPayments) return;
    setEditingPayment(pay);
    setEditPayAmount(pay.amount || 0);
    setEditPayMethod(pay.paymentMethod);
    setEditPayDate(pay.date);
    setEditPayNotes(pay.notes || '');
  };

  const handleSavePaymentEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditInvoicesPayments || !editingPayment) return;
    const safeAmount = Math.max(0, Number(editPayAmount) || 0);
    updatePayment(editingPayment.id, {
      amount: safeAmount,
      paymentMethod: editPayMethod,
      date: editPayDate || editingPayment.date,
      notes: editPayNotes.trim() || undefined
    });
    setEditingPayment(null);
  };

  const handleEditTimelineItem = (item: TimelineEvent) => {
    if (item.type === 'appointment') {
      if (!canEditAppointments) return;
      setIsQuickActionOpen(true, 'appointment', { appointmentId: item.id, source: 'patient_detail' });
    } else if (item.type === 'invoice') {
      if (!canEditInvoicesPayments) return;
      const target = patInvoices.find(i => i.id === item.id);
      if (target) openEditInvoiceModal(target);
    } else if (item.type === 'payment') {
      if (!canEditInvoicesPayments) return;
      const target = patPayments.find(p => p.id === item.id);
      if (target) openEditPaymentModal(target);
    }
  };

  const handleDeleteTimelineItem = (item: TimelineEvent) => {
    if (item.type === 'appointment' && canDeleteAppointments) {
      deleteAppointment(item.id);
    } else if (item.type === 'invoice' && canDeleteInvoicesPayments) {
      voidInvoice(item.id);
    } else if (item.type === 'payment' && canDeleteInvoicesPayments) {
      voidPayment(item.id);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Header & Quick Contacts */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        {/* Back and breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => goBack()}
            className="flex items-center gap-1.5 text-xs font-bold text-[#087e83] hover:underline cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع</span>
          </button>
          <span className="text-[11px] text-slate-400 font-mono">
            رقم الملف: {patient.id}
          </span>
        </div>

        {/* Patient Hero Details */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          {/* Top Hero Row: Avatar + Name on right, Follow-Up / History / Edit / Delete in top bar */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#e6f4f1] to-[#bfe2db] text-[#087e83] font-bold text-xl flex items-center justify-center shadow-sm flex-shrink-0">
                {patient.name.slice(0, 1)}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-[#172f3d]">
                    {patient.name}
                  </h1>
                  {patient.points !== undefined && patient.points > 0 && (
                    <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
                      {patient.points.toLocaleString()} نقطة ولاء
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-500 flex-wrap">
                  <span>{patient.gender || 'أنثى'}</span>
                  <span>·</span>
                  <span>{patient.age ? `${patient.age} سنة` : 'السن غير مسجل'}</span>
                  <span>·</span>
                  <span>تاريخ التسجيل: {patient.registeredDate}</span>
                  {patient.referralSource && (
                    <span
                      style={getCustomColorBadgeStyle(listItemColors.referralSources?.[patient.referralSource])}
                      className={
                        listItemColors.referralSources?.[patient.referralSource]
                          ? 'px-2 py-0.5 rounded-full border font-bold'
                          : undefined
                      }
                    >
                      · مصدر: {patient.referralSource}
                    </span>
                  )}
                </div>
                {patient.address && (
                  <p className="text-xs text-slate-400">العنوان: {patient.address}</p>
                )}
              </div>
            </div>

            {/* Header Controls: Follow-up Status Dropdown + Icon History + Edit Profile + Delete */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <ColoredSelect
                value={patientFollowUpStatuses.includes(patient.followUpStatus) ? patient.followUpStatus : ''}
                onChange={val => {
                  if (!val) return;
                  changePatientFollowUpStatus(patient.id, val, { actionSource: 'patient_detail' });
                  setFollowUpSavedNotice(true);
                  window.setTimeout(() => setFollowUpSavedNotice(false), 1800);
                }}
                placeholder="-- حالة المتابعة --"
                options={patientFollowUpStatuses.map(st => ({
                  value: st,
                  label: st,
                  colorHex: getFollowUpStatusColorHex(st, listItemColors.followUpStatuses)
                }))}
                ariaLabel="تغيير حالة متابعة المريض"
              />
              <button
                type="button"
                onClick={() => setIsFollowUpLogModalOpen(true)}
                className="w-9 h-9 rounded-xl bg-white hover:bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db] flex items-center justify-center cursor-pointer transition-colors"
                title="سجل المتابعة"
                aria-label="سجل المتابعة"
              >
                <History className="w-4 h-4" />
              </button>
              {followUpSavedNotice && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  تم ✓
                </span>
              )}
              {canEditPatients && (
                <button
                  type="button"
                  onClick={openEditPatientModal}
                  className="px-3 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] font-bold text-xs flex items-center gap-1.5 border border-[#bfe2db] transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل الملف</span>
                </button>
              )}
              {canDeletePatients && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDeletePatient) {
                      setConfirmDeletePatient(true);
                      return;
                    }
                    deletePatient(patient.id);
                    setActiveView('patients');
                  }}
                  onBlur={() => setConfirmDeletePatient(false)}
                  className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    confirmDeletePatient
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{confirmDeletePatient ? 'تأكيد الحذف؟' : 'حذف'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Phone Copy + Compact Contact Buttons + Tags */}
          {(() => {
            const preferredWaPhone = getPreferredPatientWhatsAppPhone(patient) || patient.phone;
            const isWaMissing = isPreferredWhatsAppMissing(patient, preferredWaPhone);
            const anyNoWa = hasAnyNoWhatsAppPhone(patient);
            const isPrimaryNoWa = isPhoneMarkedNoWhatsApp(patient, patient.phone);
            const isSecondaryNoWa = patient.secondaryPhone
              ? isPhoneMarkedNoWhatsApp(patient, patient.secondaryPhone)
              : false;
            const activeDefaultSlot =
              patient.secondaryPhone && patient.defaultWhatsAppPhone === 'secondary'
                ? 'secondary'
                : 'primary';

            return (
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                {/* Phone & Compact Contact Stack (Above Tags) */}
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(patient.phone).catch(() => {});
                          }
                          setCopiedPhone(true);
                          window.setTimeout(() => setCopiedPhone(false), 1800);
                        }}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono font-bold text-xs transition-colors cursor-pointer ${
                          isPrimaryNoWa
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 hover:bg-slate-200 text-[#172f3d]'
                        }`}
                        title="اضغط لنسخ رقم الهاتف"
                      >
                        <Phone className={`w-3.5 h-3.5 ${isPrimaryNoWa ? 'text-rose-600' : 'text-[#087e83]'}`} />
                        <span dir="ltr">{patient.phone}</span>
                        <Copy className="w-3 h-3 text-slate-400" />
                      </button>

                      {patient.secondaryPhone && (
                        <button
                          type="button"
                          onClick={() => setPatientDefaultWhatsAppPhone(patient.id, 'primary')}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                            activeDefaultSlot === 'primary'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-[#087e83]'
                          }`}
                        >
                          {activeDefaultSlot === 'primary' ? 'واتساب افتراضي ✓' : 'تعيين للواتساب'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPatientPhoneNoWhatsApp(patient.id, patient.phone, !isPrimaryNoWa)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                          isPrimaryNoWa
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-rose-700 hover:border-rose-200'
                        }`}
                        title={isPrimaryNoWa ? 'إعادة تفعيل واتساب لهذا الرقم' : 'تحديد أن الرقم لا يوجد عليه واتساب'}
                      >
                        {isPrimaryNoWa ? 'تفعيل واتساب' : 'بدون واتساب'}
                      </button>
                    </div>

                    {patient.secondaryPhone && (
                      <div className="inline-flex items-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator.clipboard?.writeText && patient.secondaryPhone) {
                              navigator.clipboard.writeText(patient.secondaryPhone).catch(() => {});
                            }
                            setCopiedPhone(true);
                            window.setTimeout(() => setCopiedPhone(false), 1800);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono text-[11px] font-semibold border cursor-pointer ${
                            isSecondaryNoWa
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                          title="اضغط لنسخ الرقم الإضافي"
                        >
                          <span dir="ltr">{patient.secondaryPhone}</span>
                          <Copy className="w-2.5 h-2.5 text-slate-400" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setPatientDefaultWhatsAppPhone(patient.id, 'secondary')}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                            activeDefaultSlot === 'secondary'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-[#087e83]'
                          }`}
                        >
                          {activeDefaultSlot === 'secondary' ? 'واتساب افتراضي ✓' : 'تعيين للواتساب'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            patient.secondaryPhone &&
                            setPatientPhoneNoWhatsApp(patient.id, patient.secondaryPhone, !isSecondaryNoWa)
                          }
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                            isSecondaryNoWa
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-rose-700 hover:border-rose-200'
                          }`}
                        >
                          {isSecondaryNoWa ? 'تفعيل واتساب' : 'بدون واتساب'}
                        </button>
                      </div>
                    )}

                    {copiedPhone && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        تم النسخ ✓
                      </span>
                    )}

                    {anyNoWa && (
                      <button
                        type="button"
                        onClick={() => setIsRegisterWaModalOpen(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                      >
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>لا يوجد واتساب (تسجيل رقم واتساب آخر)</span>
                      </button>
                    )}
                  </div>

                  {/* Icon-only WhatsApp + Call directly below phone, with قالب واتساب directly under WhatsApp */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="inline-flex flex-col items-start gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={buildWhatsAppUrl(preferredWaPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all shadow-xs ${
                            isWaMissing
                              ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-50 hover:opacity-80'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}
                          title={
                            isWaMissing
                              ? `لا يوجد واتساب على هذا الرقم (${preferredWaPhone}) — اضغط للتحقق في واتساب`
                              : `فتح محادثة واتساب (${preferredWaPhone})`
                          }
                          aria-label="فتح محادثة واتساب"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                        <a
                          href={`tel:${patient.phone}`}
                          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center justify-center transition-colors shadow-xs"
                          title="اتصال هاتفي"
                          aria-label="اتصال هاتفي"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        {isWaMissing && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl">
                            <span>لا يوجد واتساب على هذا الرقم</span>
                            <button
                              type="button"
                              onClick={() => setIsRegisterWaModalOpen(true)}
                              className="text-[#087e83] underline hover:text-[#06686c] cursor-pointer"
                            >
                              (تسجيل رقم واتساب)
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={openWhatsAppTemplateModal}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all ${
                          isWaMissing
                            ? 'bg-slate-200 hover:bg-slate-300 text-slate-600 opacity-70'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>قالب واتساب</span>
                      </button>
                    </div>
                  </div>
                </div>

            {/* Patient Tags (deleted settings tags filtered out) */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-50">
              {(patient.tags || []).filter(t => patientTags.includes(t)).map(tag => {
                const tagHex = getPatientTagColorHex(tag, listItemColors.patientTags);
                return (
                <span
                  key={tag}
                  style={getCustomColorBadgeStyle(tagHex)}
                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    tagHex
                      ? ''
                      : tag === 'VIP'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-[#e7f5f2] text-[#087e83] border-[#bfe2db]'
                  }`}
                >
                  <span>#{tag}</span>
                  {canEditPatients && (
                    <button
                      type="button"
                      onClick={() =>
                        updatePatient(patient.id, {
                          tags: (patient.tags || []).filter(t => t !== tag)
                        })
                      }
                      className="w-3.5 h-3.5 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center transition-colors cursor-pointer"
                      title="إزالة التاج من المريض"
                      aria-label={`إزالة ${tag}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
                );
              })}
              {canEditPatients && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomTagInput('');
                    setIsTagModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-dashed border-[#087e83]/50 text-[#087e83] hover:bg-[#e7f5f2] transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>تاج</span>
                </button>
              )}
            </div>
          </div>
          );
          })()}
        </div>
      </div>

      {/* Patient Specific Quick Action Bar — Only Appointment, Invoice, Payment */}
      {(canAddAppointments || canAddInvoicesPayments) && (
        <div className="p-3 bg-[#f8fbfa] border border-[#dce8eb] rounded-2xl flex items-center gap-2 flex-wrap">
          {canAddAppointments && (
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'appointment', { patientId: patient.id, source: 'patient_detail' })}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>موعد</span>
            </button>
          )}
          {canAddInvoicesPayments && (
            <>
              <button
                type="button"
                onClick={() => setIsQuickActionOpen(true, 'invoice', { patientId: patient.id })}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-xs font-bold flex items-center justify-center gap-1.5 border border-[#bfe2db] cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>فاتورة</span>
              </button>
              <button
                type="button"
                onClick={() => setIsQuickActionOpen(true, 'payment', { patientId: patient.id })}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-xs font-bold flex items-center justify-center gap-1.5 border border-[#bfe2db] cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>دفعة</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 2. Palmer Dental Notation Tooth Chart (Admin & Doctor only) */}
      {canShowPalmerChart && (
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#087e83]" />
            <h2 className="text-sm sm:text-base font-extrabold text-[#172f3d]">
              مخطط الأسنان السريري (Palmer Dental Chart)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            انقر على أي سن لعرض الملاحظات أو الإجراءات المرتبطة به
          </span>
        </div>

        {/* 4 Quadrants Grid (Always 2x2 Dental Cross on all viewports) */}
        <div className="grid grid-cols-2 max-w-3xl mx-auto p-2.5 sm:p-4 bg-[#fbfdfd] rounded-2xl border border-slate-200" dir="ltr">
          {/* Upper Right Quadrant (UR 8 to 1) */}
          <div className="border-r-2 border-b-2 border-[#087e83] pr-1.5 sm:pr-3 pb-2.5 sm:pb-3 text-right">
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mb-1.5 truncate">UR · علوي يمين</div>
            <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-end justify-items-center">
              {[8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                const code = 10 + num; // Palmer 11 to 18
                const linked = getToothLinkedData(code);
                const isSelected = Boolean(patient.palmerTeeth?.includes(code)) || linked.hasAny;
                return (
                  <ToothIcon
                    key={code}
                    num={num}
                    arch="upper"
                    size="quadrant"
                    selected={isSelected}
                    onClick={() => setInspectedToothCode(code)}
                    title={`السن ${num} علوي يمين (${code}) — اضغط لعرض التفاصيل`}
                  />
                );
              })}
            </div>
          </div>

          {/* Upper Left Quadrant (UL 1 to 8) */}
          <div className="border-b-2 border-[#087e83] pl-1.5 sm:pl-3 pb-2.5 sm:pb-3 text-left">
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mb-1.5 truncate">UL · علوي يسار</div>
            <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-end justify-items-center">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                const code = 20 + num; // Palmer 21 to 28
                const linked = getToothLinkedData(code);
                const isSelected = Boolean(patient.palmerTeeth?.includes(code)) || linked.hasAny;
                return (
                  <ToothIcon
                    key={code}
                    num={num}
                    arch="upper"
                    size="quadrant"
                    selected={isSelected}
                    onClick={() => setInspectedToothCode(code)}
                    title={`السن ${num} علوي يسار (${code}) — اضغط لعرض التفاصيل`}
                  />
                );
              })}
            </div>
          </div>

          {/* Lower Right Quadrant (LR 8 to 1) */}
          <div className="border-r-2 border-[#087e83] pr-1.5 sm:pr-3 pt-2.5 sm:pt-3 text-right">
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mb-1.5 truncate">LR · سفلي يمين</div>
            <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-start justify-items-center">
              {[8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                const code = 40 + num; // Palmer 41 to 48
                const linked = getToothLinkedData(code);
                const isSelected = Boolean(patient.palmerTeeth?.includes(code)) || linked.hasAny;
                return (
                  <ToothIcon
                    key={code}
                    num={num}
                    arch="lower"
                    size="quadrant"
                    selected={isSelected}
                    onClick={() => setInspectedToothCode(code)}
                    title={`السن ${num} سفلي يمين (${code}) — اضغط لعرض التفاصيل`}
                  />
                );
              })}
            </div>
          </div>

          {/* Lower Left Quadrant (LL 1 to 8) */}
          <div className="pl-1.5 sm:pl-3 pt-2.5 sm:pt-3 text-left">
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase mb-1.5 truncate">LL · سفلي يسار</div>
            <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-start justify-items-center">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                const code = 30 + num; // Palmer 31 to 38
                const linked = getToothLinkedData(code);
                const isSelected = Boolean(patient.palmerTeeth?.includes(code)) || linked.hasAny;
                return (
                  <ToothIcon
                    key={code}
                    num={num}
                    arch="lower"
                    size="quadrant"
                    selected={isSelected}
                    onClick={() => setInspectedToothCode(code)}
                    title={`السن ${num} سفلي يسار (${code}) — اضغط لعرض التفاصيل`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Teeth Summary */}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-slate-500 font-bold">
            الأسنان المحددة حالياً في خطة العلاج:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {patient.palmerTeeth && patient.palmerTeeth.length > 0 ? (
              patient.palmerTeeth.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setInspectedToothCode(t)}
                  className="px-2 py-0.5 rounded-md bg-[#087e83] hover:bg-[#06686c] text-white font-mono text-[11px] font-bold cursor-pointer"
                >
                  {t}
                </button>
              ))
            ) : (
              <span className="text-slate-400 text-xs">لم يتم تحديد أسنان بعد</span>
            )}
          </div>
        </div>
      </div>
      )}

      {/* 3. Chronological History & Timeline (Displayed ABOVE Financial Ledger Summary) */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            activeTimelineTab !== 'hidden' ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d]">
            السجل الزمني المتكامل للحالة ({timelineEvents.length})
          </h2>

          {/* Timeline Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#edf4f5] rounded-xl overflow-x-auto text-xs font-bold scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTimelineTab('hidden')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${
                activeTimelineTab === 'hidden' ? 'bg-[#087e83] text-white' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              إخفاء
            </button>
            <button
              type="button"
              onClick={() => setActiveTimelineTab('appointments')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${
                activeTimelineTab === 'appointments' ? 'bg-[#087e83] text-white' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              المواعيد ({patAppointments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTimelineTab('invoices')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${
                activeTimelineTab === 'invoices' ? 'bg-[#087e83] text-white' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              الفواتير ({patInvoices.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTimelineTab('payments')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${
                activeTimelineTab === 'payments' ? 'bg-[#087e83] text-white' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              المدفوعات ({patPayments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTimelineTab('all')}
              className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${
                activeTimelineTab === 'all' ? 'bg-[#087e83] text-white' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              الكل ({timelineEvents.length})
            </button>
          </div>
        </div>

        {/* Timeline list (completely hidden when activeTimelineTab === 'hidden') */}
        {activeTimelineTab !== 'hidden' && (
          filteredTimeline.length > 0 ? (
            <div className="space-y-3">
              {filteredTimeline.map(item => {
                const menuKey = `${item.type}_${item.id}`;
                const isMenuOpen = openTimelineMenuKey === menuKey;
                const isConfirmDelete = confirmDeleteTimelineKey === menuKey;

                const canEditItem =
                  (item.type === 'appointment' && canEditAppointments) ||
                  (item.type === 'invoice' && canEditInvoicesPayments) ||
                  (item.type === 'payment' && canEditInvoicesPayments);

                const canDeleteItem =
                  (item.type === 'appointment' && canDeleteAppointments) ||
                  (item.type === 'invoice' && canDeleteInvoicesPayments) ||
                  (item.type === 'payment' && canDeleteInvoicesPayments);

                return (
                  <div
                    key={menuKey}
                    onClick={e => {
                      if (!canEditItem) return;
                      const target = e.target as HTMLElement;
                      if (
                        target.closest('button, a, input, textarea, select, audio, [data-timeline-menu="true"]')
                      ) {
                        return;
                      }
                      handleEditTimelineItem(item);
                    }}
                    className={`p-4 rounded-2xl border border-slate-200 bg-[#fbfdfd] hover:bg-white transition-all space-y-1.5 ${
                      canEditItem ? 'hover:border-[#087e83] cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.date}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRelativeTimeBadgeClass(item.rawTime)}`}
                          >
                            {formatRelativeTimeArabic(item.rawTime)}
                          </span>
                        </div>
                        <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm">
                          {item.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.badge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor}`}>
                            {item.badge}
                          </span>
                        )}

                        {(canEditItem || canDeleteItem) && (
                          <div
                            className="relative"
                            data-timeline-menu="true"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteTimelineKey(null);
                                setOpenTimelineMenuKey(isMenuOpen ? null : menuKey);
                              }}
                              className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                                isMenuOpen
                                  ? 'bg-[#e7f5f2] text-[#087e83]'
                                  : 'text-slate-400 hover:text-[#087e83] hover:bg-slate-100'
                              }`}
                              title="خيارات السجل"
                              aria-label="خيارات السجل"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute left-0 top-8 z-40 w-44 bg-white border border-[#d6e5e8] rounded-2xl shadow-xl py-1.5 text-xs font-bold text-[#172f3d] animate-in fade-in duration-100">
                                {canEditItem && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenTimelineMenuKey(null);
                                      handleEditTimelineItem(item);
                                    }}
                                    className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                                    <span>تعديل</span>
                                  </button>
                                )}

                                {canDeleteItem && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!isConfirmDelete) {
                                        setConfirmDeleteTimelineKey(menuKey);
                                        return;
                                      }
                                      handleDeleteTimelineItem(item);
                                      setConfirmDeleteTimelineKey(null);
                                      setOpenTimelineMenuKey(null);
                                    }}
                                    className={`w-full px-3 py-2 text-right flex items-center gap-2 transition-colors cursor-pointer ${
                                      isConfirmDelete
                                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                                        : 'text-rose-600 hover:bg-rose-50'
                                    }`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{isConfirmDelete ? 'تأكيد الحذف' : 'حذف'}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {item.subtitle}
                    </p>

                    {/* Color-coded Invoice Financial Breakdown (Blue: Total, Green: Paid, Red: Remaining) */}
                    {item.type === 'invoice' && item.financials && (
                      <dl className="grid grid-cols-3 gap-2 pt-2 mt-1.5 border-t border-slate-100 bg-slate-50/70 p-2.5 rounded-xl font-mono">
                        <div>
                          <dt className="text-[10px] text-slate-500 font-sans font-bold">قيمة الفاتورة</dt>
                          <dd className="text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                            {item.financials.netTotal.toLocaleString()} ج.م
                          </dd>
                        </div>
                        {canViewFinancialDetails && (
                          <>
                            <div>
                              <dt className="text-[10px] text-slate-500 font-sans font-bold">المدفوع</dt>
                              <dd className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {item.financials.paidAmount.toLocaleString()} ج.م
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] text-slate-500 font-sans font-bold">المتبقي</dt>
                              <dd className="text-xs sm:text-sm font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
                                {item.financials.outstandingBalance.toLocaleString()} ج.م
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                    )}

                    {(item.details || item.audioDataUrl) && (
                      <div className="pt-2 mt-2 border-t border-slate-100 text-xs text-slate-500 bg-slate-50/50 p-2 rounded-xl space-y-2">
                        {item.details && <div>{item.details}</div>}
                        {item.audioDataUrl && (
                          <audio controls src={item.audioDataUrl} className="h-8 w-full max-w-sm" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-slate-400 text-xs py-8">
              لا توجد سجلات مطابقة في هذا التصنيف
            </p>
          )
        )}
      </div>

      {/* 4. Financial Ledger Summary & Quick Operations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm">
          <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي الفواتير الصادرة</span>
          <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
            {displayTotalBilled.toLocaleString()} ج.م
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            عدد {patInvoices.length} فواتير
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm">
          <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي المسدد نقداً وإلكترونياً</span>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {displayTotalPaid.toLocaleString()} ج.م
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            عدد {patPayments.length} دفعات
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm">
          <span className="text-xs text-slate-400 font-bold block mb-1">الرصيد المتبقي المستحق</span>
          <div
            className={`text-2xl font-extrabold font-mono tabular-nums ${
              displayOutstanding > 0 ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {displayOutstanding > 0 ? `${displayOutstanding.toLocaleString()} ج.م` : 'خالص بالكامل ✓'}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {displayOutstanding > 0 ? 'مستحق السداد' : 'لا توجد مديونية'}
          </span>
        </div>
      </div>

      {/* 5. Clinical Notes Section — Positioned as the last section at the bottom under Patient Record */}
      {(canViewClinicalNotes || canAddClinicalNotes) && (
        <div ref={clinicalNotesRef} className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4 scroll-mt-20">
          <h2 className="text-sm font-extrabold text-[#172f3d]">
            الملاحظات السريرية وتوثيق الخطة العلاجية ({sortedClinicalNotes.length})
          </h2>

          {canAddClinicalNotes && (
            <form onSubmit={handleSaveNote} className="space-y-3">
              <textarea
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                placeholder="اكتب ملاحظات الكشف، خطة العلاج، نوع الحشو المستخدم، أو تعليمات الزيارة القادمة..."
                className="w-full p-3 rounded-2xl border border-slate-200 text-xs leading-relaxed focus:border-[#087e83] focus:outline-none min-h-[90px]"
              />

              {selectedTeethForNote.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#e7f5f2] border border-[#bfe2db] text-xs font-bold text-[#087e83] flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>الأسنان المحددة للملاحظة:</span>
                    {selectedTeethForNote.map(t => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-[#9fd4ca] text-[11px] font-mono font-extrabold text-[#087e83]"
                      >
                        <span>سن {t}</span>
                        <button
                          type="button"
                          onClick={() => toggleToothForNote(t)}
                          className="text-rose-500 hover:text-rose-700 cursor-pointer"
                          aria-label={`إزالة سن ${t}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTeethForNote([])}
                    className="text-rose-600 underline text-[11px] cursor-pointer"
                  >
                    إلغاء الكل
                  </button>
                </div>
              )}

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
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{recordingError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setMicPermissionModal({
                        status: typeof window !== 'undefined' && window.self !== window.top ? 'iframe_blocked' : 'denied'
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    السماح بالوصول للميكروفون
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="submit"
                    disabled={!newNoteText.trim() && !recordedAudioUrl}
                    className="px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-50 text-white font-bold text-xs shadow-sm cursor-pointer"
                  >
                    إضافة ملاحظة
                  </button>

                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isRecording
                        ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isRecording ? <Square className="w-3.5 h-3.5 fill-rose-600" /> : <Mic className="w-3.5 h-3.5" />}
                    <span>
                      {isRecording
                        ? `إيقاف التسجيل (0:${String(recordingSeconds).padStart(2, '0')} / 1:00)`
                        : 'تسجيل صوتي'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsToothModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] border border-[#bfe2db] text-[#087e83] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>اختيار الأسنان {selectedTeethForNote.length > 0 ? `(${selectedTeethForNote.length})` : ''}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Notes List Directly Underneath Input Box (Newest to Oldest) */}
          {canViewClinicalNotes && (
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              {sortedClinicalNotes.length > 0 ? (
                sortedClinicalNotes.map(note => {
                  const noteTeeth =
                    note.toothNumbers && note.toothNumbers.length > 0
                      ? note.toothNumbers
                      : note.toothNumber
                      ? [note.toothNumber]
                      : [];
                  return (
                  <div
                    key={note.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-[#fbfdfd] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-xs text-[#172f3d]">{note.authorName}</span>
                        <span className="text-[10px] text-slate-400">({note.authorRole})</span>
                        {noteTeeth.map(toothCode => (
                          <span
                            key={toothCode}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db]"
                          >
                            سن {toothCode}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRelativeTimeBadgeClass(note.createdAt)}`}
                        >
                          {formatRelativeTimeArabic(note.createdAt)}
                        </span>
                        {canEditClinicalNotes && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingNoteContent(note.content);
                              setConfirmDeleteNoteId(null);
                            }}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="تعديل الملاحظة"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteClinicalNotes && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirmDeleteNoteId !== note.id) {
                                setConfirmDeleteNoteId(note.id);
                                return;
                              }
                              deletePatientNote(patient.id, note.id);
                              setConfirmDeleteNoteId(null);
                            }}
                            onBlur={() => setConfirmDeleteNoteId(null)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                              confirmDeleteNoteId === note.id
                                ? 'bg-rose-600 text-white'
                                : 'text-rose-600 hover:bg-rose-50'
                            }`}
                            title="حذف الملاحظة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {confirmDeleteNoteId === note.id && <span>تأكيد</span>}
                          </button>
                        )}
                      </div>
                    </div>

                    {editingNoteId === note.id ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={editingNoteContent}
                          onChange={e => setEditingNoteContent(e.target.value)}
                          rows={3}
                          className="w-full p-2.5 rounded-xl border border-[#087e83] text-xs focus:outline-none bg-white"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editingNoteContent.trim()) return;
                              updatePatientNote(
                                patient.id,
                                note.id,
                                editingNoteContent.trim(),
                                note.toothNumbers?.length ? note.toothNumbers : note.toothNumber
                              );
                              setEditingNoteId(null);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#087e83] text-white text-xs font-bold cursor-pointer"
                          >
                            حفظ التعديل
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {note.content && (
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                        )}
                        {note.audioDataUrl && (
                          <div className="pt-1">
                            <audio controls src={note.audioDataUrl} className="h-8 w-full max-w-sm" />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">لا توجد ملاحظات مسجلة لهذا المريض بعد</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tooth Selection Popup Modal — Interactive 4-Quadrant Anatomical Palmer Dental Chart */}
      {isToothModalOpen && (
        <div
          onClick={() => setIsToothModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">
                مخطط اختيار الأسنان (يمكنك تحديد أكثر من سن)
              </h3>
              <button
                type="button"
                onClick={() => setIsToothModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 p-2.5 sm:p-3 bg-[#fbfdfd] rounded-2xl border border-slate-200" dir="ltr">
              {/* Upper Right (18..11) */}
              <div className="border-r-2 border-b-2 border-[#087e83] pr-1.5 sm:pr-2.5 pb-2.5 text-right">
                <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mb-1.5 truncate">UR · علوي يمين</div>
                <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-end justify-items-center">
                  {[8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                    const code = 10 + num;
                    const active = selectedTeethForNote.includes(code);
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="upper"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForNote(code)}
                        title={`سن ${code}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Upper Left (21..28) */}
              <div className="border-b-2 border-[#087e83] pl-1.5 sm:pl-2.5 pb-2.5 text-left">
                <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mb-1.5 truncate">UL · علوي يسار</div>
                <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-end justify-items-center">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                    const code = 20 + num;
                    const active = selectedTeethForNote.includes(code);
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="upper"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForNote(code)}
                        title={`سن ${code}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Lower Right (48..41) */}
              <div className="border-r-2 border-[#087e83] pr-1.5 sm:pr-2.5 pt-2.5 text-right">
                <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mb-1.5 truncate">LR · سفلي يمين</div>
                <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-start justify-items-center">
                  {[8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                    const code = 40 + num;
                    const active = selectedTeethForNote.includes(code);
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="lower"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForNote(code)}
                        title={`سن ${code}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Lower Left (31..38) */}
              <div className="pl-1.5 sm:pl-2.5 pt-2.5 text-left">
                <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mb-1.5 truncate">LL · سفلي يسار</div>
                <div className="grid grid-cols-8 gap-0.5 sm:gap-1 items-start justify-items-center">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                    const code = 30 + num;
                    const active = selectedTeethForNote.includes(code);
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="lower"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForNote(code)}
                        title={`سن ${code}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsToothModalOpen(false)}
                className="flex-1 py-2.5 px-4 bg-[#087e83] hover:bg-[#06686c] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                تأكيد الاختيار {selectedTeethForNote.length > 0 ? `(${selectedTeethForNote.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTeethForNote([]);
                  setIsToothModalOpen(false);
                }}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء وتحديد ملاحظة عامة (بدون سن)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Data Modal */}
      {isEditPatientOpen && canEditPatients && (
        <div
          onClick={() => setIsEditPatientOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-[#172f3d]">تعديل بيانات المريض</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPatientOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePatientEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">اسم المريض *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">رقم الموبايل *</label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-left focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">موبايل إضافي</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={editSecondaryPhone}
                    onChange={e => setEditSecondaryPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-left focus:border-[#087e83] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">السن</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={editAge}
                    onChange={e => setEditAge(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">النوع</label>
                  <select
                    value={editGender}
                    onChange={e => setEditGender(e.target.value as 'ذكر' | 'أنثى')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                  >
                    <option value="أنثى">أنثى</option>
                    <option value="ذكر">ذكر</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">حالة المتابعة</label>
                  <ColoredSelect
                    value={patientFollowUpStatuses.includes(editFollowUpStatus) ? editFollowUpStatus : ''}
                    onChange={val => setEditFollowUpStatus(val)}
                    placeholder="-- بدون حالة --"
                    options={[
                      { value: '', label: '-- بدون حالة --' },
                      ...patientFollowUpStatuses.map(st => ({
                        value: st,
                        label: st,
                        colorHex: getFollowUpStatusColorHex(st, listItemColors.followUpStatuses)
                      }))
                    ]}
                    className="w-full"
                    ariaLabel="حالة المتابعة"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">العنوان</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditPatientOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient Tags Editor Modal */}
      {isTagModalOpen && canEditPatients && (
        <div
          onClick={() => setIsTagModalOpen(false)}
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
                  <p className="text-[11px] text-slate-500 font-semibold">{patient.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTagModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500">اختر أو أزل من الوسوم:</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsTagModalOpen(false);
                    setActiveView('settings');
                  }}
                  className="text-[11px] font-bold text-[#087e83] hover:underline cursor-pointer"
                >
                  حذف / تعديل التاجات في الإعدادات
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {patientTags.map(tag => {
                  const isActive = (patient.tags || []).includes(tag);
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
                      onClick={() => {
                        const cur = patient.tags || [];
                        updatePatient(patient.id, {
                          tags: isActive ? cur.filter(t => t !== tag) : [...cur, tag]
                        });
                      }}
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

            <form
              onSubmit={e => {
                e.preventDefault();
                const trimmed = customTagInput.trim();
                if (!trimmed) return;
                addPatientTag(trimmed);
                const cur = patient.tags || [];
                if (!cur.includes(trimmed)) {
                  updatePatient(patient.id, { tags: [...cur, trimmed] });
                }
                setCustomTagInput('');
              }}
              className="flex items-center gap-2 pt-1"
            >
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
              onClick={() => setIsTagModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
            >
              تم
            </button>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal (from Patient Timeline) */}
      {editingInvoice && canEditInvoicesPayments && (
        <div
          onClick={() => setEditingInvoice(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-[#172f3d]">
                  تعديل الفاتورة — {editingInvoice.items.map(it => it.procedureName).filter(Boolean).join('، ') || patient.name}
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold">{patient.name} · {editingInvoice.date}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoiceEdit} className="space-y-3 text-xs">
              <div className="space-y-2">
                <label className="block font-bold text-slate-600">بنود الإجراء العلاجي</label>
                {editInvItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="col-span-6">
                      <input
                        type="text"
                        value={it.procedureName}
                        onChange={e =>
                          setEditInvItems(prev => prev.map((row, i) => (i === idx ? { ...row, procedureName: e.target.value } : row)))
                        }
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 font-bold text-slate-800 bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={e => {
                          const qty = Math.max(1, Number(e.target.value) || 1);
                          setEditInvItems(prev => prev.map((row, i) => (i === idx ? { ...row, quantity: qty } : row)));
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 font-mono text-center bg-white"
                        title="الكمية"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="number"
                        min={0}
                        value={it.unitPrice}
                        onChange={e => {
                          const price = Math.max(0, Number(e.target.value) || 0);
                          setEditInvItems(prev => prev.map((row, i) => (i === idx ? { ...row, unitPrice: price } : row)));
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 font-mono text-left bg-white"
                        title="سعر الوحدة"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">قيمة الخصم (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    value={editInvDiscount}
                    onChange={e => setEditInvDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col justify-center">
                  <span className="text-[10px] text-blue-700 font-bold">قيمة الفاتورة بعد التعديل</span>
                  <span className="font-mono text-sm font-extrabold text-blue-700">
                    {Math.max(
                      0,
                      editInvItems.reduce((s, it) => s + (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0), 0) -
                        (Number(editInvDiscount) || 0)
                    ).toLocaleString()}{' '}
                    ج.م
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={editInvNotes}
                  onChange={e => setEditInvNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold cursor-pointer"
                >
                  حفظ تعديلات الفاتورة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Payment Modal (from Patient Timeline) */}
      {editingPayment && canEditInvoicesPayments && (
        <div
          onClick={() => setEditingPayment(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-[#172f3d]">تعديل الدفعة المالية</h3>
                <p className="text-[11px] text-slate-500 font-semibold">{patient.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">المبلغ المدفوع (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editPayAmount}
                    onChange={e => setEditPayAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold text-emerald-700 focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">تاريخ السداد</label>
                  <input
                    type="date"
                    value={editPayDate}
                    onChange={e => setEditPayDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">طريقة الدفع</label>
                <select
                  value={editPayMethod}
                  onChange={e => setEditPayMethod(e.target.value as Payment['paymentMethod'])}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                >
                  <option value="cash">كاش نقدي</option>
                  <option value="card">فيزا / ماستركارد</option>
                  <option value="wallet">محفظة إلكترونية (فودافون كاش)</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={editPayNotes}
                  onChange={e => setEditPayNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold cursor-pointer"
                >
                  حفظ تعديلات الدفعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Microphone Permission Request / Recovery Modal */}
      {micPermissionModal && (
        <div
          onClick={() => setMicPermissionModal(null)}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    micPermissionModal.status === 'prompt'
                      ? 'bg-[#e7f5f2] text-[#087e83]'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {micPermissionModal.status === 'prompt' ? (
                    <Mic className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#172f3d]">
                    {micPermissionModal.status === 'prompt'
                      ? 'إذن الوصول للميكروفون'
                      : micPermissionModal.status === 'no_device'
                      ? 'لا يوجد ميكروفون متصل'
                      : 'تفعيل صلاحية الميكروفون للتسجيل الصوتي'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تسجيل ملاحظة صوتية في ملف المريض
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMicPermissionModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-700">
              {micPermissionModal.status === 'prompt' && (
                <div className="p-3.5 rounded-2xl bg-[#f4fbf9] border border-[#bfe2db] text-[#172f3d]">
                  اضغط على زر <span className="font-extrabold text-[#087e83]">«السماح بالوصول للميكروفون»</span> بالأسفل، ثم اختر <span className="font-bold">السماح (Allow)</span> في نافذة المتصفح لبدء تسجيل الملاحظة الصوتية مباشرة.
                </div>
              )}

              {(micPermissionModal.status === 'denied' || micPermissionModal.status === 'iframe_blocked') && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                    {micPermissionModal.status === 'iframe_blocked'
                      ? 'المتصفح أو نافذة المعاينة الحالية تمنع طلب إذن الميكروفون تلقائياً. يمكنك طلب الإذن مباشرة أو فتح الصفحة في نافذة مستقلة لتظهر لك نافذة السماح.'
                      : 'تم رفض صلاحية الميكروفون سابقاً في هذا المتصفح، لذا لم تظهر نافذة السماح تلقائياً.'}
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-[11px]">
                    <div className="font-extrabold text-[#172f3d]">خطوات السماح يدوياً من المتصفح:</div>
                    <div>١. اضغط على أيقونة <span className="font-bold">القفل 🔒</span> أو <span className="font-bold">الإعدادات ⚙️</span> بجانب رابط الموقع في شريط العنوان.</div>
                    <div>٢. فعّل خيار <span className="font-bold">الميكروفون (Microphone) ← السماح (Allow)</span>.</div>
                    <div>٣. أعد تحميل الصفحة أو اضغط «محاولة طلب الإذن الآن».</div>
                  </div>
                </div>
              )}

              {micPermissionModal.status === 'no_device' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  لم يتم اكتشاف أي ميكروفون متصل بهذا الجهاز. تأكد من توصيل السماعة أو الميكروفون ثم أعد المحاولة.
                </div>
              )}

              {micPermissionModal.status === 'unsupported' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {micPermissionModal.detail || 'المتصفح لا يدعم التسجيل الصوتي أو الصفحة لا تعمل عبر HTTPS.'}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              {micPermissionModal.status !== 'unsupported' && micPermissionModal.status !== 'no_device' && (
                <button
                  type="button"
                  onClick={() => {
                    void startAudioRecording();
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>
                    {micPermissionModal.status === 'prompt'
                      ? 'السماح بالوصول للميكروفون وبدء التسجيل'
                      : 'محاولة طلب الإذن الآن'}
                  </span>
                </button>
              )}

              {micPermissionModal.status === 'iframe_blocked' && typeof window !== 'undefined' && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMicPermissionModal(null)}
                  className="py-2.5 px-3.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] border border-[#bfe2db] text-[#087e83] font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح في نافذة مستقلة</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setMicPermissionModal(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send WhatsApp Template Modal */}
      {isTemplateModalOpen && (
        <div
          onClick={() => setIsTemplateModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#172f3d]">إرسال قالب واتساب</h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    {patient.name} · {getPreferredPatientWhatsAppPhone(patient) || patient.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {whatsappTemplates.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <p className="text-xs font-bold text-slate-600">لا توجد قوالب واتساب محفوظة حالياً</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsTemplateModalOpen(false);
                    setActiveView('whatsapp');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#087e83] text-white text-xs font-bold cursor-pointer"
                >
                  إدارة قوالب الواتساب
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">اختر قالب الرسالة</label>
                    <select
                      value={selectedTemplateId}
                      onChange={e => {
                        const nextId = e.target.value;
                        setSelectedTemplateId(nextId);
                        setTemplatePreviewText(buildPatientTemplatePreview(nextId, selectedTemplateUnitId));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                    >
                      {whatsappTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">الفرع / العنوان في القالب</label>
                    <select
                      value={selectedTemplateUnitId}
                      onChange={e => {
                        const nextUnitId = e.target.value;
                        setSelectedTemplateUnitId(nextUnitId);
                        setTemplatePreviewText(buildPatientTemplatePreview(selectedTemplateId, nextUnitId));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                    >
                      {units.filter(u => !u.isDisabled).map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {resolveClinicAddress(units, selectedTemplateUnitId) && (
                  <div className="px-3 py-2 rounded-xl bg-[#f4fbf9] border border-[#d6ede8] text-[11px] text-[#087e83] font-semibold">
                    عنوان الفرع المستخدم ({'{{clinic_address}}'}): {resolveClinicAddress(units, selectedTemplateUnitId)}
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-600 mb-1">معاينة وتعديل نص الرسالة قبل الإرسال</label>
                  <textarea
                    rows={5}
                    value={templatePreviewText}
                    onChange={e => setTemplatePreviewText(e.target.value)}
                    className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white font-medium text-slate-800 leading-relaxed focus:border-[#087e83] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsTemplateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={!templatePreviewText.trim()}
                    onClick={() => {
                      const targetPhone = getPreferredPatientWhatsAppPhone(patient) || patient.phone;
                      openWhatsAppChat(targetPhone, templatePreviewText);
                      setIsTemplateModalOpen(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>إرسال القالب عبر واتساب</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tooth Details Inspection Modal (Notes + Linked Invoice Procedures + Operations) */}
      {inspectedToothCode !== null && (() => {
        const toothInfo = getToothLinkedData(inspectedToothCode);
        const isInTreatmentPlan = Boolean(patient.palmerTeeth?.includes(inspectedToothCode));
        return (
          <div
            onClick={() => setInspectedToothCode(null)}
            className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="w-full sm:max-w-lg bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#e7f5f2] text-[#087e83] font-mono font-extrabold text-sm flex items-center justify-center border border-[#bfe2db]">
                    {inspectedToothCode}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-[#172f3d]">
                      تفاصيل السن ({inspectedToothCode})
                    </h3>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      {getToothArabicQuadrantLabel(inspectedToothCode)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedToothCode(null)}
                  className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
                {/* Linked Clinical Notes */}
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-[#087e83] flex items-center justify-between">
                    <span>الملاحظات السريرية المرتبطة ({toothInfo.notes.length})</span>
                  </h4>
                  {toothInfo.notes.length > 0 ? (
                    <div className="space-y-2">
                      {toothInfo.notes.map(note => (
                        <div key={note.id} className="p-3 rounded-2xl bg-[#f8fbfa] border border-[#dce8eb] space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                            <span className="font-bold text-[#172f3d]">{note.authorName}</span>
                            <span className="font-mono">{note.createdAt.slice(0, 10)}</span>
                          </div>
                          {note.content && (
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                          )}
                          {note.audioDataUrl && (
                            <audio controls src={note.audioDataUrl} className="h-8 w-full" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 bg-slate-50 rounded-xl p-2.5 text-center">
                      لا توجد ملاحظات مسجلة لهذا السن
                    </p>
                  )}
                </div>

                {/* Linked Procedures (Invoices + Operations) */}
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-[#087e83]">
                    الإجراءات العلاجية المرتبطة ({toothInfo.invoiceItems.length + toothInfo.operations.length})
                  </h4>
                  {(toothInfo.invoiceItems.length > 0 || toothInfo.operations.length > 0) ? (
                    <div className="space-y-2">
                      {toothInfo.invoiceItems.map(({ invoiceId, invoiceNumber, date, item }) => (
                        <div key={`${invoiceId}_${item.id}`} className="p-3 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-[#172f3d]">{item.procedureName}</span>
                            <span className="text-[10px] font-mono font-bold text-blue-700">{date}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono">
                            <span>فاتورة: {invoiceNumber} · الكمية: {item.quantity}</span>
                            <span className="font-bold text-[#087e83]">{item.lineTotal.toLocaleString()} ج.م</span>
                          </div>
                        </div>
                      ))}
                      {toothInfo.operations.map(op => (
                        <div key={op.id} className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-[#172f3d]">{op.name}</span>
                            <span className="text-[10px] font-mono font-bold text-emerald-700">{op.date}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span>{op.doctorName || op.branchName} · {op.status}</span>
                            <span className="font-mono font-bold text-[#087e83]">{(op.total || op.price || 0).toLocaleString()} ج.م</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 bg-slate-50 rounded-xl p-2.5 text-center">
                      لا توجد إجراءات مسجلة لهذا السن
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100 flex-shrink-0">
                {canAddClinicalNotes && (
                  <button
                    type="button"
                    onClick={() => {
                      const code = inspectedToothCode;
                      setSelectedTeethForNote(prev => (prev.includes(code) ? prev : [...prev, code]));
                      setInspectedToothCode(null);
                      window.setTimeout(() => {
                        clinicalNotesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 80);
                    }}
                    className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
                  >
                    + إضافة ملاحظة لهذا السن
                  </button>
                )}
                {canAddInvoicesPayments && (
                  <button
                    type="button"
                    onClick={() => {
                      const code = inspectedToothCode;
                      setInspectedToothCode(null);
                      setIsQuickActionOpen(true, 'invoice', {
                        patientId: patient.id,
                        toothNumber: code
                      });
                    }}
                    className="flex-1 min-w-[125px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة إجراء</span>
                  </button>
                )}
                {canEditClinicalNotes && (
                  <button
                    type="button"
                    onClick={() => togglePalmerTooth(patient.id, inspectedToothCode)}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs border cursor-pointer transition-colors ${
                      isInTreatmentPlan
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                        : 'bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border-[#bfe2db]'
                    }`}
                  >
                    {isInTreatmentPlan ? 'إزالة من خطة العلاج' : 'إضافة لخطة العلاج'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Patient Follow-Up Status Log Modal (View + Edit + Delete) */}
      {isFollowUpLogModalOpen && (
        <div
          onClick={() => {
            setIsFollowUpLogModalOpen(false);
            setEditingFollowUpId(null);
            setConfirmDeleteFollowUpId(null);
          }}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#172f3d]">سجل متابعة المريض</h3>
                  <p className="text-[11px] text-slate-500 font-semibold">{patient.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFollowUpLogModalOpen(false);
                  setEditingFollowUpId(null);
                  setConfirmDeleteFollowUpId(null);
                }}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {followUpModalNotice && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5 flex-shrink-0">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{followUpModalNotice}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
              {(() => {
                const patFollowUpEntries = patientFollowUpLogs
                  .filter(l => l.patientId === patient.id)
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                if (patFollowUpEntries.length === 0) {
                  return (
                    <div className="py-10 text-center space-y-2">
                      <History className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs font-bold text-slate-500">
                        لا توجد تغييرات مسجلة في متابعة هذا المريض حتى الآن
                      </p>
                    </div>
                  );
                }

                return patFollowUpEntries.map(entry => {
                  const isEditingEntry = editingFollowUpId === entry.id;
                  const isConfirmDeleteEntry = confirmDeleteFollowUpId === entry.id;
                  return (
                  <div
                    key={entry.id}
                    className={`p-3.5 rounded-2xl border space-y-2.5 ${
                      entry.reverted
                        ? 'border-amber-200 bg-amber-50/30'
                        : 'border-slate-200 bg-[#fbfdfd]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span
                          style={getCustomColorBadgeStyle(getFollowUpStatusColorHex(entry.previousStatus, listItemColors.followUpStatuses))}
                          className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-transparent font-bold"
                        >
                          {entry.previousStatus || 'غير محدد'}
                        </span>
                        <ArrowLeft className="w-3.5 h-3.5 text-[#087e83]" />
                        <span
                          style={getCustomColorBadgeStyle(getFollowUpStatusColorHex(entry.newStatus, listItemColors.followUpStatuses))}
                          className="px-2 py-0.5 rounded-lg bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db] font-extrabold"
                        >
                          {entry.newStatus}
                        </span>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRelativeTimeBadgeClass(entry.timestamp)}`}>
                        {formatRelativeTimeArabic(entry.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.feedbackOutcome === 'done' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✓ تم الفيدباك{entry.feedbackDate ? ` (${entry.feedbackDate})` : ''}
                        </span>
                      )}
                      {entry.feedbackOutcome === 'not_done' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          ✕ لم تتم المهمة{entry.feedbackDate ? ` (${entry.feedbackDate})` : ''}
                        </span>
                      )}
                      {entry.finishedWorkAction === 'finished' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✓ خلص شغل (مهمة){entry.actionDate ? ` (${entry.actionDate})` : ''}
                        </span>
                      )}
                      {entry.finishedWorkAction === 'unreachable' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          لا يمكن التواصل{entry.finishedWorkAttempt ? ` · محاولة ${entry.finishedWorkAttempt}` : ''}{entry.snoozeUntilDate ? ` (حتى ${entry.snoozeUntilDate})` : ''}
                        </span>
                      )}
                      {entry.finishedWorkAction === 'not_interested' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          غير مهتم{entry.finishedWorkAttempt ? ` · محاولة ${entry.finishedWorkAttempt}` : ''}{entry.snoozeUntilDate ? ` (حتى ${entry.snoozeUntilDate})` : ''}
                        </span>
                      )}
                      {entry.finishedWorkAction === 'postpone_week' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          تأجيل أسبوع{entry.finishedWorkAttempt ? ` · محاولة ${entry.finishedWorkAttempt}` : ''}{entry.snoozeUntilDate ? ` (حتى ${entry.snoozeUntilDate})` : ''}
                        </span>
                      )}
                      {entry.finishedWorkAction === 'closed_file' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300">
                          إغلاق الملف (غير مهتم){entry.actionDate ? ` (${entry.actionDate})` : ''}
                        </span>
                      )}
                      {entry.reverted && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          تم الرجوع للحالة السابقة
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-[11px] text-slate-500 font-semibold">
                        بواسطة: {entry.changedBy}
                      </div>

                      {!isEditingEntry && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFollowUpId(entry.id);
                              setEditFollowUpPrevStatus(entry.previousStatus);
                              setEditFollowUpNewStatus(entry.newStatus);
                              setEditFollowUpNotes(entry.notes || '');
                              setConfirmDeleteFollowUpId(null);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] border border-[#bfe2db] text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>تعديل</span>
                          </button>

                          {isConfirmDeleteEntry ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const res = deletePatientFollowUpLog(entry.id);
                                  setConfirmDeleteFollowUpId(null);
                                  setFollowUpModalNotice(
                                    res.reverted
                                      ? `تم حذف السجل وإرجاع حالة المريض إلى "${res.previousStatus || 'غير محدد'}"`
                                      : 'تم حذف السجل من سجل متابعة المريض'
                                  );
                                  window.setTimeout(() => setFollowUpModalNotice(null), 2600);
                                }}
                                className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                              >
                                تأكيد الحذف
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteFollowUpId(null)}
                                className="px-2 py-1 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFollowUpId(entry.id)}
                              className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {entry.notes && !isEditingEntry && (
                      <p className="text-xs text-slate-700 bg-white border border-slate-100 rounded-xl px-3 py-1.5">
                        {entry.notes}
                      </p>
                    )}

                    {entry.audioDataUrl && !isEditingEntry && (
                      <div className="flex items-center gap-2 bg-[#f0f8f6] border border-[#bfe2db] rounded-xl px-3 py-1.5">
                        <audio controls src={entry.audioDataUrl} className="h-8 w-full" />
                        {entry.audioDurationSeconds !== undefined && (
                          <span className="text-[11px] font-mono font-bold text-[#087e83] whitespace-nowrap">
                            ({entry.audioDurationSeconds} ث)
                          </span>
                        )}
                      </div>
                    )}

                    {isEditingEntry && (
                      <form
                        onSubmit={e => {
                          e.preventDefault();
                          if (!editFollowUpPrevStatus.trim() || !editFollowUpNewStatus.trim()) return;
                          updatePatientFollowUpLog(entry.id, {
                            previousStatus: editFollowUpPrevStatus.trim(),
                            newStatus: editFollowUpNewStatus.trim(),
                            notes: editFollowUpNotes.trim() || undefined
                          });
                          setEditingFollowUpId(null);
                          setFollowUpModalNotice('تم تعديل سجل المتابعة وتحديث حالة المريض إذا لزم الأمر');
                          window.setTimeout(() => setFollowUpModalNotice(null), 2600);
                        }}
                        className="p-3 rounded-2xl bg-white border border-[#cfe5e7] space-y-3 text-xs"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">الحالة السابقة</label>
                            <ColoredSelect
                              value={editFollowUpPrevStatus}
                              onChange={val => setEditFollowUpPrevStatus(val)}
                              options={Array.from(new Set([...patientFollowUpStatuses, editFollowUpPrevStatus].filter(Boolean))).map(st => ({
                                value: st,
                                label: st,
                                colorHex: getFollowUpStatusColorHex(st, listItemColors.followUpStatuses)
                              }))}
                              className="w-full"
                              ariaLabel="الحالة السابقة"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">الحالة الجديدة</label>
                            <ColoredSelect
                              value={editFollowUpNewStatus}
                              onChange={val => setEditFollowUpNewStatus(val)}
                              options={Array.from(new Set([...patientFollowUpStatuses, editFollowUpNewStatus].filter(Boolean))).map(st => ({
                                value: st,
                                label: st,
                                colorHex: getFollowUpStatusColorHex(st, listItemColors.followUpStatuses)
                              }))}
                              className="w-full"
                              ariaLabel="الحالة الجديدة"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-600 mb-1">ملاحظات (اختياري)</label>
                          <input
                            type="text"
                            value={editFollowUpNotes}
                            onChange={e => setEditFollowUpNotes(e.target.value)}
                            placeholder="أضف ملاحظة حول التعديل..."
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingFollowUpId(null)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>إلغاء</span>
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>حفظ التعديل</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
      {isRegisterWaModalOpen && (
        <RegisterWhatsAppModal
          patient={patient}
          onClose={() => setIsRegisterWaModalOpen(false)}
        />
      )}
    </div>
  );
};
