import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  X
} from 'lucide-react';
import {
  formatRelativeTimeArabic,
  getArabicWeekdayName,
  getRelativeTimeBadgeClass
} from '../utils/arabic';
import { Expense } from '../types/clinic';
import { getCustomColorActiveStyle, getCustomColorBadgeStyle } from '../utils/colors';
import { AdminDateCruiser } from '../components/AdminDateCruiser';

export const ExpensesView: React.FC = () => {
  const {
    currentUser,
    cairoTodayStr,
    expenses,
    expensesTodayOnly,
    setExpensesTodayOnly,
    expenseCategories,
    listItemColors,
    updateExpense,
    deleteExpense,
    setIsQuickActionOpen,
    hasPermission,
    isUnitAllowed
  } = useClinic();
  const isAdmin = currentUser.role === 'admin';
  const canAddExpense = hasPermission('addExpenses');
  const canEditExpense = hasPermission('editExpenses');
  const canDeleteExpense = hasPermission('deleteExpenses');

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

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-expense-menu-wrap="true"]')) return;
      setOpenMenuId(null);
      setConfirmDeleteId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
        setConfirmDeleteId(null);
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
    setVisibleCount(50);
  }, [selectedCategory, expensesTodayOnly, activeDate]);

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<string>(expenseCategories[0]?.name || 'أخرى');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const allCategoryNames = useMemo(
    () =>
      Array.from(
        new Set([
          ...expenseCategories.map(c => c.name),
          ...expenses.map(e => e.category).filter(Boolean)
        ])
      ),
    [expenseCategories, expenses]
  );

  const openEditModal = (exp: Expense) => {
    if (!canEditExpense) return;
    setEditingExpense(exp);
    setEditAmount(String(exp.amount));
    setEditCategory(exp.category || expenseCategories[0]?.name || 'أخرى');
    setEditDate(exp.date);
    setEditNotes(exp.notes || '');
    setOpenMenuId(null);
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditExpense || !editingExpense) return;
    const numericAmount = Number(editAmount);
    if (!editCategory.trim() || isNaN(numericAmount) || numericAmount < 0) return;
    updateExpense(editingExpense.id, {
      title: editCategory.trim(),
      amount: numericAmount,
      category: editCategory.trim(),
      date: editDate || editingExpense.date,
      notes: editNotes.trim() || undefined
    });
    setEditingExpense(null);
  };

  const scopedExpenses = useMemo(
    () => expenses.filter(e => !e.unitId || isUnitAllowed(e.unitId, e.unitName)),
    [expenses, isUnitAllowed]
  );

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    scopedExpenses.forEach(exp => {
      if (exp.date) {
        map.set(exp.date, (map.get(exp.date) || 0) + 1);
      }
    });
    return map;
  }, [scopedExpenses]);

  const filteredExpenses = useMemo(
    () =>
      scopedExpenses.filter(e => {
        if (expensesTodayOnly && e.date !== activeDate) return false;
        if (selectedCategory !== 'all' && e.category !== selectedCategory) return false;
        return true;
      }),
    [scopedExpenses, expensesTodayOnly, activeDate, selectedCategory]
  );

  const { dayExpenses, dayExpenseTotal } = useMemo(() => {
    const list = scopedExpenses.filter(
      e => e.date === activeDate && (selectedCategory === 'all' || e.category === selectedCategory)
    );
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].amount;
    return { dayExpenses: list, dayExpenseTotal: total };
  }, [scopedExpenses, activeDate, selectedCategory]);

  const visibleExpenses = useMemo(
    () => filteredExpenses.slice(0, visibleCount),
    [filteredExpenses, visibleCount]
  );

  const handleCruiserDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    if (!expensesTodayOnly) {
      setExpensesTodayOnly(true);
    }
    setOpenMenuId(null);
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header and Summary Card */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              {expensesTodayOnly
                ? isSelectedToday
                  ? 'مصاريف اليوم'
                  : `مصاريف ${getArabicWeekdayName(activeDate)}`
                : 'المصروفات'}{' '}
              ({filteredExpenses.length})
            </h1>
            <button
              type="button"
              onClick={() => setExpensesTodayOnly(!expensesTodayOnly)}
              className={`px-3 py-1 rounded-full text-xs font-extrabold border transition-colors cursor-pointer ${
                expensesTodayOnly
                  ? 'bg-[#087e83] text-white border-[#087e83]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {expensesTodayOnly
                ? 'كل السجل'
                : 'كل المصروفات (اليوم فقط؟)'}
            </button>
          </div>

          {canAddExpense && (
            <button
              type="button"
              onClick={() => setIsQuickActionOpen(true, 'expense')}
              className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل مصروف جديد</span>
            </button>
          )}
        </div>

        {/* Admin Date Cruiser */}
        {isAdmin && (
          <AdminDateCruiser
            selectedDate={selectedDate}
            todayStr={cairoTodayStr}
            onSelectDate={handleCruiserDateChange}
            labelPrefix="مصاريف"
            count={scopedExpenses.filter(e => e.date === activeDate).length}
            countByDate={countByDate}
            isDayFilterActive={expensesTodayOnly}
          />
        )}

        {/* Selected Day Summary Card */}
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs text-rose-800 font-extrabold block">
              ملخص مصروفات {isSelectedToday ? 'اليوم فقط' : getArabicWeekdayName(activeDate)} ({activeDate}) · {dayExpenses.length} بند
            </span>
            <span className="text-2xl font-extrabold font-mono text-rose-900 tabular-nums">
              {dayExpenseTotal.toLocaleString()} ج.م
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/80 text-rose-700 flex items-center justify-center font-bold">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs font-bold pt-1">
          {['all', ...allCategoryNames].map(cat => {
            const customHex = cat !== 'all' ? listItemColors.expenseCategories?.[cat] : undefined;
            const isSelected = selectedCategory === cat;
            const chipStyle =
              customHex
                ? isSelected
                  ? getCustomColorActiveStyle(customHex)
                  : getCustomColorBadgeStyle(customHex)
                : undefined;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={chipStyle}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors cursor-pointer border ${
                  isSelected
                    ? 'bg-[#087e83] text-white border-[#087e83]'
                    : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200'
                }`}
              >
                {cat === 'all' ? 'جميع التصنيفات' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expenses List */}
      <div className="space-y-2.5">
        {visibleExpenses.length > 0 ? (
          visibleExpenses.map(exp => {
            const relTime = formatRelativeTimeArabic(exp.date);
            const relBadge = getRelativeTimeBadgeClass(exp.date);
            const isMenuOpen = openMenuId === exp.id;
            return (
              <div
                key={exp.id}
                className={`relative p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isMenuOpen ? 'z-20' : ''
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-[#172f3d]">
                      {exp.title}
                    </span>
                    <span
                      style={getCustomColorBadgeStyle(listItemColors.expenseCategories?.[exp.category])}
                      className="text-[10px] bg-slate-100 text-slate-700 border border-transparent font-semibold px-2 py-0.5 rounded-full"
                    >
                      {exp.category}
                    </span>
                    {exp.unitName && (
                      <span className="text-[10px] text-slate-400">
                        ({exp.unitName})
                      </span>
                    )}
                    {relTime && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${relBadge}`}>
                        {relTime}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 font-mono flex items-center gap-3 flex-wrap">
                    <span>التاريخ: {exp.date}</span>
                    <span className="font-sans">· المسجل: {exp.loggedBy}</span>
                  </div>

                  {exp.notes && (
                    <p className="text-xs text-slate-500 italic">
                      "{exp.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left font-mono">
                    <span className="text-[10px] text-slate-400 block font-sans">المبلغ</span>
                    <span className="text-base sm:text-lg font-extrabold text-rose-700">
                      {exp.amount.toLocaleString()} ج.م
                    </span>
                  </div>

                  <div className="relative" data-expense-menu-wrap="true">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                        setOpenMenuId(isMenuOpen ? null : exp.id);
                      }}
                      className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                        isMenuOpen
                          ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                      title="خيارات المصروف"
                      aria-label="خيارات المصروف"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute left-0 top-full mt-1.5 w-52 bg-white rounded-2xl border border-[#dce8eb] shadow-xl p-1.5 z-50 space-y-0.5 text-right animate-in fade-in duration-100"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExpense(exp);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#087e83]" />
                          <span>عرض التفاصيل</span>
                        </button>

                        {canEditExpense && (
                          <button
                            type="button"
                            onClick={() => openEditModal(exp)}
                            className="w-full px-3 py-2 rounded-xl hover:bg-blue-50 text-blue-700 text-xs font-bold flex items-center gap-2 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>تعديل المصروف</span>
                          </button>
                        )}

                        {canDeleteExpense && (
                          <div className="pt-1 mt-1 border-t border-slate-100">
                            {confirmDeleteId === exp.id ? (
                              <div className="p-1.5 rounded-xl bg-rose-50 space-y-1.5">
                                <span className="block text-[11px] font-bold text-rose-800 px-1">
                                  تأكيد حذف المصروف؟
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      deleteExpense(exp.id);
                                      setConfirmDeleteId(null);
                                      setOpenMenuId(null);
                                    }}
                                    className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    تأكيد الحذف
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                                  >
                                    تراجع
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(exp.id)}
                                className="w-full px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-2 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف المصروف</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
            {expensesTodayOnly
              ? isSelectedToday
                ? 'لا توجد مصروفات مسجلة اليوم في هذا التصنيف'
                : `لا توجد مصروفات مسجلة في يوم ${activeDate}`
              : 'لا توجد مصروفات مسجلة في هذا التصنيف'}
          </div>
        )}
        {filteredExpenses.length > visibleCount && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + 50)}
              className="px-5 py-2.5 rounded-xl bg-white border border-[#dce8eb] hover:border-[#087e83] text-[#087e83] text-xs font-extrabold shadow-xs cursor-pointer"
            >
              عرض المزيد ({filteredExpenses.length - visibleCount} بند متبقي)
            </button>
          </div>
        )}
      </div>

      {/* Expense Details Modal */}
      {selectedExpense && (
        <div
          onClick={() => setSelectedExpense(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">تفاصيل المصروف</h3>
              <button
                type="button"
                onClick={() => setSelectedExpense(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">البند:</span>
                <span className="font-bold">{selectedExpense.title}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">التصنيف:</span>
                <span className="font-bold">{selectedExpense.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">المبلغ:</span>
                <span className="font-bold font-mono text-rose-700 text-sm">
                  {selectedExpense.amount.toLocaleString()} ج.م
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">التاريخ:</span>
                <span className="font-mono">{selectedExpense.date}</span>
              </div>
              {selectedExpense.unitName && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">الفرع:</span>
                  <span className="font-bold">{selectedExpense.unitName}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">المسجل:</span>
                <span className="font-bold">{selectedExpense.loggedBy}</span>
              </div>
              {selectedExpense.notes && (
                <div className="py-1">
                  <span className="text-slate-500 block mb-0.5">ملاحظات:</span>
                  <span className="text-slate-700">{selectedExpense.notes}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedExpense(null)}
              className="w-full py-2.5 bg-[#087e83] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {editingExpense && canEditExpense && (
        <div
          onClick={() => setEditingExpense(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">تعديل المصروف</h3>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">التصنيف *</label>
                <select
                  value={editCategory}
                  onChange={e => {
                    const nextCat = e.target.value;
                    setEditCategory(nextCat);
                    const matched = expenseCategories.find(c => c.name === nextCat);
                    if (matched?.defaultAmount && matched.defaultAmount > 0) {
                      setEditAmount(String(matched.defaultAmount));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold focus:border-[#087e83] focus:outline-none"
                >
                  {Array.from(new Set([...allCategoryNames, editCategory])).filter(Boolean).map(catName => {
                    const cfg = expenseCategories.find(c => c.name === catName);
                    return (
                      <option key={catName} value={catName}>
                        {catName}
                        {cfg?.defaultAmount && cfg.defaultAmount > 0 ? ` (${cfg.defaultAmount.toLocaleString()} ج.م)` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">التاريخ</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:border-[#087e83] focus:outline-none"
                  />
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
                  onClick={() => setEditingExpense(null)}
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
