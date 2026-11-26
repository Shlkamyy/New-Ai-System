import React, { useMemo, useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import { Home, Calendar, Users, DollarSign, Plus, X, FileText, CreditCard, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react';
import { getTodayDateString } from '../data/mockData';

export const BottomNav: React.FC = React.memo(() => {
  const {
    activeView,
    switchBottomTab,
    setIsQuickActionOpen,
    deviceLayout,
    appointments,
    invoices,
    payments,
    expenses,
    cairoTodayStr,
    currentUser,
    hasPermission,
    isUnitAllowed,
    isPatientAllowed,
    openReportsForToday
  } = useClinic();
  const [isAccountsMenuOpen, setIsAccountsMenuOpen] = useState(false);
  const [isStaffTodaySummaryOpen, setIsStaffTodaySummaryOpen] = useState(false);

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
  const canInvoicesPayments =
    hasPermission('viewInvoicesPayments') ||
    hasPermission('addInvoicesPayments') ||
    hasPermission('editInvoicesPayments') ||
    hasPermission('deleteInvoicesPayments');
  const canExpenses =
    hasPermission('viewExpenses') ||
    hasPermission('addExpenses') ||
    hasPermission('editExpenses') ||
    hasPermission('deleteExpenses');
  const canDailyReport =
    currentUser.role === 'admin' ||
    hasPermission('viewFinancialReports') ||
    canInvoicesPayments ||
    canExpenses;
  const canAnyQuickAdd =
    hasPermission('addPatients') ||
    hasPermission('addAppointments') ||
    hasPermission('addInvoicesPayments') ||
    hasPermission('addExpenses') ||
    hasPermission('addTasks');

  const canStaffTodaySummary = currentUser.role !== 'admin';
  const canOpenAccountsMenu = canInvoicesPayments || canExpenses || canStaffTodaySummary;

  const todayStr = cairoTodayStr || getTodayDateString();

  const staffTodaySummary = useMemo(() => {
    const todayInvoices = invoices.filter(
      inv => inv.status !== 'voided' && inv.date === todayStr && isPatientAllowed(inv.patientId)
    );
    const todayPayments = payments.filter(
      pay => pay.status !== 'voided' && pay.date === todayStr && isPatientAllowed(pay.patientId)
    );
    const todayExpenses = expenses.filter(
      exp => exp.date === todayStr && (!exp.unitId || isUnitAllowed(exp.unitId, exp.unitName))
    );
    const totalInvoices = todayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
    const totalPayments = todayPayments.reduce((sum, pay) => sum + (pay.amount || 0), 0);
    const totalExpenses = todayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const totalRevenue = totalPayments - totalExpenses;
    return {
      invoicesCount: todayInvoices.length,
      paymentsCount: todayPayments.length,
      expensesCount: todayExpenses.length,
      totalInvoices,
      totalPayments,
      totalExpenses,
      totalRevenue
    };
  }, [invoices, payments, expenses, todayStr, isPatientAllowed, isUnitAllowed]);

  const todayApptsCount = useMemo(
    () =>
      appointments.filter(a => {
        if (a.date !== todayStr || a.status === 'cancelled') return false;
        if (!isUnitAllowed(a.unitId, a.unitName)) return false;
        if (currentUser.permissions?.appointmentsOwnOnly) {
          return !!currentUser.doctorId && a.doctorId === currentUser.doctorId;
        }
        return true;
      }).length,
    [appointments, todayStr, isUnitAllowed, currentUser.permissions?.appointmentsOwnOnly, currentUser.doctorId]
  );

  // Hide bottom navigation on Desktop layout
  if (deviceLayout === 'desktop') {
    return null;
  }

  const isTablet = deviceLayout === 'tablet';

  const handleTabNav = (
    tabId: 'dashboard' | 'appointments' | 'patients' | 'accounts',
    defaultView: 'dashboard' | 'appointments' | 'patients' | 'invoices' | 'payments' | 'expenses',
    forceTodayFilter?: 'invoices' | 'payments' | 'expenses'
  ) => {
    try {
      navigator.vibrate?.(10);
    } catch {}
    switchBottomTab(tabId, defaultView, forceTodayFilter);
    setIsAccountsMenuOpen(false);
  };

  return (
    <>
      {/* Accounts quick popup overlay */}
      {isAccountsMenuOpen && (
        <div
          onClick={() => setIsAccountsMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity"
        />
      )}

      {/* Accounts popup options */}
      {isAccountsMenuOpen && (
        <div
          className={`fixed bottom-20 inset-x-0 z-50 pointer-events-none ${
            isTablet ? 'max-w-xl mx-auto px-4' : 'px-4'
          } flex justify-start`}
        >
          <div className="pointer-events-auto bg-white border border-[#d6e5e8] rounded-2xl shadow-2xl p-2 w-56 flex flex-col gap-1 text-xs font-bold animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3 py-1.5 text-[10px] text-slate-400 font-bold border-b border-slate-100 flex items-center justify-between">
            <span>حسابات اليوم</span>
            <span className="text-[9px] bg-[#e7f5f2] text-[#087e83] px-1.5 py-0.5 rounded font-mono">TODAY</span>
          </div>
          {canInvoicesPayments && (
            <button
              type="button"
              onClick={() => handleTabNav('accounts', 'invoices', 'invoices')}
              className={`w-full text-right px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors ${
                activeView === 'invoices' ? 'bg-[#e7f5f2] text-[#087e83]' : 'hover:bg-[#f4f8f9] text-[#172f3d]'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#087e83] flex-shrink-0" />
                <span>فواتير اليوم</span>
              </span>
              <span className="text-[10px] text-[#087e83] bg-[#e7f5f2] px-2 py-0.5 rounded-full">عرض</span>
            </button>
          )}
          {canInvoicesPayments && (
            <button
              type="button"
              onClick={() => handleTabNav('accounts', 'payments', 'payments')}
              className={`w-full text-right px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors ${
                activeView === 'payments' ? 'bg-[#e7f5f2] text-[#087e83]' : 'hover:bg-[#f4f8f9] text-[#172f3d]'
              }`}
            >
              <span className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>مدفوعات اليوم</span>
              </span>
              <span className="text-[10px] text-[#087e83] bg-[#e7f5f2] px-2 py-0.5 rounded-full">عرض</span>
            </button>
          )}
          {canExpenses && (
            <button
              type="button"
              onClick={() => handleTabNav('accounts', 'expenses', 'expenses')}
              className={`w-full text-right px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors ${
                activeView === 'expenses' ? 'bg-[#e7f5f2] text-[#087e83]' : 'hover:bg-[#f4f8f9] text-[#172f3d]'
              }`}
            >
              <span className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>مصاريف اليوم</span>
              </span>
              <span className="text-[10px] text-[#087e83] bg-[#e7f5f2] px-2 py-0.5 rounded-full">عرض</span>
            </button>
          )}
          {currentUser.role === 'admin' && canDailyReport && (
            <button
              type="button"
              onClick={() => {
                try {
                  navigator.vibrate?.(10);
                } catch {}
                openReportsForToday();
                setIsAccountsMenuOpen(false);
              }}
              className={`w-full text-right px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors border-t border-slate-100 mt-0.5 pt-2.5 ${
                activeView === 'reports' ? 'bg-[#e7f5f2] text-[#087e83]' : 'hover:bg-[#f4f8f9] text-[#172f3d]'
              }`}
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#087e83] flex-shrink-0" />
                <span>ملخص / تقرير اليوم</span>
              </span>
              <span className="text-[10px] text-[#087e83] bg-[#e7f5f2] px-2 py-0.5 rounded-full">تقرير</span>
            </button>
          )}
          {canStaffTodaySummary && (
            <button
              type="button"
              onClick={() => {
                try {
                  navigator.vibrate?.(10);
                } catch {}
                setIsAccountsMenuOpen(false);
                setIsStaffTodaySummaryOpen(true);
              }}
              className="w-full text-right px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors border-t border-slate-100 mt-0.5 pt-2.5 hover:bg-[#e7f5f2] text-[#172f3d] hover:text-[#087e83] cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#087e83] flex-shrink-0" />
                <span>ملخص اليوم</span>
              </span>
              <span className="text-[10px] text-[#087e83] bg-[#e7f5f2] px-2 py-0.5 rounded-full">اليوم</span>
            </button>
          )}
          {!canOpenAccountsMenu && (
            <div className="px-3 py-2 text-[11px] text-slate-400 text-center">
              لا توجد صلاحيات مالية مفعلة لهذا الحساب
            </div>
          )}
          </div>
        </div>
      )}

      {/* Employee Today-Only Financial Summary Modal */}
      {isStaffTodaySummaryOpen && (
        <div
          onClick={() => setIsStaffTodaySummaryOpen(false)}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-extrabold text-[#172f3d]">ملخص حسابات اليوم</h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">{todayStr}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsStaffTodaySummaryOpen(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/80 text-blue-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-blue-900 block">الفواتير</span>
                    <span className="text-[10px] font-semibold text-blue-700 block">
                      {staffTodaySummary.invoicesCount} فاتورة اليوم
                    </span>
                  </div>
                </div>
                <div className="text-base font-extrabold font-mono text-blue-950 tabular-nums shrink-0">
                  {staffTodaySummary.totalInvoices.toLocaleString()} ج.م
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/80 text-emerald-600 flex items-center justify-center shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-emerald-900 block">المدفوعات</span>
                    <span className="text-[10px] font-semibold text-emerald-700 block">
                      {staffTodaySummary.paymentsCount} دفعة اليوم
                    </span>
                  </div>
                </div>
                <div className="text-base font-extrabold font-mono text-emerald-950 tabular-nums shrink-0">
                  {staffTodaySummary.totalPayments.toLocaleString()} ج.م
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/80 text-rose-600 flex items-center justify-center shrink-0">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-rose-900 block">المصاريف</span>
                    <span className="text-[10px] font-semibold text-rose-700 block">
                      {staffTodaySummary.expensesCount} مصروف اليوم
                    </span>
                  </div>
                </div>
                <div className="text-base font-extrabold font-mono text-rose-950 tabular-nums shrink-0">
                  {staffTodaySummary.totalExpenses.toLocaleString()} ج.م
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#e7f5f2] border border-[#bfe2db] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/80 text-[#087e83] flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-[#087e83] block">الصافي</span>
                    <span className="text-[10px] font-semibold text-slate-600 block">
                      المدفوعات - المصروفات
                    </span>
                  </div>
                </div>
                <div className={`text-base font-extrabold font-mono tabular-nums shrink-0 ${staffTodaySummary.totalRevenue >= 0 ? 'text-[#087e83]' : 'text-rose-700'}`}>
                  {staffTodaySummary.totalRevenue.toLocaleString()} ج.م
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsStaffTodaySummaryOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Bottom navigation container */}
      <nav
        id="bottomNav"
        className={`fixed bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#dce8e9] shadow-[0_-4px_24px_rgba(18,48,60,0.08)] grid grid-cols-5 items-center h-16 px-1 pb-[env(safe-area-inset-bottom)] select-none ${
          isTablet
            ? 'left-1/2 -translate-x-1/2 w-full max-w-xl rounded-t-3xl border-x'
            : 'left-0 right-0'
        }`}
        aria-label="شريط التنقل السفلي"
      >
        {/* 1. حسابات */}
        <button
          type="button"
          disabled={!canOpenAccountsMenu}
          onClick={() => {
            if (!canOpenAccountsMenu) return;
            setIsAccountsMenuOpen(prev => !prev);
          }}
          className={`relative flex flex-col items-center justify-center h-full min-w-0 transition-all ${
            !canOpenAccountsMenu
              ? 'opacity-40 cursor-not-allowed text-slate-400'
              : activeView === 'invoices' || activeView === 'payments' || activeView === 'expenses' || activeView === 'reports' || isStaffTodaySummaryOpen
              ? 'text-[#087e83] font-extrabold scale-105'
              : 'text-[#58737d] hover:text-[#087e83]'
          }`}
          aria-label="الحسابات والمالية"
        >
          <DollarSign className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold tracking-tight truncate">حسابات</span>
          {(activeView === 'invoices' || activeView === 'payments' || activeView === 'expenses' || activeView === 'reports') && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#087e83] mt-0.5" />
          )}
        </button>

        {/* 2. المرضى */}
        <button
          type="button"
          disabled={!canViewPatients}
          onClick={() => canViewPatients && handleTabNav('patients', 'patients')}
          className={`relative flex flex-col items-center justify-center h-full min-w-0 transition-all ${
            !canViewPatients
              ? 'opacity-40 cursor-not-allowed text-slate-400'
              : activeView === 'patients' || activeView === 'patient_detail'
              ? 'text-[#087e83] font-extrabold scale-105'
              : 'text-[#58737d] hover:text-[#087e83]'
          }`}
          aria-label="دليل المرضى"
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold tracking-tight truncate">المرضى</span>
          {(activeView === 'patients' || activeView === 'patient_detail') && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#087e83] mt-0.5" />
          )}
        </button>

        {/* 3. Central FAB + Button */}
        <div className="flex items-center justify-center relative">
          <button
            type="button"
            disabled={!canAnyQuickAdd}
            onClick={() => {
              if (!canAnyQuickAdd) return;
              try {
                navigator.vibrate?.(15);
              } catch {}
              setIsAccountsMenuOpen(false);
              setIsQuickActionOpen(true);
            }}
            className={`w-14 h-14 -translate-y-4 rounded-full flex items-center justify-center shadow-lg border-4 border-[#f4f7f9] transition-all focus:outline-none ${
              canAnyQuickAdd
                ? 'bg-gradient-to-tr from-[#087e83] via-[#0b9399] to-[#12a19c] text-white shadow-[#087e83]/35 hover:scale-105 active:scale-95 cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-75'
            }`}
            aria-label="إضافة سريعة"
            title={canAnyQuickAdd ? 'إضافة سريعة (موعد / مريض / فاتورة)' : 'لا تملك صلاحيات إضافة'}
          >
            <Plus className="w-7 h-7 stroke-[2.8]" />
          </button>
        </div>

        {/* 4. المواعيد */}
        <button
          type="button"
          disabled={!canViewAppointments}
          onClick={() => canViewAppointments && handleTabNav('appointments', 'appointments')}
          className={`relative flex flex-col items-center justify-center h-full min-w-0 transition-all ${
            !canViewAppointments
              ? 'opacity-40 cursor-not-allowed text-slate-400'
              : activeView === 'appointments'
              ? 'text-[#087e83] font-extrabold scale-105'
              : 'text-[#58737d] hover:text-[#087e83]'
          }`}
          aria-label="المواعيد والتقويم"
        >
          <div className="relative">
            <Calendar className="w-5 h-5 mb-0.5" />
            {canViewAppointments && todayApptsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#087e83] ring-2 ring-white" />
            )}
          </div>
          <span className="text-[10px] font-bold tracking-tight truncate">المواعيد</span>
          {activeView === 'appointments' && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#087e83] mt-0.5" />
          )}
        </button>

        {/* 5. الرئيسية */}
        <button
          type="button"
          onClick={() => handleTabNav('dashboard', 'dashboard')}
          className={`relative flex flex-col items-center justify-center h-full min-w-0 transition-all ${
            activeView === 'dashboard' ? 'text-[#087e83] font-extrabold scale-105' : 'text-[#58737d] hover:text-[#087e83]'
          }`}
          aria-label="الصفحة الرئيسية"
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold tracking-tight truncate">الرئيسية</span>
          {activeView === 'dashboard' && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#087e83] mt-0.5" />
          )}
        </button>
      </nav>
    </>
  );
});
