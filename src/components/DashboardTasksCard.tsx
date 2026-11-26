import React from 'react';
import {
  Calendar as CalendarIcon,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  RotateCcw
} from 'lucide-react';
import { StaffMember, Task } from '../types/clinic';
import {
  TaskEvaluationContext,
  getTaskCompletionForDate,
  isFeedbackTaskTitle
} from '../utils/feedback';
import {
  computeFinishedWorkTaskProgress,
  isFinishedWorkTaskTitle
} from '../utils/finishedWork';
import { ActiveView } from '../context/ClinicContext';

export interface DashboardFeedbackSummary {
  prevWorkDay: string;
  totalPatients: number;
  processedCount: number;
  doneCount: number;
  notDoneCount: number;
}

interface DashboardTasksCardProps {
  taskListRef: React.RefObject<HTMLDivElement | null>;
  isAdmin: boolean;
  effectiveCanAddTasks: boolean;
  effectiveCanEditTasks: boolean;
  taskStaffFilter: string;
  setTaskStaffFilter: (val: string) => void;
  activeTaskDate: string;
  taskWeekdayName: string;
  taskDaySlashMonth: string;
  isTaskToday: boolean;
  stepTaskDate: (days: number) => void;
  resetTaskToToday: () => void;
  openTasksCalendar: () => void;
  selectedDateTasks: Task[];
  overdueTasks: Task[];
  taskEvalCtx: TaskEvaluationContext;
  feedbackProgress: DashboardFeedbackSummary;
  staffMembers: StaffMember[];
  toggleTask: (taskId: string, dateStr?: string) => void;
  adminCompleteTask: (taskId: string, dateStr?: string) => void;
  setActiveView: (view: ActiveView) => void;
  setIsQuickActionOpen: (
    open: boolean,
    tab?: 'appointment' | 'patient' | 'invoice' | 'payment' | 'expense' | 'task',
    prefill?: { date?: string; time?: string; unitId?: string; doctorId?: string; patientId?: string; appointmentId?: string; invoiceId?: string; amount?: number; toothNumber?: number; toothNumbers?: number[] }
  ) => void;
  openFeedbackFollowUp: (e?: React.MouseEvent, anchorYmd?: string) => void;
  openFinishedWorkFollowUp: (e?: React.MouseEvent, evalYmd?: string) => void;
}

