import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Plus,
  Trash2,
  AlertCircle,
  Pencil,
  X,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  History,
  CheckCircle2,
  Search
} from 'lucide-react';
import { addDaysToYmd, matchArabicTerms, scoreArabicTextMatch } from '../utils/arabic';
import { Task } from '../types/clinic';
import {
  computeFeedbackTaskProgress,
  doesTaskOccurOnDate,
  getTaskCompletionForDate,
  isFeedbackTaskTitle
} from '../utils/feedback';
import {
  computeFinishedWorkTaskProgress,
  isFinishedWorkTaskTitle
} from '../utils/finishedWork';
import { DAY_OFF_UNIT_ID } from '../utils/staffAlerts';

export const TasksView: React.FC = () => {
  const {
    tasks,
    toggleTask,
    adminCompleteTask,
    updateTask,
    deleteTask,
    setIsQuickActionOpen,
    staffMembers,
    currentUser,
    hasPermission,
    patients,
    appointments,
    operations,
    invoices,
    weekdaySettings,
    patientFollowUpLogs,
    navigateToPatientFollowUp,
    cairoTodayStr
  } = useClinic();
  const isAdmin = currentUser.role === 'admin';
  const canAddTasks = hasPermission('addTasks') || isAdmin;
  const canEditTasks = hasPermission('editTasks') || isAdmin;
  const canDeleteTasks = hasPermission('deleteTasks') || isAdmin;

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'overdue'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Completed Tasks Log ("سجل المهام") state
  const [showTaskLog, setShowTaskLog] = useState(false);
  const [logStaffFilter, setLogStaffFilter] = useState<string>('all');
  const [logTaskFilter, setLogTaskFilter] = useState<string>('all');
  const [logDateFilter, setLogDateFilter] = useState<string>('');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  const todayStr = cairoTodayStr;
  const [selectedReportDate, setSelectedReportDate] = useState(todayStr);
  const [dateScope, setDateScope] = useState<'day' | 'all'>('day');
  const [showCompletedForDay, setShowCompletedForDay] = useState(true);
  const [initY, initM] = todayStr.split('-').map(Number);
  const [calYear, setCalYear] = useState(initY);
  const [calMonth, setCalMonth] = useState(initM - 1);
  const prevCairoTodayRef = useRef(todayStr);
  useEffect(() => {
    if (prevCairoTodayRef.current !== cairoTodayStr) {
      const oldToday = prevCairoTodayRef.current;
      prevCairoTodayRef.current = cairoTodayStr;
      setSelectedReportDate(prev => (prev === oldToday ? cairoTodayStr : prev));
      const [y, m] = cairoTodayStr.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setCalYear(y);
        setCalMonth(m - 1);
      }
    }
  }, [cairoTodayStr]);
  const taskDetailRef = useRef<HTMLDivElement>(null);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editRecurrence, setEditRecurrence] = useState<Task['recurrence']>('once');

  const openEditTaskModal = (t: Task) => {
    if (!canEditTasks) return;
    setEditingTask(t);
    setEditTitle(t.title);
    setEditDesc(t.description || '');
    setEditAssignee(t.assignedTo);
    setEditDueDate(t.dueDate);
    setEditRecurrence(t.recurrence);
  };

  const handleSaveTaskEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditTasks || !editingTask || !editTitle.trim()) return;
    updateTask(editingTask.id, {
      title: editTitle.trim(),
      description: editDesc.trim() || undefined,
      assignedTo: editAssignee,
      dueDate: editDueDate || editingTask.dueDate,
      recurrence: editRecurrence
    });
    setEditingTask(null);
  };

  const visibleTasks = useMemo(() => {
    if (isAdmin) {
      if (staffFilter === 'all') return tasks;
      return tasks.filter(t => t.assignedTo === staffFilter);
    }
    return tasks.filter(t => t.assignedTo === currentUser.name);
  }, [tasks, isAdmin, staffFilter, currentUser.name]);

  const stepCalMonth = (delta: number) => {
    const next = new Date(calYear, calMonth + delta, 1);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());
  };

  const taskEvalCtx = useMemo(
    () => ({ weekdaySettings, appointments, patientFollowUpLogs, patients, operations, invoices }),
    [weekdaySettings, appointments, patientFollowUpLogs, patients, operations, invoices]
  );

  const closedWeekdaySet = useMemo(
    () => new Set(weekdaySettings.filter(w => w.isClosed).map(w => w.dayOfWeek)),
    [weekdaySettings]
  );

  const selectedStaffMember = useMemo(
    () => (staffFilter !== 'all' ? staffMembers.find(s => s.name === staffFilter) || null : null),
    [staffFilter, staffMembers]
  );

  const calendarCells = useMemo(() => {
    if (!isAdmin) return [];
    const firstDay = new Date(calYear, calMonth, 1);
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
    const startIdx = (firstDay.getDay() + 1) % 7; // Saturday start
    const cells: Array<{
      day: number | null;
      dateStr: string;
      count: number;
      pendingCount: number;
      hasOverdue: boolean;
      isClinicHoliday: boolean;
      isStaffLeave: boolean;
    }> = [];
    for (let i = 0; i < startIdx; i++) {
      cells.push({
        day: null,
        dateStr: '',
        count: 0,
        pendingCount: 0,
        hasOverdue: false,
        isClinicHoliday: false,
        isStaffLeave: false
      });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(calYear, calMonth, d, 12, 0, 0).getDay();
      const isClinicHoliday = closedWeekdaySet.has(dow);
      const isStaffLeave = Boolean(
        selectedStaffMember &&
          (selectedStaffMember.attendanceExemptDates?.includes(dateStr) ||
            (!selectedStaffMember.exemptFromAttendance &&
              selectedStaffMember.defaultUnitByDay?.[dow] === DAY_OFF_UNIT_ID))
      );
      const dayTasks = visibleTasks.filter(t => doesTaskOccurOnDate(t, dateStr));
      const pending = dayTasks.filter(t => !getTaskCompletionForDate(t, dateStr, taskEvalCtx).isCompleted).length;
      cells.push({
        day: d,
        dateStr,
        count: dayTasks.length,
        pendingCount: pending,
        hasOverdue: pending > 0 && dateStr < todayStr,
        isClinicHoliday,
        isStaffLeave
      });
    }
    return cells;
  }, [isAdmin, calYear, calMonth, visibleTasks, todayStr, taskEvalCtx, closedWeekdaySet, selectedStaffMember]);

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric'
  });

  const getEvalDateForTask = (t: Task) => {
    if (isAdmin && dateScope === 'day' && statusFilter !== 'overdue') {
      return selectedReportDate;
    }
    return (t.recurrence || 'once') === 'once' ? t.dueDate : todayStr;
  };

  const selectedDayStats = useMemo(() => {
    if (!isAdmin || dateScope !== 'day') return { total: 0, completed: 0, pending: 0 };
    const dayTasks = visibleTasks.filter(t => doesTaskOccurOnDate(t, selectedReportDate));
    let completed = 0;
    dayTasks.forEach(t => {
      if (getTaskCompletionForDate(t, selectedReportDate, taskEvalCtx).isCompleted) {
        completed += 1;
      }
    });
    return { total: dayTasks.length, completed, pending: dayTasks.length - completed };
  }, [isAdmin, dateScope, visibleTasks, selectedReportDate, taskEvalCtx]);

  const filteredTasks = useMemo(
    () =>
      visibleTasks.filter(t => {
        if (isAdmin && dateScope === 'day' && statusFilter !== 'overdue' && !doesTaskOccurOnDate(t, selectedReportDate)) {
          return false;
        }
        const evalDate = getEvalDateForTask(t);
        const isCompletedForView = getTaskCompletionForDate(t, evalDate, taskEvalCtx).isCompleted;
        if (isAdmin && dateScope === 'day' && statusFilter !== 'completed' && statusFilter !== 'overdue' && !showCompletedForDay && isCompletedForView) {
          return false;
        }
        if (statusFilter === 'pending' && isCompletedForView) return false;
        if (statusFilter === 'completed' && !isCompletedForView) return false;
        if (statusFilter === 'overdue') {
          if ((t.recurrence || 'once') !== 'once') return false;
          if (isCompletedForView || t.dueDate >= todayStr) return false;
        }
        return true;
      }),
    [visibleTasks, isAdmin, dateScope, statusFilter, selectedReportDate, todayStr, taskEvalCtx, showCompletedForDay]
  );

  // Completed Tasks Log ("سجل المهام") entries across once + recurring + auto-evaluated daily tasks
  const completedTaskLogEntries = useMemo(() => {
    const scopeTasks = isAdmin
      ? tasks
      : tasks.filter(t => t.assignedTo === currentUser.name || t.completedBy === currentUser.name);

    const candidateSmartDates = new Set<string>();
    for (let offset = 0; offset <= 30; offset++) {
      candidateSmartDates.add(addDaysToYmd(todayStr, -offset));
    }
    patientFollowUpLogs.forEach(l => {
      const ymd = (l.actionDate || l.timestamp || '').slice(0, 10);
      if (ymd && ymd <= todayStr) candidateSmartDates.add(ymd);
    });

    interface CompletedLogRow {
      key: string;
      taskId: string;
      taskTitle: string;
      description?: string;
      assignedTo: string;
      completedBy: string;
      date: string;
      completedAt?: string;
      recurrence: Task['recurrence'];
      summaryLabel?: string;
    }

    const rows: CompletedLogRow[] = [];
    const seen = new Set<string>();

    scopeTasks.forEach(t => {
      const rec = t.recurrence || 'once';
      if (rec === 'once') {
        if (t.isCompleted) {
          const d = t.dueDate || (t.completedAt ? t.completedAt.slice(0, 10) : todayStr);
          const key = `${t.id}::${d}`;
          if (!seen.has(key)) {
            seen.add(key);
            rows.push({
              key,
              taskId: t.id,
              taskTitle: t.title,
              description: t.description,
              assignedTo: t.assignedTo,
              completedBy: t.completedBy || t.assignedTo,
              date: d,
              completedAt: t.completedAt,
              recurrence: 'once'
            });
          }
        }
        return;
      }

      // 1. Explicit completedDates map
      if (t.completedDates) {
        Object.entries(t.completedDates).forEach(([d, dateEntry]) => {
          if (!dateEntry) return;
          const key = `${t.id}::${d}`;
          if (seen.has(key)) return;
          seen.add(key);
          const entryObj = typeof dateEntry === 'object' ? dateEntry : undefined;
          rows.push({
            key,
            taskId: t.id,
            taskTitle: t.title,
            description: t.description,
            assignedTo: t.assignedTo,
            completedBy: entryObj?.completedBy || t.assignedTo,
            date: d,
            completedAt: entryObj?.completedAt,
            recurrence: rec
          });
        });
      }

      // 2. Smart auto-completed daily tasks (Feedback / Finished Work) over candidate dates
      const isSmartDaily = isFeedbackTaskTitle(t.title) || isFinishedWorkTaskTitle(t.title);
      if (isSmartDaily) {
        candidateSmartDates.forEach(d => {
          if (t.dueDate && d < t.dueDate) return;
          const key = `${t.id}::${d}`;
          if (seen.has(key)) return;
          if (!doesTaskOccurOnDate(t, d)) return;
          const comp = getTaskCompletionForDate(t, d, taskEvalCtx);
          if (!comp.isCompleted) return;
          seen.add(key);
          let summaryLabel = '';
          if (comp.finishedWorkProgress) {
            summaryLabel = `إنجاز ${comp.finishedWorkProgress.doneCount}/${comp.finishedWorkProgress.quotaTarget}`;
          } else if (comp.feedbackProgress && comp.feedbackProgress.totalPatients > 0) {
            summaryLabel = `إنجاز ${comp.feedbackProgress.processedCount}/${comp.feedbackProgress.totalPatients}`;
          }
          rows.push({
            key,
            taskId: t.id,
            taskTitle: t.title,
            description: t.description,
            assignedTo: t.assignedTo,
            completedBy: comp.completedBy || t.assignedTo,
            date: d,
            recurrence: rec,
            summaryLabel
          });
        });
      }
    });

    return rows.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      const tA = a.completedAt || '';
      const tB = b.completedAt || '';
      if (tB !== tA) return tB.localeCompare(tA);
      return a.taskTitle.localeCompare(b.taskTitle, 'ar');
    });
  }, [tasks, isAdmin, currentUser.name, todayStr, patientFollowUpLogs, taskEvalCtx]);

  const logDistinctEmployees = useMemo(() => {
    const set = new Set<string>();
    staffMembers.forEach(s => {
      if (s.name) set.add(s.name);
    });
    completedTaskLogEntries.forEach(r => {
      if (r.assignedTo) set.add(r.assignedTo);
      if (r.completedBy) set.add(r.completedBy);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [staffMembers, completedTaskLogEntries]);

  const logDistinctTaskTitles = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      if (t.title) set.add(t.title);
    });
    completedTaskLogEntries.forEach(r => {
      if (r.taskTitle) set.add(r.taskTitle);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [tasks, completedTaskLogEntries]);

  const filteredTaskLogEntries = useMemo(() => {
    const q = logSearchQuery.trim();
    const matched = completedTaskLogEntries.filter(entry => {
      if (isAdmin && logStaffFilter !== 'all') {
        if (entry.assignedTo !== logStaffFilter && entry.completedBy !== logStaffFilter) return false;
      }
      if (logTaskFilter !== 'all' && entry.taskTitle !== logTaskFilter) return false;
      if (logDateFilter && entry.date !== logDateFilter) return false;
      if (q) {
        const target = `${entry.taskTitle} ${entry.description || ''} ${entry.assignedTo} ${entry.completedBy} ${entry.date}`;
        if (!matchArabicTerms(target, q)) return false;
      }
      return true;
    });
    if (!q) return matched;
    return [...matched].sort(
      (a, b) =>
        scoreArabicTextMatch(`${b.taskTitle} ${b.completedBy} ${b.assignedTo}`, q) -
        scoreArabicTextMatch(`${a.taskTitle} ${a.completedBy} ${a.assignedTo}`, q)
    );
  }, [completedTaskLogEntries, isAdmin, logStaffFilter, logTaskFilter, logDateFilter, logSearchQuery]);

  const { pendingCount, overdueCount } = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    for (let i = 0; i < visibleTasks.length; i++) {
      const t = visibleTasks[i];
      const evalD = (t.recurrence || 'once') === 'once' ? t.dueDate : todayStr;
      const done = getTaskCompletionForDate(t, evalD, taskEvalCtx).isCompleted;
      if (!done) {
        pending += 1;
        if ((t.recurrence || 'once') === 'once' && t.dueDate < todayStr) {
          overdue += 1;
        }
      }
    }
    return { pendingCount: pending, overdueCount: overdue };
  }, [visibleTasks, todayStr, taskEvalCtx]);

  const feedbackDateCursor = isAdmin && dateScope === 'day' ? selectedReportDate : todayStr;
  const feedbackProgress = useMemo(() => {
    if (!visibleTasks.some(t => isFeedbackTaskTitle(t.title))) {
      return {
        prevWorkDay: feedbackDateCursor,
        totalPatients: 0,
        processedCount: 0,
        doneCount: 0,
        notDoneCount: 0,
        isCompleted: false,
        isDoneComplete: false,
        isRedComplete: false
      };
    }
    return computeFeedbackTaskProgress(feedbackDateCursor, weekdaySettings, appointments, patientFollowUpLogs, patients);
  }, [visibleTasks, feedbackDateCursor, weekdaySettings, appointments, patientFollowUpLogs, patients]);

  const openFeedbackFollowUp = (anchorYmd?: string) => {
    navigateToPatientFollowUp({
      periodUnit: 'day',
      dateBasis: 'last_appointment',
      anchorDate: anchorYmd || feedbackProgress.prevWorkDay,
      selectedAppointmentStatuses: ['completed'],
      excludeFollowUpStatuses: ['فيدباك'],
      feedbackMode: true,
      scrollToFirstCard: true
    });
  };

  const openFinishedWorkFollowUp = (evalYmd?: string) => {
    navigateToPatientFollowUp({
      periodUnit: 'all',
      dateBasis: 'last_appointment',
      anchorDate: evalYmd || feedbackDateCursor,
      finishedWorkMode: true,
      scrollToFirstCard: true
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header & Metrics */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              {isAdmin ? `إدارة مهام الموظفين (${visibleTasks.length})` : `مهامي (${visibleTasks.length})`}
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              {isAdmin
                ? 'يمكنك استعراض وإدارة مهام جميع الموظفين أو تصفية المهام لموظف محدد'
                : `تظهر هنا المهام المكلف بها فقط: ${currentUser.name}`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowTaskLog(prev => !prev)}
              className={`px-4 py-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer ${
                showTaskLog
                  ? 'bg-[#172f3d] text-white border-[#172f3d]'
                  : 'bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border-[#bfe2db]'
              }`}
            >
              <History className="w-4 h-4" />
              <span>سجل المهام</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  showTaskLog ? 'bg-white/20 text-white' : 'bg-white text-[#087e83] border border-[#bfe2db]'
                }`}
              >
                {completedTaskLogEntries.length}
              </span>
            </button>

            {canAddTasks && (
              <button
                type="button"
                onClick={() =>
                  setIsQuickActionOpen(
                    true,
                    'task',
                    isAdmin && dateScope === 'day' ? { date: selectedReportDate } : undefined
                  )
                }
                className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مهمة جديدة</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي المهام المسجلة</span>
            <span className="text-xl font-extrabold font-mono text-[#172f3d]">{visibleTasks.length}</span>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl">
            <span className="text-[11px] text-blue-700 font-bold block">المهام قيد الانتظار</span>
            <span className="text-xl font-extrabold font-mono text-blue-900">{pendingCount}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter(prev => (prev === 'overdue' ? 'all' : 'overdue'))}
            className={`col-span-2 sm:col-span-1 p-3 rounded-2xl border text-right transition-colors cursor-pointer ${
              statusFilter === 'overdue'
                ? 'bg-amber-100 border-amber-400'
                : 'bg-amber-50 border-amber-200 hover:border-amber-300'
            }`}
          >
            <span className="text-[11px] text-amber-700 font-bold block">مهام متأخرة عن موعدها</span>
            <span className="text-xl font-extrabold font-mono text-amber-900">{overdueCount}</span>
          </button>
        </div>

        {/* Filters (hidden while Completed Task Log panel is active) */}
        {!showTaskLog && (
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'all' | 'pending' | 'completed' | 'overdue')}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
              >
                <option value="all">جميع الحالات</option>
                <option value="pending">المعلقة فقط</option>
                <option value="overdue">المتأخرة فقط</option>
                <option value="completed">المكتملة</option>
              </select>

              {isAdmin && (
                <select
                  value={staffFilter}
                  onChange={e => setStaffFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
                >
                  <option value="all">جميع الموظفين</option>
                  {staffMembers.map(s => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Completed Tasks Log Panel ("سجل المهام") */}
      {showTaskLog ? (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[#172f3d]">
                  سجل المهام المنتهية ({filteredTaskLogEntries.length})
                </h2>
                <p className="text-[11px] text-slate-500 font-semibold">
                  سجل شامل بجميع المهام التي تم إنجازها مع التصفية حسب الموظف والمهمة والتاريخ
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTaskLog(false)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>العودة لقائمة المهام</span>
            </button>
          </div>

          {/* Log Filters: Search, Employee, Task, Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={e => setLogSearchQuery(e.target.value)}
                placeholder="بحث في سجل المهام..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-[#087e83] focus:outline-none text-xs font-semibold"
              />
            </div>

            {isAdmin && (
              <select
                value={logStaffFilter}
                onChange={e => setLogStaffFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
                aria-label="تصفية حسب الموظف"
              >
                <option value="all">كل الموظفين</option>
                {logDistinctEmployees.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={logTaskFilter}
              onChange={e => setLogTaskFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
              aria-label="تصفية حسب المهمة"
            >
              <option value="all">كل المهام</option>
              {logDistinctTaskTitles.map(title => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={logDateFilter}
                onChange={e => setLogDateFilter(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-semibold focus:border-[#087e83]"
                aria-label="تصفية حسب التاريخ"
              />
              {logDateFilter && (
                <button
                  type="button"
                  onClick={() => setLogDateFilter('')}
                  className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                  title="كل التواريخ"
                >
                  الكل
                </button>
              )}
            </div>
          </div>

          {/* Log Rows */}
          {filteredTaskLogEntries.length > 0 ? (
            <div className="divide-y divide-slate-100 max-h-[65vh] overflow-y-auto pr-1">
              {filteredTaskLogEntries.map(entry => {
                const recurrenceLabels: Record<Task['recurrence'], string> = {
                  once: 'مرة واحدة',
                  daily: 'يومية',
                  weekly: 'أسبوعية',
                  monthly: 'شهرية'
                };
                return (
                  <div
                    key={entry.key}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-extrabold text-[#172f3d]">
                            {entry.taskTitle}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            مكتملة
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {recurrenceLabels[entry.recurrence || 'once']}
                          </span>
                          {entry.summaryLabel && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db]">
                              {entry.summaryLabel}
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{entry.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold text-slate-600 flex-shrink-0">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700">
                        الموظف: {entry.completedBy}
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-[#f0f6f5] text-[#087e83] font-mono border border-[#dce8eb]">
                        {entry.date}
                      </span>
                      {entry.completedAt && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {isNaN(Date.parse(entry.completedAt))
                            ? entry.completedAt
                            : new Date(entry.completedAt).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-slate-400 text-xs font-semibold">
              لا توجد مهام منتهية مطابقة للفلاتر المحددة
            </div>
          )}
        </div>
      ) : (
        <>

      {/* Admin Only: Interactive Tasks Report Calendar (matching AttendanceView) */}
      {isAdmin && (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#087e83]" />
              <h2 className="text-base font-extrabold text-[#172f3d]">
                تقويم تقارير المهام
              </h2>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => stepCalMonth(-1)}
                className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                title="الشهر السابق"
              >
                <ChevronRight className="w-4 h-4 pointer-events-none" />
              </button>
              <span className="text-xs sm:text-sm font-extrabold text-[#172f3d] min-w-[115px] text-center">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => stepCalMonth(1)}
                className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                title="الشهر القادم"
              >
                <ChevronLeft className="w-4 h-4 pointer-events-none" />
              </button>
              {(selectedReportDate !== todayStr || dateScope !== 'day') && (
                <button
                  type="button"
                  onClick={() => {
                    const [y, m] = todayStr.split('-').map(Number);
                    setCalYear(y);
                    setCalMonth(m - 1);
                    setSelectedReportDate(todayStr);
                    setDateScope('day');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-[#e7f5f2] text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                >
                  <RotateCcw className="w-3 h-3 pointer-events-none" />
                  <span className="pointer-events-none">اليوم</span>
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
              const isSelected = dateScope === 'day' && cell.dateStr === selectedReportDate;
              const isToday = cell.dateStr === todayStr;
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => {
                    setSelectedReportDate(cell.dateStr);
                    setDateScope('day');
                    if (statusFilter === 'overdue') setStatusFilter('all');
                    taskDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  className={`min-h-[54px] py-1 px-0.5 rounded-xl border flex flex-col items-center justify-center relative font-mono text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#087e83] text-white border-[#087e83] shadow-sm'
                      : isToday
                      ? 'bg-[#e7f5f2] text-[#087e83] border-[#087e83]'
                      : cell.isClinicHoliday
                      ? 'bg-rose-50/85 border-rose-200 hover:bg-rose-100/75 text-rose-800'
                      : cell.isStaffLeave
                      ? 'bg-amber-50/85 border-amber-200 hover:bg-amber-100/75 text-amber-800'
                      : 'bg-white border-slate-200 hover:bg-[#f0f6f5] text-slate-700'
                  }`}
                >
                  <span>{cell.day}</span>
                  {cell.count > 0 && (
                    <span
                      className={`text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight ${
                        isSelected
                          ? 'bg-white/25 text-white'
                          : cell.hasOverdue
                          ? 'bg-amber-100 text-amber-800'
                          : cell.pendingCount === 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-[#e7f5f2] text-[#087e83]'
                      }`}
                    >
                      {cell.count} مهمة
                    </span>
                  )}
                  {(cell.isClinicHoliday || cell.isStaffLeave) && (
                    <span
                      className={`text-[9px] font-sans font-extrabold px-1.5 rounded-full mt-0.5 leading-tight ${
                        isSelected
                          ? 'bg-rose-400/35 text-white'
                          : cell.isClinicHoliday
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      إجازة
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Task List */}
      <div ref={taskDetailRef} className="space-y-2.5">
        {isAdmin && (
          <div className="bg-white border border-[#dce8eb] rounded-2xl px-4 py-3 flex items-center justify-between gap-2 flex-wrap shadow-2xs">
            <h2 className="text-sm font-extrabold text-[#172f3d]">
              {statusFilter === 'overdue'
                ? `المهام المتأخرة (${filteredTasks.length})`
                : dateScope === 'day'
                ? (
                  <>
                    تفاصيل مهام يوم <span className="font-mono text-[#087e83]">{selectedReportDate}</span> ({filteredTasks.length})
                  </>
                )
                : `جميع المهام (${filteredTasks.length})`}
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              {dateScope === 'day' && statusFilter !== 'overdue' && statusFilter !== 'completed' && (
                <button
                  type="button"
                  onClick={() => {
                    if (statusFilter === 'pending') {
                      setStatusFilter('all');
                      setShowCompletedForDay(true);
                    } else {
                      setShowCompletedForDay(prev => !prev);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border cursor-pointer transition-colors ${
                    statusFilter !== 'pending' && showCompletedForDay
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white text-[#087e83] border-[#bfe2db] hover:bg-[#e7f5f2]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {statusFilter !== 'pending' && showCompletedForDay
                      ? `إخفاء المهام المنتهية (${selectedDayStats.completed})`
                      : `إظهار المهام المنتهية (${selectedDayStats.completed})`}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDateScope('day');
                  if (statusFilter === 'overdue') setStatusFilter('all');
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-colors ${
                  dateScope === 'day' && statusFilter !== 'overdue'
                    ? 'bg-[#087e83] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                اليوم المحدد
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateScope('all');
                  if (statusFilter === 'overdue') setStatusFilter('all');
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-colors ${
                  dateScope === 'all' && statusFilter !== 'overdue'
                    ? 'bg-[#087e83] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                كل الأيام ({visibleTasks.length})
              </button>
            </div>
          </div>
        )}

        {filteredTasks.length > 0 ? (
          filteredTasks.map(task => {
            const evalDate = getEvalDateForTask(task);
            const completion = getTaskCompletionForDate(task, evalDate, taskEvalCtx);
            const isCompleted = completion.isCompleted;
            const isOverdue =
              (task.recurrence || 'once') === 'once' && !isCompleted && task.dueDate < todayStr;
            const isFeedback = isFeedbackTaskTitle(task.title);
            const isFinishedWork = isFinishedWorkTaskTitle(task.title);
            const taskFeedback = completion.feedbackProgress || feedbackProgress;
            const taskFinishedWork =
              isFinishedWork
                ? completion.finishedWorkProgress ||
                  computeFinishedWorkTaskProgress(
                    evalDate,
                    weekdaySettings,
                    patients,
                    appointments,
                    operations,
                    invoices,
                    patientFollowUpLogs
                  )
                : null;
            const total = isFinishedWork ? (taskFinishedWork?.quotaTarget || 5) : taskFeedback.totalPatients;
            const processed = isFinishedWork ? (taskFinishedWork?.doneCount || 0) : taskFeedback.processedCount;
            const greenPct = total > 0
              ? Math.min(100, ((isFinishedWork ? (taskFinishedWork?.greenDoneCount || 0) : taskFeedback.doneCount) / total) * 100)
              : 0;
            const redPct = total > 0
              ? Math.min(100 - greenPct, ((isFinishedWork ? (taskFinishedWork?.redClosedCount || 0) : taskFeedback.notDoneCount) / total) * 100)
              : 0;
            const deferredCount = isFinishedWork ? (taskFinishedWork?.deferredCount || 0) : 0;
            const carryoverCredit = isFinishedWork ? (taskFinishedWork?.carryoverCredit || 0) : 0;
            const surplusCount = isFinishedWork ? (taskFinishedWork?.surplusCount || 0) : 0;
            const recurrenceLabels = {
              once: 'مرة واحدة',
              daily: 'تكرار يومي',
              weekly: 'تكرار أسبوعي',
              monthly: 'تكرار شهري'
            };

            return (
              <div
                key={task.id}
                className={`p-4 rounded-3xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isCompleted
                    ? 'bg-slate-50 border-slate-200 opacity-75'
                    : isOverdue
                    ? 'bg-amber-50/40 border-amber-300'
                    : 'bg-white border-[#dce8eb] shadow-sm hover:border-[#087e83]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {isFeedback || isFinishedWork ? (
                    <div className="flex flex-col items-start gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          isFinishedWork
                            ? openFinishedWorkFollowUp(evalDate)
                            : openFeedbackFollowUp(taskFeedback.prevWorkDay)
                        }
                        className="relative overflow-hidden px-3 py-1.5 rounded-xl border border-emerald-500/70 bg-slate-100 text-xs font-extrabold text-slate-900 shadow-2xs flex-shrink-0 cursor-pointer hover:brightness-95 transition-all"
                        title={
                          isFinishedWork
                            ? `فتح قائمة خلص شغل ليوم ${evalDate}`
                            : `فتح متابعة مرضى يوم ${taskFeedback.prevWorkDay}`
                        }
                      >
                        <div className="absolute inset-0 flex pointer-events-none" dir="rtl">
                          {greenPct > 0 && (
                            <div
                              className="h-full bg-emerald-400/70 transition-all duration-300"
                              style={{ width: `${greenPct}%` }}
                            />
                          )}
                          {redPct > 0 && (
                            <div
                              className="h-full bg-rose-400/75 transition-all duration-300"
                              style={{ width: `${redPct}%` }}
                            />
                          )}
                        </div>
                        <span className="relative z-10 flex items-center gap-1.5">
                          <span>اتمام المهمة</span>
                          <span className="font-mono" dir="ltr">
                            {processed}/{total}
                          </span>
                        </span>
                      </button>
                      {isFinishedWork && (deferredCount > 0 || carryoverCredit > 0 || surplusCount > 0) && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {deferredCount > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                              مؤجل {deferredCount.toLocaleString('ar-EG')} بيشنت
                            </span>
                          )}
                          {carryoverCredit > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              +{carryoverCredit.toLocaleString('ar-EG')} مرحّل
                            </span>
                          )}
                          {surplusCount > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200">
                              +{surplusCount.toLocaleString('ar-EG')} فائض للغد
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      disabled={!canEditTasks}
                      onChange={() => {
                        if (canEditTasks) toggleTask(task.id, evalDate);
                      }}
                      className="w-5 h-5 rounded text-[#087e83] mt-0.5 cursor-pointer disabled:cursor-default flex-shrink-0"
                    />
                  )}

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs sm:text-sm font-bold ${
                          isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
                        }`}
                      >
                        {task.title}
                      </span>

                      {isOverdue && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> متأخرة
                        </span>
                      )}

                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">
                        {recurrenceLabels[task.recurrence]}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono flex-wrap">
                      <span>تاريخ الاستحقاق: {task.dueDate}</span>
                      <span className="font-sans">· المسؤول: {task.assignedTo}</span>
                      {completion.completedBy && (
                        <span className="text-emerald-700 font-sans">· تم بواسطة: {completion.completedBy}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex-wrap">
                  {isAdmin && !isCompleted && (
                    <button
                      type="button"
                      onClick={() => adminCompleteTask(task.id, evalDate)}
                      className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors cursor-pointer"
                      title="إتمام المهمة إدارياً بدون تنفيذ خطواتها"
                    >
                      إتمام إداري
                    </button>
                  )}
                  {(canEditTasks || isFeedback || isFinishedWork) && (
                    <>
                      {isFeedback ? (
                        <button
                          type="button"
                          onClick={() => openFeedbackFollowUp(taskFeedback.prevWorkDay)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] border border-[#bfe2db] transition-colors cursor-pointer"
                        >
                          فتح قائمة الفيدباك
                        </button>
                      ) : isFinishedWork ? (
                        <button
                          type="button"
                          onClick={() => openFinishedWorkFollowUp(evalDate)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] border border-[#bfe2db] transition-colors cursor-pointer"
                        >
                          فتح قائمة خلص شغل
                        </button>
                      ) : canEditTasks ? (
                        <button
                          type="button"
                          onClick={() => toggleTask(task.id, evalDate)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                            isCompleted
                              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {isCompleted ? 'إعادة فتح' : 'تم الإنجاز ✓'}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openEditTaskModal(task)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl cursor-pointer"
                        title="تعديل المهمة"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {canDeleteTasks && (
                    confirmDeleteId === task.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            deleteTask(task.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          تأكيد الحذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(task.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer"
                        title="حذف المهمة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
            لا توجد مهام مسجلة مطابقة للفلاتر الحالية
          </div>
        )}
      </div>
        </>
      )}

      {/* Edit Task Modal */}
      {editingTask && canEditTasks && (
        <div
          onClick={() => setEditingTask(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">تعديل المهمة</h3>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTaskEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">عنوان المهمة *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">تفاصيل إضافية</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">الموظف المسؤول</label>
                  <select
                    value={editAssignee}
                    onChange={e => setEditAssignee(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                  >
                    {staffMembers.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={e => setEditDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">التكرار</label>
                <select
                  value={editRecurrence}
                  onChange={e => setEditRecurrence(e.target.value as Task['recurrence'])}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                >
                  <option value="once">مرة واحدة</option>
                  <option value="daily">تكرار يومي</option>
                  <option value="weekly">تكرار أسبوعي</option>
                  <option value="monthly">تكرار شهري</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold cursor-pointer"
                >
                  حفظ التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
