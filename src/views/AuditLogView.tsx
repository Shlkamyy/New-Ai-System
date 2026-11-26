import React, { useMemo, useState } from 'react';
import { ActiveView, STAFF_ROLE_LABELS, useClinic } from '../context/ClinicContext';
import {
  Trash2,
  RotateCcw,
  ExternalLink,
  Search,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut,
  UserCheck,
  Calendar
} from 'lucide-react';
import { formatCairoTime, formatRelativeTimeArabic, getCairoNowParts, getRelativeTimeBadgeClass, matchArabicTerms } from '../utils/arabic';
import { AuditLogEntry, StaffRole } from '../types/clinic';

const FIELD_LABELS_AR: Record<string, string> = {
  name: 'الاسم',
  patientName: 'اسم المريض',
  phone: 'الهاتف',
  secondaryPhone: 'هاتف إضافي',
  age: 'السن',
  gender: 'النوع',
  followUpStatus: 'حالة المتابعة',
  tags: 'التاجات',
  palmerTeeth: 'الأسنان المحددة',
  notes: 'الملاحظات',
  date: 'التاريخ',
  time: 'الوقت',
  durationMinutes: 'المدة (دقيقة)',
  status: 'الحالة',
  unitName: 'الوحدة / الفرع',
  doctorName: 'الطبيب',
  procedureType: 'الإجراء',
  cancellationReason: 'سبب الإلغاء',
  netTotal: 'الصافي',
  subtotal: 'الإجمالي',
  discountAmount: 'الخصم',
  paidAmount: 'المدفوع',
  outstandingBalance: 'المتبقي',
  amount: 'المبلغ',
  paymentMethod: 'طريقة الدفع',
  title: 'العنوان',
  category: 'التصنيف',
  dueDate: 'تاريخ الاستحقاق',
  assignedTo: 'المسؤول',
  priority: 'الأولوية',
  isCompleted: 'مكتمل',
  defaultPrice: 'السعر الافتراضي',
  clockIn: 'وقت الدخول',
  clockOut: 'وقت الخروج',
  manualReason: 'السبب / الملاحظة',
  jobTitle: 'المسمى الوظيفي',
  role: 'الدور',
  isDisabled: 'معطّل',
  isClosed: 'مغلق',
  startHour: 'ساعة البداية',
  endHour: 'ساعة النهاية',
  chairCount: 'عدد الكراسي',
  latitude: 'خط العرض',
  longitude: 'خط الطول',
  allowedRadiusMeters: 'نطاق الحضور (متر)',
  distanceMeters: 'المسافة الفعلية (متر)'
};

const HIDDEN_DIFF_KEYS = new Set([
  'id',
  'createdAt',
  'audioDataUrl',
  'password',
  'recoveryPin'
]);

function formatDiffValue(val: unknown): string {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
  if (Array.isArray(val)) {
    if (val.length === 0) return 'لا يوجد';
    if (typeof val[0] === 'object' && val[0] !== null) {
      return `${val.length} عنصر`;
    }
    return val.join('، ');
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return '—';
    return entries
      .slice(0, 4)
      .map(([k, v]) => `${FIELD_LABELS_AR[k] || k}: ${String(v)}`)
      .join(' | ');
  }
  const str = String(val);
  return str.length > 90 ? `${str.slice(0, 90)}…` : str;
}

function buildFieldDiffs(prevObj?: Record<string, unknown>, newObj?: Record<string, unknown>) {
  const keys = new Set<string>([
    ...(prevObj ? Object.keys(prevObj) : []),
    ...(newObj ? Object.keys(newObj) : [])
  ]);
  const rows: Array<{ key: string; label: string; before: string; after: string; changed: boolean }> = [];
  keys.forEach(key => {
    if (HIDDEN_DIFF_KEYS.has(key)) return;
    const beforeRaw = prevObj?.[key];
    const afterRaw = newObj?.[key];
    const before = formatDiffValue(beforeRaw);
    const after = formatDiffValue(afterRaw);
    const changed = JSON.stringify(beforeRaw) !== JSON.stringify(afterRaw);
    if (!prevObj || !newObj || changed) {
      rows.push({
        key,
        label: FIELD_LABELS_AR[key] || key,
        before,
        after,
        changed
      });
    }
  });
  return rows;
}

