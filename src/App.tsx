import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { ClinicProvider, useClinic } from './context/ClinicContext';
import { formatCairoTime } from './utils/arabic';
import {
  evaluateShiftGateState,
  isStaffExemptFromAttendanceOnDate,
  parseAppointmentMinutes24,
  resolveEmployeeDefaultUnitForToday
} from './utils/staffAlerts';
import { PersistentActionButtons, DrShlkamyLogo } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { LoginView } from './components/LoginView';
import {
  AlertTriangle,
  X,
  MapPin,
  CheckCircle2,
  Bell,
  Clock,
  LogIn,
  LogOut,
  RefreshCw
} from 'lucide-react';

// Eager primary view
import { DashboardView } from './views/DashboardView';

// Lazy-loaded secondary views and modals for fast initial startup
const AppointmentsView = lazy(() => import('./views/AppointmentsView').then(m => ({ default: m.AppointmentsView })));
const PatientsView = lazy(() => import('./views/PatientsView').then(m => ({ default: m.PatientsView })));
const PatientDetailView = lazy(() => import('./views/PatientDetailView').then(m => ({ default: m.PatientDetailView })));
const InvoicesView = lazy(() => import('./views/InvoicesView').then(m => ({ default: m.InvoicesView })));
const PaymentsView = lazy(() => import('./views/PaymentsView').then(m => ({ default: m.PaymentsView })));
const ExpensesView = lazy(() => import('./views/ExpensesView').then(m => ({ default: m.ExpensesView })));
const AttendanceView = lazy(() => import('./views/AttendanceView').then(m => ({ default: m.AttendanceView })));
const TasksView = lazy(() => import('./views/TasksView').then(m => ({ default: m.TasksView })));
const WhatsAppView = lazy(() => import('./views/WhatsAppView').then(m => ({ default: m.WhatsAppView })));
const ReportsView = lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const ProceduresView = lazy(() => import('./views/ProceduresView').then(m => ({ default: m.ProceduresView })));
const ExcelImportView = lazy(() => import('./views/ExcelImportView').then(m => ({ default: m.ExcelImportView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));
const AuditLogView = lazy(() => import('./views/AuditLogView').then(m => ({ default: m.AuditLogView })));
const StaffCommentsView = lazy(() => import('./views/StaffCommentsView').then(m => ({ default: m.StaffCommentsView })));
const StaffAlertsView = lazy(() => import('./views/StaffAlertsView').then(m => ({ default: m.StaffAlertsView })));
const PatientFollowUpView = lazy(() => import('./views/PatientFollowUpView').then(m => ({ default: m.PatientFollowUpView })));
const FollowUpLogView = lazy(() => import('./views/FollowUpLogView').then(m => ({ default: m.FollowUpLogView })));
const NotesView = lazy(() => import('./views/NotesView').then(m => ({ default: m.NotesView })));


const QuickActionModal = lazy(() => import('./components/QuickActionModal').then(m => ({ default: m.QuickActionModal })));
const GlobalSearchModal = lazy(() => import('./components/GlobalSearchModal').then(m => ({ default: m.GlobalSearchModal })));
const PWAInstallModal = lazy(() => import('./components/PWAInstallModal').then(m => ({ default: m.PWAInstallModal })));

const ViewLoaderFallback: React.FC = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-7 h-7 rounded-full border-2 border-[#087e83] border-t-transparent animate-spin" />
  </div>
);

const ShiftAndPushGateMonitor: React.FC = React.memo(() => {
  const {
    currentUser,
    cloudUser,
    cloudAuthReady,
    cloudAttendanceReady,
    completedShiftDates,
    cloudError,
    triggerShiftActionFromAlert,
    attendance,
    units,
    weekdaySettings,
    cairoTodayStr,
    shiftStartSnoozeUntil,
    shiftEndSnoozeUntil,
    snoozeShiftStart,
    snoozeShiftEnd,
    enableMobilePushNotifications,
    restrictedUnit,
    logout
  } = useClinic();

  const [pushPromptDismissed, setPushPromptDismissed] = useState(false);
  const [pushPromptBusy, setPushPromptBusy] = useState(false);
  const [pushPromptNote, setPushPromptNote] = useState('');
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState('');
  const [gateUnitId, setGateUnitId] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [cloudAttendanceWaitExpired, setCloudAttendanceWaitExpired] = useState(false);
  const gateSnoozeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (gateSnoozeTimerRef.current) {
        window.clearTimeout(gateSnoozeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cloudAttendanceReady || cloudError) {
      setCloudAttendanceWaitExpired(false);
      return;
    }
    const timer = window.setTimeout(() => setCloudAttendanceWaitExpired(true), 3500);
    return () => window.clearTimeout(timer);
  }, [cloudAttendanceReady, cloudError, cloudUser]);

  const isExemptToday =
    currentUser.role === 'admin' || isStaffExemptFromAttendanceOnDate(currentUser, cairoTodayStr);
  const startMin = currentUser.shiftStartTime ? parseAppointmentMinutes24(currentUser.shiftStartTime) : null;
  const endMin = currentUser.shiftEndTime ? parseAppointmentMinutes24(currentUser.shiftEndTime) : null;

  useEffect(() => {
    if (isExemptToday || (startMin === null && endMin === null)) {
      return;
    }
    const refreshTick = () => setNowTick(Date.now());
    const onVisibility = () => {
      if (!document.hidden) refreshTick();
    };
    refreshTick();
    const interval = window.setInterval(refreshTick, 30000);
    window.addEventListener('focus', refreshTick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshTick);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isExemptToday, startMin, endMin, shiftStartSnoozeUntil, shiftEndSnoozeUntil]);

  const activeUnits = units.filter(u => !u.isDisabled);
  const allowedGateUnits = restrictedUnit
    ? activeUnits.filter(u => u.id === restrictedUnit.id)
    : activeUnits.length > 0
    ? activeUnits
    : units;
  const defaultUnitForToday = resolveEmployeeDefaultUnitForToday(currentUser, units, weekdaySettings);
  const resolvedStartUnitId =
    (gateUnitId && allowedGateUnits.some(u => u.id === gateUnitId) ? gateUnitId : '') ||
    defaultUnitForToday?.id ||
    allowedGateUnits[0]?.id ||
    '';

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const waitForCloudAttendance =
    !isOffline &&
    !cloudAttendanceWaitExpired &&
    !cloudError &&
    (!cloudAuthReady || (Boolean(cloudUser) && !cloudAttendanceReady));

  const { activeShift, isStartGateDue, isEndGateDue } = evaluateShiftGateState({
    currentUser,
    attendance,
    nowDate: new Date(nowTick),
    shiftStartSnoozeUntil,
    shiftEndSnoozeUntil,
    waitForCloudAttendance,
    completedShiftDateForUser: completedShiftDates[currentUser.id] || null
  });

  const notifPerm: NotificationPermission | 'unsupported' =
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
  const showStartupPushPrompt =
    !isStartGateDue &&
    !isEndGateDue &&
    !pushPromptDismissed &&
    notifPerm !== 'granted' &&
    notifPerm !== 'unsupported';

  if (isStartGateDue) {
    const selectedUnitObj =
      allowedGateUnits.find(u => u.id === resolvedStartUnitId) || defaultUnitForToday;
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[100] bg-gradient-to-b from-emerald-600 via-emerald-700 to-teal-900 text-white flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200"
      >
        <div className="w-full max-w-sm space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center mx-auto shadow-xl">
            <LogIn className="w-10 h-10 text-white" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-100">
              مرحباً {currentUser.name}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">تسجيل بدء العمل</h1>
            {currentUser.shiftStartTime && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-mono font-bold" dir="ltr">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatCairoTime(currentUser.shiftStartTime)}</span>
              </div>
            )}
          </div>

          {allowedGateUnits.length > 1 && !restrictedUnit ? (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-3 text-right space-y-1.5">
              <label className="text-[11px] font-bold text-emerald-100 block">فرع العمل اليوم</label>
              <select
                value={resolvedStartUnitId}
                onChange={e => setGateUnitId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white text-[#172f3d] text-xs font-extrabold focus:outline-none"
              >
                {allowedGateUnits.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          ) : selectedUnitObj ? (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs font-bold">
              <MapPin className="w-3.5 h-3.5" />
              <span>{selectedUnitObj.name}</span>
            </div>
          ) : null}

          {gateError && (
            <div className="p-3 rounded-2xl bg-rose-950/70 border border-rose-300/40 text-rose-100 text-xs font-bold leading-relaxed space-y-2.5">
              <div className="flex items-start gap-2 text-right">
                <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
                <span>{gateError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (gateSnoozeTimerRef.current) {
                    window.clearTimeout(gateSnoozeTimerRef.current);
                    gateSnoozeTimerRef.current = null;
                  }
                  setGateError('');
                  snoozeShiftStart(15);
                }}
                className="w-full py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-extrabold cursor-pointer transition-colors"
              >
                تأجيل ١٥ دقيقة ومتابعة العمل الآن
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={gateBusy}
            onClick={async () => {
              if (gateSnoozeTimerRef.current) {
                window.clearTimeout(gateSnoozeTimerRef.current);
                gateSnoozeTimerRef.current = null;
              }
              setGateError('');
              setGateBusy(true);
              const res = await triggerShiftActionFromAlert(
                'shift_start',
                'شاشة بداية الشفت الإلزامية',
                resolvedStartUnitId
              );
              setGateBusy(false);
              if (!res.success) {
                setGateError(
                  `${res.error || 'تعذر التحقق من الموقع الجغرافي'} — سيتم عمل تأجيل (Snooze) لمدة ١٥ دقيقة والدخول للعمل.`
                );
                gateSnoozeTimerRef.current = window.setTimeout(() => {
                  gateSnoozeTimerRef.current = null;
                  setGateError('');
                  snoozeShiftStart(15);
                }, 1500);
              }
            }}
            className="w-full py-5 px-6 rounded-3xl bg-white hover:bg-emerald-50 active:scale-95 text-emerald-800 font-extrabold text-xl shadow-2xl transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-70"
          >
            {gateBusy ? (
              <>
                <MapPin className="w-6 h-6 animate-pulse" />
                <span>جاري التحقق من الموقع...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                <span>ابدأ العمل</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (gateSnoozeTimerRef.current) {
                window.clearTimeout(gateSnoozeTimerRef.current);
                gateSnoozeTimerRef.current = null;
              }
              logout();
            }}
            className="text-xs font-bold text-emerald-100/80 hover:text-white underline cursor-pointer pt-2"
          >
            تسجيل الخروج / تغيير الحساب
          </button>
        </div>
      </div>
    );
  }

  if (isEndGateDue && activeShift) {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[100] bg-gradient-to-b from-rose-600 via-rose-700 to-red-950 text-white flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200"
      >
        <div className="w-full max-w-sm space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center mx-auto shadow-xl">
            <LogOut className="w-10 h-10 text-white" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-100">
              {currentUser.name} · {activeShift.unitName}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">حان وقت إنهاء العمل</h1>
            {currentUser.shiftEndTime && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-mono font-bold" dir="ltr">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatCairoTime(currentUser.shiftEndTime)}</span>
              </div>
            )}
          </div>

          {gateError && (
            <div className="p-3 rounded-2xl bg-black/35 border border-white/20 text-rose-100 text-xs font-bold leading-relaxed flex items-start gap-2 text-right">
              <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
              <span>{gateError}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              disabled={gateBusy}
              onClick={async () => {
                setGateError('');
                setGateBusy(true);
                const res = await triggerShiftActionFromAlert(
                  'shift_end',
                  'شاشة نهاية الشفت الإلزامية'
                );
                setGateBusy(false);
                if (!res.success && res.error) {
                  setGateError(res.error);
                }
              }}
              className="w-full py-5 px-6 rounded-3xl bg-white hover:bg-rose-50 active:scale-95 text-rose-800 font-extrabold text-xl shadow-2xl transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-70"
            >
              {gateBusy ? (
                <>
                  <MapPin className="w-6 h-6 animate-pulse" />
                  <span>جاري التحقق من الموقع...</span>
                </>
              ) : (
                <>
                  <LogOut className="w-6 h-6" />
                  <span>إنهاء الشفت</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={gateBusy}
              onClick={() => {
                setGateError('');
                snoozeShiftEnd(10);
              }}
              className="w-full py-3.5 px-5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-extrabold text-sm cursor-pointer transition-all"
            >
              تأجيل ١٠ دقائق
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showStartupPushPrompt) {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      >
        <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#d6e5e8] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#172f3d]">تفعيل إشعارات الهاتف الفورية</h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  تصلك تنبيهات المواعيد والشفت على الموبايل حتى عند إغلاق الموقع
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPushPromptDismissed(true)}
              className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 cursor-pointer"
              aria-label="لاحقاً"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {notifPerm === 'denied' && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold leading-relaxed">
              الإشعارات محظورة من إعدادات المتصفح حالياً — اضغط على أيقونة القفل بجانب عنوان الموقع واختر "السماح بالإشعارات" ثم أعد المحاولة.
            </div>
          )}

          {pushPromptNote && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold">
              {pushPromptNote}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pushPromptBusy}
              onClick={async () => {
                setPushPromptNote('');
                setPushPromptBusy(true);
                const res = await enableMobilePushNotifications();
                setPushPromptBusy(false);
                if (res.ok) {
                  setPushPromptDismissed(true);
                } else if (res.reason) {
                  setPushPromptNote(res.reason);
                }
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-extrabold text-xs cursor-pointer disabled:opacity-60"
            >
              {pushPromptBusy ? 'جاري التفعيل...' : 'تفعيل الإشعارات الآن'}
            </button>
            <button
              type="button"
              onClick={() => setPushPromptDismissed(true)}
              className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
            >
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
});

const MainLayout: React.FC = () => {
  const {
    isLoggedIn,
    currentUser,
    activeView,
    setActiveView,
    hasPermission,
    deviceLayout,
    isQuickActionOpen,
    isGlobalSearchOpen,
    setIsGlobalSearchOpen,
    isPWAInstallModalOpen,
    setIsPWAInstallModalOpen,
    cloudUser,
    cloudAuthReady,
    cloudError,
    cloudNeedsConsoleSetup,
    pendingCloudCount,
    retryPendingCloudSync,
    retryAttendanceSync,
    attendanceSyncErrors,
    shiftAlertFeedback,
    clearShiftAlertFeedback,
    triggerShiftActionFromAlert
  } = useClinic();

  const [dismissCloudPrompt, setDismissCloudPrompt] = useState(false);
  const [retryingCloud, setRetryingCloud] = useState(false);
  const [cloudRetryError, setCloudRetryError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsGlobalSearchOpen]);

  const handleRetryCloud = async () => {
    if (retryingCloud) return;
    setCloudRetryError('');
    setRetryingCloud(true);
    try {
      const res = await retryPendingCloudSync();
      if (!res.success && res.error) {
        setCloudRetryError(res.error);
      }
    } catch (err) {
      setCloudRetryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingCloud(false);
    }
  };

  const renderCloudSetupNotice = () => {
    if (cloudNeedsConsoleSetup && !dismissCloudPrompt) {
      return (
        <div className="mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm overflow-hidden">
          <div className="flex items-start gap-2.5 text-xs min-w-0 flex-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">
                {currentUser.role === 'admin'
                  ? 'تفعيل الربط التلقائي لقاعدة البيانات السحابية (مرة واحدة فقط)'
                  : 'المزامنة السحابية متوقفة حالياً — التعديلات محفوظة محلياً على هذا الجهاز فقط'}
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                {currentUser.role === 'admin'
                  ? 'لتعمل المزامنة تلقائياً لجميع الموظفين بدون حساب Google، افتح Firebase Console ← Authentication ← Sign-in method ← فعّل Anonymous ثم اضغط إعادة الاتصال.'
                  : 'يرجى إبلاغ مدير العيادة لتفعيل خيار Anonymous في إعدادات Firebase، وحتى يتم التفعيل ستبقى تعديلاتك محفوظة محلياً على هذا الجهاز فقط ولن تظهر للأجهزة الأخرى.'}
                {pendingCloudCount > 0 ? ` (${pendingCloudCount} تعديل بانتظار الرفع التلقائي فور التفعيل)` : ''}
              </p>
              {cloudRetryError && (
                <p className="text-[11px] font-bold text-rose-700 mt-1 break-words [overflow-wrap:anywhere]">{cloudRetryError}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
            <button
              type="button"
              onClick={handleRetryCloud}
              disabled={retryingCloud}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer whitespace-nowrap"
            >
              {retryingCloud ? 'جاري الاتصال...' : 'إعادة الاتصال'}
            </button>
            <button
              type="button"
              onClick={() => setDismissCloudPrompt(true)}
              className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 cursor-pointer"
              title="إخفاء الآن"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    if (!cloudNeedsConsoleSetup && ((cloudAuthReady && !cloudUser) || cloudError) && !dismissCloudPrompt) {
      return (
        <div className="mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm overflow-hidden">
          <div className="flex items-start gap-2.5 text-xs min-w-0 flex-1">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">
                تعذر المزامنة مع السحابة حالياً
                {pendingCloudCount > 0 ? ` (${pendingCloudCount} تعديل في انتظار الحفظ السحابي)` : ''}
              </div>
              <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                التغييرات محفوظة بأمان على جهازك وسيتم رفعها تلقائياً بمجرد عودة الاتصال.
              </p>
              {(cloudRetryError || cloudError) && (
                <p className="text-[11px] font-bold text-rose-700 mt-1 break-all [overflow-wrap:anywhere] max-h-24 overflow-y-auto">
                  {cloudRetryError || cloudError}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
            <button
              type="button"
              onClick={handleRetryCloud}
              disabled={retryingCloud}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer whitespace-nowrap flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${retryingCloud ? 'animate-spin' : ''}`} />
              <span>{retryingCloud ? 'جاري المزامنة...' : 'إعادة الاتصال والمزامنة'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissCloudPrompt(true)}
              className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-100 cursor-pointer"
              title="إخفاء الآن"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    if (cloudUser && pendingCloudCount > 0) {
      return (
        <div className="mb-3 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-2 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-bold">
            <RefreshCw className={`w-3.5 h-3.5 text-amber-600 flex-shrink-0 ${retryingCloud ? 'animate-spin' : ''}`} />
            <span>جاري مزامنة {pendingCloudCount} تعديل مع السحابة...</span>
          </div>
          <button
            type="button"
            onClick={handleRetryCloud}
            disabled={retryingCloud}
            className="px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer flex-shrink-0"
          >
            {retryingCloud ? 'جاري...' : 'مزامنة الآن'}
          </button>
        </div>
      );
    }

    return null;
  };

  const renderShiftAlertFeedback = () => {
    if (!shiftAlertFeedback) return null;
    const isError = shiftAlertFeedback.type === 'error';
    const isLoading = shiftAlertFeedback.type === 'loading';
    const isStart = shiftAlertFeedback.action === 'shift_start';
    return (
      <div
        className={`mb-3 p-3 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
          isError
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : isLoading
            ? 'bg-[#e7f5f2] border-[#bfe2db] text-[#087e83]'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}
      >
        <div className="flex items-start gap-2 font-bold">
          {isLoading ? (
            <MapPin className="w-4 h-4 animate-pulse flex-shrink-0 mt-0.5" />
          ) : isError ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
          )}
          <span>{shiftAlertFeedback.text}</span>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
          {isError && (
            <button
              type="button"
              onClick={() => {
                if (
                  Object.keys(attendanceSyncErrors).length > 0 &&
                  shiftAlertFeedback.text.includes('المزامنة')
                ) {
                  void retryAttendanceSync().then(res => {
                    if (res.success && res.failedCount === 0) {
                      clearShiftAlertFeedback();
                    }
                  });
                  return;
                }
                void triggerShiftActionFromAlert(shiftAlertFeedback.action, 'إعادة محاولة من التنبيه');
              }}
              className={`px-3 py-1.5 rounded-xl text-white font-bold text-[11px] cursor-pointer ${
                isStart ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {Object.keys(attendanceSyncErrors).length > 0 && shiftAlertFeedback.text.includes('المزامنة')
                ? 'إعادة محاولة المزامنة'
                : isStart
                ? 'إعادة محاولة بدأ الشفت'
                : 'إعادة محاولة إنهاء الشفت'}
            </button>
          )}
          {!isLoading && (
            <button
              type="button"
              onClick={clearShiftAlertFeedback}
              className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"
              title="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };


  if (!isLoggedIn) {
    return <LoginView />;
  }

  const canAccessView = (): boolean => {
    switch (activeView) {
      case 'staff_alerts':
      case 'staff_comments':
      case 'follow_up_logs':
      case 'audit_logs':
      case 'reports':
      case 'procedures':
      case 'settings':
      case 'excel_import':
        return currentUser.role === 'admin';

      case 'appointments':
        return (
          hasPermission('viewAppointments') ||
          hasPermission('addAppointments') ||
          hasPermission('editAppointments') ||
          hasPermission('deleteAppointments')
        );
      case 'patients':
      case 'patient_detail':
      case 'patient_follow_up':
        return (
          hasPermission('viewPatients') ||
          hasPermission('addPatients') ||
          hasPermission('editPatients') ||
          hasPermission('deletePatients')
        );
      case 'tasks':
        return (
          hasPermission('viewTasks') ||
          hasPermission('addTasks') ||
          hasPermission('editTasks') ||
          hasPermission('deleteTasks')
        );
      case 'expenses':
        return (
          hasPermission('viewExpenses') ||
          hasPermission('addExpenses') ||
          hasPermission('editExpenses') ||
          hasPermission('deleteExpenses')
        );
      case 'invoices':
      case 'payments':
        return (
          hasPermission('viewInvoicesPayments') ||
          hasPermission('addInvoicesPayments') ||
          hasPermission('editInvoicesPayments') ||
          hasPermission('deleteInvoicesPayments')
        );
      default:
        return true;
    }
  };

  const renderActiveView = () => {
    if (!canAccessView()) {
      return (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-8 shadow-sm text-center space-y-3 max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto font-extrabold text-lg">
            !
          </div>
          <h2 className="text-base font-extrabold text-[#172f3d]">
            غير مصرح بالوصول لهذه الصفحة
          </h2>
          <p className="text-xs text-slate-500">
            حسابك الحالي لا يملك صلاحية فتح هذا القسم. يمكنك التواصل مع مدير العيادة لتفعيل الصلاحية من الإعدادات.
          </p>
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
          >
            العودة للصفحة الرئيسية
          </button>
        </div>
      );
    }

    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'appointments':
        return <AppointmentsView />;
      case 'patients':
        return <PatientsView />;
      case 'patient_detail':
        return <PatientDetailView />;
      case 'invoices':
        return <InvoicesView />;
      case 'payments':
        return <PaymentsView />;
      case 'expenses':
        return <ExpensesView />;
      case 'attendance':
        return <AttendanceView />;
      case 'tasks':
        return <TasksView />;
      case 'whatsapp':
        return <WhatsAppView />;
      case 'reports':
        return <ReportsView />;
      case 'procedures':
        return <ProceduresView />;
      case 'excel_import':
        return <ExcelImportView />;
      case 'settings':
        return <SettingsView />;
      case 'audit_logs':
        return <AuditLogView />;
      case 'staff_comments':
        return <StaffCommentsView />;
      case 'staff_alerts':
        return <StaffAlertsView />;
      case 'patient_follow_up':
        return <PatientFollowUpView />;
      case 'follow_up_logs':
        return <FollowUpLogView />;
      case 'notes':
        return <NotesView />;

      default:
        return <DashboardView />;
    }
  };

  const renderLazyModals = () => (
    <Suspense fallback={null}>
      {isQuickActionOpen && <QuickActionModal />}
      {isGlobalSearchOpen && <GlobalSearchModal />}
      {isPWAInstallModalOpen && (
        <PWAInstallModal
          isOpen={isPWAInstallModalOpen}
          onClose={() => setIsPWAInstallModalOpen(false)}
        />
      )}
    </Suspense>
  );

  const isDesktop = deviceLayout === 'desktop';
  const isTablet = deviceLayout === 'tablet';

  return (
    <div className="min-h-screen bg-[#f4f7f9] dark:bg-[#0b1319] text-[#172f3d] flex flex-col font-sans selection:bg-[#bce7d9] selection:text-[#123844]">
      <ShiftAndPushGateMonitor />

      {isDesktop ? (
        /* DESKTOP LAYOUT: Docked persistent sidebar + wide workspace */
        <div className="flex-1 flex min-h-screen w-full">
          <Sidebar />

          <div className="flex-1 min-w-0 flex flex-col">
            <header className="sticky top-0 z-30 bg-[#f4f7f9]/95 dark:bg-[#0b1319]/95 backdrop-blur-md border-b border-[#dce8eb] dark:border-[#1d2f3d] px-6 py-2.5">
              <div className="max-w-[1400px] mx-auto w-full">
                <PersistentActionButtons hideMenuButton={true} />
              </div>
            </header>

            <main className="flex-1 min-w-0 w-full max-w-[1400px] mx-auto p-5 lg:p-7 pb-12">
              {renderShiftAlertFeedback()}
              {renderCloudSetupNotice()}
              <Suspense fallback={<ViewLoaderFallback />}>
                {renderActiveView()}
              </Suspense>
            </main>
          </div>

          {renderLazyModals()}
        </div>
      ) : (
        /* TABLET & MOBILE LAYOUTS: Responsive full-screen canvas + drawer + bottom dock */
        <div className="flex-1 flex flex-col min-h-screen relative overflow-x-hidden w-full">
          <div
            className={`fixed top-[calc(env(safe-area-inset-top,0px)+14px)] z-40 pointer-events-none mx-auto transform-gpu ${
              isTablet ? 'left-5 right-5 max-w-4xl' : 'left-3 right-3 sm:left-6 sm:right-6 max-w-2xl'
            }`}
          >
            <PersistentActionButtons />
          </div>

          <div
            className={`flex-1 flex flex-col w-full min-w-0 mx-auto ${
              isTablet ? 'max-w-4xl' : 'max-w-2xl'
            }`}
          >
            <div
              className={`pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-2 flex items-center justify-center flex-shrink-0 ${
                isTablet ? 'px-28 min-h-[58px]' : 'px-24 sm:px-28 min-h-[54px]'
              }`}
            >
              <DrShlkamyLogo />
            </div>

            <Sidebar />

            <main
              className={`flex-1 min-w-0 pb-24 ${
                isTablet ? 'px-5 sm:px-6 pt-2' : 'p-3 sm:p-5'
              }`}
            >
              {renderShiftAlertFeedback()}
              {renderCloudSetupNotice()}
              <Suspense fallback={<ViewLoaderFallback />}>
                {renderActiveView()}
              </Suspense>
            </main>
          </div>

          {renderLazyModals()}
          <BottomNav />
        </div>
      )}
    </div>
  );
};

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'حدث خطأ غير متوقع' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#0f1b22] flex items-center justify-center p-4 text-[#172f3d] font-sans"
        >
          <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-[#dce8eb] text-center space-y-4">
            <h2 className="text-lg font-extrabold text-rose-700">تعذر تحميل الصفحة</h2>
            <p className="text-xs text-slate-500">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
            >
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ClinicProvider>
        <MainLayout />
      </ClinicProvider>
    </AppErrorBoundary>
  );
}
