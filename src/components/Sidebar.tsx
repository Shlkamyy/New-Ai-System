import React, { useMemo } from 'react';
import { useClinic, ActiveView, STAFF_ROLE_LABELS } from '../context/ClinicContext';
import {
  Home,
  Users,
  Calendar,
  FileText,
  CreditCard,
  TrendingDown,
  MessageCircle,
  Clock,
  CheckSquare,
  BarChart3,
  Stethoscope,
  Settings,
  X,
  PlusCircle,
  Download,
  FileSpreadsheet,
  Moon,
  Sun,
  LogOut,
  Bell,
  UserCheck,
  ClipboardList,
  ChevronDown,
  Search,
  RefreshCw,
  StickyNote
} from 'lucide-react';
import { getDueStaffAppointmentAlerts } from '../utils/staffAlerts';
import { matchArabicTerms } from '../utils/arabic';
import { getTaskCompletionForDate } from '../utils/feedback';

export const Sidebar: React.FC = React.memo(() => {
  const {
    activeView,
    setActiveView,
    isDrawerOpen,
    setIsDrawerOpen,
    whatsappAlerts,
    appointments,
    patients,
    operations,
    invoices,
    tasks,
    setIsQuickActionOpen,
    darkMode,
    toggleDarkMode,
    setIsPWAInstallModalOpen,
    deviceLayout,
    currentUser,
    hasPermission,
    logout,
    staffAlertSettings,
    weekdaySettings,
    patientFollowUpLogs,
    cairoTodayStr,
    cloudUser,
    cloudAuthReady,
    cloudSynced,
    cloudError,
    cloudNeedsConsoleSetup,
    pendingCloudCount,
    retryPendingCloudSync
  } = useClinic();
  const [isRetryingSync, setIsRetryingSync] = React.useState(false);

  const handleSidebarSyncRetry = async () => {
    if (isRetryingSync) return;
    setIsRetryingSync(true);
    try {
      await retryPendingCloudSync();
    } finally {
      setIsRetryingSync(false);
    }
  };

  const today = cairoTodayStr;
  const pendingAlerts = useMemo(
    () => whatsappAlerts.filter(a => a.status === 'pending').length,
    [whatsappAlerts]
  );
  const todayApptsList = useMemo(
    () => appointments.filter(a => a.date === today && a.status !== 'cancelled'),
    [appointments, today]
  );
  const todayAppts = todayApptsList.length;
  const dueStaffAlertsCount = useMemo(
    () =>
      currentUser.role === 'admin'
        ? getDueStaffAppointmentAlerts(todayApptsList, staffAlertSettings, currentUser).length
        : 0,
    [currentUser, todayApptsList, staffAlertSettings]
  );
  const pendingTasks = useMemo(
    () =>
      tasks.filter(
        t =>
          t.assignedTo === currentUser.name &&
          !getTaskCompletionForDate(t, (t.recurrence || 'once') === 'once' ? t.dueDate : today, {
            weekdaySettings,
            appointments,
            patientFollowUpLogs,
            patients,
            operations,
            invoices
          }).isCompleted
      ).length,
    [
      tasks,
      currentUser.name,
      today,
      weekdaySettings,
      appointments,
      patientFollowUpLogs,
      patients,
      operations,
      invoices
    ]
  );

  const canViewAppointments =
    hasPermission('viewAppointments') ||
    hasPermission('addAppointments') ||
    hasPermission('editAppointments') ||
    hasPermission('deleteAppointments');
  const canViewPatients =
    hasPermission('viewPatients') ||
    hasPermission('addPatients') ||
    hasPermission('editPatients') ||
    hasPermission('deletePatients');
  const canViewTasks =
    hasPermission('viewTasks') ||
    hasPermission('addTasks') ||
    hasPermission('editTasks') ||
    hasPermission('deleteTasks');
  const canViewInvoicesPayments =
    hasPermission('viewInvoicesPayments') ||
    hasPermission('addInvoicesPayments') ||
    hasPermission('editInvoicesPayments') ||
    hasPermission('deleteInvoicesPayments');
  const canViewExpenses =
    hasPermission('viewExpenses') ||
    hasPermission('addExpenses') ||
    hasPermission('editExpenses') ||
    hasPermission('deleteExpenses');

  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});
  const [menuSearchQuery, setMenuSearchQuery] = React.useState('');
  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  interface NavItem {
    id: ActiveView;
    label: string;
    icon: React.ElementType;
    badge: string | null;
    alertColor?: boolean;
  }

  interface NavGroup {
    key: string;
    title: string;
    items: NavItem[];
  }

  const rawNavGroups: NavGroup[] = [
    {
      key: 'daily_ops',
      title: 'عمليات يومية',
      items: [
        { id: 'dashboard', label: 'الرئيسية', icon: Home, badge: null },
        ...(canViewAppointments
          ? [{ id: 'appointments' as ActiveView, label: 'المواعيد', icon: Calendar, badge: todayAppts > 0 ? `${todayAppts} اليوم` : null }]
          : []),
        ...(canViewPatients
          ? [{ id: 'patients' as ActiveView, label: 'المرضى', icon: Users, badge: null }]
          : [])
      ]
    },
    {
      key: 'accounts',
      title: 'الحسابات',
      items: [
        ...(canViewInvoicesPayments
          ? [
              { id: 'invoices' as ActiveView, label: 'الفواتير', icon: FileText, badge: null },
              { id: 'payments' as ActiveView, label: 'المدفوعات', icon: CreditCard, badge: null }
            ]
          : []),
        ...(canViewExpenses
          ? [{ id: 'expenses' as ActiveView, label: 'المصروفات', icon: TrendingDown, badge: null }]
          : []),
        ...(currentUser.role === 'admin'
          ? [{ id: 'reports' as ActiveView, label: 'التقارير', icon: BarChart3, badge: null }]
          : [])
      ]
    },
    {
      key: 'communication',
      title: 'التواصل',
      items: [
        { id: 'whatsapp', label: 'واتساب', icon: MessageCircle, badge: pendingAlerts > 0 ? `${pendingAlerts} مطلوب` : null, alertColor: true },
        ...(canViewPatients
          ? [{ id: 'patient_follow_up' as ActiveView, label: 'متابعة المرضى', icon: UserCheck, badge: null }]
          : []),
        ...(currentUser.role === 'admin'
          ? [
              { id: 'follow_up_logs' as ActiveView, label: 'سجل متابعة المرضى', icon: ClipboardList, badge: null },
              { id: 'notes' as ActiveView, label: 'الملاحظات', icon: StickyNote, badge: null }
            ]
          : [])
      ]
    },
    {
      key: 'staff',
      title: 'الموظفين',
      items: [
        { id: 'attendance', label: 'الحضور', icon: Clock, badge: null },
        ...(canViewTasks
          ? [{ id: 'tasks' as ActiveView, label: 'المهام', icon: CheckSquare, badge: pendingTasks > 0 ? `${pendingTasks}` : null }]
          : []),
        ...(currentUser.role === 'admin'
          ? [
              { id: 'staff_comments' as ActiveView, label: 'الكومنتات', icon: MessageCircle, badge: null },
              {
                id: 'staff_alerts' as ActiveView,
                label: 'تنبيهات الموظف',
                icon: Bell,
                badge: dueStaffAlertsCount > 0 ? `${dueStaffAlertsCount}` : null,
                alertColor: dueStaffAlertsCount > 0
              }
            ]
          : [])
      ]
    },
    {
      key: 'settings',
      title: 'الاعدادات',
      items: [
        ...(currentUser.role === 'admin'
          ? [
              { id: 'settings' as ActiveView, label: 'الإعدادات', icon: Settings, badge: null },
              { id: 'procedures' as ActiveView, label: 'الإجراءات', icon: Stethoscope, badge: null },
              { id: 'excel_import' as ActiveView, label: 'الاستيراد', icon: FileSpreadsheet, badge: null },
              { id: 'audit_logs' as ActiveView, label: 'سجل التغييرات', icon: FileText, badge: null }
            ]
          : [])
      ]
    }
  ];
  const navGroups = rawNavGroups.filter(g => g.items.length > 0);
  const trimmedMenuSearch = menuSearchQuery.trim();
  const filteredNavGroups = trimmedMenuSearch
    ? navGroups
        .map(group => {
          const groupMatches = matchArabicTerms(group.title, trimmedMenuSearch);
          const matchingItems = groupMatches
            ? group.items
            : group.items.filter(item => matchArabicTerms(item.label, trimmedMenuSearch));
          return { ...group, items: matchingItems };
        })
        .filter(group => group.items.length > 0)
    : navGroups;

  const handleNavClick = (view: ActiveView) => {
    setActiveView(view);
    setIsDrawerOpen(false);
  };

  const isDesktop = deviceLayout === 'desktop';
  const isTablet = deviceLayout === 'tablet';

  return (
    <>
      {/* Drawer Backdrop Overlay (Mobile & Tablet only) */}
      {isDrawerOpen && !isDesktop && (
        <div
          onClick={() => setIsDrawerOpen(false)}
          className="fixed inset-0 bg-[#0d232c]/50 backdrop-blur-sm z-50 transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        aria-hidden={!isDesktop && !isDrawerOpen}
        className={`${
          isDesktop
            ? 'sticky top-0 h-screen w-64 xl:w-72 flex-shrink-0 z-30 shadow-none'
            : `fixed top-0 right-0 bottom-0 z-50 ${
                isTablet ? 'w-80' : 'w-72'
              } transition-[transform,visibility] duration-200 ease-in-out shadow-2xl ${
                isDrawerOpen
                  ? 'translate-x-0 visible pointer-events-auto'
                  : 'translate-x-full invisible pointer-events-none'
              }`
        } bg-white border-l border-[#e2eaee] flex flex-col`}
      >
        {/* Drawer Header */}
        <div className="relative flex items-center justify-between p-4 border-b border-[#e2eaee] dark:border-[#1d2f3d]">
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#087e83] to-[#12a19c] p-1 flex items-center justify-center text-white shadow-sm flex-shrink-0">
              <svg viewBox="0 0 48 48" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 6c-5 0-9 4-9 10 0 5 3 8 4 14 1 7 4 12 8 12 2 0 3-4 4-9 1-4 2-5 3-5s2 1 3 5c1 5 2 9 4 9 4 0 7-5 8-12 1-6 4-9 4-14 0-6-4-10-9-10-5 0-7 3-10 3s-5-3-10-3Z"/>
              </svg>
            </div>
            <span className="font-signature text-2xl text-[#087e83] dark:text-[#2dd4bf]" dir="ltr">
              Dr Shlkamy
            </span>
          </div>
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#f0f6f5] hover:bg-[#e4f0ed] dark:bg-[#16242f] text-[#172f3d] dark:text-white cursor-pointer"
              aria-label="إغلاق القائمة"
            >
              <X className="w-5 h-5 text-[#087e83] dark:text-[#2dd4bf]" />
            </button>
          )}
        </div>

        {/* Current Logged-in User Profile & Logout inside Drawer */}
        <div className="p-3 border-b border-[#edf3f5] dark:border-[#1d2f3d] bg-[#f8fbfa] dark:bg-[#15232e] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#e6f4f1] text-[#087e83] flex items-center justify-center font-bold text-xs flex-shrink-0">
                {currentUser.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#172f3d] dark:text-[#f1f6fa] truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {currentUser.jobTitle || STAFF_ROLE_LABELS[currentUser.role]}
                  {currentUser.username ? ` · @${currentUser.username}` : ''}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e6f4f1] dark:bg-[#087e83]/30 text-[#087e83] dark:text-[#2dd4bf] flex-shrink-0">
              دمنهور
            </span>
          </div>

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-[11px] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج / تبديل المستخدم</span>
          </button>
        </div>

        {/* Quick Add Button on Desktop Sidebar */}
        {isDesktop &&
          (hasPermission('addPatients') ||
            hasPermission('addAppointments') ||
            hasPermission('addInvoicesPayments') ||
            hasPermission('addExpenses') ||
            hasPermission('addTasks')) && (
            <div className="p-3 border-b border-[#edf3f5]">
              <button
                type="button"
                onClick={() => setIsQuickActionOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>إضافة جديدة سريعة</span>
              </button>
            </div>
          )}

        {/* Sidebar Menu Items Search Bar */}
        <div className="px-3 pt-2.5 pb-2 border-b border-[#edf3f5] dark:border-[#1d2f3d] bg-white dark:bg-[#121e27]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={menuSearchQuery}
              onChange={e => setMenuSearchQuery(e.target.value)}
              placeholder="ابحث في بنود القائمة..."
              aria-label="بحث في بنود القائمة"
              className="w-full pr-8 pl-7 py-2 rounded-xl border border-slate-200 dark:border-[#243847] bg-slate-50/80 dark:bg-[#16242f] text-xs font-semibold text-[#172f3d] dark:text-[#f1f6fa] placeholder:text-slate-400 focus:bg-white dark:focus:bg-[#1a2b38] focus:border-[#087e83] focus:outline-none transition-colors"
            />
            {menuSearchQuery && (
              <button
                type="button"
                onClick={() => setMenuSearchQuery('')}
                aria-label="مسح بحث القائمة"
                className="w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Links Scrollable Body */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-3">
          {filteredNavGroups.length > 0 ? (
            filteredNavGroups.map(group => {
              const isCollapsed = trimmedMenuSearch ? false : Boolean(collapsedGroups[group.key]);
              return (
                <div key={group.key} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse(group.key)}
                  aria-expanded={!isCollapsed}
                  className="w-full px-3 pt-1.5 pb-1.5 mb-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-400 border-b border-amber-200/80 dark:border-amber-500/25 flex items-center justify-between gap-1.5 tracking-wide hover:bg-amber-50/60 dark:hover:bg-amber-900/10 rounded-t-lg transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 flex-shrink-0" />
                    <span>{group.title}</span>
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 transition-transform duration-150 ${
                      isCollapsed ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {!isCollapsed &&
                  group.items.map(item => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavClick(item.id as ActiveView)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#e7f5f2] text-[#087e83] font-bold shadow-sm'
                            : 'text-[#38535e] hover:bg-[#f3f8f9] hover:text-[#172f3d]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#087e83]' : 'text-[#627f8a]'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              item.alertColor
                                ? 'bg-rose-100 text-rose-700'
                                : isActive
                                ? 'bg-[#087e83] text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center text-xs font-semibold text-slate-400">
              لا توجد بنود مطابقة للبحث
            </div>
          )}
        </nav>

        {/* Sidebar Footer Info */}
        <div className="p-3 border-t border-[#edf3f5] bg-[#fafcfc] text-[11px] text-[#6b858e] space-y-2">
          {/* Dark / Light Mode Switch */}
          <button
            type="button"
            onClick={toggleDarkMode}
            className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white border border-[#d6e5e5] text-[#245b64] font-semibold hover:bg-[#f0f7f7] transition-colors"
            title="تبديل مظهر النظام بين الوضعين الليلي والنهاري"
          >
            <div className="flex items-center gap-2">
              {darkMode ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-[#087e83]" />
              )}
              <span>{darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 font-mono text-slate-500">
              {darkMode ? 'Dark' : 'Light'}
            </span>
          </button>

          <div className="flex items-center justify-between gap-2 font-semibold">
            {!cloudAuthReady ? (
              <>
                <span className="truncate">جاري الاتصال بالسحابة...</span>
                <span className="flex items-center gap-1 text-amber-600 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  انتظار
                </span>
              </>
            ) : cloudNeedsConsoleSetup || !cloudUser ? (
              <>
                <span className="text-rose-700 truncate">
                  {cloudNeedsConsoleSetup
                    ? 'المزامنة متوقفة (تحتاج تفعيل)'
                    : pendingCloudCount > 0
                    ? `محفوظ محلياً (${pendingCloudCount} معلق)`
                    : 'حفظ محلي فقط (غير متصل)'}
                </span>
                <button
                  type="button"
                  onClick={handleSidebarSyncRetry}
                  disabled={isRetryingSync}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-bold cursor-pointer flex-shrink-0"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRetryingSync ? 'animate-spin' : ''}`} />
                  <span>{isRetryingSync ? 'جاري...' : 'إعادة المحاولة'}</span>
                </button>
              </>
            ) : pendingCloudCount > 0 ? (
              <>
                <span className="text-amber-700 truncate">
                  {cloudError ? `تعذر رفع ${pendingCloudCount} تعديل` : `جاري حفظ ${pendingCloudCount} تعديل...`}
                </span>
                <button
                  type="button"
                  onClick={handleSidebarSyncRetry}
                  disabled={isRetryingSync}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold cursor-pointer flex-shrink-0"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRetryingSync ? 'animate-spin' : ''}`} />
                  <span>{isRetryingSync ? 'مزامنة...' : 'مزامنة الآن'}</span>
                </button>
              </>
            ) : cloudError ? (
              <>
                <span className="text-amber-700 truncate">مشكلة في المزامنة السحابية</span>
                <button
                  type="button"
                  onClick={handleSidebarSyncRetry}
                  disabled={isRetryingSync}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-bold cursor-pointer flex-shrink-0"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRetryingSync ? 'animate-spin' : ''}`} />
                  <span>إعادة المحاولة</span>
                </button>
              </>
            ) : cloudSynced ? (
              <>
                <span className="truncate">متصل ومتزامن سحابياً</span>
                <span className="flex items-center gap-1 text-emerald-600 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  نشط
                </span>
              </>
            ) : (
              <>
                <span className="truncate">جاري تحميل بيانات السحابة...</span>
                <span className="flex items-center gap-1 text-amber-600 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  تحميل
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsDrawerOpen(false);
              setIsPWAInstallModalOpen(true);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-gradient-to-r from-[#087e83] to-[#12a19c] text-white font-bold text-xs shadow-sm hover:opacity-95 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تثبيت التطبيق على الجهاز</span>
          </button>
        </div>
      </aside>
    </>
  );
});
