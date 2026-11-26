import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  CreditCard,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
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
import { Invoice, Payment } from '../types/clinic';
import { AdminDateCruiser } from '../components/AdminDateCruiser';

export const PaymentsView: React.FC = () => {
  const {
    currentUser,
    cairoTodayStr,
    payments,
    invoices,
    paymentsTodayOnly,
    setPaymentsTodayOnly,
    updatePayment,
    voidPayment,
    setIsQuickActionOpen,
    goToPatient,
    hasPermission,
    isPatientAllowed
  } = useClinic();

  const isAdmin = currentUser.role === 'admin';
  const canAddPayment = hasPermission('addInvoicesPayments');
  const canEditPayment = hasPermission('editInvoicesPayments');
  const canDeletePayment = hasPermission('deleteInvoicesPayments');

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
  const [methodFilter, setMethodFilter] = useState<'all' | 'cash' | 'card' | 'wallet' | 'bank_transfer'>('all');
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [linkedInvoicePreview, setLinkedInvoicePreview] = useState<Invoice | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);

  // Edit payment modal state
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMethod, setEditMethod] = useState<Payment['paymentMethod']>('cash');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-payment-menu-wrap="true"]')) return;
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
  }, [debouncedSearchQuery, methodFilter, paymentsTodayOnly, activeDate]);

  const validPayments = useMemo(
    () => payments.filter(p => p.status !== 'voided' && isPatientAllowed(p.patientId)),
    [payments, isPatientAllowed]
  );

  const invoiceById = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach(inv => {
      if (inv.status !== 'voided') map.set(inv.id, inv);
    });
    return map;
  }, [invoices]);

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    validPayments.forEach(p => {
      if (p.date) {
        map.set(p.date, (map.get(p.date) || 0) + 1);
      }
    });
    return map;
  }, [validPayments]);

  const filteredPayments = useMemo(() => {
    const q = debouncedSearchQuery.trim();
    const qLower = q.toLowerCase();
    return validPayments.filter(pay => {
      if (paymentsTodayOnly && pay.date !== activeDate) return false;
      if (q) {
        const matchPat = matchArabicTerms(pay.patientName, q);
        const matchRec = pay.receiptNumber.toLowerCase().includes(qLower);
        if (!matchPat && !matchRec) return false;
      }
      if (methodFilter !== 'all' && pay.paymentMethod !== methodFilter) return false;
      return true;
    });
  }, [validPayments, paymentsTodayOnly, activeDate, debouncedSearchQuery, methodFilter]);

  const { dayPayments, dayCollected } = useMemo(() => {
    const list = validPayments.filter(
      p => p.date === activeDate && (methodFilter === 'all' || p.paymentMethod === methodFilter)
    );
    let collected = 0;
    for (let i = 0; i < list.length; i++) collected += list[i].amount;
    return { dayPayments: list, dayCollected: collected };
  }, [validPayments, activeDate, methodFilter]);

  const visiblePayments = useMemo(
    () => filteredPayments.slice(0, visibleCount),
    [filteredPayments, visibleCount]
  );

  const methodLabels: Record<Payment['paymentMethod'], string> = {
    cash: 'نقداً (كاش)',
    card: 'بطاقة فيزا/ماستركارد',
    wallet: 'محفظة إلكترونية',
    bank_transfer: 'تحويل بنكي'
  };

  const handleCruiserDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    if (!paymentsTodayOnly) {
      setPaymentsTodayOnly(true);
    }
    setOpenMenuId(null);
    setConfirmVoidId(null);
  };

  const openEditModal = (pay: Payment) => {
    if (!canEditPayment) return;
    setEditingPayment(pay);
    setEditAmount(String(pay.amount));
    setEditMethod(pay.paymentMethod);
    setEditDate(pay.date);
    setEditNotes(pay.notes || '');
    setOpenMenuId(null);
    setConfirmVoidId(null);
  };

  const handleSavePaymentEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditPayment || !editingPayment) return;
    const numericAmount = Number(editAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    updatePayment(editingPayment.id, {
      amount: numericAmount,
      paymentMethod: editMethod,
      date: editDate || editingPayment.date,
      notes: editNotes.trim() || undefined
    });
    setEditingPayment(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Top Banner */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              {paymentsTodayOnly
                ? isSelectedToday
                  ? 'مدفوعات اليوم'
                  : `مدفوعات ${getArabicWeekdayName(activeDate)}`
                : 'المقبوضات'}{' '}
              ({filteredPayments.length})
            </h1>
            <button
              type="button"
              onClick={() => setPaymentsTodayOnly(!paymentsTodayOnly)}
              className={`px-3 py-1 rounded-full text-xs font-extrabold border transition-colors cursor-pointer ${
                paymentsTodayOnly
                  ? 'bg-[#087e83] text-white border-[#087e83]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {paymentsTodayOnly
                ? 'كل السجل'
                : 'كل المدفوعات (اليوم فقط؟)'}
            </button>
          </div>

          {canAddPayment && (
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'payment')}
              className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل دفعة جديدة</span>
            </button>
          )}
        </div>

        {/* Admin Date Cruiser */}
        {isAdmin && (
          <AdminDateCruiser
            selectedDate={selectedDate}
            todayStr={cairoTodayStr}
            onSelectDate={handleCruiserDateChange}
            labelPrefix="مدفوعات"
            count={dayPayments.length}
            countByDate={countByDate}
            isDayFilterActive={paymentsTodayOnly}
          />
        )}

        {/* Selected Day Summary Card */}
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs text-emerald-800 font-extrabold block">
              ملخص مدفوعات {isSelectedToday ? 'اليوم فقط' : getArabicWeekdayName(activeDate)} ({activeDate}) · {dayPayments.length} إيصال
            </span>
            <span className="text-2xl font-extrabold font-mono text-emerald-900 tabular-nums">
              {dayCollected.toLocaleString()} ج.م
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/80 text-emerald-700 flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المريض أو رقم الدفعة..."
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
            />
          </div>

          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value as 'all' | 'cash' | 'card' | 'wallet' | 'bank_transfer')}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83]"
          >
            <option value="all">جميع طرق الدفع</option>
            <option value="cash">نقداً (كاش)</option>
            <option value="card">بطاقات بنكية</option>
            <option value="wallet">محافظ إلكترونية</option>
            <option value="bank_transfer">تحويلات بنكية</option>
          </select>
        </div>
      </div>

      {/* Payments List */}
      <div className="space-y-2.5">
        {visiblePayments.length > 0 ? (
          visiblePayments.map(pay => {
            const relTime = formatRelativeTimeArabic(pay.createdAt || pay.date);
            const relBadge = getRelativeTimeBadgeClass(pay.createdAt || pay.date);
            const isMenuOpen = openMenuId === pay.id;
            const linkedInv = pay.invoiceId ? invoiceById.get(pay.invoiceId) : undefined;
            return (
              <div
                key={pay.id}
                className={`relative p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isMenuOpen ? 'z-20' : ''
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                      {pay.receiptNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPatient(pay.patientId)}
                      className="font-extrabold text-sm text-[#172f3d] hover:text-[#087e83] hover:underline cursor-pointer"
                    >
                      {pay.patientName}
                    </button>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                      {methodLabels[pay.paymentMethod]}
                    </span>
                    {pay.invoiceNumber && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        (فاتورة: {pay.invoiceNumber})
                      </span>
                    )}
                    {relTime && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${relBadge}`}>
                        {relTime}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 font-mono flex items-center gap-3 flex-wrap">
                    <span>تاريخ السداد: {pay.date}</span>
                    <span className="font-sans">· المستلم: {pay.receivedBy}</span>
                  </div>

                  {pay.notes && (
                    <p className="text-xs text-slate-600 italic">
                      "{pay.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left font-mono">
                    <span className="text-[10px] text-slate-400 block font-sans">المبلغ المدفوع</span>
                    <span className="text-base sm:text-lg font-extrabold text-emerald-700">
                      {pay.amount.toLocaleString()} ج.م
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPayment(pay)}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      عرض الإيصال
                    </button>

                    <div className="relative" data-payment-menu-wrap="true">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmVoidId(null);
                          setOpenMenuId(isMenuOpen ? null : pay.id);
                        }}
                        className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                          isMenuOpen
                            ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                        title="خيارات الإيصال"
                        aria-label="خيارات الإيصال"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-2xl border border-[#dce8eb] shadow-xl p-1.5 z-50 space-y-0.5 text-right animate-in fade-in duration-100"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPayment(pay);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5 text-[#087e83]" />
                            <span>عرض الإيصال</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              goToPatient(pay.patientId);
                            }}
                            className="w-full px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>فتح ملف المريض</span>
                          </button>

                          {linkedInv && (
                            <button
                              type="button"
                              onClick={() => {
                                setLinkedInvoicePreview(linkedInv);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 text-indigo-600" />
                              <span>عرض الفاتورة ({linkedInv.invoiceNumber})</span>
                            </button>
                          )}

                          {canEditPayment && (
                            <button
                              type="button"
                              onClick={() => openEditModal(pay)}
                              className="w-full px-3 py-2 rounded-xl hover:bg-blue-50 text-blue-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>تعديل الدفعة</span>
                            </button>
                          )}

                          {canDeletePayment && (
                            <div className="pt-1 mt-1 border-t border-slate-100">
                              {confirmVoidId === pay.id ? (
                                <div className="p-1.5 rounded-xl bg-rose-50 space-y-1.5">
                                  <span className="block text-[11px] font-bold text-rose-800 px-1">
                                    تأكيد إلغاء الإيصال؟
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        voidPayment(pay.id);
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
                                  onClick={() => setConfirmVoidId(pay.id)}
                                  className="w-full px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>إلغاء الإيصال</span>
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
            {paymentsTodayOnly
              ? isSelectedToday
                ? 'لا توجد مدفوعات مسجلة اليوم'
                : `لا توجد مدفوعات مسجلة في يوم ${activeDate}`
              : 'لا توجد مدفوعات مسجلة في هذا البحث'}
          </div>
        )}
        {filteredPayments.length > visibleCount && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + 50)}
              className="px-5 py-2.5 rounded-xl bg-white border border-[#dce8eb] hover:border-[#087e83] text-[#087e83] text-xs font-extrabold shadow-xs cursor-pointer"
            >
              عرض المزيد ({filteredPayments.length - visibleCount} إيصال متبقي)
            </button>
          </div>
        )}
      </div>

      {/* Payment Receipt Modal */}
      {selectedPayment && (
        <div
          onClick={() => setSelectedPayment(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="text-center pb-3 border-b border-slate-100 space-y-1">
              <span className="font-signature text-2xl text-[#087e83]" dir="ltr">Dr Shlkamy</span>
              <h3 className="text-sm font-extrabold text-slate-800">إيصال استلام نقدية وسند قبض - عيادات د. شلقامي</h3>
              <p className="font-mono text-xs text-slate-400">{selectedPayment.receiptNumber}</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">المريض:</span>
                <span className="font-bold">{selectedPayment.patientName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">المبلغ:</span>
                <span className="font-bold font-mono text-emerald-700 text-sm">{selectedPayment.amount.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">طريقة الدفع:</span>
                <span className="font-bold">{methodLabels[selectedPayment.paymentMethod]}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">التاريخ:</span>
                <span className="font-mono">{selectedPayment.date}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">المستلم:</span>
                <span className="font-bold">{selectedPayment.receivedBy}</span>
              </div>
              {selectedPayment.notes && (
                <div className="py-1">
                  <span className="text-slate-500 block mb-0.5">ملاحظات:</span>
                  <span className="text-slate-700">{selectedPayment.notes}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedPayment(null)}
              className="w-full py-2.5 bg-[#087e83] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              إغلاق الإيصال
            </button>
          </div>
        </div>
      )}

      {/* Linked Invoice Preview Modal */}
      {linkedInvoicePreview && (
        <div
          onClick={() => setLinkedInvoicePreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-mono font-bold text-[#087e83]">{linkedInvoicePreview.invoiceNumber}</span>
                <h3 className="text-base font-extrabold text-[#172f3d]">تفاصيل الفاتورة المرتبطة</h3>
              </div>
              <button
                type="button"
                onClick={() => setLinkedInvoicePreview(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <p><strong>المريض:</strong> {linkedInvoicePreview.patientName}</p>
              <p><strong>التاريخ:</strong> <span className="font-mono">{linkedInvoicePreview.date}</span></p>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2">البند</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linkedInvoicePreview.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-semibold text-slate-800">{it.procedureName}</td>
                      <td className="p-2 text-center font-mono">{it.quantity}</td>
                      <td className="p-2 text-left font-mono font-bold">{it.lineTotal.toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-[#e7f5f2] border border-[#bfe2db] rounded-2xl text-xs space-y-1">
              <div className="flex justify-between font-bold text-[#087e83]">
                <span>صافي الفاتورة:</span>
                <span className="font-mono">{linkedInvoicePreview.netTotal.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>المسدد:</span>
                <span className="font-mono">{linkedInvoicePreview.paidAmount.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold">
                <span>المتبقي:</span>
                <span className="font-mono">{linkedInvoicePreview.outstandingBalance.toLocaleString()} ج.م</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLinkedInvoicePreview(null)}
              className="w-full py-2.5 bg-[#087e83] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && canEditPayment && (
        <div
          onClick={() => setEditingPayment(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-mono font-bold text-[#087e83]">{editingPayment.receiptNumber}</span>
                <h3 className="text-base font-extrabold text-[#172f3d]">
                  تعديل الدفعة — {editingPayment.patientName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">تاريخ السداد</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">طريقة الدفع</label>
                <select
                  value={editMethod}
                  onChange={e => setEditMethod(e.target.value as Payment['paymentMethod'])}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                >
                  <option value="cash">نقداً (كاش)</option>
                  <option value="card">بطاقة فيزا/ماستركارد</option>
                  <option value="wallet">محفظة إلكترونية</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                </select>
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
                  onClick={() => setEditingPayment(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold cursor-pointer"
                >
                  حفظ تعديل الدفعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