export const AuditLogView: React.FC = () => {
  const {
    auditLogs,
    deleteAuditLogEntry,
    clearAuditLogs,
    revertAuditLogEntry,
    currentUser,
    staffMembers,
    setActiveView,
    goToPatient
  } = useClinic();

  const [activeTab, setActiveTab] = useState<'changes' | 'logins'>('changes');
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [loginDateFilter, setLoginDateFilter] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [revertFeedback, setRevertFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [visibleLogsCount, setVisibleLogsCount] = useState(50);
  const [visibleLoginsCount, setVisibleLoginsCount] = useState(50);

  const isStaffLoginLog = (log: AuditLogEntry) => {
    if (log.entityType !== 'staff') return false;
    const ev = (log.newData as { eventType?: string } | undefined)?.eventType || (log.previousData as { eventType?: string } | undefined)?.eventType;
    if (ev === 'login' || ev === 'session_open' || ev === 'logout') return true;
    return (
      Boolean(log.description?.startsWith('تسجيل دخول')) ||
      Boolean(log.description?.startsWith('فتح حساب')) ||
      Boolean(log.description?.startsWith('تسجيل خروج'))
    );
  };

  const isDeletedLog = (log: AuditLogEntry) =>
    log.action === 'delete' ||
    (log.action === 'status_change' &&
      (log.description?.startsWith('إلغاء فاتورة') || log.description?.startsWith('إلغاء سند قبض')));

  const staffFilterOptions = useMemo(() => {
    const countsById = new Map<string, number>();
    const countsByName = new Map<string, number>();
    auditLogs.forEach(log => {
      if (log.userId) countsById.set(log.userId, (countsById.get(log.userId) || 0) + 1);
      const name = (log.userName || '').trim();
      if (name) {
        countsByName.set(name, (countsByName.get(name) || 0) + 1);
      }
    });

    const seenNames = new Set<string>();
    const options: Array<{ key: string; id?: string; name: string; count: number }> = [];

    staffMembers.forEach(staff => {
      const name = (staff.name || '').trim();
      if (!name || seenNames.has(name)) return;
      seenNames.add(name);
      const count = auditLogs.filter(
        log => log.userId === staff.id || (log.userName || '').trim() === name
      ).length;
      options.push({ key: staff.id, id: staff.id, name, count });
    });

    countsByName.forEach((count, name) => {
      if (seenNames.has(name)) return;
      seenNames.add(name);
      options.push({ key: `hist_${name}`, name, count });
    });

    return options;
  }, [auditLogs, staffMembers]);

  const loginLogs = useMemo(() => auditLogs.filter(isStaffLoginLog), [auditLogs]);

  const loginCountByOptionKey = useMemo(() => {
    const map = new Map<string, number>();
    staffFilterOptions.forEach(opt => {
      const count = loginLogs.filter(
        l => (opt.id ? l.userId === opt.id : false) || (l.userName || '').trim() === opt.name
      ).length;
      map.set(opt.key, count);
    });
    return map;
  }, [staffFilterOptions, loginLogs]);

  const filteredLoginLogs = useMemo(() => {
    const matchedStaff = staffFilter !== 'all' ? staffMembers.find(s => s.name === staffFilter) : undefined;
    const q = searchQuery.trim();
    return loginLogs.filter(log => {
      if (staffFilter !== 'all') {
        const matchById = matchedStaff ? log.userId === matchedStaff.id : false;
        const matchByName = (log.userName || '').trim() === staffFilter || (log.entityName || '').trim() === staffFilter;
        if (!matchById && !matchByName) return false;
      }
      if (loginDateFilter) {
        const cairoDate = getCairoNowParts(new Date(log.timestamp)).dateStr;
        if (cairoDate !== loginDateFilter) return false;
      }
      if (q) {
        const matchName = matchArabicTerms(log.entityName || '', q);
        const matchDesc = matchArabicTerms(log.description || '', q);
        const matchUser = matchArabicTerms(log.userName || '', q);
        if (!matchName && !matchDesc && !matchUser) return false;
      }
      return true;
    });
  }, [loginLogs, staffFilter, staffMembers, loginDateFilter, searchQuery]);

  const deletedCount = useMemo(() => auditLogs.filter(isDeletedLog).length, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const matchedStaff = staffFilter !== 'all' ? staffMembers.find(s => s.name === staffFilter) : undefined;
    const q = searchQuery.trim();
    return auditLogs.filter(log => {
      if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
      if (actionFilter === 'delete' && !isDeletedLog(log)) return false;
      if (actionFilter !== 'all' && actionFilter !== 'delete' && log.action !== actionFilter) return false;
      if (staffFilter !== 'all') {
        const matchById = matchedStaff ? log.userId === matchedStaff.id : false;
        const matchByName = (log.userName || '').trim() === staffFilter;
        if (!matchById && !matchByName) return false;
      }
      if (q) {
        const matchName = matchArabicTerms(log.entityName || '', q);
        const matchDesc = matchArabicTerms(log.description || '', q);
        const matchUser = matchArabicTerms(log.userName || '', q);
        if (!matchName && !matchDesc && !matchUser) return false;
      }
      return true;
    });
  }, [auditLogs, entityFilter, actionFilter, staffFilter, staffMembers, searchQuery]);

  const visibleLogs = useMemo(() => filteredLogs.slice(0, visibleLogsCount), [filteredLogs, visibleLogsCount]);
  const visibleLoginLogs = useMemo(() => filteredLoginLogs.slice(0, visibleLoginsCount), [filteredLoginLogs, visibleLoginsCount]);

  if (currentUser.role !== 'admin') {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-base font-extrabold text-[#172f3d]">غير مسموح بالوصول</h2>
        <p className="text-xs text-slate-500">سجل التغييرات (Audit Log) متاح لمدير النظام فقط.</p>
      </div>
    );
  }

  const getLoginEventMeta = (log: AuditLogEntry) => {
    const ev = (log.newData as { eventType?: string } | undefined)?.eventType || (log.previousData as { eventType?: string } | undefined)?.eventType;
    if (ev === 'logout' || log.description?.startsWith('تسجيل خروج')) {
      return {
        kind: 'logout' as const,
        label: 'تسجيل خروج',
        badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
        Icon: LogOut
      };
    }
    if (ev === 'session_open' || log.description?.startsWith('فتح حساب')) {
      return {
        kind: 'session_open' as const,
        label: 'فتح الحساب',
        badgeClass: 'bg-teal-50 text-[#087e83] border border-[#bfe2db]',
        Icon: UserCheck
      };
    }
    return {
      kind: 'login' as const,
      label: 'تسجيل دخول',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      Icon: LogIn
    };
  };

  const actionLabels: Record<string, { label: string; bg: string; text: string }> = {
    add: { label: 'إضافة جديد', bg: 'bg-emerald-100', text: 'text-emerald-800' },
    update: { label: 'تعديل', bg: 'bg-blue-100', text: 'text-blue-800' },
    delete: { label: 'تم الحذف', bg: 'bg-rose-100 border border-rose-200', text: 'text-rose-800' },
    status_change: { label: 'تغيير حالة', bg: 'bg-amber-100', text: 'text-amber-800' }
  };

  const entityTypeLabels: Record<string, string> = {
    patient: 'مريض',
    appointment: 'موعد',
    invoice: 'فاتورة',
    payment: 'دفعة',
    expense: 'مصروف',
    task: 'مهمة',
    procedure: 'إجراء',
    staff: 'موظف',
    setting: 'إعدادات',
    attendance: 'الشفتات والحضور'
  };

  const handleNavigateToTarget = (log: AuditLogEntry) => {
    if (log.targetView === 'patient_detail' && log.targetId) {
      goToPatient(log.targetId);
      return;
    }
    if (log.entityType === 'patient' && log.entityId) {
      goToPatient(log.entityId);
      return;
    }
    if (log.targetView) {
      setActiveView(log.targetView as ActiveView);
      return;
    }
    const fallbackMap: Record<AuditLogEntry['entityType'], ActiveView> = {
      patient: 'patients',
      appointment: 'appointments',
      invoice: 'invoices',
      payment: 'payments',
      expense: 'expenses',
      task: 'tasks',
      procedure: 'procedures',
      staff: 'settings',
      setting: 'settings',
      attendance: 'attendance'
    };
    setActiveView(fallbackMap[log.entityType] || 'dashboard');
  };

  const handleRevert = (logId: string) => {
    const res = revertAuditLogEntry(logId);
    setRevertFeedback(res);
    setTimeout(() => setRevertFeedback(null), 4000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header & Stats */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              {activeTab === 'logins'
                ? 'سجل دخول الموظفين وفتح الحسابات'
                : 'سجل التغييرات والعمليات (Audit Log)'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTab === 'logins'
                ? 'معرفة أوقات تسجيل الدخول وفتح الحساب لكل موظف باليوم والساعة.'
                : 'تتبع جميع التعديلات والإضافات التي تتم في النظام ومن قام بتنفيذها مع إمكانية المراجعة والانتقال والاسترجاع.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab(prev => (prev === 'logins' ? 'changes' : 'logins'))}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border ${
                activeTab === 'logins'
                  ? 'bg-[#087e83] text-white border-[#087e83] shadow-xs'
                  : 'bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border-[#bfe2db]'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>سجل الدخول</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'logins' ? 'bg-white/20 text-white' : 'bg-white text-[#087e83]'
                }`}
              >
                {loginLogs.length}
              </span>
            </button>

            {activeTab === 'logins' && (
              <button
                type="button"
                onClick={() => setActiveTab('changes')}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#172f3d] font-bold text-xs cursor-pointer transition-colors"
              >
                العودة لسجل التغييرات
              </button>
            )}

            {activeTab === 'changes' && auditLogs.length > 0 && (
              confirmClearAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-700">تأكيد مسح السجل؟</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearAuditLogs();
                      setConfirmClearAll(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
                  >
                    نعم، مسح الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>مسح السجل بالكامل</span>
                </button>
              )
            )}
          </div>
        </div>

        {revertFeedback && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
              revertFeedback.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {revertFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{revertFeedback.message}</span>
          </div>
        )}

        {/* Filters */}
        {activeTab === 'logins' ? (
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 pt-2 border-t border-slate-100">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم الموظف..."
                className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
              />
            </div>

            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              aria-label="فلترة حسب الموظف"
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
            >
              <option value="all">جميع الموظفين ({loginLogs.length})</option>
              {staffFilterOptions.map(opt => (
                <option key={opt.key} value={opt.name}>
                  {opt.name} ({loginCountByOptionKey.get(opt.key) || 0})
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-[#087e83] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={loginDateFilter}
                  onChange={e => setLoginDateFilter(e.target.value)}
                  aria-label="فلترة حسب التاريخ"
                  className="pr-8 pl-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
                />
              </div>
              {loginDateFilter && (
                <button
                  type="button"
                  onClick={() => setLoginDateFilter('')}
                  className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  كل الأيام
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 pt-2 border-t border-slate-100">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم العنصر، الوصف، أو اسم المستخدم..."
                className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
              />
            </div>

            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              aria-label="فلترة حسب الموظف"
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
            >
              <option value="all">جميع الموظفين ({auditLogs.length})</option>
              {staffFilterOptions.map(opt => (
                <option key={opt.key} value={opt.name}>
                  {opt.name} ({opt.count})
                </option>
              ))}
            </select>

            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
            >
              <option value="all">جميع العمليات</option>
              <option value="delete">المحذوفات فقط ({deletedCount})</option>
              <option value="add">الإضافات فقط</option>
              <option value="update">التعديلات فقط</option>
              <option value="status_change">تغييرات الحالة</option>
            </select>

            <button
              type="button"
              onClick={() => setActionFilter(prev => (prev === 'delete' ? 'all' : 'delete'))}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                actionFilter === 'delete'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>المحذوفات ({deletedCount})</span>
            </button>

            <select
              value={entityFilter}
              onChange={e => setEntityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
            >
              <option value="all">جميع أنواع العناصر</option>
              <option value="patient">مرضى</option>
              <option value="appointment">مواعيد</option>
              <option value="invoice">فواتير</option>
              <option value="payment">مدفوعات</option>
              <option value="expense">مصروفات</option>
              <option value="task">مهام</option>
              <option value="procedure">إجراءات</option>
              <option value="attendance">الشفتات والحضور</option>
              <option value="staff">موظفين</option>
              <option value="setting">إعدادات</option>
            </select>
          </div>
        )}
      </div>

      {/* Logs List */}
      {activeTab === 'logins' ? (
        <div className="space-y-2.5">
          {visibleLoginLogs.length > 0 ? (
            visibleLoginLogs.map(log => {
              const meta = getLoginEventMeta(log);
              const EventIcon = meta.Icon;
              const cairo = getCairoNowParts(new Date(log.timestamp));
              const relTime = formatRelativeTimeArabic(log.timestamp);
              const relBadge = getRelativeTimeBadgeClass(log.timestamp);
              const staffMember = staffMembers.find(
                s => s.id === log.userId || s.id === log.entityId || s.name === log.userName
              );
              const rawRole =
                ((log.newData as { role?: string } | undefined)?.role ||
                  (log.previousData as { role?: string } | undefined)?.role ||
                  staffMember?.role) as StaffRole | undefined;
              const roleLabel = (rawRole && STAFF_ROLE_LABELS[rawRole]) || staffMember?.jobTitle || '';

              return (
                <div
                  key={log.id}
                  className="p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                        meta.kind === 'logout'
                          ? 'bg-slate-100 text-slate-600'
                          : meta.kind === 'session_open'
                          ? 'bg-teal-50 text-[#087e83]'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      <EventIcon className="w-5 h-5" />
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-[#172f3d]">
                          {log.entityName || log.userName}
                        </span>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                        {roleLabel && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                            {roleLabel}
                          </span>
                        )}
                        {relTime && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${relBadge}`}>
                            {relTime}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600">{log.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-right sm:text-left font-mono">
                      <div className="text-xs font-extrabold text-[#087e83]">
                        {formatCairoTime(cairo.timeStr)}
                      </div>
                      <div className="text-[11px] text-slate-500">{cairo.dateStr}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteAuditLogEntry(log.id)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer"
                      title="حذف هذا السجل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-1.5">
              <LogIn className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-500">لا توجد سجلات دخول مطابقة حتى الآن</p>
              <p className="text-[11px] text-slate-400">
                سيظهر هنا تلقائياً توقيت دخول كل موظف أو فتح حسابه.
              </p>
            </div>
          )}
          {filteredLoginLogs.length > visibleLoginsCount && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleLoginsCount(prev => prev + 50)}
                className="px-5 py-2.5 rounded-2xl bg-[#e7f5f2] hover:bg-[#d6ede8] border border-[#bfe2db] text-[#087e83] text-xs font-extrabold cursor-pointer transition-colors"
              >
                عرض المزيد ({(filteredLoginLogs.length - visibleLoginsCount).toLocaleString('ar-EG')} متبقي)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleLogs.length > 0 ? (
            visibleLogs.map(log => {
              const deletedEntry = isDeletedLog(log);
              const effectiveAction = deletedEntry ? 'delete' : log.action;
              const act = actionLabels[effectiveAction] || { label: log.action, bg: 'bg-slate-100', text: 'text-slate-700' };
              const relTime = formatRelativeTimeArabic(log.timestamp);
              const relBadge = getRelativeTimeBadgeClass(log.timestamp);
              const cairo = getCairoNowParts(new Date(log.timestamp));
              const canRevert = !log.reverted && (log.action === 'add' || Boolean(log.previousData));

              return (
                <div
                  key={log.id}
                  className={`p-4 rounded-3xl bg-white border shadow-sm hover:border-[#087e83] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    deletedEntry ? 'border-rose-200 border-r-4 border-r-rose-500 bg-rose-50/15' : 'border-[#dce8eb]'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${act.bg} ${act.text}`}>
                        {act.label}
                      </span>
                      <span className="text-xs font-extrabold text-[#172f3d]">
                        [{entityTypeLabels[log.entityType] || log.entityType}] {log.entityName}
                      </span>
                      <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                        المستخدم: {log.userName}
                      </span>
                      {log.reverted && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>تم الاسترجاع ✓</span>
                        </span>
                      )}
                      {relTime && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${relBadge}`}>
                          {relTime}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600">
                      {log.description}
                    </p>

                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-3">
                      <span>{formatCairoTime(cairo.timeStr)} — {cairo.dateStr}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      تفاصيل التغيير
                    </button>

                    <button
                      type="button"
                      onClick={() => handleNavigateToTarget(log)}
                      className="px-3 py-1.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d6eede] text-[#087e83] text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>الانتقال للصفحة</span>
                    </button>

                    {canRevert && (
                      <button
                        type="button"
                        onClick={() => handleRevert(log.id)}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>إرجاع للحالة السابقة</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => deleteAuditLogEntry(log.id)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer"
                      title="حذف هذا السجل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
              لا توجد سجلات تغييرات مطابقة
            </div>
          )}
          {filteredLogs.length > visibleLogsCount && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleLogsCount(prev => prev + 50)}
                className="px-5 py-2.5 rounded-2xl bg-[#e7f5f2] hover:bg-[#d6ede8] border border-[#bfe2db] text-[#087e83] text-xs font-extrabold cursor-pointer transition-colors"
              >
                عرض المزيد ({(filteredLogs.length - visibleLogsCount).toLocaleString('ar-EG')} متبقي)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Log Details Modal with Arabic Field Diff */}
      {selectedLog && (
        <div
          onClick={() => setSelectedLog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">تفاصيل سجل التغيير</h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p><strong>الحدث:</strong> {actionLabels[isDeletedLog(selectedLog) ? 'delete' : selectedLog.action]?.label || selectedLog.action}</p>
              <p><strong>نوع العنصر:</strong> {entityTypeLabels[selectedLog.entityType] || selectedLog.entityType} ({selectedLog.entityName})</p>
              <p><strong>بواسطة المستخدم:</strong> {selectedLog.userName}</p>
              <p><strong>التوقيت:</strong> <span className="font-mono" dir="ltr">{selectedLog.timestamp.replace('T', ' ').slice(0, 16)}</span></p>
              <p><strong>الوصف:</strong> {selectedLog.description}</p>
            </div>

            {(() => {
              const diffs = buildFieldDiffs(
                selectedLog.previousData as Record<string, unknown> | undefined,
                selectedLog.newData as Record<string, unknown> | undefined
              );
              if (diffs.length === 0) return null;
              return (
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-[#087e83]">
                    {selectedLog.previousData && !selectedLog.newData ? 'بيانات العنصر المحذوف:' : 'مقارنة الحقول (قبل / بعد):'}
                  </h4>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-right text-[11px]">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">الحقل</th>
                          {selectedLog.previousData && <th className="p-2">{!selectedLog.newData ? 'القيمة المحذوفة' : 'قبل'}</th>}
                          {selectedLog.newData && <th className="p-2">بعد</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {diffs.map(row => (
                          <tr key={row.key} className={row.changed ? 'bg-amber-50/40' : ''}>
                            <td className="p-2 font-bold text-[#172f3d] whitespace-nowrap">{row.label}</td>
                            {selectedLog.previousData && (
                              <td className="p-2 text-rose-700 break-words max-w-[140px]">{row.before}</td>
                            )}
                            {selectedLog.newData && (
                              <td className="p-2 text-emerald-700 font-semibold break-words max-w-[140px]">{row.after}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-2 pt-1">
              {!selectedLog.reverted && (selectedLog.action === 'add' || Boolean(selectedLog.previousData)) && (
                <button
                  type="button"
                  onClick={() => {
                    handleRevert(selectedLog.id);
                    setSelectedLog(null);
                  }}
                  className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إرجاع للحالة السابقة</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="flex-1 py-2.5 bg-[#087e83] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
