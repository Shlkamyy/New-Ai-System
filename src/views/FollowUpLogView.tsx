import React, { useMemo, useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  History,
  Search,
  Edit3,
  Trash2,
  Check,
  X,
  ArrowLeft,
  User,
  Phone,
  CheckCircle2,
  ListChecks,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  matchArabicTerms,
  matchPhone,
  scoreArabicTextMatch,
  scorePhoneMatch,
  formatRelativeTimeArabic,
  getRelativeTimeBadgeClass
} from '../utils/arabic';
import { getCustomColorBadgeStyle, getFollowUpStatusColorHex } from '../utils/colors';
import { ColoredSelect } from '../components/ColoredSelect';
import { FinishedWorkActionType, PatientFollowUpLogEntry } from '../types/clinic';
import {
  formatPostponeDaysArabic,
  getCairoDateStringFromIso,
  getYmdDiffDays
} from '../utils/finishedWork';

type TaskFilterType = 'all' | 'finished_work' | 'feedback' | 'notes';
type ButtonFilterType =
  | 'all'
  | FinishedWorkActionType
  | 'feedback_done'
  | 'feedback_not_done';

const FINISHED_WORK_ACTION_META: Record<
  FinishedWorkActionType,
  { label: string; badgeClass: string; cardClass: string; activeCardClass: string }
> = {
  finished: {
    label: 'خلص شغل',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cardClass: 'bg-emerald-50/50 border-emerald-200 text-emerald-800 hover:bg-emerald-50',
    activeCardClass: 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
  },
  unreachable: {
    label: 'لا يمكن التواصل',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    cardClass: 'bg-amber-50/50 border-amber-200 text-amber-800 hover:bg-amber-50',
    activeCardClass: 'bg-amber-600 border-amber-600 text-white shadow-sm'
  },
  not_interested: {
    label: 'غير مهتم',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    cardClass: 'bg-rose-50/50 border-rose-200 text-rose-800 hover:bg-rose-50',
    activeCardClass: 'bg-rose-600 border-rose-600 text-white shadow-sm'
  },
  postpone_week: {
    label: 'تأجيل المتابعة',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    cardClass: 'bg-indigo-50/50 border-indigo-200 text-indigo-800 hover:bg-indigo-50',
    activeCardClass: 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
  },
  closed_file: {
    label: 'إغلاق الملف',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
    cardClass: 'bg-rose-100/60 border-rose-300 text-rose-900 hover:bg-rose-100',
    activeCardClass: 'bg-rose-800 border-rose-800 text-white shadow-sm'
  }
};

function hasManualFollowUpNote(entry: PatientFollowUpLogEntry): boolean {
  if (entry.audioDataUrl) return true;
  const notes = (entry.notes || '').trim();
  if (!notes) return false;
  if (notes === 'تم التواصل — خلص شغل') return false;
  if (notes === 'إغلاق الملف — غير مهتم') return false;
  if (notes.startsWith('لا يمكن التواصل — تأجيل')) return false;
  if (notes.startsWith('تحديث تلقائي')) return false;
  return true;
}

const ACTION_SOURCE_LABELS: Record<string, { label: string; isInside: boolean }> = {
  task_card_button: { label: 'من زرار كارت المهمة', isInside: true },
  task_card_dropdown: { label: 'من قائمة كارت المهمة', isInside: true },
  appointments_schedule: { label: 'من برا المهمة · جدول المواعيد', isInside: false },
  dashboard_schedule: { label: 'من برا المهمة · لوحة التحكم', isInside: false },
  patients_list: { label: 'من برا المهمة · قائمة المرضى', isInside: false },
  patient_detail: { label: 'من برا المهمة · ملف المريض', isInside: false },
  followup_outside: { label: 'من برا المهمة · حالات المتابعة', isInside: false },
  staff_alerts: { label: 'من برا المهمة · تنبيهات الموظفين', isInside: false },
  quick_action: { label: 'من برا المهمة · الإضافة السريعة', isInside: false }
};

function getEntryTaskKind(entry: PatientFollowUpLogEntry): 'finished_work' | 'feedback' | null {
  if (entry.taskType === 'finished_work' || entry.finishedWorkAction) return 'finished_work';
  if (entry.taskType === 'feedback' || entry.feedbackOutcome) return 'feedback';
  return null;
}

