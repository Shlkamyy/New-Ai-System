import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  DollarSign,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  X
} from 'lucide-react';
import {
  formatRelativeTimeArabic,
  getArabicWeekdayName,
  getRelativeTimeBadgeClass,
  matchArabicTerms
} from '../utils/arabic';
import { Invoice, InvoiceItem } from '../types/clinic';
import { AdminDateCruiser } from '../components/AdminDateCruiser';

export const InvoicesView: React.FC = () => {
  const {
    currentUser,
    cairoTodayStr,
    invoices,
    appointments,
    invoicesTodayOnly,
    setInvoicesTodayOnly,
    updateInvoice,
    voidInvoice,
    setIsQuickActionOpen,
    goToPatient,
    hasPermission,
    isPatientAllowed
  } = useClinic();

  const isAdmin = currentUser.role === 'admin';
  const canAddInvoice = hasPermission('addInvoicesPayments');
  const canEditInvoice = hasPermission('editInvoicesPayments');
  const canDeleteInvoice = hasPermission('deleteInvoicesPayments');
  const canViewFinancialDetails =
    canAddInvoice || canEditInvoice || hasPermission('viewFinancialReports');

  const [selectedDate, setSelectedDate] = useState(cairoTodayStr);
  const prevTodayRef = useRef(cairoTodayStr);
  useEffect(() => {
    if (prevTodayRef.current !== cairoTodayStr) {
      if (selectedDate === prevTodayRef.current) {
        setSelectedDate(cairoTodayStr);
      }
      prevTodayRef.current = cairoTodayStr;
    }
  }, [cairoTodayStr, selectedDate]);

  const activeDate = isAdmin ? selectedDate : cairoTodayStr;
  const isSelectedToday = activeDate === cairoTodayStr;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-invoice-menu-wrap="true"]')) return;
      setOpenMenuId(null);
      setConfirmVoidId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
        setConfirmVoidId(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 150);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setVisibleCount(50);
  }, [debouncedSearchQuery, statusFilter, invoicesTodayOnly, activeDate]);

  // Edit invoice modal state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');

  const openEditModal = (inv: Invoice) => {
    if (!canEditInvoice) return;
    setEditingInvoice(inv);
    setEditItems(inv.items.map(it => ({ ...it })));
    setEditDiscount(inv.discountAmount || 0);
    setEditNotes(inv.notes || '');
    setOpenMenuId(null);
    setConfirmVoidId(null);
  };

  const handleSaveInvoiceEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditInvoice || !editingInvoice) return;
    const normalizedItems = editItems.map(it => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const price = Math.max(0, Number(it.unitPrice) || 0);
      return {
        ...it,
        quantity: qty,
        unitPrice: price,
        lineTotal: qty * price
      };
    });
    const subtotal = normalizedItems.reduce((sum, it) => sum + it.lineTotal, 0);
    const discount = Math.max(0, Math.min(subtotal, Number(editDiscount) || 0));
    const netTotal = Math.max(0, subtotal - discount);
    const paid = editingInvoice.paidAmount || 0;
    const outstandingBalance = Math.max(0, netTotal - paid);
    const status: Invoice['status'] =
      outstandingBalance <= 0 && netTotal > 0
        ? 'paid'
        : paid > 0 && outstandingBalance > 0
        ? 'partial'
        : netTotal === 0
        ? 'paid'
        : 'unpaid';

    updateInvoice(editingInvoice.id, {
      items: normalizedItems,
      subtotal,
      discountAmount: discount,
      netTotal,
      outstandingBalance,
      status,
      notes: editNotes.trim() || undefined
    });
    setEditingInvoice(null);
  };

  // Patients who have non-cancelled appointments on activeDate
  const activeDatePatientIds = useMemo(
    () =>
      new Set(
        appointments
          .filter(a => a.date === activeDate && a.status !== 'cancelled' && isPatientAllowed(a.patientId))
          .map(a => a.patientId)
      ),
    [appointments, activeDate, isPatientAllowed]
  );

  const validInvoices = useMemo(
    () => invoices.filter(i => i.status !== 'voided' && isPatientAllowed(i.patientId)),
    [invoices, isPatientAllowed]
  );

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    validInvoices.forEach(inv => {
      if (inv.date) {
        map.set(inv.date, (map.get(inv.date) || 0) + 1);
      }
    });
    return map;
  }, [validInvoices]);

  const filteredInvoices = useMemo(() => {
    const q = debouncedSearchQuery.trim();
    const qLower = q.toLowerCase();
    return validInvoices.filter(inv => {
      if (q) {
        const matchPat = matchArabicTerms(inv.patientName, q);
        const matchNum = inv.invoiceNumber.toLowerCase().includes(qLower);
        if (!matchPat && !matchNum) return false;
      }
      if (invoicesTodayOnly && inv.date !== activeDate && !activeDatePatientIds.has(inv.patientId)) {
        return false;
      }
      if (statusFilter !== 'all' && inv.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [validInvoices, debouncedSearchQuery, invoicesTodayOnly, activeDate, activeDatePatientIds, statusFilter]);

  const { daySummaryInvoices, dayBilled, dayPaid, dayRemaining } = useMemo(() => {
    const summaryList = invoicesTodayOnly
      ? filteredInvoices
      : validInvoices.filter(i => i.date === activeDate);
    let billed = 0;
    let paid = 0;
    let remaining = 0;
    for (let i = 0; i < summaryList.length; i++) {
      const inv = summaryList[i];
      billed += inv.netTotal;
      paid += inv.paidAmount;
      remaining += inv.outstandingBalance;
    }
    return {
      daySummaryInvoices: summaryList,
      dayBilled: billed,
      dayPaid: paid,
      dayRemaining: remaining
    };
  }, [invoicesTodayOnly, filteredInvoices, validInvoices, activeDate]);

  const visibleInvoices = useMemo(
    () => filteredInvoices.slice(0, visibleCount),
    [filteredInvoices, visibleCount]
  );

  const handleCruiserDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    if (!invoicesTodayOnly) {
      setInvoicesTodayOnly(true);
    }
    setOpenMenuId(null);
    setConfirmVoidId(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Top Banner & Metrics */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              {invoicesTodayOnly
                ? isSelectedToday
                  ? 'فواتير اليوم'
                  : `فواتير ${getArabicWeekdayName(activeDate)}`
                : 'الفواتير'}{' '}
              ({filteredInvoices.length})
            </h1>
            <button
              type="button"
              onClick={() => setInvoicesTodayOnly(!invoicesTodayOnly)}
              className={`px-3 py-1 rounded-full text-xs font-extrabold border transition-colors cursor-pointer ${
                invoicesTodayOnly
                  ? 'bg-[#087e83] text-white border-[#087e83]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {invoicesTodayOnly
                ? 'كل السجل'
                : 'عرض كل الفواتير (فواتير اليوم فقط؟)'}
            </button>
          </div>

          {canAddInvoice && (
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'invoice')}
              className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إصدار فاتورة جديدة</span>
            </button>
          )}
        </div>

        {/* Admin Date Cruiser */}
        {isAdmin && (
          <AdminDateCruiser
            selectedDate={selectedDate}
            todayStr={cairoTodayStr}
            onSelectDate={handleCruiserDateChange}
            labelPrefix="فواتير"
            count={validInvoices.filter(i => i.date === activeDate || activeDatePatientIds.has(i.patientId)).length}
            countByDate={countByDate}
            isDayFilterActive={invoicesTodayOnly}
          />
        )}

        {/* Selected Day Summary Card */}
        <div className="p-3.5 bg-[#e7f5f2] border border-[#bfe2db] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-extrabold text-[#087e83] block">
              {invoicesTodayOnly
                ? `ملخص فواتير مرضى مواعيد ${isSelectedToday ? 'اليوم' : getArabicWeekdayName(activeDate)} (${activeDate})`
                : `ملخص فواتير ${isSelectedToday ? 'اليوم فقط' : getArabicWeekdayName(activeDate)} (${activeDate})`}
            </span>
            <span className="text-[11px] text-slate-600">
              عدد الفواتير: {daySummaryInvoices.length} فاتورة
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs flex-wrap">
            <div>
              <span className="text-slate-500 block text-[10px]">المفوتر:</span>
              <span className="font-extrabold text-[#087e83]">{dayBilled.toLocaleString()} ج.م</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">المسدد:</span>
              <span className="font-extrabold text-emerald-700">{dayPaid.toLocaleString()} ج.م</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">المتبقي:</span>
              <span className="font-extrabold text-rose-600">{dayRemaining.toLocaleString()} ج.م</span>
            </div>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المريض أو رقم الفاتورة..."
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Select */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'unpaid' | 'partial' | 'paid')}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
            >
              <option value="all">جميع الحالات</option>
              <option value="unpaid">غير مسددة</option>
              <option value="partial">سداد جزئي</option>
              <option value="paid">مسددة بالكامل</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="space-y-3">
        {visibleInvoices.length > 0 ? (
          visibleInvoices.map(inv => {
            const relTime = formatRelativeTimeArabic(inv.createdAt || inv.date);
            const relBadge = getRelativeTimeBadgeClass(inv.createdAt || inv.date);
            const isMenuOpen = openMenuId === inv.id;
            return (
              <div
                key={inv.id}
                className={`relative p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isMenuOpen ? 'z-20' : ''
                }`}
              >
                {/* Details */}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                      {inv.invoiceNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPatient(inv.patientId)}
                      className="font-extrabold text-sm text-[#172f3d] hover:text-[#087e83] hover:underline cursor-pointer"
                    >
                      {inv.patientName}
                    </button>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        inv.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inv.status === 'partial'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {inv.status === 'paid' ? 'خالص' : inv.status === 'partial' ? 'سداد جزئي' : 'مستحق بالكامل'}
                    </span>
                    {relTime && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${relBadge}`}>
                        {relTime}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-1">
                    الإجراءات:{' '}
                    {inv.items
                      .map(
                        it =>
                          `${it.procedureName}${it.toothNumbers && it.toothNumbers.length > 0 ? ` [سن ${it.toothNumbers.join('، ')}]` : ''} (${it.quantity}x)`
                      )
                      .join('، ')}
                  </p>

                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-3 flex-wrap">
                    <span>التاريخ: {inv.date}</span>
                    {inv.discountAmount > 0 && (
                      <span className="text-rose-600 font-sans">
                        (خصم {inv.discountAmount.toLocaleString()} ج.م)
                      </span>
                    )}
                  </div>
                </div>

                {/* Amounts & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <dl className="grid grid-cols-3 sm:flex sm:items-center gap-3 text-right sm:text-left font-mono bg-slate-50/80 sm:bg-transparent p-2.5 sm:p-0 rounded-2xl">
                    <div>
                      <dt className="text-[10px] text-slate-400 font-sans font-bold">الفاتوره</dt>
                      <dd className="text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400">
                        {inv.netTotal.toLocaleString()} ج.م
                      </dd>
                    </div>
                    {canViewFinancialDetails && (
                      <>
                        <div>
                          <dt className="text-[10px] text-slate-400 font-sans font-bold">المدفوع</dt>
                          <dd className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            {inv.paidAmount.toLocaleString()} ج.م
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-400 font-sans font-bold">المتبقي</dt>
                          <dd className="text-xs sm:text-sm font-extrabold text-rose-600 dark:text-rose-400">
                            {inv.outstandingBalance.toLocaleString()} ج.م
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>

                  <div className="flex items-center justify-end gap-1.5">
                    {inv.outstandingBalance > 0 && canAddInvoice && (
                      <button
                        type="button"
                        onClick={() =>
                          setIsQuickActionOpen(true, 'payment', {
                            patientId: inv.patientId,
                            invoiceId: inv.id,
                            amount: inv.outstandingBalance
                          })
                        }
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap shadow-xs cursor-pointer transition-colors"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>سداد</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(inv)}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold whitespace-nowrap cursor-pointer"
                    >
                      عرض الفاتورة
                    </button>

                    <div className="relative" data-invoice-menu-wrap="true">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmVoidId(null);
                          setOpenMenuId(isMenuOpen ? null : inv.id);
                        }}
                        className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                          isMenuOpen
                            ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                        title="خيارات الفاتورة"
                        aria-label="خيارات الفاتورة"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-2xl border border-[#dce8eb] shadow-xl p-1.5 z-50 space-y-0.5 text-right animate-in fade-in duration-100"
                        >
                          {inv.outstandingBalance > 0 && canAddInvoice && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setIsQuickActionOpen(true, 'payment', {
                                  patientId: inv.patientId,
                                  invoiceId: inv.id,
                                  amount: inv.outstandingBalance
                                });
                              }}
                              className="w-full px-3 py-2 rounded-xl hover:bg-emerald-50 text-emerald-700 text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>سداد الفاتورة</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#087e83]" />
                            <span>عرض الفاتورة</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              goToPatient(inv.patientId);
                            }}
                            className="w-full px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>فتح ملف المريض</span>
                          </button>

                          {canEditInvoice && (
                            <button
                              type="button"
                              onClick={() => openEditModal(inv)}
                              className="w-full px-3 py-2 rounded-xl hover:bg-blue-50 text-blue-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>تعديل الفاتورة</span>
                            </button>
                          )}

                          {inv.paidAmount === 0 && canDeleteInvoice && (
                            <div className="pt-1 mt-1 border-t border-slate-100">
                              {confirmVoidId === inv.id ? (
                                <div className="p-1.5 rounded-xl bg-rose-50 space-y-1.5">
                                  <span className="block text-[11px] font-bold text-rose-800 px-1">
                                    تأكيد إلغاء الفاتورة؟
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        voidInvoice(inv.id);
                                        setConfirmVoidId(null);
                                        setOpenMenuId(null);
                                      }}
                                      className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                                    >
                                      تأكيد الإلغاء
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmVoidId(null)}
                                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                                    >
                                      تراجع
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmVoidId(inv.id)}
                                  className="w-full px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>إلغاء الفاتورة</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
            {invoicesTodayOnly
              ? isSelectedToday
                ? 'لا توجد فواتير مسجلة على مرضى مواعيد اليوم'
                : `لا توجد فواتير مسجلة على مرضى مواعيد يوم ${activeDate}`
              : 'لا توجد فواتير مطابقة لهذا البحث'}
          </div>
        )}
        {filteredInvoices.length > visibleCount && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + 50)}
              className="px-5 py-2.5 rounded-xl bg-white border border-[#dce8eb] hover:border-[#087e83] text-[#087e83] text-xs font-extrabold shadow-xs cursor-pointer"
            >
              عرض المزيد ({filteredInvoices.length - visibleCount} فاتورة متبقية)
            </button>
          </div>
        )}
      </div>

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <div
          onClick={() => setSelectedInvoice(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-mono font-bold text-[#087e83]">{selectedInvoice.invoiceNumber}</span>
                <h3 className="text-base font-extrabold text-[#172f3d]">فاتورة علاجية - عيادات د. شلقامي</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <p><strong>المريض:</strong> {selectedInvoice.patientName}</p>
              <p><strong>التاريخ:</strong> {selectedInvoice.date}</p>
            </div>

            {/* Line items table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">البند</th>
                    <th className="p-2.5 text-center">الكمية</th>
                    <th className="p-2.5 text-left">السعر</th>
                    <th className="p-2.5 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedInvoice.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-semibold text-slate-800">
                        <div>{it.procedureName}</div>
                        {it.toothNumbers && it.toothNumbers.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-1">
                            {it.toothNumbers.map(code => (
                              <span
                                key={code}
                                className="px-1.5 py-0.5 rounded bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db] font-mono text-[10px] font-bold"
                              >
                                سن {code}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono">{it.quantity}</td>
                      <td className="p-2.5 text-left font-mono">{it.unitPrice.toLocaleString()} ج.م</td>
                      <td className="p-2.5 text-left font-mono font-bold">{it.lineTotal.toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial summary */}
            <div className="p-3 bg-[#e7f5f2] border border-[#bfe2db] rounded-2xl text-xs space-y-1">
              <div className="flex justify-between">
                <span>المجموع:</span>
                <span className="font-mono">{selectedInvoice.subtotal.toLocaleString()} ج.م</span>
              </div>
              {selectedInvoice.discountAmount > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>الخصم:</span>
                  <span className="font-mono">- {selectedInvoice.discountAmount.toLocaleString()} ج.م</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-[#087e83] pt-1 border-t border-[#bfe2db]">
                <span>صافي الفاتورة:</span>
                <span className="font-mono text-sm">{selectedInvoice.netTotal.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>المسدد:</span>
                <span className="font-mono">{selectedInvoice.paidAmount.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold">
                <span>المتبقي:</span>
                <span className="font-mono">{selectedInvoice.outstandingBalance.toLocaleString()} ج.م</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="w-full py-2.5 bg-[#087e83] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editingInvoice && canEditInvoice && (
        <div
          onClick={() => setEditingInvoice(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-mono font-bold text-[#087e83]">{editingInvoice.invoiceNumber}</span>
                <h3 className="text-base font-extrabold text-[#172f3d]">تعديل الفاتورة — {editingInvoice.patientName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoiceEdit} className="space-y-3 text-xs">
              <div className="space-y-2">
                <label className="block font-bold text-slate-600">بنود الفاتورة</label>
                {editItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="col-span-6">
                      <div className="font-bold text-slate-800 truncate">{it.procedureName}</div>
                      {it.toothNumbers && it.toothNumbers.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {it.toothNumbers.map(code => (
                            <span
                              key={code}
                              className="px-1.5 py-0.2 rounded bg-[#e7f5f2] text-[#087e83] font-mono text-[10px] font-bold"
                            >
                              سن {code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={e => {
                          const qty = Math.max(1, Number(e.target.value) || 1);
                          setEditItems(prev => prev.map((row, i) => (i === idx ? { ...row, quantity: qty } : row)));
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 font-mono text-center bg-white"
                        title="الكمية"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="number"
                        min={0}
                        value={it.unitPrice}
                        onChange={e => {
                          const price = Math.max(0, Number(e.target.value) || 0);
                          setEditItems(prev => prev.map((row, i) => (i === idx ? { ...row, unitPrice: price } : row)));
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 font-mono text-left bg-white"
                        title="سعر الوحدة"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">قيمة الخصم (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    value={editDiscount}
                    onChange={e => setEditDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-[#e7f5f2] border border-[#bfe2db] flex flex-col justify-center">
                  <span className="text-[10px] text-[#087e83] font-bold">الصافي بعد التعديل</span>
                  <span className="font-mono text-sm font-extrabold text-[#172f3d]">
                    {Math.max(
                      0,
                      editItems.reduce((s, it) => s + (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0), 0) -
                        (Number(editDiscount) || 0)
                    ).toLocaleString()}{' '}
                    ج.م
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold cursor-pointer"
                >
                  حفظ تعديلات الفاتورة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
