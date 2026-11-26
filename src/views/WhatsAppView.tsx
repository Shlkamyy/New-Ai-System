import React, { useMemo, useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  MessageCircle,
  Send,
  CheckCircle,
  XCircle,
  Plus,
  Pencil,
  Check,
  Ban,
  Clock,
  Eye
} from 'lucide-react';
import {
  WhatsAppTemplate,
  WhatsAppTimingDirection,
  WhatsAppTimingUnit,
  WhatsAppTriggerEvent
} from '../types/clinic';
import {
  WHATSAPP_TIMING_DIRECTION_LABELS,
  WHATSAPP_TIMING_UNIT_LABELS,
  buildWhatsAppUrl,
  computeTimingOffsetMinutes,
  formatWhatsAppTriggerLabel,
  getPreferredPatientWhatsAppPhone,
  isPreferredWhatsAppMissing,
  parseTimingFromTemplate,
  renderWhatsAppTemplate
} from '../utils/whatsapp';
import { getTodayDateString } from '../data/mockData';
import { formatCairoTime, formatTimeToArabicPeriod, getArabicWeekdayName } from '../utils/arabic';
import { RegisterWhatsAppModal } from '../components/RegisterWhatsAppModal';

const TRIGGER_EVENT_OPTIONS: { value: WhatsAppTriggerEvent; label: string }[] = [
  { value: 'patient_created', label: 'إنشاء ملف مريض' },
  { value: 'appointment_created', label: 'إنشاء موعد' },
  { value: 'invoice_issued', label: 'إنشاء فاتورة' },
  { value: 'invoice_procedure', label: 'اختيار إجراء معين في فاتورة' },
  { value: 'payment_received', label: 'إنشاء دفعة' },
  { value: 'manual', label: 'بدون حدث' }
];

const TIMING_DIRECTION_OPTIONS: WhatsAppTimingDirection[] = ['at', 'before', 'after'];
const TIMING_UNIT_OPTIONS: WhatsAppTimingUnit[] = ['minute', 'hour', 'day', 'week', 'month'];

function normalizeEditableTrigger(trigger: WhatsAppTriggerEvent): WhatsAppTriggerEvent {
  if (trigger === 'appointment_reminder') return 'appointment_created';
  if (trigger === 'post_op_care') return 'invoice_issued';
  return trigger;
}