function getEntryButtonKey(entry: PatientFollowUpLogEntry): Exclude<ButtonFilterType, 'all'> | null {
  if (entry.finishedWorkAction) return entry.finishedWorkAction;
  if (entry.feedbackOutcome === 'done') return 'feedback_done';
  if (entry.feedbackOutcome === 'not_done') return 'feedback_not_done';
  return null;
}

export const FollowUpLogView: React.FC = () => {
  const {
    patientFollowUpLogs,
    patientFollowUpStatuses,
    listItemColors,
    patients,
    staffMembers,
    updatePatientFollowUpLog,
    deletePatientFollowUpLog,
    goToPatient
  } = useClinic();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'reverted'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [taskFilter, setTaskFilter] = useState<TaskFilterType>('all');
  const [buttonFilter, setButtonFilter] = useState<ButtonFilterType>('all');
  const [isTaskFilterOpen, setIsTaskFilterOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPreviousStatus, setEditPreviousStatus] = useState('');
  const [editNewStatus, setEditNewStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  const patientIdSet = useMemo(() => new Set(patients.map(p => p.id)), [patients]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    window.setTimeout(() => {
      setFeedbackMessage(null);
    }, 2600);
  };

  const allStatusOptions = useMemo(() => {
    return patientFollowUpStatuses;
  }, [patientFollowUpStatuses]);

  const staffFilterOptions = useMemo(() => {
    const names = new Set<string>();
    staffMembers.forEach(s => {
      const clean = (s.name || '').trim();
      if (clean) names.add(clean);
    });
    patientFollowUpLogs.forEach(l => {
      const clean = (l.changedBy || '').trim();
      if (clean) names.add(clean);
    });
    return Array.from(names);
  }, [staffMembers, patientFollowUpLogs]);

  const baseStatusFilteredLogs = useMemo(() => {
    return [...patientFollowUpLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .filter(entry => {
        if (filterMode === 'active' && entry.reverted) return false;
        if (filterMode === 'reverted' && !entry.reverted) return false;
        if (staffFilter !== 'all' && (entry.changedBy || '').trim() !== staffFilter) return false;
        return true;
      });
  }, [patientFollowUpLogs, filterMode, staffFilter]);

  const taskBreakdown = useMemo(() => {
    const relevantKeys: Array<Exclude<ButtonFilterType, 'all'>> =
      taskFilter === 'finished_work'
        ? ['finished', 'unreachable', 'postpone_week', 'not_interested', 'closed_file']
        : taskFilter === 'feedback'
        ? ['feedback_done', 'feedback_not_done']
        : ['finished', 'unreachable', 'postpone_week', 'not_interested', 'closed_file', 'feedback_done', 'feedback_not_done'];

    const sourceLogs =
      taskFilter === 'notes'
        ? baseStatusFilteredLogs.filter(hasManualFollowUpNote)
        : baseStatusFilteredLogs;

    const labelMap: Record<Exclude<ButtonFilterType, 'all'>, string> = {
      finished: 'خلص شغل',
      unreachable: 'لا يمكن التواصل',
      postpone_week: 'تأجيل المتابعة',
      not_interested: 'غير مهتم',
      closed_file: 'إغلاق الملف',
      feedback_done: 'تم الفيدباك',
      feedback_not_done: 'لم تتم المهمة'
    };

    return relevantKeys.map(key => {
      const matching = sourceLogs.filter(entry => getEntryButtonKey(entry) === key);
      const uniquePatientIds = new Set(matching.map(e => e.patientId));
      const staffMap = new Map<string, number>();
      matching.forEach(entry => {
        const name = (entry.changedBy || 'غير معروف').trim();
        staffMap.set(name, (staffMap.get(name) || 0) + 1);
      });
      const staffList = Array.from(staffMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      return {
        key,
        label: labelMap[key],
        count: matching.length,
        uniquePatientsCount: uniquePatientIds.size,
        staffList
      };
    });
  }, [baseStatusFilteredLogs, taskFilter]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim();
    const matched = baseStatusFilteredLogs.filter(entry => {
      const entryTaskKind = getEntryTaskKind(entry);
      const entryButtonKey = getEntryButtonKey(entry);

      if (taskFilter === 'notes') {
        if (!hasManualFollowUpNote(entry)) return false;
      } else if (taskFilter !== 'all' && entryTaskKind !== taskFilter) {
        return false;
      }
      if (buttonFilter !== 'all' && entryButtonKey !== buttonFilter) return false;

      if (q) {
        const fwLabel = entry.finishedWorkAction ? FINISHED_WORK_ACTION_META[entry.finishedWorkAction].label : '';
        const fbLabel =
          entry.feedbackOutcome === 'done'
            ? 'تم الفيدباك'
            : entry.feedbackOutcome === 'not_done'
            ? 'لم تتم المهمة'
            : '';
        const combinedTarget = `${entry.patientName} ${entry.previousStatus} ${entry.newStatus} ${entry.changedBy} ${entry.notes || ''} ${fwLabel} ${fbLabel}`;
        const textOk = matchArabicTerms(combinedTarget, q);
        const phoneOk = matchPhone(entry.patientPhone, q);
        if (!textOk && !phoneOk) return false;
      }
      return true;
    });

    if (!q) return matched;

    const scoreMap = new Map<string, number>();
    matched.forEach(entry => {
      const fwLabel = entry.finishedWorkAction ? FINISHED_WORK_ACTION_META[entry.finishedWorkAction].label : '';
      const fbLabel =
        entry.feedbackOutcome === 'done'
          ? 'تم الفيدباك'
          : entry.feedbackOutcome === 'not_done'
          ? 'لم تتم المهمة'
          : '';
      const combinedTarget = `${entry.patientName} ${entry.previousStatus} ${entry.newStatus} ${entry.changedBy} ${entry.notes || ''} ${fwLabel} ${fbLabel}`;
      const score = Math.max(
        scoreArabicTextMatch(entry.patientName, q) * 10,
        scorePhoneMatch(entry.patientPhone, q) * 5,
        scoreArabicTextMatch(combinedTarget, q)
      );
      scoreMap.set(entry.id, score);
    });
    return [...matched].sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0));
  }, [baseStatusFilteredLogs, taskFilter, buttonFilter, searchQuery]);

  const filteredUniquePatientsCount = useMemo(
    () => new Set(filteredLogs.map(l => l.patientId)).size,
    [filteredLogs]
  );

  const handleTaskFilterChange = (nextTask: TaskFilterType) => {
    setTaskFilter(nextTask);
    if (
      nextTask === 'finished_work' &&
      (buttonFilter === 'feedback_done' || buttonFilter === 'feedback_not_done')
    ) {
      setButtonFilter('all');
    } else if (
      nextTask === 'feedback' &&
      (buttonFilter === 'finished' ||
        buttonFilter === 'unreachable' ||
        buttonFilter === 'postpone_week' ||
        buttonFilter === 'not_interested' ||
        buttonFilter === 'closed_file')
    ) {
      setButtonFilter('all');
    }
  };

  const startEdit = (id: string, prevStatus: string, newStatus: string, notes?: string) => {
    setEditingId(id);
    setEditPreviousStatus(prevStatus);
    setEditNewStatus(newStatus);
    setEditNotes(notes || '');
    setConfirmDeleteId(null);
  };

  const saveEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editPreviousStatus.trim() || !editNewStatus.trim()) return;
    updatePatientFollowUpLog(id, {
      previousStatus: editPreviousStatus.trim(),
      newStatus: editNewStatus.trim(),
      notes: editNotes.trim() || undefined
    });
    setEditingId(null);
    showFeedback('success', 'تم تعديل سجل المتابعة وتحديث حالة المريض إذا لزم الأمر');
  };

  const handleDelete = (id: string) => {
    const res = deletePatientFollowUpLog(id);
    setConfirmDeleteId(null);
    if (res.reverted) {
      showFeedback('success', `تم حذف السجل وإرجاع حالة المريض تلقائياً إلى "${res.previousStatus || 'غير محدد'}"`);
    } else {
      showFeedback('success', 'تم حذف السجل من سجل متابعة المرضى');
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        timeZone: 'Africa/Cairo',
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const { activeCount, revertedCount } = useMemo(() => {
    let active = 0;
    let reverted = 0;
    for (let i = 0; i < patientFollowUpLogs.length; i++) {
      if (patientFollowUpLogs[i].reverted) reverted += 1;
      else active += 1;
    }
    return { activeCount: active, revertedCount: reverted };
  }, [patientFollowUpLogs]);

  const hasAnyTaskLogs = useMemo(
    () => baseStatusFilteredLogs.some(l => getEntryTaskKind(l) !== null || hasManualFollowUpNote(l)),
    [baseStatusFilteredLogs]
  );

  const visibleLogs = useMemo(
    () => filteredLogs.slice(0, visibleCount),
    [filteredLogs, visibleCount]
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">سجل متابعة المرضى</h1>
              <p className="text-xs text-slate-500 font-semibold">
                مراقبة جميع تغييرات حالة متابعة المرضى مع إمكانية التعديل أو الحذف (الحذف يرجع المريض للحالة السابقة تلقائياً)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold flex-wrap">
            <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700">
              الإجمالي: {patientFollowUpLogs.length.toLocaleString('ar-EG')}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              نشط: {activeCount.toLocaleString('ar-EG')}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
              مرتجع: {revertedCount.toLocaleString('ar-EG')}
            </span>
          </div>
        </div>

        {feedbackMessage && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المريض، رقم الموبايل، اسم الموظف، أو الحالة..."
              className="w-full pr-10 pl-9 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/60 text-xs sm:text-sm font-semibold focus:bg-white focus:border-[#087e83] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="مسح البحث"
                className="w-6 h-6 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Staff Member Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 min-w-[175px]">
            <User className="w-3.5 h-3.5 text-[#087e83] flex-shrink-0" />
            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              aria-label="فلتر الموظف"
              className="w-full bg-transparent text-xs font-bold text-[#172f3d] focus:outline-none cursor-pointer"
            >
              <option value="all">كل الموظفين</option>
              {staffFilterOptions.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {staffFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStaffFilter('all')}
                className="text-slate-400 hover:text-rose-600 cursor-pointer flex-shrink-0"
                title="إلغاء فلتر الموظف"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
            {[
              { id: 'all' as const, label: 'الكل' },
              { id: 'active' as const, label: 'نشط' },
              { id: 'reverted' as const, label: 'تم التراجع' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  filterMode === tab.id
                    ? 'bg-white text-[#087e83] shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task Filter (Collapsed by Default with Arrow Toggle) */}
        <div className="rounded-2xl bg-[#f8fbfa] border border-[#dce8eb] overflow-hidden">
          <button
            type="button"
            onClick={() => setIsTaskFilterOpen(prev => !prev)}
            className="w-full p-3 flex items-center justify-between gap-2 text-right cursor-pointer hover:bg-[#f0f7f5] transition-colors"
            aria-expanded={isTaskFilterOpen}
          >
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#172f3d] flex-wrap">
              <ListChecks className="w-4 h-4 text-[#087e83]" />
              <span>فلتر المهمات</span>
              {(taskFilter !== 'all' || buttonFilter !== 'all' || staffFilter !== 'all') && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db]">
                  {filteredLogs.length.toLocaleString('ar-EG')} سجل · {filteredUniquePatientsCount.toLocaleString('ar-EG')} مريض
                </span>
              )}
            </div>
            <span className="w-7 h-7 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0">
              {isTaskFilterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {isTaskFilterOpen && (
            <div className="px-3 pb-3 pt-1 border-t border-[#dce8eb]/70 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: 'all' as const, label: 'كل السجل' },
                  { id: 'finished_work' as const, label: 'مهمة خلص شغل' },
                  { id: 'feedback' as const, label: 'مهمة الفيدباك' },
                  { id: 'notes' as const, label: 'ملاحظات' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTaskFilterChange(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                      taskFilter === tab.id
                        ? 'bg-[#087e83] text-white border-[#087e83] shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-[#087e83]/50 hover:text-[#087e83]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                {(taskFilter !== 'all' || buttonFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setTaskFilter('all');
                      setButtonFilter('all');
                    }}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 cursor-pointer transition-colors"
                  >
                    مسح الفلتر
                  </button>
                )}
              </div>

              {(hasAnyTaskLogs || taskFilter !== 'all') && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                  {taskBreakdown.map(item => {
                    const isSelected = buttonFilter === item.key;
                    const fwMeta =
                      (item.key === 'finished' ||
                      item.key === 'unreachable' ||
                      item.key === 'postpone_week' ||
                      item.key === 'not_interested' ||
                      item.key === 'closed_file')
                        ? FINISHED_WORK_ACTION_META[item.key]
                        : null;

                    const cardColorClass = isSelected
                      ? fwMeta
                        ? fwMeta.activeCardClass
                        : item.key === 'feedback_done'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-rose-600 border-rose-600 text-white shadow-sm'
                      : fwMeta
                      ? fwMeta.cardClass
                      : item.key === 'feedback_done'
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                      : 'bg-rose-50/50 border-rose-200 text-rose-800 hover:bg-rose-50';

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setButtonFilter(prev => (prev === item.key ? 'all' : item.key))}
                        className={`p-2.5 rounded-2xl border text-right transition-all cursor-pointer space-y-1 ${cardColorClass}`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[11px] font-extrabold truncate">{item.label}</span>
                          <span
                            className={`text-xs font-black px-1.5 py-0.5 rounded-lg ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-white/80 text-slate-800'
                            }`}
                          >
                            {item.count.toLocaleString('ar-EG')}
                          </span>
                        </div>
                        <div className={`text-[10px] font-bold ${isSelected ? 'text-white/90' : 'text-slate-600'}`}>
                          {item.uniquePatientsCount > 0
                            ? `${item.uniquePatientsCount.toLocaleString('ar-EG')} مريض`
                            : 'لا يوجد مرضى'}
                        </div>
                        {item.staffList.length > 0 && (
                          <div
                            className={`text-[10px] font-semibold truncate ${
                              isSelected ? 'text-white/85' : 'text-slate-500'
                            }`}
                            title={item.staffList.map(s => `${s.name} (${s.count})`).join('، ')}
                          >
                            {item.staffList
                              .slice(0, 2)
                              .map(s => `${s.name} (${s.count})`)
                              .join('، ')}
                            {item.staffList.length > 2 ? ` +${item.staffList.length - 2}` : ''}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Log Entries List */}
      <div className="space-y-2.5">
        {visibleLogs.length > 0 ? (
          visibleLogs.map(entry => {
            const patientExists = patientIdSet.has(entry.patientId);
            const isEditing = editingId === entry.id;
            const isConfirmDelete = confirmDeleteId === entry.id;
            const fwMeta = entry.finishedWorkAction
              ? FINISHED_WORK_ACTION_META[entry.finishedWorkAction]
              : null;

            return (
              <div
                key={entry.id}
                className={`p-4 rounded-3xl bg-white border shadow-sm space-y-3 transition-all ${
                  entry.reverted ? 'border-amber-200 bg-amber-50/20' : 'border-[#dce8eb]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {patientExists ? (
                        <button
                          type="button"
                          onClick={() => goToPatient(entry.patientId)}
                          className="font-extrabold text-sm text-[#172f3d] hover:text-[#087e83] hover:underline cursor-pointer"
                        >
                          {entry.patientName}
                        </button>
                      ) : (
                        <span className="font-extrabold text-sm text-slate-600">{entry.patientName}</span>
                      )}

                      {entry.patientPhone && (
                        <a
                          href={`tel:${entry.patientPhone}`}
                          dir="ltr"
                          className="text-[11px] font-mono text-slate-500 hover:text-[#087e83] flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{entry.patientPhone}</span>
                        </a>
                      )}

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getRelativeTimeBadgeClass(entry.timestamp)}`}>
                        {formatRelativeTimeArabic(entry.timestamp)}
                      </span>

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

                      {fwMeta && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${fwMeta.badgeClass}`}>
                          {entry.finishedWorkAction === 'finished' ? '✓ ' : ''}
                          {fwMeta.label}
                          {entry.finishedWorkAction === 'postpone_week' && entry.snoozeUntilDate
                            ? (() => {
                                const baseDate = (
                                  entry.actionDate || getCairoDateStringFromIso(entry.timestamp)
                                ).slice(0, 10);
                                const days = getYmdDiffDays(baseDate, entry.snoozeUntilDate);
                                return days >= 1 ? ` (${formatPostponeDaysArabic(days)})` : '';
                              })()
                            : ''}
                          {entry.finishedWorkAttempt ? ` · محاولة ${entry.finishedWorkAttempt}` : ''}
                          {entry.snoozeUntilDate ? ` (حتى ${entry.snoozeUntilDate})` : ''}
                          {!entry.snoozeUntilDate && entry.actionDate ? ` (${entry.actionDate})` : ''}
                        </span>
                      )}

                      {entry.actionSource && ACTION_SOURCE_LABELS[entry.actionSource] && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            ACTION_SOURCE_LABELS[entry.actionSource].isInside
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {ACTION_SOURCE_LABELS[entry.actionSource].label}
                        </span>
                      )}

                      {entry.reverted && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          تم الرجوع للحالة السابقة
                        </span>
                      )}
                    </div>

                    {/* Transition Row */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span
                        style={getCustomColorBadgeStyle(getFollowUpStatusColorHex(entry.previousStatus, listItemColors.followUpStatuses))}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-transparent font-bold"
                      >
                        {entry.previousStatus || 'غير محدد'}
                      </span>
                      <ArrowLeft className="w-3.5 h-3.5 text-[#087e83]" />
                      <span
                        style={getCustomColorBadgeStyle(getFollowUpStatusColorHex(entry.newStatus, listItemColors.followUpStatuses))}
                        className="px-2.5 py-1 rounded-xl bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db] font-extrabold"
                      >
                        {entry.newStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1 font-semibold">
                        <User className="w-3 h-3 text-slate-400" />
                        بواسطة: {entry.changedBy}
                      </span>
                      <span>·</span>
                      <span>{formatTimestamp(entry.timestamp)}</span>
                      {entry.reverted && entry.revertedBy && (
                        <>
                          <span>·</span>
                          <span className="text-amber-700 font-semibold">
                            تراجع بواسطة {entry.revertedBy}
                          </span>
                        </>
                      )}
                    </div>

                    {entry.notes && !isEditing && (
                      <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
                        {entry.notes}
                      </p>
                    )}

                    {entry.audioDataUrl && !isEditing && (
                      <div className="flex items-center gap-2 bg-[#f0f8f6] border border-[#bfe2db] rounded-xl px-3 py-1.5">
                        <audio controls src={entry.audioDataUrl} className="h-8 w-full max-w-sm" />
                        {entry.audioDurationSeconds !== undefined && (
                          <span className="text-[11px] font-mono font-bold text-[#087e83] whitespace-nowrap">
                            ({entry.audioDurationSeconds} ث)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {!isEditing && (
                    <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(entry.id, entry.previousStatus, entry.newStatus, entry.notes)}
                        className="px-3 py-1.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] border border-[#bfe2db] text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>

                      {isConfirmDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                          >
                            تأكيد الحذف
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline Edit Form */}
                {isEditing && (
                  <form
                    onSubmit={e => saveEdit(e, entry.id)}
                    className="p-3 rounded-2xl bg-[#f8fbfa] border border-[#cfe5e7] space-y-3 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-600 mb-1">الحالة السابقة</label>
                        <ColoredSelect
                          value={editPreviousStatus}
                          onChange={val => setEditPreviousStatus(val)}
                          options={Array.from(new Set([...allStatusOptions, editPreviousStatus].filter(Boolean))).map(st => ({
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
                          value={editNewStatus}
                          onChange={val => setEditNewStatus(val)}
                          options={Array.from(new Set([...allStatusOptions, editNewStatus].filter(Boolean))).map(st => ({
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
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        placeholder="أضف ملاحظة حول التعديل..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>إلغاء</span>
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>حفظ التعديل</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })
        ) : (
          <div className="bg-white border border-[#dce8eb] rounded-3xl p-10 text-center space-y-2">
            <History className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-500">
              لا توجد تغييرات مسجلة في سجل متابعة المرضى حتى الآن
            </p>
          </div>
        )}

        {filteredLogs.length > visibleCount && (
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount(prev => prev + 50)}
              className="px-5 py-2.5 rounded-2xl bg-[#e7f5f2] hover:bg-[#d6ede8] border border-[#bfe2db] text-[#087e83] text-xs font-extrabold cursor-pointer transition-colors"
            >
              عرض المزيد ({(filteredLogs.length - visibleCount).toLocaleString('ar-EG')} متبقي)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
