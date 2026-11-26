import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import { Stethoscope, Plus, Edit2, Trash2, Search } from 'lucide-react';
import { matchArabicTerms } from '../utils/arabic';
import { ProcedureItem } from '../types/clinic';

export const ProceduresView: React.FC = () => {
  const { procedures, addProcedure, updateProcedure, deleteProcedure, hasPermission } = useClinic();
  const canAddProcedures = hasPermission('addProcedures');
  const canEditProcedures = hasPermission('editProcedures');
  const canDeleteProcedures = hasPermission('deleteProcedures');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProc, setEditingProc] = useState<ProcedureItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form State
  const [procName, setProcName] = useState('');
  const [procCategory, setProcCategory] = useState('حشو');
  const [procPrice, setProcPrice] = useState<number | ''>(500);

  const filteredProcedures = procedures.filter(p => {
    if (searchQuery.trim() && !matchArabicTerms(p.name, searchQuery) && !matchArabicTerms(p.category, searchQuery)) {
      return false;
    }
    return true;
  });

  const handleOpenAdd = () => {
    if (!canAddProcedures) return;
    setEditingProc(null);
    setProcName('');
    setProcCategory('حشو');
    setProcPrice(500);
    setShowAddModal(true);
  };

  const handleOpenEdit = (p: ProcedureItem) => {
    if (!canEditProcedures) return;
    setEditingProc(p);
    setProcName(p.name);
    setProcCategory(p.category);
    setProcPrice(p.defaultPrice);
    setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(procPrice);
    if (!procName.trim() || isNaN(price) || price < 0) return;

    if (editingProc) {
      if (!canEditProcedures) return;
      updateProcedure(editingProc.id, {
        name: procName.trim(),
        category: procCategory,
        defaultPrice: price
      });
    } else {
      if (!canAddProcedures) return;
      addProcedure({
        name: procName.trim(),
        category: procCategory,
        defaultPrice: price
      });
    }
    setShowAddModal(false);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d] flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-[#087e83]" />
            <span>الإجراءات والأسعار ({procedures.length})</span>
          </h1>

          {canAddProcedures && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة إجراء جديد</span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث عن إجراء أو تخصص طبي..."
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
          />
        </div>
      </div>

      {/* Procedures Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredProcedures.map(proc => (
          <div
            key={proc.id}
            className="p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] transition-all flex flex-col justify-between gap-3"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83]">
                  {proc.category}
                </span>
                <span className="font-mono font-extrabold text-[#087e83] text-sm sm:text-base">
                  {proc.defaultPrice.toLocaleString()} ج.م
                </span>
              </div>
              <h3 className="font-extrabold text-sm text-[#172f3d] leading-snug">
                {proc.name}
              </h3>
            </div>

            {(canEditProcedures || canDeleteProcedures) && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                {canDeleteProcedures && confirmDeleteId === proc.id ? (
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="text-[11px] font-bold text-rose-700">تأكيد حذف الإجراء؟</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          deleteProcedure(proc.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        نعم، حذف
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {canEditProcedures && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          handleOpenEdit(proc);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>تعديل السعر</span>
                      </button>
                    )}
                    {canDeleteProcedures && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(proc.id)}
                        className="px-2.5 py-1.5 text-rose-600 bg-rose-50/70 hover:bg-rose-100 border border-rose-200/70 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title="حذف الإجراء"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#172f3d]">
                {editingProc ? 'تعديل الإجراء الطبي' : 'إضافة إجراء طبي جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">اسم الإجراء أو الخدمة *</label>
                <input
                  type="text"
                  value={procName}
                  onChange={e => setProcName(e.target.value)}
                  placeholder="مثال: حشو ليزر تجميلي للأسنان الأمامية"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">التصنيف الطبي</label>
                  <select
                    value={procCategory}
                    onChange={e => setProcCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold"
                  >
                    <option value="كشف">كشف واستشارة</option>
                    <option value="وقائي">تنظيف ووقائي</option>
                    <option value="حشو">حشوات تجميلية</option>
                    <option value="علاج جذور">علاج جذور وعصب</option>
                    <option value="جراحة">جراحة وخلع</option>
                    <option value="تركيبات">تركيبات وتيجان</option>
                    <option value="تجميل">تجميل وفينير وتبييض</option>
                    <option value="زراعة">زراعة أسنان</option>
                    <option value="تقويم">تقويم أسنان</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">السعر الافتراضي (ج.م) *</label>
                  <input
                    type="number"
                    value={procPrice}
                    onChange={e => setProcPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold"
                    required
                    min={0}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#087e83] hover:bg-[#06686c] text-white rounded-xl font-bold"
              >
                {editingProc ? 'حفظ التعديلات' : 'إضافة الإجراء للقائمة'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
