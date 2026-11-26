import React, { useState, useEffect, useMemo } from 'react';
import { useClinic } from '../context/ClinicContext';
import { TrendingUp, TrendingDown, DollarSign, Users, Award, ChevronRight, ChevronLeft } from 'lucide-react';
import { getTodayDateString } from '../data/mockData';

export const ReportsView: React.FC = () => {
  const {
    payments,
    expenses,
    invoices,
    patients,
    cairoTodayStr,
    reportsInitialPeriod,
    clearReportsInitialPeriod,
    isPatientAllowed,
    isUnitAllowed
  } = useClinic();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year' | 'max'>(() =>
    reportsInitialPeriod === 'today' ||
    reportsInitialPeriod === 'week' ||
    reportsInitialPeriod === 'month' ||
    reportsInitialPeriod === 'year'
      ? reportsInitialPeriod
      : reportsInitialPeriod === 'all'
      ? 'max'
      : 'month'
  );
  const [periodOffset, setPeriodOffset] = useState(0);

  useEffect(() => {
    if (
      reportsInitialPeriod === 'today' ||
      reportsInitialPeriod === 'week' ||
      reportsInitialPeriod === 'month' ||
      reportsInitialPeriod === 'year'
    ) {
      setPeriod(reportsInitialPeriod);
      setPeriodOffset(0);
      clearReportsInitialPeriod();
    } else if (reportsInitialPeriod === 'all') {
      setPeriod('max');
      setPeriodOffset(0);
      clearReportsInitialPeriod();
    } else if (reportsInitialPeriod) {
      clearReportsInitialPeriod();
    }
  }, [reportsInitialPeriod, clearReportsInitialPeriod]);

  const todayStr = cairoTodayStr || getTodayDateString();

  const { matchesPeriod, rangeLabel } = useMemo(() => {
    const [yRaw, mRaw, dRaw] = todayStr.split('-').map(Number);
    const y = yRaw || 2026;
    const m = mRaw || 1;
    const d = dRaw || 1;
    const todayUtc = new Date(Date.UTC(y, m - 1, d));

    if (period === 'max') {
      return {
        rangeLabel: 'كل البيانات المسجلة',
        matchesPeriod: (dateStr?: string) => Boolean(dateStr)
      };
    }

    if (period === 'today') {
      const targetUtc = new Date(todayUtc.getTime() + periodOffset * 24 * 60 * 60 * 1000);
      const targetStr = targetUtc.toISOString().slice(0, 10);
      return {
        rangeLabel: targetStr,
        matchesPeriod: (dateStr?: string) => (dateStr ? dateStr === targetStr : false)
      };
    }

    if (period === 'week') {
      const endUtc = new Date(todayUtc.getTime() + periodOffset * 7 * 24 * 60 * 60 * 1000);
      const startUtc = new Date(endUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
      const startStr = startUtc.toISOString().slice(0, 10);
      const endStr = endUtc.toISOString().slice(0, 10);
      return {
        rangeLabel: `${startStr} — ${endStr}`,
        matchesPeriod: (dateStr?: string) => (dateStr ? dateStr >= startStr && dateStr <= endStr : false)
      };
    }

    if (period === 'month') {
      const targetMonthUtc = new Date(Date.UTC(y, m - 1 + periodOffset, 1));
      const ty = targetMonthUtc.getUTCFullYear();
      const tm = String(targetMonthUtc.getUTCMonth() + 1).padStart(2, '0');
      const monthPrefix = `${ty}-${tm}`;
      const label = targetMonthUtc.toLocaleDateString('ar-EG', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      });
      return {
        rangeLabel: label,
        matchesPeriod: (dateStr?: string) => (dateStr ? dateStr.startsWith(monthPrefix) : false)
      };
    }

    const targetYear = String(y + periodOffset);
    return {
      rangeLabel: targetYear,
      matchesPeriod: (dateStr?: string) => (dateStr ? dateStr.startsWith(targetYear) : false)
    };
  }, [period, periodOffset, todayStr]);

  const scopedPatients = useMemo(
    () => patients.filter(p => isPatientAllowed(p.id)),
    [patients, isPatientAllowed]
  );

  // Financial aggregates (scoped & filtered by selected period)
  const {
    validPayments,
    validInvoices,
    scopedExpenses,
    totalCollections,
    totalExpenses,
    netProfit,
    sortedProcedures
  } = useMemo(() => {
    const vPays = payments.filter(
      p => p.status !== 'voided' && isPatientAllowed(p.patientId) && matchesPeriod(p.date)
    );
    const vInvs = invoices.filter(
      i => i.status !== 'voided' && isPatientAllowed(i.patientId) && matchesPeriod(i.date)
    );
    const sExps = expenses.filter(
      e => (!e.unitId || isUnitAllowed(e.unitId, e.unitName)) && matchesPeriod(e.date)
    );

    let collections = 0;
    for (let i = 0; i < vPays.length; i++) collections += vPays[i].amount;
    let expTotal = 0;
    for (let i = 0; i < sExps.length; i++) expTotal += sExps[i].amount;

    const procStats: Record<string, { count: number; totalRevenue: number }> = {};
    for (let i = 0; i < vInvs.length; i++) {
      const items = vInvs[i].items;
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        if (!procStats[item.procedureName]) {
          procStats[item.procedureName] = { count: 0, totalRevenue: 0 };
        }
        procStats[item.procedureName].count += item.quantity;
        procStats[item.procedureName].totalRevenue += item.lineTotal;
      }
    }

    const sortedProcs = Object.entries(procStats)
      .sort((a, b) => b[1].totalRevenue - a[1].totalRevenue)
      .slice(0, 6);

    return {
      validPayments: vPays,
      validInvoices: vInvs,
      scopedExpenses: sExps,
      totalCollections: collections,
      totalExpenses: expTotal,
      netProfit: collections - expTotal,
      sortedProcedures: sortedProcs
    };
  }, [payments, invoices, expenses, isPatientAllowed, isUnitAllowed, matchesPeriod]);

  const { totalDebt, referralCounts } = useMemo(() => {
    let debt = 0;
    const refs: Record<string, number> = {};
    for (let i = 0; i < scopedPatients.length; i++) {
      const p = scopedPatients[i];
      debt += p.outstandingBalance || 0;
      const src = p.referralSource || 'أخرى';
      refs[src] = (refs[src] || 0) + 1;
    }
    return { totalDebt: debt, referralCounts: refs };
  }, [scopedPatients]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header & Period Switcher */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              {period === 'today' ? 'ملخص / تقرير اليوم' : 'التقارير المالية'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs text-slate-500 font-mono">{rangeLabel}</p>
              {period !== 'max' && periodOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setPeriodOffset(0)}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83] hover:bg-[#d5eee8] cursor-pointer"
                >
                  العودة للحالي
                </button>
              )}
            </div>
          </div>

          {/* Period selector flanked by Previous / Next buttons */}
          <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
            <button
              type="button"
              disabled={period === 'max'}
              onClick={() => setPeriodOffset(o => o - 1)}
              className="px-2.5 py-2 rounded-2xl bg-[#f0f6f5] hover:bg-[#e2efec] disabled:opacity-40 disabled:cursor-not-allowed text-[#172f3d] text-xs font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
              title="الفترة السابقة"
            >
              <ChevronRight className="w-3.5 h-3.5 text-[#087e83]" />
              <span>السابق</span>
            </button>

            <div className="flex items-center gap-1 p-1 bg-[#edf4f5] rounded-2xl text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setPeriod('today');
                  setPeriodOffset(0);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer ${period === 'today' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600'}`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => {
                  setPeriod('week');
                  setPeriodOffset(0);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer ${period === 'week' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600'}`}
              >
                الأسبوع
              </button>
              <button
                type="button"
                onClick={() => {
                  setPeriod('month');
                  setPeriodOffset(0);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer ${period === 'month' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600'}`}
              >
                الشهر
              </button>
              <button
                type="button"
                onClick={() => {
                  setPeriod('year');
                  setPeriodOffset(0);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer ${period === 'year' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600'}`}
              >
                السنة
              </button>
              <button
                type="button"
                onClick={() => {
                  setPeriod('max');
                  setPeriodOffset(0);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer font-mono ${period === 'max' ? 'bg-[#087e83] text-white shadow-sm' : 'text-slate-600'}`}
              >
                Max
              </button>
            </div>

            <button
              type="button"
              disabled={period === 'max'}
              onClick={() => setPeriodOffset(o => o + 1)}
              className="px-2.5 py-2 rounded-2xl bg-[#f0f6f5] hover:bg-[#e2efec] disabled:opacity-40 disabled:cursor-not-allowed text-[#172f3d] text-xs font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
              title="الفترة القادمة"
            >
              <span>القادم</span>
              <ChevronLeft className="w-3.5 h-3.5 text-[#087e83]" />
            </button>
          </div>
        </div>

        {/* Big Financial KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-bold">
              <span>إجمالي المقبوضات (Cash In)</span>
              <TrendingUp className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-950 tabular-nums">
              {totalCollections.toLocaleString()} ج.م
            </div>
            <span className="text-[10px] text-emerald-700 font-semibold block">سداد نقدي وإلكتروني مؤكد</span>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-1">
            <div className="flex items-center justify-between text-rose-800 text-xs font-bold">
              <span>إجمالي المصروفات (Cash Out)</span>
              <TrendingDown className="w-4 h-4 text-rose-700" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-rose-950 tabular-nums">
              {totalExpenses.toLocaleString()} ج.م
            </div>
            <span className="text-[10px] text-rose-700 font-semibold block">مستلزمات، معامل وتشغيل</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#e7f5f2] border border-[#bfe2db] space-y-1">
            <div className="flex items-center justify-between text-[#087e83] text-xs font-bold">
              <span>صافي الحركة النقدية (Net Flow)</span>
              <DollarSign className="w-4 h-4 text-[#087e83]" />
            </div>
            <div className={`text-2xl font-extrabold font-mono tabular-nums ${netProfit >= 0 ? 'text-[#087e83]' : 'text-rose-700'}`}>
              {netProfit.toLocaleString()} ج.م
            </div>
            <span className="text-[10px] text-slate-500 font-semibold block">المقبوضات مطروحاً منها المصروفات</span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
            <div className="flex items-center justify-between text-amber-800 text-xs font-bold">
              <span>إجمالي مديونية المرضى</span>
              <Users className="w-4 h-4 text-amber-700" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-amber-950 tabular-nums">
              {totalDebt.toLocaleString()} ج.م
            </div>
            <span className="text-[10px] text-amber-700 font-semibold block">مبالغ مستحقة قيد السداد</span>
          </div>
        </div>
      </div>

      {/* Top Procedures Ranking by Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Procedures Revenue List */}
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>أعلى الإجراءات الطبية دخلاً</span>
            </h2>
            <span className="text-xs text-slate-400">مرتبة حسب القيمة</span>
          </div>

          <div className="space-y-3">
            {sortedProcedures.length > 0 ? (
              sortedProcedures.map(([procName, stat], idx) => {
                const maxRev = sortedProcedures[0]?.[1]?.totalRevenue || 1;
                const barPercent = Math.min(100, Math.round((stat.totalRevenue / maxRev) * 100));

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>{procName}</span>
                      <span className="font-mono text-[#087e83]">{stat.totalRevenue.toLocaleString()} ج.م</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-l from-[#087e83] to-[#12a19c] rounded-full"
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 text-left">
                      تم تنفيذ {stat.count} جلسات
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">لا توجد فواتير في هذه الفترة</p>
            )}
          </div>
        </div>

        {/* Patient Referral Distribution */}
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#087e83]" />
              <span>مصادر جذب المرضى (Patient Acquisition)</span>
            </h2>
            <span className="text-xs text-slate-400">تحليل مصادر المعرفة</span>
          </div>

          <div className="space-y-3">
            {Object.entries(referralCounts).map(([src, count], idx) => {
              const pct = scopedPatients.length > 0 ? Math.round((count / scopedPatients.length) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>{src}</span>
                    <span className="font-mono">{count} مرضى ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