export const WhatsAppView: React.FC = () => {
  const {
    patients,
    whatsappAlerts,
    confirmWhatsAppAlertSent,
    markWhatsAppAlertOpened,
    dismissWhatsAppAlert,
    whatsappTemplates,
    toggleWhatsAppTemplate,
    addWhatsAppTemplate,
    updateWhatsAppTemplate,
    goToPatient,
    currentUser,
    isPatientAllowed,
    units,
    doctors,
    procedures
  } = useClinic();

  const isAdmin = currentUser.role === 'admin';

  const [activeTab, setActiveTab] = useState<'queue' | 'templates' | 'sent'>('queue');
  const effectiveTab = isAdmin ? activeTab : 'queue';

  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'dismissed'>('all');
  const [queueSort, setQueueSort] = useState<'due_asc' | 'due_desc' | 'created_asc' | 'created_desc'>('due_asc');
  const [registerWaPatientId, setRegisterWaPatientId] = useState<string | null>(null);
  const registerWaPatient = useMemo(
    () => (registerWaPatientId ? patients.find(p => p.id === registerWaPatientId) || null : null),
    [registerWaPatientId, patients]
  );

  // Shared Create / Edit Template Modal State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalTrigger, setModalTrigger] = useState<WhatsAppTriggerEvent>('appointment_created');
  const [modalDirection, setModalDirection] = useState<WhatsAppTimingDirection>('at');
  const [modalTimingValue, setModalTimingValue] = useState<number>(1);
  const [modalTimingUnit, setModalTimingUnit] = useState<WhatsAppTimingUnit>('day');
  const [modalProcedureId, setModalProcedureId] = useState<string>('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalFormError, setModalFormError] = useState('');

  // Active alerts include both pending and opened (scoped by allowed patients/branch)
  const scopedWhatsappAlerts = whatsappAlerts.filter(a => isPatientAllowed(a.patientId));
  const activeQueueAlerts = scopedWhatsappAlerts.filter(a => a.status === 'pending' || a.status === 'opened');
  const sortedActiveQueueAlerts = useMemo(() => {
    const getTimestamp = (value: string | undefined): number => {
      if (!value) return Number.NaN;
      const normalized = value.trim().replace(' ', 'T');
      const timestamp = Date.parse(normalized);
      return Number.isFinite(timestamp) ? timestamp : Number.NaN;
    };

    const isDueSort = queueSort.startsWith('due');
    const direction = queueSort.endsWith('asc') ? 1 : -1;
    return [...activeQueueAlerts].sort((a, b) => {
      const aValue = getTimestamp(isDueSort ? a.scheduledFor : a.createdAt);
      const bValue = getTimestamp(isDueSort ? b.scheduledFor : b.createdAt);
      if (Number.isNaN(aValue) && Number.isNaN(bValue)) return 0;
      if (Number.isNaN(aValue)) return 1;
      if (Number.isNaN(bValue)) return -1;
      return (aValue - bValue) * direction;
    });
  }, [activeQueueAlerts, queueSort]);
  const historyAlerts = scopedWhatsappAlerts.filter(a => {
    if (historyFilter === 'sent') return a.status === 'sent';
    if (historyFilter === 'dismissed') return a.status === 'dismissed';
    return a.status === 'sent' || a.status === 'dismissed';
  });

  const openCreateTemplateModal = () => {
    setEditingTemplateId(null);
    setModalTitle('');
    setModalTrigger('appointment_created');
    setModalDirection('at');
    setModalTimingValue(1);
    setModalTimingUnit('day');
    setModalProcedureId(procedures[0]?.id || '');
    setModalMessage('');
    setModalFormError('');
    setShowTemplateModal(true);
  };

  const openEditTemplateModal = (tmpl: WhatsAppTemplate) => {
    const parsed = parseTimingFromTemplate(tmpl);
    const normalizedTrigger = normalizeEditableTrigger(tmpl.triggerEvent);
    const matchedProc =
      (tmpl.procedureId && procedures.find(p => p.id === tmpl.procedureId)) ||
      (tmpl.procedureName && procedures.find(p => p.name === tmpl.procedureName)) ||
      procedures[0];

    setEditingTemplateId(tmpl.id);
    setModalTitle(tmpl.title);
    setModalTrigger(normalizedTrigger);
    setModalDirection(parsed.direction);
    setModalTimingValue(parsed.value);
    setModalTimingUnit(parsed.unit);
    setModalProcedureId(matchedProc?.id || '');
    setModalMessage(tmpl.messageTemplate);
    setModalFormError('');
    setShowTemplateModal(true);
  };

  const handleSaveTemplateModal = (e: React.FormEvent) => {
    e.preventDefault();
    setModalFormError('');
    if (!modalTitle.trim() || !modalMessage.trim()) {
      setModalFormError('يرجى إدخال اسم القالب ونص الرسالة');
      return;
    }

    let chosenProcId: string | undefined;
    let chosenProcName: string | undefined;
    if (modalTrigger === 'invoice_procedure') {
      const proc = procedures.find(p => p.id === modalProcedureId);
      if (!proc) {
        setModalFormError('يرجى اختيار الإجراء المطلوب لهذا القالب');
        return;
      }
      chosenProcId = proc.id;
      chosenProcName = proc.name;
    }

    const isManualTrigger = modalTrigger === 'manual';
    const timingOffsetMinutes = isManualTrigger
      ? 0
      : computeTimingOffsetMinutes(
          modalDirection,
          modalTimingValue,
          modalTimingUnit
        );

    const payload: Omit<WhatsAppTemplate, 'id'> = {
      title: modalTitle.trim(),
      triggerEvent: modalTrigger,
      timingOffsetMinutes,
      timingDirection: isManualTrigger ? 'at' : modalDirection,
      timingValue: isManualTrigger || modalDirection === 'at' ? 0 : Math.max(1, Math.round(Number(modalTimingValue) || 1)),
      timingUnit: modalTimingUnit,
      procedureId: chosenProcId,
      procedureName: chosenProcName,
      messageTemplate: modalMessage.trim(),
      isActive: editingTemplateId
        ? whatsappTemplates.find(t => t.id === editingTemplateId)?.isActive ?? true
        : true
    };

    if (editingTemplateId) {
      updateWhatsAppTemplate(editingTemplateId, payload);
    } else {
      addWhatsAppTemplate(payload);
    }
    setShowTemplateModal(false);
    setEditingTemplateId(null);
  };

  const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
    { key: 'patient_name', label: 'اسم المريض' },
    { key: 'clinic_name', label: 'اسم العيادة' },
    { key: 'clinic_address', label: 'عنوان العيادة' },
    { key: 'unit_name', label: 'الفرع / الوحدة' },
    { key: 'day_name', label: 'اسم اليوم' },
    { key: 'date', label: 'التاريخ' },
    { key: 'time', label: 'الساعة' },
    { key: 'doctor_name', label: 'اسم الطبيب' },
    { key: 'procedure', label: 'الإجراء' },
    { key: 'amount', label: 'المبلغ' },
    { key: 'balance', label: 'المتبقي' },
    { key: 'invoice_number', label: 'رقم الفاتورة' }
  ];

  const insertVariable = (variable: string) => {
    setModalMessage(prev => (prev ? `${prev} {{${variable}}}` : `{{${variable}}}`));
  };

  const previewRenderedMessage = useMemo(() => {
    const activeUnit = units.find(u => !u.isDisabled) || units[0];
    const activeDoctor = doctors.find(d => !d.isDisabled) || doctors[0];
    const selectedProc =
      modalTrigger === 'invoice_procedure'
        ? procedures.find(p => p.id === modalProcedureId)
        : procedures[0];
    const todayStr = getTodayDateString();

    return renderWhatsAppTemplate(
      modalMessage,
      {
        patientName: 'أحمد محمد علي',
        unitId: activeUnit?.id,
        unitName: activeUnit?.name || 'عيادة ١',
        date: todayStr,
        dayName: getArabicWeekdayName(todayStr),
        time: formatTimeToArabicPeriod('17:30'),
        doctorName: activeDoctor?.name || 'د. محمد شلقامي',
        procedure: selectedProc?.name || 'حشو عصب',
        amount: selectedProc?.defaultPrice ?? 1500,
        balance: 500,
        invoiceNumber: 'INV-2026-001'
      },
      units
    );
  }, [modalMessage, modalTrigger, modalProcedureId, units, doctors, procedures]);

  const modalTriggerPreviewLabel = useMemo(() => {
    const selectedProc = procedures.find(p => p.id === modalProcedureId);
    return formatWhatsAppTriggerLabel({
      id: 'preview',
      title: modalTitle,
      triggerEvent: modalTrigger,
      timingOffsetMinutes: computeTimingOffsetMinutes(modalDirection, modalTimingValue, modalTimingUnit),
      timingDirection: modalDirection,
      timingValue: modalTimingValue,
      timingUnit: modalTimingUnit,
      procedureId: selectedProc?.id,
      procedureName: selectedProc?.name,
      messageTemplate: modalMessage,
      isActive: true
    });
  }, [modalTitle, modalTrigger, modalDirection, modalTimingValue, modalTimingUnit, modalProcedureId, modalMessage, procedures]);

  const handleOpenWhatsAppOnly = (alertId: string, phone: string, message: string) => {
    const waUrl = buildWhatsAppUrl(phone, message);
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    markWhatsAppAlertOpened(alertId);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d] flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-emerald-600" />
            <span>تنبيهات واتساب</span>
            {!isAdmin && activeQueueAlerts.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs bg-rose-500 text-white font-bold">
                {activeQueueAlerts.length} نشط
              </span>
            )}
          </h1>

          {isAdmin && effectiveTab === 'templates' && (
            <button
              type="button"
              onClick={openCreateTemplateModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قالب رسالة جديد</span>
            </button>
          )}
        </div>

        {/* Navigation Tabs: Admin sees all 3 tabs; Staff sees active alerts only */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 p-1 bg-[#edf4f5] rounded-2xl w-full sm:w-auto overflow-x-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                effectiveTab === 'queue' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              <span>التنبيهات النشطة</span>
              {activeQueueAlerts.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${effectiveTab === 'queue' ? 'bg-white text-emerald-700' : 'bg-rose-500 text-white'}`}>
                  {activeQueueAlerts.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                effectiveTab === 'templates' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              قوالب الرسائل ({whatsappTemplates.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sent')}
              className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                effectiveTab === 'sent' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              سجل التنبيهات ({scopedWhatsappAlerts.filter(a => a.status === 'sent' || a.status === 'dismissed').length})
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: PENDING & OPENED ALERTS QUEUE */}
      {effectiveTab === 'queue' && (
        <div className="space-y-3">
          {activeQueueAlerts.length > 0 && (
            <div className="flex items-center justify-between gap-2 flex-wrap px-1">
              <label htmlFor="whatsapp-alert-sort" className="text-xs font-extrabold text-slate-600">
                ترتيب التنبيهات
              </label>
              <select
                id="whatsapp-alert-sort"
                value={queueSort}
                onChange={e => setQueueSort(e.target.value as typeof queueSort)}
                className="max-w-full px-3 py-2 rounded-xl bg-white border border-[#dce8eb] text-xs font-bold text-[#172f3d] shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="due_asc">تاريخ الاستحقاق — الأقدم أولاً</option>
                <option value="due_desc">تاريخ الاستحقاق — الأحدث أولاً</option>
                <option value="created_asc">تاريخ الإنشاء — الأقدم أولاً</option>
                <option value="created_desc">تاريخ الإنشاء — الأحدث أولاً</option>
              </select>
            </div>
          )}
          {activeQueueAlerts.length > 0 ? (
            sortedActiveQueueAlerts.map(alert => {
              const isOpened = alert.status === 'opened';
              const patient = patients.find(p => p.id === alert.patientId);
              const targetWaPhone = getPreferredPatientWhatsAppPhone(patient) || alert.patientPhone;
              const isWaMissing = isPreferredWhatsAppMissing(patient, targetWaPhone);
              return (
                <div
                  key={alert.id}
                  className="p-5 rounded-3xl bg-white border border-[#dce8eb] shadow-sm hover:border-emerald-300 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => goToPatient(alert.patientId)}
                        className="font-extrabold text-sm text-[#172f3d] hover:text-[#087e83] hover:underline cursor-pointer"
                      >
                        {alert.patientName}
                      </button>
                      <span className="text-slate-400 font-mono text-xs" dir="ltr">
                        ({targetWaPhone})
                      </span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                        {alert.templateTitle}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isOpened
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {isOpened ? 'تم فتح واتساب (بانتظار التأكيد)' : 'معلق'}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      الاستحقاق: {alert.scheduledFor}
                    </span>
                  </div>

                  {/* Message preview text */}
                  <div className="p-3.5 bg-[#f6faf8] border border-[#d8ebe3] rounded-2xl text-xs sm:text-sm text-slate-700 leading-relaxed font-sans whitespace-pre-wrap select-text">
                    {alert.renderedMessage}
                  </div>

                  {/* Actions: Send button always prominent on top; secondary controls below */}
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleOpenWhatsAppOnly(alert.id, targetWaPhone, alert.renderedMessage)}
                        className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
                          isWaMissing
                            ? 'bg-slate-200 hover:bg-slate-300 text-slate-600 opacity-65 border border-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>إرسال عبر واتساب</span>
                      </button>

                      {isWaMissing && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl">
                          <span>لا يوجد واتساب على هذا الرقم</span>
                          {patient && (
                            <button
                              type="button"
                              onClick={() => setRegisterWaPatientId(patient.id)}
                              className="text-[#087e83] underline hover:text-[#06686c] cursor-pointer"
                            >
                              (تسجيل رقم واتساب)
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => dismissWhatsAppAlert(alert.id)}
                        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>تجاهل وإلغاء</span>
                      </button>

                      {isOpened && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => dismissWhatsAppAlert(alert.id, true)}
                            className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>لا يوجد واتساب</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => confirmWhatsAppAlertSent(alert.id)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>تأكيد الإرسال</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="font-extrabold text-slate-700 text-base">لا توجد رسائل معلقة حالياً</p>
              <p className="text-xs text-slate-400">
                يتم توليد التنبيهات تلقائياً عند حجز مواعيد جديدة أو إصدار فواتير وسندات قبض
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEMPLATES MANAGEMENT (Admin only) */}
      {isAdmin && effectiveTab === 'templates' && (
        <div className="space-y-3">
          {whatsappTemplates.map(tmpl => (
            <div
              key={tmpl.id}
              className="p-5 rounded-3xl bg-white border border-[#dce8eb] shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-sm text-[#172f3d]">{tmpl.title}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tmpl.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {tmpl.isActive ? 'مفعل' : 'معطل'}
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatWhatsAppTriggerLabel(tmpl)}</span>
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEditTemplateModal(tmpl)}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>تعديل القالب</span>
                  </button>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tmpl.isActive}
                      onChange={() => toggleWhatsAppTemplate(tmpl.id)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    <span>تفعيل</span>
                  </label>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-wrap">
                {tmpl.messageTemplate}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: SENT & DISMISSED ALERTS HISTORY (Admin only) */}
      {isAdmin && effectiveTab === 'sent' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'sent', label: 'مرسلة (Sent)' },
                { id: 'dismissed', label: 'متجاهلة (Dismissed)' }
              ] as const
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  historyFilter === f.id
                    ? 'bg-[#087e83] text-white border-[#087e83]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {historyAlerts.length > 0 ? (
            historyAlerts.map(alert => (
              <div
                key={alert.id}
                className="p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm text-slate-800">{alert.patientName}</span>
                    <span className="text-xs text-slate-400 font-mono" dir="ltr">({alert.patientPhone})</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                      {alert.templateTitle}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1">{alert.renderedMessage}</p>
                </div>

                {alert.status === 'sent' ? (
                  <div className="text-left font-mono text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    <span>تم الإرسال</span>
                  </div>
                ) : alert.sentAt === 'no_whatsapp' ? (
                  <div className="text-left font-mono text-xs text-rose-600 font-bold flex items-center gap-1.5">
                    <Ban className="w-4 h-4" />
                    <span>لا يوجد واتساب</span>
                  </div>
                ) : (
                  <div className="text-left font-mono text-xs text-rose-500 font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    <span>تم التجاهل</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
              لا توجد رسائل مطابقة في السجل
            </div>
          )}
        </div>
      )}

      {/* Unified Create / Edit Template Modal (Admin only) */}
      {isAdmin && showTemplateModal && (
        <div
          onClick={() => setShowTemplateModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">
                {editingTemplateId ? 'تعديل قالب رسالة واتساب' : 'إنشاء قالب رسالة واتساب مخصص'}
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplateModal} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">اسم القالب *</label>
                <input
                  type="text"
                  value={modalTitle}
                  onChange={e => setModalTitle(e.target.value)}
                  placeholder="مثال: تهنئة بمناسبة انتهاء علاج التقويم"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold"
                  required
                />
              </div>

              {/* Structured Trigger Builder: (1) الحدث -> (2) قبل/بعد/عند -> (3) عدد -> (4) دقيقة/ساعة/يوم/أسبوع/شهر */}
              <div className="p-3.5 rounded-2xl bg-[#f4faf9] border border-[#cde6e1] space-y-2.5">
                <label className="block text-[11px] font-extrabold text-[#087e83]">
                  حدث وتوقيت الإطلاق التلقائي
                </label>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">1. الحدث</label>
                  <select
                    value={modalTrigger}
                    onChange={e => {
                      const nextTrigger = e.target.value as WhatsAppTriggerEvent;
                      setModalTrigger(nextTrigger);
                      if (nextTrigger === 'invoice_procedure' && !modalProcedureId && procedures.length > 0) {
                        setModalProcedureId(procedures[0].id);
                      }
                      setModalFormError('');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold"
                  >
                    {TRIGGER_EVENT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {modalTrigger === 'invoice_procedure' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      الإجراء المستهدف في الفاتورة *
                    </label>
                    <select
                      value={modalProcedureId}
                      onChange={e => {
                        setModalProcedureId(e.target.value);
                        setModalFormError('');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-[#bfe2db] bg-white font-semibold"
                      required
                    >
                      {procedures.length === 0 ? (
                        <option value="">لا توجد إجراءات مسجلة</option>
                      ) : (
                        procedures.map(proc => (
                          <option key={proc.id} value={proc.id}>
                            {proc.name} ({proc.defaultPrice} ج.م)
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">2. التوقيت</label>
                    <select
                      disabled={modalTrigger === 'manual'}
                      value={modalDirection}
                      onChange={e => setModalDirection(e.target.value as WhatsAppTimingDirection)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {TIMING_DIRECTION_OPTIONS.map(dir => (
                        <option key={dir} value={dir}>
                          {WHATSAPP_TIMING_DIRECTION_LABELS[dir]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">3. العدد</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      disabled={modalTrigger === 'manual' || modalDirection === 'at'}
                      value={modalTrigger === 'manual' || modalDirection === 'at' ? 0 : modalTimingValue}
                      onChange={e => setModalTimingValue(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono font-bold disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">4. الوحدة</label>
                    <select
                      disabled={modalTrigger === 'manual' || modalDirection === 'at'}
                      value={modalTimingUnit}
                      onChange={e => setModalTimingUnit(e.target.value as WhatsAppTimingUnit)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {TIMING_UNIT_OPTIONS.map(u => (
                        <option key={u} value={u}>
                          {WHATSAPP_TIMING_UNIT_LABELS[u]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {modalTrigger === 'manual' && (
                  <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5">
                    قالب مخصص للإرسال اليدوي فقط (مثل رسائل الفيدباك أو المتابعة) — لا يولّد تنبيهات تلقائية عند الأحداث.
                  </p>
                )}

                <div className="text-[11px] font-bold text-[#087e83] bg-white px-3 py-1.5 rounded-xl border border-[#d6ece7] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>القاعدة: {modalTriggerPreviewLabel}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  المتغيرات المتاحة للإدراج داخل نص الرسالة (عنوان العيادة من وصف الفرع في الإعدادات):
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TEMPLATE_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      title={v.label}
                      className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100 cursor-pointer flex items-center gap-1"
                    >
                      <span className="font-mono">+{`{{${v.key}}}`}</span>
                      <span className="text-[9px] text-emerald-700/80">({v.label})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">نص الرسالة *</label>
                <textarea
                  value={modalMessage}
                  onChange={e => setModalMessage(e.target.value)}
                  placeholder="اكتب نص الرسالة هنا، وسيتم استبدال المتغيرات تلقائياً ببيانات كل مريض..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs leading-relaxed min-h-[110px]"
                  required
                />
              </div>

              {/* Live Message Preview with Clinic Default Info */}
              <div className="p-3.5 rounded-2xl bg-[#f6faf8] border border-[#cce7dc] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة الرسالة (ببيانات افتراضية من العيادة)</span>
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-[#e1efe9] text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {previewRenderedMessage.trim()
                    ? previewRenderedMessage
                    : 'ستظهر معاينة الرسالة هنا بمجرد كتابة نص الرسالة...'}
                </div>
              </div>

              {modalFormError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                  {modalFormError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold cursor-pointer"
              >
                {editingTemplateId ? 'حفظ تعديلات القالب' : 'حفظ وإضافة القالب'}
              </button>
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
