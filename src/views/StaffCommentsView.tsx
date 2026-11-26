import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  MessageSquare,
  Plus,
  RefreshCw,
  MinusCircle,
  Trash2,
  EyeOff,
  Eye,
  Clock
} from 'lucide-react';

type DurationPreset = 'permanent' | '1d' | 'custom_days' | '1w' | 'custom_weeks';

export const StaffCommentsView: React.FC = () => {
  const {
    staffComments,
    addStaffComment,
    repeatStaffComment,
    unrepeatStaffComment,
    hideStaffComment,
    restoreStaffComment,
    deleteStaffComment,
    staffMembers,
    currentUser
  } = useClinic();

  const [contentInput, setContentInput] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('permanent');
  const [customCount, setCustomCount] = useState<number>(3);
  const [restoreDurations, setRestoreDurations] = useState<Record<string, DurationPreset>>({});
  const [restoreCustomCounts, setRestoreCustomCounts] = useState<Record<string, number>>({});

  const resolveDurationOptions = (
    preset: DurationPreset,
    countVal: number
  ): { durationDays: number | null; durationLabel: string } => {
    const safeCount = Math.max(1, Math.round(countVal || 1));
    if (preset === '1d') return { durationDays: 1, durationLabel: 'يوم واحد' };
    if (preset === 'custom_days') {
      return {
        durationDays: safeCount,
        durationLabel: safeCount === 1 ? 'يوم واحد' : safeCount === 2 ? 'يومان' : `${safeCount} أيام`
      };
    }
    if (preset === '1w') return { durationDays: 7, durationLabel: 'أسبوع واحد' };
    if (preset === 'custom_weeks') {
      return {
        durationDays: safeCount * 7,
        durationLabel:
          safeCount === 1 ? 'أسبوع واحد' : safeCount === 2 ? 'أسبوعان' : `${safeCount} أسابيع`
      };
    }
    return { durationDays: null, durationLabel: 'دائم' };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentInput.trim()) return;
    const durationOpts = resolveDurationOptions(durationPreset, customCount);
    addStaffComment(selectedStaffId, contentInput.trim(), durationOpts);
    setContentInput('');
  };

  const nowMs = Date.now();
  const isExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false;
    const ts = Date.parse(expiresAt);
    return !isNaN(ts) && nowMs >= ts;
  };

  const activeComments = staffComments.filter(c => !c.isHidden && !isExpired(c.expiresAt));
  const hiddenOrExpiredComments = staffComments.filter(c => c.isHidden || isExpired(c.expiresAt));

  return (
    <div className="space-y-5 animate-in fade-in duration-150 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center font-bold">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-[#172f3d]">الكومنتات والإنذارات للموظفين</h1>
            <p className="text-xs text-slate-500">إضافة ملاحظات وتوجيهات متكررة مع مدة ظهور محددة وإمكانية الإخفاء أو الإعادة</p>
          </div>
        </div>
      </div>

      {/* Add Comment Form */}
      {currentUser.role === 'admin' && (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-[#172f3d]">إضافة كومنت أو توجيه جديد</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">نص الكومنت أو التوجيه</label>
                <input
                  type="text"
                  value={contentInput}
                  onChange={e => setContentInput(e.target.value)}
                  placeholder="مثال: يرجى الالتزام بمواعيد الحضور وتأكيد الحجوزات..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المعني</label>
                <select
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none bg-white"
                >
                  <option value="all">جميع الموظفين (عام)</option>
                  {staffMembers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.jobTitle})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Display Duration Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">مدة الظهور للموظف ثم الاختفاء التلقائي</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={durationPreset}
                    onChange={e => setDurationPreset(e.target.value as DurationPreset)}
                    className="flex-1 min-w-[160px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none bg-white"
                  >
                    <option value="permanent">دائم (بدون انتهاء تلقائي)</option>
                    <option value="1d">يوم واحد (24 ساعة)</option>
                    <option value="custom_days">عدد أيام محدد...</option>
                    <option value="1w">أسبوع واحد (7 أيام)</option>
                    <option value="custom_weeks">عدد أسابيع محدد...</option>
                  </select>

                  {(durationPreset === 'custom_days' || durationPreset === 'custom_weeks') && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={customCount}
                        onChange={e => setCustomCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold text-center focus:border-[#087e83] focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-600">
                        {durationPreset === 'custom_days' ? 'يوم' : 'أسبوع'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>إضافة الكومنت</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Active Comments List */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-extrabold text-[#172f3d]">
            الكومنتات النشطة الظاهرة للموظفين ({activeComments.length})
          </h2>
        </div>

        {activeComments.length > 0 ? (
          <div className="space-y-3">
            {activeComments.map(comment => {
              const count = comment.repeatCount || 1;
              const isBlue = count === 1;
              const isOrange = count === 2;

              const cardBg = isBlue
                ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                : isOrange
                ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                : 'bg-rose-50/80 border-rose-300 text-rose-950';

              const badgeBg = isBlue
                ? 'bg-blue-100 text-blue-800'
                : isOrange
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-800';

              return (
                <div key={comment.id} className={`p-4 rounded-2xl border ${cardBg} flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xl flex-shrink-0 mt-0.5" title="إنذار وتوجيه">⚠️</span>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-white/80 border border-black/10">
                          {comment.staffName}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>
                          تكرار رقم {count}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border border-black/10 text-slate-700 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#087e83]" />
                          <span>المدة: {comment.durationLabel || 'دائم'}</span>
                        </span>
                      </div>
                      <p className="text-sm font-bold">{comment.content}</p>
                      <div className="text-[10px] opacity-80 font-mono flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>تاريخ الإنشاء: {new Date(comment.createdAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}</span>
                        {comment.expiresAt && (
                          <span>· يختفي في: {new Date(comment.expiresAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}</span>
                        )}
                      </div>
                      {(() => {
                        const historyDates =
                          Array.isArray(comment.history) && comment.history.length > 0
                            ? comment.history
                            : [comment.createdAt];
                        return (
                          <div className="pt-1 flex flex-wrap items-center gap-1.5">
                            {historyDates.map((ts, idx) => (
                              <span
                                key={`${comment.id}_h_${idx}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/75 dark:bg-slate-900/40 border border-black/10 text-[10px] font-semibold"
                              >
                                <span className="font-extrabold text-[#087e83]">
                                  {idx === 0 ? 'الإنشاء (١):' : `تكرار ${idx + 1}:`}
                                </span>
                                <span className="font-mono" dir="ltr">
                                  {new Date(ts).toLocaleString('ar-EG', {
                                    timeZone: 'Africa/Cairo',
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {currentUser.role === 'admin' && (
                    <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-center flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => repeatStaffComment(comment.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-black/15 text-slate-700 font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                        title="تكرار الكومنت (زيادة عداد التكرار)"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#087e83]" />
                        <span>تكرار (+)</span>
                      </button>

                      {count > 1 && (
                        <button
                          type="button"
                          onClick={() => unrepeatStaffComment(comment.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="إلغاء تكرار (تقليل عداد التكرار)"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span>إلغاء تكرار</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => hideStaffComment(comment.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                        title="إخفاء الكومنت عن شاشة الموظف مؤقتاً"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                        <span>إخفاء</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteStaffComment(comment.id)}
                        className="p-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 cursor-pointer"
                        title="حذف الكومنت نهائياً"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-slate-400 space-y-2">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-500">لا توجد كومنتات نشطة مسجلة حالياً</p>
          </div>
        )}
      </div>

      {/* Hidden & Expired Comments Archive (Admin can restore anytime) */}
      {hiddenOrExpiredComments.length > 0 && (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-slate-700 flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-slate-500" />
              <span>الكومنتات المخفية والمنتهية ({hiddenOrExpiredComments.length})</span>
            </h2>
            <span className="text-[11px] text-slate-400">يمكن إعادة إظهار أي كومنت للموظف في أي وقت</span>
          </div>

          <div className="space-y-2.5">
            {hiddenOrExpiredComments.map(comment => {
              const expired = isExpired(comment.expiresAt);
              const rPreset = restoreDurations[comment.id] || 'permanent';
              const rCustom = restoreCustomCounts[comment.id] || 3;

              return (
                <div key={comment.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800">
                        {comment.staffName}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        تكرار رقم {comment.repeatCount || 1}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        comment.isHidden ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {comment.isHidden ? 'مخفي يدوياً' : 'انتهت مدة الظهور'}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{comment.content}</p>
                    <div className="text-[10px] text-slate-500 font-mono">
                      الإنشاء: {new Date(comment.createdAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
                      {expired && comment.expiresAt && ` · انتهى: ${new Date(comment.expiresAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`}
                    </div>
                    {(() => {
                      const historyDates =
                        Array.isArray(comment.history) && comment.history.length > 0
                          ? comment.history
                          : [comment.createdAt];
                      return (
                        <div className="pt-1 flex flex-wrap items-center gap-1.5">
                          {historyDates.map((ts, idx) => (
                            <span
                              key={`${comment.id}_arch_${idx}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[10px] font-semibold text-slate-700"
                            >
                              <span className="font-extrabold text-[#087e83]">
                                {idx === 0 ? 'الإنشاء (١):' : `تكرار ${idx + 1}:`}
                              </span>
                              <span className="font-mono" dir="ltr">
                                {new Date(ts).toLocaleString('ar-EG', {
                                  timeZone: 'Africa/Cairo',
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {currentUser.role === 'admin' && (
                    <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-center flex-shrink-0">
                      <select
                        value={rPreset}
                        onChange={e =>
                          setRestoreDurations(prev => ({
                            ...prev,
                            [comment.id]: e.target.value as DurationPreset
                          }))
                        }
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-700"
                        title="مدة الظهور عند إعادة التفعيل"
                      >
                        <option value="permanent">إرجاع: دائم</option>
                        <option value="1d">يوم واحد</option>
                        <option value="custom_days">أيام محددة</option>
                        <option value="1w">أسبوع واحد</option>
                        <option value="custom_weeks">أسابيع محددة</option>
                      </select>

                      {(rPreset === 'custom_days' || rPreset === 'custom_weeks') && (
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={rCustom}
                          onChange={e =>
                            setRestoreCustomCounts(prev => ({
                              ...prev,
                              [comment.id]: Math.max(1, Number(e.target.value) || 1)
                            }))
                          }
                          className="w-14 px-2 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-mono font-bold text-center"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const opts = resolveDurationOptions(rPreset, rCustom);
                          restoreStaffComment(comment.id, opts);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>إرجاع</span>
                      </button>

                      {(comment.repeatCount || 1) > 1 && (
                        <button
                          type="button"
                          onClick={() => unrepeatStaffComment(comment.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title="إلغاء تكرار"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteStaffComment(comment.id)}
                        className="p-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 cursor-pointer"
                        title="حذف نهائياً"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