export const DashboardTasksCard: React.FC<DashboardTasksCardProps> = React.memo(({
  taskListRef,
  isAdmin,
  effectiveCanAddTasks,
  effectiveCanEditTasks,
  taskStaffFilter,
  setTaskStaffFilter,
  activeTaskDate,
  taskWeekdayName,
  taskDaySlashMonth,
  isTaskToday,
  stepTaskDate,
  resetTaskToToday,
  openTasksCalendar,
  selectedDateTasks,
  overdueTasks,
  taskEvalCtx,
  feedbackProgress,
  staffMembers,
  toggleTask,
  adminCompleteTask,
  setActiveView,
  setIsQuickActionOpen,
  openFeedbackFollowUp,
  openFinishedWorkFollowUp
}) => {
  return (
    <div
      ref={taskListRef}
      className="@container bg-white border border-[#dce8eb] rounded-3xl p-3.5 sm:p-5 shadow-sm space-y-4 min-w-0 [overflow-anchor:none]"
    >
      <div className="flex flex-col gap-2.5 pb-3 border-b border-slate-100 min-w-0 @xl:grid @xl:grid-cols-[1fr_auto_1fr] @xl:items-center @xl:gap-2">
        {/* Mobile Row 1 (becomes left/right grid columns at @xl) */}
        <div className="flex items-center justify-between gap-2 w-full @xl:contents">
          {/* Right side: Employee Filter (Admin) + All tasks link */}
          <div className="flex items-center justify-start gap-2 min-w-0 @xl:order-1">
            {isAdmin && (
              <select
                value={taskStaffFilter}
                onChange={e => setTaskStaffFilter(e.target.value)}
                className="text-[11px] font-bold bg-[#f0f6f5] text-[#087e83] border border-[#d6e5e8] rounded-xl px-2.5 py-1.5 cursor-pointer focus:outline-none max-w-[130px] @xl:max-w-none truncate touch-manipulation"
                title="عرض مهام الموظف"
              >
                <option value="all">كل الموظفين</option>
                {staffMembers.map(s => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setActiveView('tasks')}
              className="text-xs font-bold text-[#087e83] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap touch-manipulation select-none [-webkit-tap-highlight-color:transparent]"
            >
              <span className="pointer-events-none">كل المهام</span>
              <ArrowLeft className="w-3.5 h-3.5 pointer-events-none" />
            </button>
          </div>

          {/* Physical Left (RTL end): Create Button (Cursor Date) */}
          <div className="flex items-center justify-end gap-1.5 shrink-0 @xl:order-3">
            {effectiveCanAddTasks && (
              <button
                type="button"
                onClick={() => setIsQuickActionOpen(true, 'task', { date: activeTaskDate })}
                className="px-3 py-1.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                title="إضافة مهمة جديدة بتاريخ المهام المحدد"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5] pointer-events-none" />
                <span className="pointer-events-none">مهمة</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Row 2 / Desktop Center: Task Date Pager (Calendar & navigation hidden for non-admin) */}
        <div className="flex flex-col items-center justify-center gap-1.5 min-w-0 w-full @xl:w-auto @xl:order-2">
          {isAdmin ? (
            <>
              <div className="flex items-center justify-between gap-1 sm:gap-2 w-full @xl:w-auto @xl:justify-center">
                <button
                  type="button"
                  onClick={() => stepTaskDate(-1)}
                  className="shrink-0 px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#172f3d] font-bold text-[11px] sm:text-xs flex items-center gap-0.5 transition-colors cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                  title="اليوم السابق"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-[#087e83] pointer-events-none" />
                  <span className="pointer-events-none">السابق</span>
                </button>

                <button
                  type="button"
                  onClick={openTasksCalendar}
                  className="min-w-0 flex-1 @xl:flex-initial text-[11px] sm:text-sm md:text-base font-extrabold text-[#172f3d] hover:text-[#087e83] bg-[#f0f6f5] hover:bg-[#e2efec] border border-[#bfe2db] hover:border-[#087e83] shadow-2xs active:scale-[0.98] px-2 sm:px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 leading-snug text-center whitespace-nowrap touch-manipulation select-none [-webkit-tap-highlight-color:transparent]"
                  title="اضغط لاختيار يوم من التقويم"
                >
                  <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#087e83] shrink-0 pointer-events-none" />
                  <span className="pointer-events-none">مهام</span>
                  <span className="truncate pointer-events-none">
                    {taskWeekdayName} {taskDaySlashMonth}
                  </span>
                  <span className="text-[#087e83] font-mono shrink-0 bg-white/80 px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs border border-[#bfe2db] pointer-events-none">
                    {selectedDateTasks.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => stepTaskDate(1)}
                  className="shrink-0 px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#172f3d] font-bold text-[11px] sm:text-xs flex items-center gap-0.5 transition-colors cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-95"
                  title="اليوم القادم"
                >
                  <span className="pointer-events-none">القادم</span>
                  <ChevronLeft className="w-3.5 h-3.5 text-[#087e83] pointer-events-none" />
                </button>
              </div>

              {!isTaskToday && (
                <button
                  type="button"
                  onClick={resetTaskToToday}
                  className="px-3.5 py-1 rounded-full bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-[11px] shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent]"
                >
                  <RotateCcw className="w-3 h-3 pointer-events-none" />
                  <span className="pointer-events-none">العودة لليوم</span>
                </button>
              )}
            </>
          ) : (
            <div className="text-xs sm:text-sm font-extrabold text-[#172f3d] bg-[#f0f6f5] border border-[#dce8eb] px-3.5 py-1.5 rounded-xl flex items-center justify-center gap-2 whitespace-nowrap">
              <span>مهام اليوم {taskWeekdayName} {taskDaySlashMonth}</span>
              <span className="text-[#087e83] font-mono bg-white px-1.5 py-0.2 rounded-full text-[11px] border border-[#bfe2db]">
                {selectedDateTasks.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Selected Day Tasks */}
      {selectedDateTasks.length > 0 ? (
        <div className="space-y-2">
          {selectedDateTasks.map(t => {
            const completion = getTaskCompletionForDate(t, activeTaskDate, taskEvalCtx);
            const isCompleted = completion.isCompleted;
            const isFeedback = isFeedbackTaskTitle(t.title);
            const isFinishedWork = isFinishedWorkTaskTitle(t.title);
            const taskFeedback = completion.feedbackProgress || feedbackProgress;
            const taskFinishedWork =
              isFinishedWork
                ? completion.finishedWorkProgress ||
                  computeFinishedWorkTaskProgress(
                    activeTaskDate,
                    taskEvalCtx.weekdaySettings,
                    taskEvalCtx.patients || [],
                    taskEvalCtx.appointments,
                    taskEvalCtx.operations || [],
                    taskEvalCtx.invoices || [],
                    taskEvalCtx.patientFollowUpLogs
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

            return (
              <div
                key={t.id}
                onClick={() => {
                  if (isFinishedWork) {
                    openFinishedWorkFollowUp(undefined, activeTaskDate);
                    return;
                  }
                  if (isFeedback) {
                    openFeedbackFollowUp(undefined, taskFeedback.prevWorkDay);
                    return;
                  }
                  if (effectiveCanEditTasks) toggleTask(t.id, activeTaskDate);
                }}
                className={`p-3 rounded-2xl border transition-all flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 select-none touch-manipulation ${
                  isFeedback || isFinishedWork || effectiveCanEditTasks ? 'cursor-pointer' : 'cursor-default'
                } ${
                  isCompleted
                    ? 'bg-slate-50 border-slate-200 opacity-75'
                    : 'bg-white border-slate-200 hover:border-[#087e83]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {isFeedback || isFinishedWork ? (
                    <div className="flex flex-col items-start gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={e =>
                          isFinishedWork
                            ? openFinishedWorkFollowUp(e, activeTaskDate)
                            : openFeedbackFollowUp(e, taskFeedback.prevWorkDay)
                        }
                        className="relative overflow-hidden px-3 py-1.5 rounded-xl border border-emerald-500/70 bg-slate-100 text-xs font-extrabold text-slate-900 shadow-2xs flex-shrink-0 cursor-pointer hover:brightness-95 transition-all touch-manipulation"
                        title={
                          isFinishedWork
                            ? `فتح قائمة خلص شغل ليوم ${activeTaskDate}`
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
                        <span className="relative z-10 flex items-center gap-1.5 pointer-events-none">
                          <span>اتمام المهمة</span>
                          <span className="font-mono" dir="ltr">
                            {processed}/{total}
                          </span>
                        </span>
                      </button>
                      {isFinishedWork && (deferredCount > 0 || carryoverCredit > 0 || surplusCount > 0) && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {deferredCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                              مؤجل {deferredCount.toLocaleString('ar-EG')} بيشنت
                            </span>
                          )}
                          {carryoverCredit > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              +{carryoverCredit.toLocaleString('ar-EG')} مرحّل
                            </span>
                          )}
                          {surplusCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200">
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
                      disabled={!effectiveCanEditTasks}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-[#087e83] cursor-pointer disabled:cursor-default flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className={`text-xs font-bold ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {t.title}
                    </p>
                    {t.description && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {t.description}
                      </p>
                    )}
                    {completion.completedBy && (
                      <p className="text-[10px] text-emerald-700 font-bold mt-0.5">
                        تم بواسطة: {completion.completedBy}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-2 flex-shrink-0">
                  {isAdmin && !isCompleted && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        adminCompleteTask(t.id, activeTaskDate);
                      }}
                      className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors cursor-pointer touch-manipulation"
                      title="إتمام المهمة إدارياً بدون تنفيذ خطواتها"
                    >
                      إتمام إداري
                    </button>
                  )}
                  <span>{t.assignedTo}</span>
                  {isCompleted && <span className="text-emerald-700 text-[10px] font-bold">✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-400 py-3 text-center">لا توجد مهام</p>
      )}

      {/* Overdue Tasks Section if any */}
      {overdueTasks.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-2">
            <AlertCircle className="w-4 h-4" />
            <span>مهام متأخرة ({overdueTasks.length})</span>
          </div>
          <div className="space-y-1.5">
            {overdueTasks.map(t => {
              const completion = getTaskCompletionForDate(t, t.dueDate, taskEvalCtx);
              const isFeedback = isFeedbackTaskTitle(t.title);
              const isFinishedWork = isFinishedWorkTaskTitle(t.title);
              const taskFeedback = completion.feedbackProgress || feedbackProgress;
              const taskFinishedWork =
                isFinishedWork
                  ? completion.finishedWorkProgress ||
                    computeFinishedWorkTaskProgress(
                      t.dueDate,
                      taskEvalCtx.weekdaySettings,
                      taskEvalCtx.patients || [],
                      taskEvalCtx.appointments,
                      taskEvalCtx.operations || [],
                      taskEvalCtx.invoices || [],
                      taskEvalCtx.patientFollowUpLogs
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

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    if (isFinishedWork) {
                      openFinishedWorkFollowUp(undefined, t.dueDate);
                      return;
                    }
                    if (isFeedback) {
                      openFeedbackFollowUp(undefined, taskFeedback.prevWorkDay);
                      return;
                    }
                    if (effectiveCanEditTasks) toggleTask(t.id, t.dueDate);
                  }}
                  className={`p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2 text-xs touch-manipulation ${
                    isFeedback || isFinishedWork || effectiveCanEditTasks ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    {isFeedback || isFinishedWork ? (
                      <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                        <button
                          type="button"
                          onClick={e =>
                            isFinishedWork
                              ? openFinishedWorkFollowUp(e, t.dueDate)
                              : openFeedbackFollowUp(e, taskFeedback.prevWorkDay)
                          }
                          className="relative overflow-hidden px-2.5 py-1 rounded-lg border border-emerald-500/70 bg-white text-[11px] font-extrabold text-slate-900 flex-shrink-0 cursor-pointer touch-manipulation"
                        >
                          <div className="absolute inset-0 flex pointer-events-none" dir="rtl">
                            {greenPct > 0 && <div className="h-full bg-emerald-400/70" style={{ width: `${greenPct}%` }} />}
                            {redPct > 0 && <div className="h-full bg-rose-400/75" style={{ width: `${redPct}%` }} />}
                          </div>
                          <span className="relative z-10 flex items-center gap-1 pointer-events-none">
                            <span>اتمام المهمة</span>
                            <span className="font-mono" dir="ltr">
                              {processed}/{total}
                            </span>
                          </span>
                        </button>
                        {isFinishedWork && deferredCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                            مؤجل {deferredCount.toLocaleString('ar-EG')} بيشنت
                          </span>
                        )}
                      </div>
                    ) : (
                      <input
                        type="checkbox"
                        checked={completion.isCompleted}
                        disabled={!effectiveCanEditTasks}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-amber-700 cursor-pointer disabled:cursor-default"
                      />
                    )}
                    <span className="font-bold text-amber-900 truncate">{t.title}</span>
                  </div>
                  <div className="text-[10px] text-amber-700 font-mono font-bold flex items-center gap-2 flex-shrink-0">
                    {isAdmin && !completion.isCompleted && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          adminCompleteTask(t.id, t.dueDate);
                        }}
                        className="px-2 py-0.5 rounded-lg font-sans text-[10px] font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors cursor-pointer touch-manipulation"
                      >
                        إتمام إداري
                      </button>
                    )}
                    <span>{isAdmin ? `${t.assignedTo} · ` : ''}{t.dueDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

DashboardTasksCard.displayName = 'DashboardTasksCard';
