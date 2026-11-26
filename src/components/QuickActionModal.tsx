import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  X,
  Calendar,
  UserPlus,
  FileText,
  CreditCard,
  TrendingDown,
  CheckSquare,
  AlertTriangle,
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Activity,
  ChevronDown
} from 'lucide-react';
import {
  formatCairoTime,
  normalizeEgyptianPhone,
  isValidEgyptianMobile,
  getCairoNowParts,
  addDaysToYmd,
  normalizeArabic,
  convertArabicDigitsToWestern,
  isLikelyPhoneQuery,
  getArabicWeekdayName
} from '../utils/arabic';
import { getTodayDateString, getDateOffset } from '../data/mockData';
import { Appointment, AppointmentStatus, Patient } from '../types/clinic';
import { PatientSearchSelect } from './PatientSearchSelect';
import { ColoredSelect } from './ColoredSelect';
import { ToothIcon } from './ToothIcon';
import { getCustomColorActiveStyle, getCustomColorBadgeStyle, getFollowUpStatusColorHex } from '../utils/colors';
import { isFeedbackTaskTitle } from '../utils/feedback';
import { isFinishedWorkTaskTitle } from '../utils/finishedWork';

export const QuickActionModal: React.FC = () => {
  const { isQuickActionOpen } = useClinic();
  if (!isQuickActionOpen) return null;
  return <QuickActionModalInner />;
};

const QuickActionModalInner: React.FC = () => {
  const {
    isQuickActionOpen,
    setIsQuickActionOpen,
    quickActionInitialTab,
    quickActionPrefill,
    activeView,
    selectedPatientId,
    patients,
    appointments,
    doctors,
    units,
    staffMembers,
    procedures,
    invoices,
    referralSources,
    patientTags,
    patientFollowUpStatuses,
    expenseCategories,
    listItemColors,
    patientRequiredFields,
    addAppointment,
    updateAppointment,
    deleteAppointment,
    addPatient,
    addInvoice,
    addPayment,
    payAllInvoices,
    addExpense,
    addTask,
    checkAppointmentConflict,
    goToPatient,
    clinicStartHour,
    clinicEndHour,
    weekdaySettings,
    cairoTodayStr,
    currentUser,
    hasPermission,
    restrictedUnit,
    isPatientAllowed
  } = useClinic();

  type ActionType = 'appointment' | 'patient' | 'invoice' | 'payment' | 'expense' | 'task';
  const [activeTab, setActiveTab] = useState<ActionType | null>(null);

  const editingAppointment = useMemo(
    () =>
      quickActionPrefill?.appointmentId
        ? appointments.find(a => a.id === quickActionPrefill.appointmentId) || null
        : null,
    [quickActionPrefill?.appointmentId, appointments]
  );

  const predeterminedPatientId =
    editingAppointment?.patientId ||
    quickActionPrefill?.patientId ||
    (activeView === 'patient_detail' ? selectedPatientId : null);

  const isPredeterminedPatient = !!predeterminedPatientId;
  const patNameInputRef = useRef<HTMLInputElement | null>(null);
  const inlinePatNameInputRef = useRef<HTMLInputElement | null>(null);
  const inlinePatPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const procInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const procBlurTimerRef = useRef<number | null>(null);
  const payAmountInputRef = useRef<HTMLInputElement | null>(null);

  const focusProcInput = (idx: number) => {
    if (procBlurTimerRef.current) {
      window.clearTimeout(procBlurTimerRef.current);
      procBlurTimerRef.current = null;
    }
    setOpenProcDropdownIdx(idx);
    const el = procInputRefs.current[idx];
    if (el) {
      el.focus();
    } else {
      window.setTimeout(() => {
        procInputRefs.current[idx]?.focus();
      }, 30);
    }
  };

  const expenseCategoriesRef = useRef(expenseCategories);
  expenseCategoriesRef.current = expenseCategories;

  useEffect(() => {
    if (isQuickActionOpen) {
      setActiveTab(quickActionInitialTab || null);
      setApptFormError('');
      setPatFormError('');
      setInvFormError('');
      setPayFormError('');
      setExpFormError('');
      setTaskFormError('');
      setShowInlineNewPatient(false);
      setDuplicateBypassed(false);
      setInlineDuplicateBypassed(false);
      setOpenProcDropdownIdx(null);
      const prefilledTeeth = quickActionPrefill?.toothNumbers?.length
        ? quickActionPrefill.toothNumbers
        : quickActionPrefill?.toothNumber
        ? [quickActionPrefill.toothNumber]
        : [];
      setInvItems([{ procedureId: '', procedureName: '', quantity: 1, unitPrice: 0, lineTotal: 0, toothNumbers: prefilledTeeth }]);
      setInvDiscountType('none');
      setInvDiscountValue(0);
      setInvNotes('');
      setPayAllMode(false);
      setConfirmDeleteAppt(false);
      const firstCat = expenseCategoriesRef.current[0];
      setExpCategory(firstCat?.name || 'أخرى');
      setExpAmount(firstCat?.defaultAmount && firstCat.defaultAmount > 0 ? firstCat.defaultAmount : '');
      setExpNotes('');
      setPatFollowUpStatus('عميل محتمل');
      setTaskDueDate(quickActionPrefill?.date || getTodayDateString());
      setTaskRecurrence('once');
      setTaskRecurrenceManuallySet(false);
    }
  }, [isQuickActionOpen, quickActionInitialTab, quickActionPrefill?.date, quickActionPrefill?.toothNumber, quickActionPrefill?.toothNumbers]);

  useEffect(() => {
    if (!isQuickActionOpen) return;

    if (predeterminedPatientId) {
      const p = patients.find(pat => pat.id === predeterminedPatientId);
      if (p) {
        setApptSelectedPatientId(p.id);
        setInvPatientId(p.id);
        setPayPatientId(p.id);
        const patInvs = invoices.filter(
          i => i.patientId === p.id && i.outstandingBalance > 0 && i.status !== 'voided'
        );
        if (quickActionPrefill?.invoiceId) {
          const matchedInv = patInvs.find(i => i.id === quickActionPrefill.invoiceId);
          if (matchedInv) {
            setPayInvoiceId(matchedInv.id);
            setPayAmount(quickActionPrefill.amount ?? matchedInv.outstandingBalance);
            setPayAllMode(false);
            return;
          }
        }
        if (patInvs.length > 0) {
          setPayInvoiceId(patInvs[0].id);
          setPayAmount(quickActionPrefill?.amount ?? patInvs[0].outstandingBalance);
          setPayAllMode(false);
        } else {
          setPayInvoiceId('');
          setPayAmount(quickActionPrefill?.amount ?? '');
          setPayAllMode(false);
        }
      }
    } else {
      setApptSelectedPatientId('');
      setInvPatientId('');
      setPayPatientId('');
      setPayInvoiceId('');
      setPayAmount('');
      setPayAllMode(false);
    }
  }, [isQuickActionOpen, predeterminedPatientId, quickActionPrefill?.invoiceId, quickActionPrefill?.amount]);

  useEffect(() => {
    if (isQuickActionOpen && activeTab === 'patient') {
      const t = window.setTimeout(() => {
        patNameInputRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(t);
    }
  }, [isQuickActionOpen, activeTab]);

  const activeUnits = units.filter(u => !u.isDisabled);
  const rawSelectableUnits = activeUnits.length > 0 ? activeUnits : units;
  const selectableUnits = restrictedUnit
    ? rawSelectableUnits.filter(u => u.id === restrictedUnit.id)
    : rawSelectableUnits;
  const activeDoctors = doctors.filter(d => !d.isDisabled);
  const selectableDoctors = activeDoctors.length > 0 ? activeDoctors : doctors;
  const visiblePatients = useMemo(
    () => patients.filter(p => isPatientAllowed(p.id)),
    [patients, isPatientAllowed]
  );

  // Appointment Form State
  const [apptSelectedPatientId, setApptSelectedPatientId] = useState('');
  const [apptDate, setApptDate] = useState(getTodayDateString());
  const [apptTime, setApptTime] = useState('14:00'); // Default 2:00 PM
  const [apptDuration, setApptDuration] = useState(30);
  const [apptUnitId, setApptUnitId] = useState(selectableUnits[0]?.id || 'unit_1');
  const [apptDoctorId, setApptDoctorId] = useState(selectableDoctors[0]?.id || 'doc_1');
  const [apptStatus, setApptStatus] = useState<AppointmentStatus>('booked');
  const [apptStatusManuallySet, setApptStatusManuallySet] = useState(false);
  const [apptConflict, setApptConflict] = useState<Appointment | null>(null);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);
  const [apptFormError, setApptFormError] = useState('');
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(false);
  const apptDateInputRef = useRef<HTMLInputElement | null>(null);

  const formatLocalYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const getWeekdayDefaultUnitId = (dateStr: string): string => {
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
      const ws = weekdaySettings.find(w => w.dayOfWeek === dayOfWeek);
      if (ws?.defaultUnitId && selectableUnits.some(u => u.id === ws.defaultUnitId)) {
        return ws.defaultUnitId;
      }
    }
    return selectableUnits[0]?.id || 'unit_1';
  };

  const pickReverseFreeTime = (dateStr: string, unitId: string, durationMins: number): string => {
    const start = clinicStartHour ?? 14;
    const end = clinicEndHour ?? 22;
    const lastSlot = Math.min(21, Math.max(start, end - 1));
    for (let h = lastSlot; h >= start; h--) {
      const candidate = `${String(h).padStart(2, '0')}:00`;
      if (!checkAppointmentConflict(dateStr, candidate, durationMins, unitId, editingAppointment?.id)) {
        return candidate;
      }
    }
    return `${String(lastSlot).padStart(2, '0')}:00`;
  };

  useEffect(() => {
    if (!isQuickActionOpen) return;
    if (editingAppointment) {
      const effUnitId = restrictedUnit
        ? restrictedUnit.id
        : editingAppointment.unitId || selectableUnits[0]?.id || 'unit_1';
      setApptDate(editingAppointment.date);
      setApptTime(editingAppointment.time);
      setApptDuration(editingAppointment.durationMinutes || 30);
      setApptUnitId(effUnitId);
      setApptDoctorId(editingAppointment.doctorId || selectableDoctors[0]?.id || 'doc_1');
      setApptStatus(editingAppointment.status);
      setApptStatusManuallySet(true);
      const conflict = checkAppointmentConflict(
        editingAppointment.date,
        editingAppointment.time,
        editingAppointment.durationMinutes || 30,
        effUnitId,
        editingAppointment.id
      );
      setApptConflict(conflict || null);
      setConflictAcknowledged(false);
      return;
    }

    const nextDate = quickActionPrefill?.date || cairoTodayStr;
    const nextUnitId = restrictedUnit
      ? restrictedUnit.id
      : quickActionPrefill?.unitId || getWeekdayDefaultUnitId(nextDate);
    const nextTime = quickActionPrefill?.time || pickReverseFreeTime(nextDate, nextUnitId, 30);
    const nextDoctorId =
      currentUser.permissions?.appointmentsOwnOnly && currentUser.doctorId
        ? currentUser.doctorId
        : quickActionPrefill?.doctorId || selectableDoctors[0]?.id || 'doc_1';
    setApptDate(nextDate);
    setApptTime(nextTime);
    setApptDuration(30);
    setApptUnitId(nextUnitId);
    setApptDoctorId(nextDoctorId);
    setApptStatus(nextDate < cairoTodayStr ? 'completed' : 'booked');
    setApptStatusManuallySet(false);
    const conflict = checkAppointmentConflict(nextDate, nextTime, 30, nextUnitId);
    setApptConflict(conflict || null);
    setConflictAcknowledged(false);
  }, [isQuickActionOpen, quickActionPrefill, editingAppointment, currentUser, cairoTodayStr, restrictedUnit]);

  // Quick inline patient create inside appointment modal
  const [showInlineNewPatient, setShowInlineNewPatient] = useState(false);
  const [inlinePatientName, setInlinePatientName] = useState('');
  const [inlinePatientPhone, setInlinePatientPhone] = useState('');
  const [inlineDuplicateBypassed, setInlineDuplicateBypassed] = useState(false);

  // Standalone Patient Form State
  const [patName, setPatName] = useState('');
  const [patPhone, setPatPhone] = useState('');
  const [patSecondaryPhone, setPatSecondaryPhone] = useState('');
  const [patAge, setPatAge] = useState<number | ''>('');
  const [patGender, setPatGender] = useState<'' | 'ذكر' | 'أنثى'>('');
  const [patReferral, setPatReferral] = useState('');
  const [patFollowUpStatus, setPatFollowUpStatus] = useState('عميل محتمل');
  const [patTags, setPatTags] = useState<string[]>([]);
  const [duplicateBypassed, setDuplicateBypassed] = useState(false);
  const [patFormError, setPatFormError] = useState('');

  // Invoice Form State
  const [invPatientId, setInvPatientId] = useState('');
  const [invItems, setInvItems] = useState<{ procedureId: string; procedureName: string; quantity: number; unitPrice: number; lineTotal: number; toothNumbers?: number[] }[]>([
    { procedureId: '', procedureName: '', quantity: 1, unitPrice: 0, lineTotal: 0, toothNumbers: [] }
  ]);
  const [invDiscountType, setInvDiscountType] = useState<'none' | 'fixed' | 'percent'>('none');
  const [invDiscountValue, setInvDiscountValue] = useState(0);
  const [invNotes, setInvNotes] = useState('');
  const [invFormError, setInvFormError] = useState('');
  const [openProcDropdownIdx, setOpenProcDropdownIdx] = useState<number | null>(null);
  const [invoiceToothPickerIdx, setInvoiceToothPickerIdx] = useState<number | null>(null);

  const toggleToothForInvoiceItem = (itemIdx: number, code: number) => {
    setInvItems(prev =>
      prev.map((it, i) => {
        if (i !== itemIdx) return it;
        const curr = it.toothNumbers || [];
        const next = curr.includes(code) ? curr.filter(t => t !== code) : [...curr, code];
        return { ...it, toothNumbers: next };
      })
    );
  };

  useEffect(() => {
    if (isQuickActionOpen && activeTab === 'invoice' && invPatientId) {
      const t = window.setTimeout(() => {
        setOpenProcDropdownIdx(0);
        procInputRefs.current[0]?.focus();
      }, 60);
      return () => window.clearTimeout(t);
    }
  }, [isQuickActionOpen, activeTab, invPatientId]);

  // Payment Form State
  const [payPatientId, setPayPatientId] = useState('');
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payAllMode, setPayAllMode] = useState(false);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'wallet'>('cash');
  const [payNotes, setPayNotes] = useState('');
  const [payFormError, setPayFormError] = useState('');

  // Expense Form State
  const [expCategory, setExpCategory] = useState<string>(expenseCategories[0]?.name || 'مستلزمات أسنان');
  const [expAmount, setExpAmount] = useState<number | ''>(
    expenseCategories[0]?.defaultAmount && expenseCategories[0].defaultAmount > 0
      ? expenseCategories[0].defaultAmount
      : ''
  );
  const [expUnit, setExpUnit] = useState('جميع الوحدات');
  const [expNotes, setExpNotes] = useState('');
  const [expFormError, setExpFormError] = useState('');

  // Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(getTodayDateString());
  const [taskAssignee, setTaskAssignee] = useState(
    currentUser.name || staffMembers.find(s => !s.isDisabled)?.name || ''
  );
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskRecurrence, setTaskRecurrence] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [taskRecurrenceManuallySet, setTaskRecurrenceManuallySet] = useState(false);
  const [taskFormError, setTaskFormError] = useState('');

  // Duplicate phone detection helper
  const findDuplicateByPhone = (rawPhone: string): Patient | undefined => {
    const normalized = normalizeEgyptianPhone(rawPhone);
    if (normalized.length < 10) return undefined;
    return patients.find(p => {
      const p1 = normalizeEgyptianPhone(p.phone);
      const p2 = p.secondaryPhone ? normalizeEgyptianPhone(p.secondaryPhone) : '';
      return p1 === normalized || (p2 && p2 === normalized);
    });
  };

  const duplicatePatientMatch = useMemo(() => {
    return findDuplicateByPhone(patPhone) || (patSecondaryPhone.trim() ? findDuplicateByPhone(patSecondaryPhone) : undefined);
  }, [patPhone, patSecondaryPhone, patients]);

  const inlineDuplicatePatientMatch = useMemo(() => {
    return findDuplicateByPhone(inlinePatientPhone);
  }, [inlinePatientPhone, patients]);

  if (!isQuickActionOpen) return null;

  // Filtered invoices for payment
  const patientUnpaidInvoices = invoices.filter(
    inv => inv.patientId === payPatientId && inv.outstandingBalance > 0 && inv.status !== 'voided'
  );
  const totalUnpaidCents = patientUnpaidInvoices.reduce(
    (sum, inv) => sum + Math.round(inv.outstandingBalance * 100),
    0
  );
  const totalUnpaidAmount = totalUnpaidCents / 100;

  // Live invoice math
  const invSubtotal = invItems.reduce((sum, item) => sum + item.lineTotal, 0);
  let invDiscountAmount = 0;
  if (invDiscountType === 'fixed') {
    invDiscountAmount = Math.min(invSubtotal, invDiscountValue);
  } else if (invDiscountType === 'percent') {
    invDiscountAmount = (invSubtotal * Math.min(100, invDiscountValue)) / 100;
  }
  const invNetTotal = Math.max(0, invSubtotal - invDiscountAmount);

  // Handlers
  const handleCheckConflict = (timeVal: string, durVal: number, unitVal: string, dateVal: string) => {
    const conflict = checkAppointmentConflict(dateVal, timeVal, durVal, unitVal, editingAppointment?.id);
    setApptConflict(conflict || null);
    if (!conflict) setConflictAcknowledged(false);
  };

  const submitAppointmentAction = (bypassInlineDuplicate = false) => {
    setApptFormError('');
    if (editingAppointment && !hasPermission('editAppointments')) {
      setApptFormError('لا تملك صلاحية تعديل المواعيد');
      return;
    }
    if (!editingAppointment && !hasPermission('addAppointments')) {
      setApptFormError('لا تملك صلاحية إضافة مواعيد جديدة');
      return;
    }
    let targetPatient = patients.find(p => p.id === apptSelectedPatientId);

    // If user created inline patient
    if (showInlineNewPatient) {
      if (!hasPermission('addPatients')) {
        setApptFormError('لا تملك صلاحية إضافة مريض جديد');
        return;
      }
      if (!inlinePatientName.trim() || !inlinePatientPhone.trim()) {
        setApptFormError('يرجى إدخال اسم ورقم هاتف المريض الجديد');
        return;
      }
      if (!isValidEgyptianMobile(inlinePatientPhone)) {
        setApptFormError('رقم الموبايل المصري غير صحيح (يجب أن يتكون من 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015)');
        return;
      }
      if (inlineDuplicatePatientMatch && !inlineDuplicateBypassed && !bypassInlineDuplicate) {
        setApptFormError('رقم الموبايل مسجل لمريض آخر — اختر "إظهار الملف" أو "إنشاء على أي حال"');
        return;
      }
      targetPatient = addPatient({
        name: inlinePatientName.trim(),
        phone: normalizeEgyptianPhone(inlinePatientPhone),
        tags: [],
        followUpStatus: 'عميل محتمل',
        palmerTeeth: [],
        ...(restrictedUnit ? { branchName: restrictedUnit.name } : {}),
        registeredDate: apptDate || quickActionPrefill?.date || getTodayDateString()
      });
    }

    if (!targetPatient) {
      setApptFormError('يرجى اختيار مريض أو إدخال مريض جديد');
      return;
    }

    const finalUnitId = restrictedUnit ? restrictedUnit.id : apptUnitId;

    // Check conflict
    const conflict = checkAppointmentConflict(
      apptDate,
      apptTime,
      apptDuration,
      finalUnitId,
      editingAppointment?.id
    );
    if (conflict && !conflictAcknowledged) {
      setApptConflict(conflict);
      return;
    }

    const doctor = doctors.find(d => d.id === apptDoctorId);
    const unit = units.find(u => u.id === finalUnitId) || restrictedUnit;

    if (editingAppointment) {
      updateAppointment(editingAppointment.id, {
        patientId: targetPatient.id,
        patientName: targetPatient.name,
        patientPhone: targetPatient.phone,
        date: apptDate,
        time: apptTime,
        durationMinutes: apptDuration,
        status: apptStatus,
        unitId: finalUnitId,
        unitName: unit ? unit.name : 'عيادة ١',
        doctorId: apptDoctorId,
        doctorName: doctor ? doctor.name : 'د. محمد شلقامي',
        notes: editingAppointment.notes || ''
      });
    } else {
      addAppointment({
        patientId: targetPatient.id,
        patientName: targetPatient.name,
        patientPhone: targetPatient.phone,
        date: apptDate,
        time: apptTime,
        durationMinutes: apptDuration,
        status: apptStatus,
        unitId: finalUnitId,
        unitName: unit ? unit.name : 'عيادة ١',
        doctorId: apptDoctorId,
        doctorName: doctor ? doctor.name : 'د. محمد شلقامي',
        notes: ''
      });
    }

    setInlinePatientName('');
    setInlinePatientPhone('');
    setShowInlineNewPatient(false);
    setIsQuickActionOpen(false);
  };

  const handleApptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitAppointmentAction(false);
  };

  const submitNewPatient = (bypassDuplicate = false) => {
    setPatFormError('');
    if (!hasPermission('addPatients')) {
      setPatFormError('لا تملك صلاحية إضافة مرضى جدد');
      return;
    }

    if (!patName.trim()) {
      setPatFormError('يرجى إدخال اسم المريض بالكامل');
      return;
    }
    if (patientRequiredFields.phone && !patPhone.trim()) {
      setPatFormError('رقم الموبايل الأساسي مطلوب');
      return;
    }
    if (patPhone.trim() && !isValidEgyptianMobile(patPhone)) {
      setPatFormError('رقم الموبايل الأساسي غير صحيح (يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقماً)');
      return;
    }
    if (patientRequiredFields.secondaryPhone && !patSecondaryPhone.trim()) {
      setPatFormError('رقم الهاتف الإضافي مطلوب حسب إعدادات العيادة');
      return;
    }
    if (patSecondaryPhone.trim() && !isValidEgyptianMobile(patSecondaryPhone)) {
      setPatFormError('رقم الهاتف الإضافي غير صحيح (يجب أن يكون رقم موبايل مصري صحيح)');
      return;
    }
    if (patientRequiredFields.age && (patAge === '' || Number(patAge) <= 0)) {
      setPatFormError('السن مطلوب حسب إعدادات العيادة');
      return;
    }
    if (patientRequiredFields.gender && !patGender) {
      setPatFormError('تحديد النوع مطلوب حسب إعدادات العيادة');
      return;
    }
    if (patientRequiredFields.referralSource && !patReferral) {
      setPatFormError('مصدر المعرفة بالعيادة مطلوب حسب إعدادات العيادة');
      return;
    }

    if (duplicatePatientMatch && !duplicateBypassed && !bypassDuplicate) {
      setPatFormError('يوجد مريض مسجل بنفس رقم الهاتف — يرجى اختيار "إظهار الملف" أو "إنشاء على أي حال"');
      return;
    }

    const newPat = addPatient({
      name: patName.trim(),
      phone: patPhone.trim() ? normalizeEgyptianPhone(patPhone) : '',
      secondaryPhone: patSecondaryPhone.trim() ? normalizeEgyptianPhone(patSecondaryPhone) : undefined,
      age: patAge !== '' ? Number(patAge) : undefined,
      gender: patGender || undefined,
      referralSource: patReferral || undefined,
      tags: patTags,
      followUpStatus: patFollowUpStatus || 'عميل محتمل',
      palmerTeeth: [],
      ...(restrictedUnit ? { branchName: restrictedUnit.name } : {}),
      registeredDate: quickActionPrefill?.date || getTodayDateString()
    });

    setPatName('');
    setPatPhone('');
    setPatSecondaryPhone('');
    setPatAge('');
    setPatGender('');
    setPatReferral('');
    setPatFollowUpStatus('عميل محتمل');
    setPatTags([]);
    setDuplicateBypassed(false);
    setIsQuickActionOpen(false);
    goToPatient(newPat.id);
  };

  const handlePatientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitNewPatient(false);
  };

  const handleApptDateChange = (newDate: string) => {
    setApptDate(newDate);
    if (!editingAppointment && !apptStatusManuallySet && newDate) {
      setApptStatus(newDate < cairoTodayStr ? 'completed' : 'booked');
    }
    const nextUnit = getWeekdayDefaultUnitId(newDate);
    setApptUnitId(nextUnit);
    if (!editingAppointment) {
      const nextTime = quickActionPrefill?.time || pickReverseFreeTime(newDate, nextUnit, apptDuration);
      if (!quickActionPrefill?.time) {
        setApptTime(nextTime);
      }
      handleCheckConflict(nextTime, apptDuration, nextUnit, newDate);
    } else {
      handleCheckConflict(apptTime, apptDuration, nextUnit, newDate);
    }
  };

  const submitInvoiceAction = (goToPayAfter: boolean) => {
    setInvFormError('');
    if (!hasPermission('addInvoicesPayments')) {
      setInvFormError('لا تملك صلاحية إصدار فواتير جديدة');
      return;
    }
    const pat = patients.find(p => p.id === invPatientId);
    if (!pat) {
      setInvFormError('يرجى اختيار مريض أولاً');
      return;
    }

    const validItems = invItems
      .map(it => ({ ...it, procedureName: it.procedureName.trim() }))
      .filter(it => it.procedureName.length > 0);
    if (validItems.length === 0) {
      setInvFormError('يرجى كتابة أو اختيار إجراء واحد على الأقل');
      focusProcInput(0);
      return;
    }

    const validSubtotal = validItems.reduce((sum, item) => sum + item.lineTotal, 0);
    let validDiscountAmount = 0;
    if (invDiscountType === 'fixed') {
      validDiscountAmount = Math.min(validSubtotal, invDiscountValue);
    } else if (invDiscountType === 'percent') {
      validDiscountAmount = (validSubtotal * Math.min(100, invDiscountValue)) / 100;
    }
    const validNetTotal = Math.max(0, validSubtotal - validDiscountAmount);

    const newInv = addInvoice({
      patientId: pat.id,
      patientName: pat.name,
      date: getTodayDateString(),
      items: validItems.map((item, idx) => ({
        id: `inv_item_${idx}_${Date.now()}`,
        procedureId: item.procedureId,
        procedureName: item.procedureName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        ...(item.toothNumbers && item.toothNumbers.length > 0 ? { toothNumbers: item.toothNumbers } : {})
      })),
      subtotal: validSubtotal,
      discountType: invDiscountType,
      discountValue: invDiscountValue,
      discountAmount: validDiscountAmount,
      netTotal: validNetTotal,
      paidAmount: 0,
      outstandingBalance: validNetTotal,
      status: validNetTotal === 0 ? 'paid' : 'unpaid',
      notes: invNotes
    });

    setInvItems([{ procedureId: '', procedureName: '', quantity: 1, unitPrice: 0, lineTotal: 0, toothNumbers: [] }]);
    setInvoiceToothPickerIdx(null);
    setInvNotes('');
    setInvDiscountType('none');
    setInvDiscountValue(0);

    if (goToPayAfter) {
      setPayPatientId(pat.id);
      setPayInvoiceId(newInv.id);
      setPayAllMode(false);
      setPayAmount(newInv.outstandingBalance > 0 ? newInv.outstandingBalance : '');
      setPayFormError('');
      setActiveTab('payment');
      return;
    }

    setIsQuickActionOpen(false);
  };

  const handleInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitInvoiceAction(false);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPayFormError('');
    if (!hasPermission('addInvoicesPayments')) {
      setPayFormError('لا تملك صلاحية تسجيل دفعات مالية');
      return;
    }
    const pat = patients.find(p => p.id === payPatientId);
    if (!pat) {
      setPayFormError('يرجى اختيار المريض أولاً');
      return;
    }
    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayFormError('يرجى إدخال مبلغ دفع صحيح');
      return;
    }

    if (payAllMode || payInvoiceId === '__ALL__') {
      payAllInvoices(pat.id, amt, payMethod, payNotes);
    } else {
      const inv = invoices.find(i => i.id === payInvoiceId);
      addPayment({
        invoiceId: payInvoiceId,
        invoiceNumber: inv?.invoiceNumber,
        patientId: pat.id,
        patientName: pat.name,
        amount: amt,
        paymentMethod: payMethod,
        date: getTodayDateString(),
        receivedBy: currentUser.name || 'الاستقبال',
        notes: payNotes,
        status: 'valid'
      });
    }

    setPayNotes('');
    setPayAllMode(false);
    setIsQuickActionOpen(false);
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setExpFormError('');
    if (!hasPermission('addExpenses')) {
      setExpFormError('لا تملك صلاحية إضافة مصروفات');
      return;
    }
    const categoryName = expCategory.trim() || expenseCategories[0]?.name || 'أخرى';
    const amt = Number(expAmount);
    if (!categoryName || isNaN(amt) || amt <= 0) {
      setExpFormError('يرجى اختيار التصنيف وإدخال المبلغ الصحيح');
      return;
    }
    addExpense({
      title: categoryName,
      category: categoryName,
      amount: amt,
      date: getTodayDateString(),
      unitName: restrictedUnit ? restrictedUnit.name : expUnit,
      notes: expNotes,
      loggedBy: currentUser.name || 'الاستقبال'
    });
    const firstCat = expenseCategories[0];
    setExpCategory(firstCat?.name || 'أخرى');
    setExpAmount(firstCat?.defaultAmount && firstCat.defaultAmount > 0 ? firstCat.defaultAmount : '');
    setExpNotes('');
    setIsQuickActionOpen(false);
  };

  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTaskFormError('');
    if (!hasPermission('addTasks')) {
      setTaskFormError('لا تملك صلاحية إضافة مهام');
      return;
    }
    if (!taskTitle.trim()) {
      setTaskFormError('يرجى كتابة عنوان المهمة');
      return;
    }
    addTask({
      title: taskTitle.trim(),
      dueDate: taskDueDate,
      assignedTo: taskAssignee,
      priority: taskPriority,
      recurrence: taskRecurrence
    });
    setTaskTitle('');
    setIsQuickActionOpen(false);
  };

  const actionMeta: Record<ActionType, { title: string; icon: React.ReactNode; bg: string; text: string }> = {
    appointment: {
      title: editingAppointment ? 'تعديل الموعد' : 'حجز موعد جديد',
      icon: <Calendar className="w-4 h-4" />,
      bg: 'bg-[#e6f4f1]',
      text: 'text-[#087e83]'
    },
    patient: { title: 'إضافة مريض جديد', icon: <UserPlus className="w-4 h-4" />, bg: 'bg-[#e6f4f1]', text: 'text-[#087e83]' },
    invoice: { title: 'إصدار فاتورة جديدة', icon: <FileText className="w-4 h-4" />, bg: 'bg-[#e6f4f1]', text: 'text-[#087e83]' },
    payment: { title: 'تسجيل دفعة جديدة', icon: <CreditCard className="w-4 h-4" />, bg: 'bg-emerald-50', text: 'text-emerald-700' },
    expense: { title: 'تسجيل مصروف', icon: <TrendingDown className="w-4 h-4" />, bg: 'bg-amber-50', text: 'text-amber-700' },
    task: { title: 'إضافة مهمة جديدة', icon: <CheckSquare className="w-4 h-4" />, bg: 'bg-blue-50', text: 'text-blue-700' }
  };

  const currentHeader = activeTab ? actionMeta[activeTab] : null;

  return (
    <div
      onClick={() => setIsQuickActionOpen(false)}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full sm:max-w-xl max-h-[92dvh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200 border border-[#d6e5e8]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Header (Dedicated Form Title OR Options Picker) */}
        <div className="px-5 py-4 border-b border-[#e2eaee] flex items-center justify-between bg-[#f8fbfa]">
          <div className="flex items-center gap-2.5">
            {activeTab && !quickActionInitialTab && (
              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-[#087e83] hover:border-[#087e83] transition-colors cursor-pointer"
                title="رجوع للخيارات"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                currentHeader ? `${currentHeader.bg} ${currentHeader.text}` : 'bg-[#e6f4f1] text-[#087e83]'
              }`}
            >
              {currentHeader ? currentHeader.icon : <Plus className="w-4 h-4" />}
            </div>
            <h2 className="text-base font-bold text-[#172f3d]">
              {currentHeader ? currentHeader.title : 'إضافة جديدة'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsQuickActionOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-[#172f3d]">
          {/* ACTION OPTIONS PICKER (shown when clicking '+' button) */}
          {activeTab === null && (() => {
            const options = [
              ...(hasPermission('addPatients')
                ? [{ id: 'patient' as const, label: 'مريض جديد', sub: 'فتح ملف مريض', icon: <UserPlus className="w-6 h-6" />, bg: 'bg-[#e7f5f2] text-[#087e83]' }]
                : []),
              ...(hasPermission('addAppointments')
                ? [{ id: 'appointment' as const, label: 'حجز موعد', sub: 'موعد كشف أو متابعة', icon: <Calendar className="w-6 h-6" />, bg: 'bg-[#e7f5f2] text-[#087e83]' }]
                : []),
              ...(hasPermission('addInvoicesPayments')
                ? [
                    { id: 'invoice' as const, label: 'فاتورة', sub: 'إصدار فاتورة علاج', icon: <FileText className="w-6 h-6" />, bg: 'bg-[#e7f5f2] text-[#087e83]' },
                    { id: 'payment' as const, label: 'دفعة', sub: 'تسجيل دفعة سداد', icon: <CreditCard className="w-6 h-6" />, bg: 'bg-emerald-50 text-emerald-700' }
                  ]
                : []),
              ...(hasPermission('addExpenses')
                ? [{ id: 'expense' as const, label: 'مصروف', sub: 'تسجيل مصروف عيادة', icon: <TrendingDown className="w-6 h-6" />, bg: 'bg-amber-50 text-amber-700' }]
                : []),
              ...(hasPermission('addTasks')
                ? [{ id: 'task' as const, label: 'مهمة', sub: 'إضافة مهمة للطاقم', icon: <CheckSquare className="w-6 h-6" />, bg: 'bg-blue-50 text-blue-700' }]
                : [])
            ];

            if (options.length === 0) {
              return (
                <div className="py-10 text-center space-y-2 text-slate-500">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-bold text-[#172f3d]">لا تملك صلاحيات إضافة</p>
                  <p className="text-xs text-slate-400">يمكنك مراجعة مدير العيادة لتفعيل صلاحيات الإضافة المناسبة لحسابك.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-1">
                {options.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setActiveTab(opt.id)}
                    className="p-4 rounded-2xl border border-[#dce8eb] bg-white hover:border-[#087e83] hover:bg-[#f7fbfa] shadow-xs transition-all flex flex-col items-center justify-center text-center gap-2 active:scale-95 cursor-pointer group"
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${opt.bg} group-hover:scale-105 transition-transform`}>
                      {opt.icon}
                    </div>
                    <div>
                      <div className="font-extrabold text-sm text-[#172f3d]">{opt.label}</div>
                      <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{opt.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}
          {/* TAB 1: BOOK APPOINTMENT */}
          {activeTab === 'appointment' && (
            <form onSubmit={handleApptSubmit} className="space-y-4">
              {/* Unit & Doctor Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">وحدة الكشف / العيادة</label>
                  <select
                    value={restrictedUnit ? restrictedUnit.id : apptUnitId}
                    disabled={Boolean(restrictedUnit)}
                    onChange={e => {
                      setApptUnitId(e.target.value);
                      handleCheckConflict(apptTime, apptDuration, e.target.value, apptDate);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
                  >
                    {selectableUnits.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">الطبيب المسؤول</label>
                  <select
                    value={apptDoctorId}
                    disabled={!!(currentUser.permissions?.appointmentsOwnOnly && currentUser.doctorId)}
                    onChange={e => setApptDoctorId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
                  >
                    {selectableDoctors.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.specialty.split(' ')[0]})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Patient Selection or Quick Inline Create */}
              {!showInlineNewPatient ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500">اختيار المريض *</label>
                    {!isPredeterminedPatient && hasPermission('addPatients') && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowInlineNewPatient(true);
                          setApptFormError('');
                          window.setTimeout(() => inlinePatNameInputRef.current?.focus(), 40);
                        }}
                        className="text-[#087e83] hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> مريض جديد غير مسجل
                      </button>
                    )}
                  </div>

                  <PatientSearchSelect
                    patients={visiblePatients}
                    selectedPatientId={apptSelectedPatientId}
                    onSelect={p => {
                      setApptSelectedPatientId(p.id);
                      setApptFormError('');
                    }}
                    onClear={() => setApptSelectedPatientId('')}
                    isPredetermined={isPredeterminedPatient}
                    autoFocus={!isPredeterminedPatient}
                    focusKey={`appt_${isQuickActionOpen}_${activeTab}`}
                    onCreateNew={
                      hasPermission('addPatients')
                        ? initialQuery => {
                            const cleanedQuery = initialQuery.trim();
                            setShowInlineNewPatient(true);
                            setInlineDuplicateBypassed(false);
                            if (isLikelyPhoneQuery(cleanedQuery)) {
                              const westernPhone = convertArabicDigitsToWestern(cleanedQuery).replace(/[^\d+]/g, '');
                              setInlinePatientPhone(westernPhone);
                              setInlinePatientName('');
                              window.setTimeout(() => inlinePatNameInputRef.current?.focus(), 40);
                            } else {
                              setInlinePatientName(cleanedQuery);
                              setInlinePatientPhone('');
                              window.setTimeout(() => inlinePatPhoneInputRef.current?.focus(), 40);
                            }
                          }
                        : undefined
                    }
                  />
                </div>
              ) : (
                /* Inline New Patient form */
                <div className="p-3.5 bg-[#f0f8f6] border border-[#bfe2db] rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between text-[#087e83] font-bold">
                    <span>بيانات المريض السريعة للموعد</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInlineNewPatient(false);
                        setApptFormError('');
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
                    >
                      إلغاء والعودة للبحث
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      ref={inlinePatNameInputRef}
                      type="text"
                      value={inlinePatientName}
                      onChange={e => setInlinePatientName(e.target.value)}
                      placeholder="اسم المريض بالكامل *"
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                      required
                    />
                    <input
                      ref={inlinePatPhoneInputRef}
                      type="tel"
                      value={inlinePatientPhone}
                      onChange={e => {
                        setInlinePatientPhone(e.target.value);
                        setInlineDuplicateBypassed(false);
                      }}
                      placeholder="رقم الموبايل (01xxxxxxxxx) *"
                      className={`px-3 py-2 rounded-xl border bg-white text-xs font-mono focus:outline-none ${
                        inlinePatientPhone.trim()
                          ? isValidEgyptianMobile(inlinePatientPhone)
                            ? 'border-emerald-400 focus:border-emerald-500'
                            : 'border-rose-400 focus:border-rose-500'
                          : 'border-slate-200 focus:border-[#087e83]'
                      }`}
                      dir="ltr"
                      required
                    />
                  </div>

                  {inlinePatientPhone.trim() && (
                    <div
                      className={`text-[11px] font-bold flex items-center gap-1.5 ${
                        isValidEgyptianMobile(inlinePatientPhone) ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {isValidEgyptianMobile(inlinePatientPhone) ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>رقم موبايل مصري صحيح ({normalizeEgyptianPhone(inlinePatientPhone)})</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>رقم غير صحيح — يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 (11 رقم)</span>
                        </>
                      )}
                    </div>
                  )}

                  {inlineDuplicatePatientMatch && !inlineDuplicateBypassed && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2 text-amber-950">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-[11px] leading-relaxed">
                          <div className="font-extrabold">يوجد مريض مسجل بنفس الرقم!</div>
                          <div>
                            الاسم: <strong>{inlineDuplicatePatientMatch.name}</strong> ·{' '}
                            <span className="font-mono" dir="ltr">{inlineDuplicatePatientMatch.phone}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuickActionOpen(false);
                            goToPatient(inlineDuplicatePatientMatch.id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:border-[#087e83] text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>إظهار الملف</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInlineDuplicateBypassed(true);
                            submitAppointmentAction(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          إنشاء على أي حال
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Date & Quick Shortcuts */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">تاريخ الموعد</label>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div
                    onClick={() => {
                      const el = apptDateInputRef.current;
                      if (!el) return;
                      if (typeof el.showPicker === 'function') {
                        try {
                          el.showPicker();
                          return;
                        } catch {}
                      }
                      el.focus();
                      el.click();
                    }}
                    className="relative flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#172f3d] flex items-center justify-between cursor-pointer hover:border-[#087e83]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 text-[#087e83] flex-shrink-0" />
                      <span>{getArabicWeekdayName(apptDate)}</span>
                      <span className="font-mono text-slate-600" dir="ltr">{apptDate}</span>
                    </div>
                    <input
                      ref={apptDateInputRef}
                      type="date"
                      value={apptDate}
                      onChange={e => handleApptDateChange(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      aria-label="تاريخ الموعد"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m, day] = apptDate.split('-').map(Number);
                      const d = new Date(y, m - 1, day - 1);
                      handleApptDateChange(formatLocalYmd(d));
                    }}
                    className="px-2.5 py-2 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 font-bold text-[11px] cursor-pointer hover:bg-rose-100 whitespace-nowrap"
                  >
                    - يوم
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m, day] = apptDate.split('-').map(Number);
                      const d = new Date(y, m - 1, day + 1);
                      handleApptDateChange(formatLocalYmd(d));
                    }}
                    className="px-2.5 py-2 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 font-bold text-[11px] cursor-pointer hover:bg-emerald-100 whitespace-nowrap"
                  >
                    + يوم
                  </button>
                </div>
                {/* Date Shortcuts - All 5 in 1 single row */}
                <div className="grid grid-cols-5 gap-1 text-[10px]">
                  {[
                    { label: 'اليوم', val: getTodayDateString() },
                    { label: 'بكرة', val: getDateOffset(1) },
                    { label: 'بعد بكرة', val: getDateOffset(2) },
                    { label: 'أول الأسبوع القادم', val: (() => {
                        const cairo = getCairoNowParts();
                        const daysToNextSat = ((6 - cairo.weekday + 7) % 7) || 7;
                        return addDaysToYmd(cairo.dateStr, daysToNextSat);
                      })()
                    },
                    { label: 'أول الشهر القادم', val: (() => {
                        const cairo = getCairoNowParts();
                        const nextMonth = new Date(cairo.year, cairo.month, 1);
                        return formatLocalYmd(nextMonth);
                      })()
                    }
                  ].map(chip => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleApptDateChange(chip.val)}
                      className={`px-1 py-1.5 rounded-lg border font-bold text-center leading-tight truncate cursor-pointer ${apptDate === chip.val ? 'bg-[#087e83] text-white border-[#087e83]' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      title={chip.label}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    الوقت بنظام (AM / PM)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={apptTime}
                      onChange={e => {
                        setApptTime(e.target.value);
                        handleCheckConflict(e.target.value, apptDuration, apptUnitId, apptDate);
                      }}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const [h, m] = apptTime.split(':').map(Number);
                        const totalMins = (isNaN(h) ? 14 : h) * 60 + (isNaN(m) ? 0 : m) + 30;
                        const newH = Math.floor(totalMins / 60) % 24;
                        const newM = totalMins % 60;
                        const newTimeStr = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
                        setApptTime(newTimeStr);
                        handleCheckConflict(newTimeStr, apptDuration, apptUnitId, apptDate);
                      }}
                      className="px-3 py-2 rounded-xl bg-[#e6f4f1] text-[#087e83] border border-[#bfe2db] hover:bg-[#d6eee8] font-bold text-xs whitespace-nowrap cursor-pointer shadow-xs"
                      title="إضافة 30 دقيقة للوقت الحالي"
                    >
                      +30 دقيقة
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#087e83] font-bold mt-1">
                    <span>التوقيت: {formatCairoTime(apptTime)}</span>
                  </div>
                  {/* Quick Working Hours Time Shortcuts (2 PM - 9 PM on 2 equal rows) */}
                  <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                    {(() => {
                      const start = clinicStartHour ?? 14;
                      const end = clinicEndHour ?? 22;
                      const maxSlotHour = Math.min(21, Math.max(start, end - 1));
                      const slots = [];
                      for (let h = start; h <= maxSlotHour; h++) {
                        const val = `${String(h).padStart(2, '0')}:00`;
                        const label = h === 0 ? '12 ص' : h === 12 ? '12 م' : h > 12 ? `${h - 12} م` : `${h} ص`;
                        slots.push({ h, val, label });
                      }
                      const dayUnitAppts = appointments.filter(
                        a =>
                          a.date === apptDate &&
                          a.status !== 'cancelled' &&
                          a.status !== 'no_show' &&
                          (!editingAppointment || a.id !== editingAppointment.id) &&
                          (!apptUnitId || !a.unitId || a.unitId === apptUnitId)
                      );

                      return slots.map(chip => {
                        const hourPrefix = chip.val.substring(0, 2);
                        const hourStart = chip.h * 60;
                        const hourEnd = (chip.h + 1) * 60;
                        const occupiedMins = new Array<boolean>(60).fill(false);

                        dayUnitAppts.forEach(a => {
                          const [ahStr, amStr] = (a.time || '').split(':');
                          const ah = parseInt(ahStr, 10);
                          const am = parseInt(amStr, 10);
                          if (isNaN(ah)) return;
                          const aStart = ah * 60 + (isNaN(am) ? 0 : am);
                          const aEnd = aStart + (a.durationMinutes || 30);
                          const ovStart = Math.max(hourStart, aStart);
                          const ovEnd = Math.min(hourEnd, aEnd);
                          for (let m = ovStart; m < ovEnd; m++) {
                            occupiedMins[m - hourStart] = true;
                          }
                        });

                        let firstHalfCount = 0;
                        let secondHalfCount = 0;
                        for (let i = 0; i < 30; i++) if (occupiedMins[i]) firstHalfCount++;
                        for (let i = 30; i < 60; i++) if (occupiedMins[i]) secondHalfCount++;
                        const occupiedCount = firstHalfCount + secondHalfCount;

                        const isFull =
                          occupiedCount >= 55 || (firstHalfCount >= 15 && secondHalfCount >= 15);
                        const isHalf = occupiedCount > 0 && !isFull;
                        const isSelected = apptTime.startsWith(`${hourPrefix}:`);

                        let btnStyle = 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100';
                        if (isSelected) {
                          btnStyle = 'bg-[#087e83] text-white border-[#087e83] font-bold';
                        } else if (isFull) {
                          btnStyle = 'bg-rose-100 text-rose-800 border-rose-400 hover:bg-rose-200/70 font-bold';
                        } else if (isHalf) {
                          btnStyle =
                            'relative overflow-hidden bg-white text-rose-900 border-amber-400 hover:border-rose-400 font-bold';
                        }

                        const titleText = isFull
                          ? 'الساعة ممتلئة بالكامل!'
                          : isHalf
                          ? secondHalfCount > firstHalfCount
                            ? 'النصف الأول متاح (:00) والنصف الثاني محجوز'
                            : 'النصف الأول محجوز والنصف الثاني متاح (:30)'
                          : 'اختر الساعة';

                        return (
                          <button
                            key={chip.val}
                            type="button"
                            onClick={() => {
                              const candidates = [
                                `${hourPrefix}:00`,
                                `${hourPrefix}:30`,
                                `${hourPrefix}:15`,
                                `${hourPrefix}:45`
                              ];
                              const freeCandidate = candidates.find(
                                t =>
                                  !checkAppointmentConflict(
                                    apptDate,
                                    t,
                                    apptDuration,
                                    apptUnitId,
                                    editingAppointment?.id
                                  )
                              );
                              const chosenTime = freeCandidate || chip.val;
                              setApptTime(chosenTime);
                              handleCheckConflict(chosenTime, apptDuration, apptUnitId, apptDate);
                            }}
                            className={`text-[10px] px-2.5 py-1 rounded-md font-mono border transition-colors cursor-pointer ${btnStyle}`}
                            title={titleText}
                          >
                            {isHalf && !isSelected && (
                              <span
                                aria-hidden="true"
                                className={`absolute inset-y-0 w-1/2 bg-rose-200/85 pointer-events-none ${
                                  secondHalfCount > firstHalfCount ? 'left-0' : 'right-0'
                                }`}
                              />
                            )}
                            <span className="relative z-10">
                              {chip.label} {!isSelected ? (isFull ? '🔴' : isHalf ? '🟠' : '') : ''}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 font-semibold">
                    <span>🔴 ساعة مليانة</span>
                    <span>🟠 ساعة فيها نص</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">مدة الجلسة بالدقائق</label>
                  {/* Minute-precision input field BEFORE the 15/30/45/60 preset buttons */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <input
                      type="number"
                      min={5}
                      max={600}
                      step={5}
                      value={apptDuration}
                      onChange={e => {
                        const val = Math.max(5, Math.min(600, Number(e.target.value) || 15));
                        setApptDuration(val);
                        handleCheckConflict(apptTime, val, apptUnitId, apptDate);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold text-[#087e83] focus:border-[#087e83] focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">دقيقة (5–600)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[15, 30, 45, 60].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => {
                          setApptDuration(mins);
                          handleCheckConflict(apptTime, mins, apptUnitId, apptDate);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                          apptDuration === mins
                            ? 'bg-[#087e83] text-white border-[#087e83]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {mins} د
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Conflict Alert Warning */}
              {apptConflict && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900 animate-in fade-in">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1.5 flex-1 text-xs">
                    <p className="font-bold">تنبيه تعارض في المواعيد!</p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      يوجد موعد محجوز مسبقاً في نفس الوحدة ({apptConflict.unitName}) للمريض{' '}
                      <strong>{apptConflict.patientName}</strong> الساعة {formatCairoTime(apptConflict.time)} لمدة {apptConflict.durationMinutes} دقيقة.
                    </p>
                    <label className="flex items-center gap-2 pt-1 font-bold cursor-pointer text-[#087e83]">
                      <input
                        type="checkbox"
                        checked={conflictAcknowledged}
                        onChange={e => setConflictAcknowledged(e.target.checked)}
                        className="rounded text-[#087e83] w-4 h-4"
                      />
                      <span>تأكيد الحجز وتجاوز التعارض على مسؤوليتي</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Appointment Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">حالة الموعد</label>
                <select
                  value={apptStatus}
                  onChange={e => {
                    setApptStatus(e.target.value as AppointmentStatus);
                    setApptStatusManuallySet(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#172f3d] focus:border-[#087e83] focus:outline-none"
                >
                  <option value="booked">محجوز</option>
                  <option value="confirmed">مؤكد</option>
                  <option value="arrived">وصل العيادة</option>
                  <option value="completed">تمت الزيارة (مكتمل)</option>
                  <option value="cancelled">ملغي</option>
                  <option value="no_show">لم يحضر</option>
                </select>
                {apptDate < cairoTodayStr && apptStatus === 'completed' && (
                  <p className="text-[10px] font-bold text-emerald-700 mt-1">
                    سيُحسب هذا المريض تلقائياً ضمن زيارات اليوم السابق ومهمة الفيدباك.
                  </p>
                )}
              </div>

              {apptFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{apptFormError}</span>
                </div>
              )}

              {/* Submit & Delete Actions */}
              <div className="pt-2 space-y-2">
                {(!editingAppointment || hasPermission('editAppointments')) && (
                  <button
                    type="submit"
                    disabled={!!apptConflict && !conflictAcknowledged}
                    className="w-full py-3 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md shadow-[#087e83]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    {editingAppointment ? 'حفظ تعديلات الموعد' : 'حفظ وتأكيد حجز الموعد'}
                  </button>
                )}

                {editingAppointment && hasPermission('deleteAppointments') && (
                  confirmDeleteAppt ? (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-rose-700">تأكيد حذف هذا الموعد نهائياً؟</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            deleteAppointment(editingAppointment.id);
                            setConfirmDeleteAppt(false);
                            setIsQuickActionOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                        >
                          نعم، حذف الموعد
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAppt(false)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAppt(true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الموعد نهائياً</span>
                    </button>
                  )
                )}
              </div>
            </form>
          )}

          {/* TAB 2: NEW PATIENT */}
          {activeTab === 'patient' && (
            <form onSubmit={handlePatientSubmit} noValidate className="space-y-3.5">
              {quickActionPrefill?.date && (
                <div className="px-3 py-2 rounded-xl bg-[#e7f5f2] border border-[#bfe2db] text-[11px] font-bold text-[#087e83] flex items-center justify-between">
                  <span>تاريخ تسجيل الملف المحدد:</span>
                  <span className="font-mono" dir="ltr">{quickActionPrefill.date}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    اسم المريض بالكامل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    ref={patNameInputRef}
                    type="text"
                    autoFocus
                    value={patName}
                    onChange={e => {
                      setPatName(e.target.value);
                      setPatFormError('');
                    }}
                    placeholder="مثال: أحمد عبد الله الشناوي"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    رقم الموبايل الأساسي{' '}
                    {patientRequiredFields.phone ? (
                      <span className="text-rose-500">*</span>
                    ) : (
                      <span className="text-slate-400 font-normal">(اختياري)</span>
                    )}
                  </label>
                  <input
                    type="tel"
                    value={patPhone}
                    onChange={e => {
                      setPatPhone(e.target.value);
                      setDuplicateBypassed(false);
                      setPatFormError('');
                    }}
                    placeholder="01xxxxxxxxx"
                    className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                      patPhone.trim()
                        ? isValidEgyptianMobile(patPhone)
                          ? 'border-emerald-400 focus:border-emerald-500 bg-emerald-50/30'
                          : 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                        : 'border-slate-200 focus:border-[#087e83]'
                    }`}
                    dir="ltr"
                  />
                  {patPhone.trim() && (
                    <div
                      className={`mt-1 text-[10px] font-bold flex items-center gap-1 ${
                        isValidEgyptianMobile(patPhone) ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {isValidEgyptianMobile(patPhone) ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>رقم موبايل مصري صحيح ({normalizeEgyptianPhone(patPhone)})</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>رقم غير صحيح (يجب أن يبدأ بـ 010/011/012/015 ويكون 11 رقم)</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    رقم هاتف إضافي / واتساب{' '}
                    {patientRequiredFields.secondaryPhone ? (
                      <span className="text-rose-500">*</span>
                    ) : (
                      <span className="text-slate-400 font-normal">(اختياري)</span>
                    )}
                  </label>
                  <input
                    type="tel"
                    value={patSecondaryPhone}
                    onChange={e => {
                      setPatSecondaryPhone(e.target.value);
                      setDuplicateBypassed(false);
                      setPatFormError('');
                    }}
                    placeholder="01xxxxxxxxx"
                    className={`w-full px-3 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                      patSecondaryPhone.trim()
                        ? isValidEgyptianMobile(patSecondaryPhone)
                          ? 'border-emerald-400 focus:border-emerald-500 bg-emerald-50/30'
                          : 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                        : 'border-slate-200 focus:border-[#087e83]'
                    }`}
                    dir="ltr"
                  />
                  {patSecondaryPhone.trim() && (
                    <div
                      className={`mt-1 text-[10px] font-bold flex items-center gap-1 ${
                        isValidEgyptianMobile(patSecondaryPhone) ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {isValidEgyptianMobile(patSecondaryPhone) ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>رقم موبايل مصري صحيح</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>رقم موبايل مصري غير صحيح</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Duplicate Phone Warning with Two Explicit Options */}
                {duplicatePatientMatch && (
                  <div className="sm:col-span-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2.5 text-amber-950 animate-in fade-in">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs space-y-0.5 flex-1">
                        <div className="font-extrabold">يوجد مريض مسجل مسبقاً بنفس رقم الهاتف!</div>
                        <div className="text-[11px] text-amber-900">
                          الاسم: <strong>{duplicatePatientMatch.name}</strong> · الهاتف:{' '}
                          <span className="font-mono" dir="ltr">{duplicatePatientMatch.phone}</span> · تاريخ الملف:{' '}
                          <span className="font-mono">{duplicatePatientMatch.registeredDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setIsQuickActionOpen(false);
                          goToPatient(duplicatePatientMatch.id);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-white border border-amber-300 hover:border-[#087e83] text-[#087e83] text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>إظهار الملف</span>
                      </button>

                      {!duplicateBypassed ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDuplicateBypassed(true);
                            submitNewPatient(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          إنشاء على أي حال
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                          ✓ تم التأكيد: سيتم إنشاء ملف جديد
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    السن{' '}
                    {patientRequiredFields.age ? (
                      <span className="text-rose-500">*</span>
                    ) : (
                      <span className="text-slate-400 font-normal">(اختياري)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={patAge}
                    onChange={e => {
                      setPatAge(e.target.value === '' ? '' : Number(e.target.value));
                      setPatFormError('');
                    }}
                    placeholder="السن بالسنوات"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:border-[#087e83] focus:outline-none"
                    min={1}
                    max={120}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    النوع{' '}
                    {patientRequiredFields.gender ? (
                      <span className="text-rose-500">*</span>
                    ) : (
                      <span className="text-slate-400 font-normal">(اختياري)</span>
                    )}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPatGender(prev => (prev === 'أنثى' && !patientRequiredFields.gender ? '' : 'أنثى'));
                        setPatFormError('');
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        patGender === 'أنثى'
                          ? 'bg-[#087e83] text-white border-[#087e83]'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      أنثى
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPatGender(prev => (prev === 'ذكر' && !patientRequiredFields.gender ? '' : 'ذكر'));
                        setPatFormError('');
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        patGender === 'ذكر'
                          ? 'bg-[#087e83] text-white border-[#087e83]'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      ذكر
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    مصدر المعرفة بالعيادة{' '}
                    {patientRequiredFields.referralSource ? (
                      <span className="text-rose-500">*</span>
                    ) : (
                      <span className="text-slate-400 font-normal">(اختياري)</span>
                    )}
                  </label>
                  <select
                    value={patReferral}
                    onChange={e => {
                      setPatReferral(e.target.value);
                      setPatFormError('');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:border-[#087e83] focus:outline-none"
                  >
                    <option value="">-- اختر مصدر المعرفة بالعيادة --</option>
                    {referralSources.map(src => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    حالة المتابعة <span className="text-slate-400 font-normal">(افتراضي: عميل محتمل)</span>
                  </label>
                  <ColoredSelect
                    value={patFollowUpStatus || 'عميل محتمل'}
                    onChange={val => setPatFollowUpStatus(val)}
                    options={patientFollowUpStatuses.map(st => ({
                      value: st,
                      label: st,
                      colorHex: getFollowUpStatusColorHex(st, listItemColors.followUpStatuses)
                    }))}
                    className="w-full"
                    ariaLabel="حالة المتابعة"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">تصنيفات ووسوم الحالة (Tags)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {patientTags.map(t => {
                    const isSelected = patTags.includes(t);
                    const tagColor = listItemColors.patientTags?.[t];
                    const chipStyle = tagColor
                      ? isSelected
                        ? getCustomColorActiveStyle(tagColor)
                        : getCustomColorBadgeStyle(tagColor)
                      : undefined;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setPatTags(prev => (isSelected ? prev.filter(x => x !== t) : [...prev, t]));
                        }}
                        style={chipStyle}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '} {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {patFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{patFormError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md shadow-[#087e83]/20 cursor-pointer"
              >
                حفظ وفتح ملف المريض
              </button>
            </form>
          )}

          {/* TAB 3: INVOICE */}
          {activeTab === 'invoice' && (
            <form onSubmit={handleInvoiceSubmit} noValidate className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">اختيار المريض *</label>
                <PatientSearchSelect
                  patients={visiblePatients}
                  selectedPatientId={invPatientId}
                  onSelect={p => {
                    setInvPatientId(p.id);
                    setInvFormError('');
                    window.setTimeout(() => focusProcInput(0), 20);
                  }}
                  onClear={() => setInvPatientId('')}
                  isPredetermined={isPredeterminedPatient}
                  autoFocus={!isPredeterminedPatient}
                  focusKey={`inv_${isQuickActionOpen}_${activeTab}`}
                />
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500">بنود الإجراءات والعلاج</label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = invItems.length;
                      setInvItems(prev => [
                        ...prev,
                        { procedureId: '', procedureName: '', quantity: 1, unitPrice: 0, lineTotal: 0, toothNumbers: [] }
                      ]);
                      window.setTimeout(() => focusProcInput(nextIdx), 30);
                    }}
                    className="text-[#087e83] font-bold text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> إضافة بند جديد
                  </button>
                </div>

                <div className="space-y-2">
                  {invItems.map((item, idx) => {
                    const isDropdownOpen = openProcDropdownIdx === idx;
                    const normalizedQuery = normalizeArabic(item.procedureName);
                    const matchingProcedures = !normalizedQuery
                      ? procedures
                      : procedures
                          .filter(
                            p =>
                              normalizeArabic(p.name).includes(normalizedQuery) ||
                              normalizeArabic(p.category).includes(normalizedQuery)
                          )
                          .sort((a, b) => {
                            const aStarts = normalizeArabic(a.name).startsWith(normalizedQuery) ? 0 : 1;
                            const bStarts = normalizeArabic(b.name).startsWith(normalizedQuery) ? 0 : 1;
                            return aStarts - bStarts;
                          });

                    return (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative">
                        <div className="flex items-center justify-between gap-2 relative">
                          <div className="flex-1 relative">
                            <input
                              ref={el => {
                                procInputRefs.current[idx] = el;
                              }}
                              type="text"
                              value={item.procedureName}
                              onFocus={() => {
                                if (procBlurTimerRef.current) {
                                  window.clearTimeout(procBlurTimerRef.current);
                                  procBlurTimerRef.current = null;
                                }
                                setOpenProcDropdownIdx(idx);
                              }}
                              onBlur={() => {
                                if (procBlurTimerRef.current) {
                                  window.clearTimeout(procBlurTimerRef.current);
                                }
                                procBlurTimerRef.current = window.setTimeout(() => {
                                  setOpenProcDropdownIdx(prev => (prev === idx ? null : prev));
                                  procBlurTimerRef.current = null;
                                }, 180);
                              }}
                              onChange={e => {
                                const val = e.target.value;
                                setOpenProcDropdownIdx(idx);
                                setInvFormError('');
                                const exactMatch = procedures.find(
                                  p => normalizeArabic(p.name) === normalizeArabic(val)
                                );
                                setInvItems(prev =>
                                  prev.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          procedureId: exactMatch ? exactMatch.id : `custom_${idx}`,
                                          procedureName: val,
                                          unitPrice: exactMatch ? exactMatch.defaultPrice : it.unitPrice,
                                          lineTotal: (exactMatch ? exactMatch.defaultPrice : it.unitPrice) * it.quantity
                                        }
                                      : it
                                  )
                                );
                              }}
                              placeholder="اكتب أول حرف من الإجراء أو اختر من القائمة..."
                              className="w-full pr-3 pl-14 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                            />
                            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              {item.procedureName && (
                                <button
                                  type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    setInvItems(prev =>
                                      prev.map((it, i) =>
                                        i === idx
                                          ? {
                                              ...it,
                                              procedureId: '',
                                              procedureName: '',
                                              unitPrice: 0,
                                              lineTotal: 0
                                            }
                                          : it
                                      )
                                    );
                                    focusProcInput(idx);
                                  }}
                                  className="w-5 h-5 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                                  title="مسح الإجراء"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  if (procBlurTimerRef.current) {
                                    window.clearTimeout(procBlurTimerRef.current);
                                    procBlurTimerRef.current = null;
                                  }
                                  if (isDropdownOpen) {
                                    setOpenProcDropdownIdx(null);
                                  } else {
                                    focusProcInput(idx);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-[#087e83] rounded cursor-pointer"
                                title={isDropdownOpen ? 'إخفاء الإجراءات' : 'عرض الإجراءات'}
                              >
                                <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180 text-[#087e83]' : ''}`} />
                              </button>
                            </div>
                            {isDropdownOpen && (
                              <div className="absolute right-0 left-0 top-full mt-1 z-50 max-h-48 overflow-y-auto bg-white border border-[#bfe2db] rounded-xl shadow-xl divide-y divide-slate-100">
                                {matchingProcedures.length > 0 ? (
                                  matchingProcedures.map(p => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        setInvItems(prev =>
                                          prev.map((it, i) =>
                                            i === idx
                                              ? {
                                                  ...it,
                                                  procedureId: p.id,
                                                  procedureName: p.name,
                                                  unitPrice: p.defaultPrice,
                                                  lineTotal: p.defaultPrice * it.quantity
                                                }
                                              : it
                                          )
                                        );
                                        setInvFormError('');
                                        setOpenProcDropdownIdx(null);
                                      }}
                                      className="w-full px-3 py-2 text-right hover:bg-[#e7f5f2] flex items-center justify-between text-xs font-bold text-[#172f3d] cursor-pointer"
                                    >
                                      <span>{p.name}</span>
                                      <span className="font-mono text-[11px] text-[#087e83]">{p.defaultPrice.toLocaleString()} ج.م</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2.5 text-[11px] font-semibold text-slate-500 text-center">
                                    لا توجد إجراءات مطابقة — سيتم حفظه كإجراء مخصص بالسعر المدخل
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {invItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setInvItems(prev => prev.filter((_, i) => i !== idx))}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-400 block mb-0.5">العدد / الكمية</span>
                            <div className="flex items-center border border-slate-200 bg-white rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => {
                                  const q = Math.max(1, item.quantity - 1);
                                  setInvItems(prev =>
                                    prev.map((it, i) => (i === idx ? { ...it, quantity: q, lineTotal: q * it.unitPrice } : it))
                                  );
                                }}
                                className="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 font-extrabold text-sm border-l border-slate-200 cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={e => {
                                  const q = Math.max(1, Number(e.target.value) || 1);
                                  setInvItems(prev =>
                                    prev.map((it, i) => (i === idx ? { ...it, quantity: q, lineTotal: q * it.unitPrice } : it))
                                  );
                                }}
                                className="w-full px-1 py-1 text-center text-xs font-mono font-bold focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const q = item.quantity + 1;
                                  setInvItems(prev =>
                                    prev.map((it, i) => (i === idx ? { ...it, quantity: q, lineTotal: q * it.unitPrice } : it))
                                  );
                                }}
                                className="w-7 h-7 flex items-center justify-center bg-[#e7f5f2] hover:bg-[#d5ede8] text-[#087e83] font-extrabold text-sm border-r border-slate-200 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">سعر الوحدة (ج.م)</span>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={e => {
                                const p = Number(e.target.value) || 0;
                                setInvItems(prev =>
                                  prev.map((it, i) => (i === idx ? { ...it, unitPrice: p, lineTotal: it.quantity * p } : it))
                                );
                              }}
                              className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                            />
                          </div>
                          <div className="text-left flex flex-col justify-end">
                            <span className="text-[10px] text-slate-400 block">الإجمالي</span>
                            <span className="font-bold font-mono text-xs text-[#087e83]">{item.lineTotal.toLocaleString()} ج.م</span>
                          </div>
                        </div>

                        {/* Optional Tooth Selection for Invoice Item */}
                        <div className="flex items-center justify-between gap-2 flex-wrap pt-1.5 border-t border-slate-200/70">
                          <button
                            type="button"
                            onClick={() => setInvoiceToothPickerIdx(idx)}
                            className="px-2.5 py-1 rounded-lg bg-[#e7f5f2] hover:bg-[#d5eee8] border border-[#bfe2db] text-[#087e83] font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <Activity className="w-3 h-3" />
                            <span>
                              اختيار السن {(item.toothNumbers?.length || 0) > 0 ? `(${item.toothNumbers?.length})` : '(اختياري)'}
                            </span>
                          </button>

                          {item.toothNumbers && item.toothNumbers.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {item.toothNumbers.map(code => (
                                <span
                                  key={code}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#9fd4ca] text-[10px] font-mono font-extrabold text-[#087e83]"
                                >
                                  <span>سن {code}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleToothForInvoiceItem(idx, code)}
                                    className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                    aria-label={`إزالة سن ${code}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Discount */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">نوع الخصم</label>
                  <select
                    value={invDiscountType}
                    onChange={e => setInvDiscountType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                  >
                    <option value="none">بدون خصم</option>
                    <option value="fixed">مبلغ محدد (ج.م)</option>
                    <option value="percent">نسبة مئوية (%)</option>
                  </select>
                </div>
                {invDiscountType !== 'none' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">قيمة الخصم</label>
                    <input
                      type="number"
                      value={invDiscountValue}
                      onChange={e => setInvDiscountValue(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold"
                    />
                  </div>
                )}
              </div>

              {/* Summary Calculation Box */}
              <div className="p-3.5 bg-[#e7f5f2] border border-[#bfe2db] rounded-2xl space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>المجموع الإجمالي:</span>
                  <span className="font-mono font-bold">{invSubtotal.toLocaleString()} ج.م</span>
                </div>
                {invDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-rose-600 font-semibold">
                    <span>قيمة الخصم:</span>
                    <span className="font-mono">- {invDiscountAmount.toLocaleString()} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#087e83] pt-1 border-t border-[#bfe2db]">
                  <span>صافي الفاتورة المستحق:</span>
                  <span className="font-mono text-base">{invNetTotal.toLocaleString()} ج.م</span>
                </div>
              </div>

              {invFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{invFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="submit"
                  className="py-3 px-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#087e83]/20 cursor-pointer"
                >
                  حفظ وإصدار الفاتورة
                </button>
                <button
                  type="button"
                  onClick={() => submitInvoiceAction(true)}
                  className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>حفظ و دفع</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: PAYMENT */}
          {activeTab === 'payment' && (
            <form onSubmit={handlePaymentSubmit} noValidate className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">المريض *</label>
                <PatientSearchSelect
                  patients={patients}
                  selectedPatientId={payPatientId}
                  onSelect={p => {
                    setPayPatientId(p.id);
                    setPayFormError('');
                    const patInvs = invoices.filter(
                      i => i.patientId === p.id && i.outstandingBalance > 0 && i.status !== 'voided'
                    );
                    if (patInvs.length > 0) {
                      setPayInvoiceId(patInvs[0].id);
                      setPayAmount(patInvs[0].outstandingBalance);
                      setPayAllMode(false);
                    } else {
                      setPayInvoiceId('');
                      setPayAmount('');
                      setPayAllMode(false);
                    }
                  }}
                  onClear={() => {
                    setPayPatientId('');
                    setPayInvoiceId('');
                    setPayAmount('');
                    setPayAllMode(false);
                  }}
                  isPredetermined={isPredeterminedPatient}
                  autoFocus={!isPredeterminedPatient}
                  focusKey={`pay_${isQuickActionOpen}_${activeTab}`}
                  renderBadge={p =>
                    p.outstandingBalance > 0 ? (
                      <span className="text-rose-600 font-bold">
                        متبقي: {p.outstandingBalance.toLocaleString()} ج.م
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-bold">خالص</span>
                    )
                  }
                />
              </div>

              {payPatientId && (
                <>
                  {patientUnpaidInvoices.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-slate-500">الفاتورة</label>
                        <button
                          type="button"
                          onClick={() => {
                            setPayAllMode(true);
                            setPayInvoiceId('__ALL__');
                            setPayAmount(totalUnpaidAmount);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                            payAllMode || payInvoiceId === '__ALL__'
                              ? 'bg-[#087e83] text-white border-[#087e83]'
                              : 'bg-[#e7f5f2] text-[#087e83] border-[#bfe2db] hover:bg-[#d6ede8]'
                          }`}
                        >
                          كل الفواتير ({patientUnpaidInvoices.length}) — {totalUnpaidAmount.toLocaleString()} ج.م
                        </button>
                      </div>
                      <select
                        value={payAllMode ? '__ALL__' : payInvoiceId}
                        onChange={e => {
                          if (e.target.value === '__ALL__') {
                            setPayAllMode(true);
                            setPayInvoiceId('__ALL__');
                            setPayAmount(totalUnpaidAmount);
                          } else {
                            setPayAllMode(false);
                            setPayInvoiceId(e.target.value);
                            const inv = patientUnpaidInvoices.find(i => i.id === e.target.value);
                            if (inv) setPayAmount(inv.outstandingBalance);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                      >
                        {patientUnpaidInvoices.length > 1 && (
                          <option value="__ALL__">
                            كل الفواتير المستحقة ({patientUnpaidInvoices.length}) — إجمالي {totalUnpaidAmount.toLocaleString()} ج.م
                          </option>
                        )}
                        {patientUnpaidInvoices.map(inv => {
                          const itemNames = inv.items.map(i => i.procedureName).filter(Boolean).join('، ');
                          return (
                            <option key={inv.id} value={inv.id}>
                              {itemNames || inv.invoiceNumber} · متبقي {inv.outstandingBalance.toLocaleString()} ج.م
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-2.5">
                      <span>✓ لا توجد فواتير متبقية</span>
                      {hasPermission('addInvoicesPayments') && (
                        <button
                          type="button"
                          onClick={() => {
                            setInvPatientId(payPatientId);
                            setInvFormError('');
                            setPayFormError('');
                            setActiveTab('invoice');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة فاتورة جديدة</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-500">المبلغ *</label>
                        {patientUnpaidInvoices.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (payAllMode || payInvoiceId === '__ALL__') {
                                setPayAmount(totalUnpaidAmount);
                              } else {
                                const inv = invoices.find(i => i.id === payInvoiceId);
                                if (inv) setPayAmount(inv.outstandingBalance);
                              }
                            }}
                            className="text-[10px] text-[#087e83] font-bold underline cursor-pointer"
                          >
                            كل المبلغ
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          ref={payAmountInputRef}
                          type="number"
                          value={payAmount}
                          onChange={e => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="0.00"
                          className="w-full pr-3 pl-9 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          required
                          min={1}
                        />
                        {payAmount !== '' && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayAmount('');
                              setPayFormError('');
                              payAmountInputRef.current?.focus();
                            }}
                            title="مسح المبلغ"
                            aria-label="مسح المبلغ"
                            className="w-5 h-5 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">طريقة الدفع</label>
                      <select
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                      >
                        <option value="cash">كاش</option>
                        <option value="card">بطاقة بنكية</option>
                        <option value="wallet">محفظة إلكترونية</option>
                        <option value="bank_transfer">تحويل بنكي</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">ملاحظة</label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      placeholder="اختياري..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </>
              )}

              {payFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{payFormError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md shadow-[#087e83]/20 cursor-pointer"
              >
                {payAllMode || payInvoiceId === '__ALL__' ? 'سداد كل الفواتير' : 'تسجيل الدفعة'}
              </button>
            </form>
          )}

          {/* TAB 5: EXPENSE */}
          {activeTab === 'expense' && (
            <form onSubmit={handleExpenseSubmit} noValidate className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">التصنيف *</label>
                  <select
                    value={expCategory}
                    onChange={e => {
                      const nextCat = e.target.value;
                      setExpCategory(nextCat);
                      const matched = expenseCategories.find(c => c.name === nextCat);
                      if (matched?.defaultAmount && matched.defaultAmount > 0) {
                        setExpAmount(matched.defaultAmount);
                      } else {
                        setExpAmount('');
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                  >
                    {expenseCategories.map(cat => (
                      <option key={cat.name} value={cat.name}>
                        {cat.name}
                        {cat.defaultAmount && cat.defaultAmount > 0 ? ` (${cat.defaultAmount.toLocaleString()} ج.م)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-500">المبلغ (ج.م) *</label>
                    {(() => {
                      const matched = expenseCategories.find(c => c.name === expCategory);
                      if (!matched?.defaultAmount || matched.defaultAmount <= 0) return null;
                      return (
                        <span className="text-[10px] font-bold text-[#087e83]">
                          افتراضي: {matched.defaultAmount.toLocaleString()} ج.م
                        </span>
                      );
                    })()}
                  </div>
                  <input
                    type="number"
                    value={expAmount}
                    onChange={e => setExpAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
                    required
                    min={1}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">ملاحظات الفاتورة أو المورد</label>
                <input
                  type="text"
                  value={expNotes}
                  onChange={e => setExpNotes(e.target.value)}
                  placeholder="اسم الشركة الموردة / رقم إيصال الصرف"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              {expFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{expFormError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md shadow-[#087e83]/20 cursor-pointer"
              >
                تسجيل المصروف في الدفتر
              </button>
            </form>
          )}

          {/* TAB 6: TASK */}
          {activeTab === 'task' && (
            <form onSubmit={handleTaskSubmit} noValidate className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">عنوان المهمة *</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={e => {
                    const val = e.target.value;
                    setTaskTitle(val);
                    if (!taskRecurrenceManuallySet && (isFeedbackTaskTitle(val) || isFinishedWorkTaskTitle(val))) {
                      setTaskRecurrence('daily');
                    }
                  }}
                  placeholder="مثال: تعقيم صواني الجراحة / متابعة استلام تركيبة مريم من المعمل"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={e => setTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">المسؤول عن التنفيذ</label>
                  <select
                    value={taskAssignee}
                    onChange={e => setTaskAssignee(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  >
                    {staffMembers.filter(s => !s.isDisabled).map(s => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">الأهمية</label>
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  >
                    <option value="high">عالية (ضروري)</option>
                    <option value="medium">متوسطة</option>
                    <option value="low">منخفضة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">التكرار</label>
                  <select
                    value={taskRecurrence}
                    onChange={e => {
                      setTaskRecurrence(e.target.value as any);
                      setTaskRecurrenceManuallySet(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  >
                    <option value="once">مرة واحدة</option>
                    <option value="daily">يومي</option>
                    <option value="weekly">أسبوعي</option>
                    <option value="monthly">شهري</option>
                  </select>
                </div>
              </div>

              {taskFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{taskFormError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md shadow-[#087e83]/20 cursor-pointer"
              >
                إضافة المهمة لجدول العمل
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Optional Palmer Tooth Selection Popup for Invoice Line Item */}
      {invoiceToothPickerIdx !== null && invItems[invoiceToothPickerIdx] && (
        <div
          onClick={() => setInvoiceToothPickerIdx(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-[#172f3d]">
                  اختيار السن للإجراء (اختياري)
                </h3>
                {invItems[invoiceToothPickerIdx].procedureName && (
                  <p className="text-[11px] font-bold text-[#087e83] mt-0.5">
                    {invItems[invoiceToothPickerIdx].procedureName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInvoiceToothPickerIdx(null)}
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
                    const active = Boolean(invItems[invoiceToothPickerIdx]?.toothNumbers?.includes(code));
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="upper"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForInvoiceItem(invoiceToothPickerIdx, code)}
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
                    const active = Boolean(invItems[invoiceToothPickerIdx]?.toothNumbers?.includes(code));
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="upper"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForInvoiceItem(invoiceToothPickerIdx, code)}
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
                    const active = Boolean(invItems[invoiceToothPickerIdx]?.toothNumbers?.includes(code));
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="lower"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForInvoiceItem(invoiceToothPickerIdx, code)}
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
                    const active = Boolean(invItems[invoiceToothPickerIdx]?.toothNumbers?.includes(code));
                    return (
                      <ToothIcon
                        key={code}
                        num={num}
                        arch="lower"
                        size="quadrant"
                        selected={active}
                        onClick={() => toggleToothForInvoiceItem(invoiceToothPickerIdx, code)}
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
                onClick={() => setInvoiceToothPickerIdx(null)}
                className="flex-1 py-2.5 px-4 bg-[#087e83] hover:bg-[#06686c] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                تأكيد الاختيار {(invItems[invoiceToothPickerIdx]?.toothNumbers?.length || 0) > 0 ? `(${invItems[invoiceToothPickerIdx].toothNumbers?.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetIdx = invoiceToothPickerIdx;
                  setInvItems(prev => prev.map((it, i) => (i === targetIdx ? { ...it, toothNumbers: [] } : it)));
                  setInvoiceToothPickerIdx(null);
                }}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                بدون سن (إلغاء التحديد)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
