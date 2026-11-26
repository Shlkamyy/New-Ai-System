import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X
} from 'lucide-react';
import { addDaysToYmd, getArabicWeekdayName } from '../utils/arabic';
import { useClinic } from '../context/ClinicContext';

interface AdminDateCruiserProps {
  selectedDate: string;
  todayStr: string;
  onSelectDate: (dateStr: string) => void;
  labelPrefix: string;
  count: number;
  countByDate?: Map<string, number>;
  isDayFilterActive?: boolean;
}

const ARABIC_MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
];

export const AdminDateCruiser: React.FC<AdminDateCruiserProps> = ({
  selectedDate,
  todayStr,
  onSelectDate,
  labelPrefix,
  countByDate,
  isDayFilterActive = true
}) => {
  const { weekdaySettings } = useClinic();
  const closedWeekdaySet = useMemo(
    () => new Set(weekdaySettings.filter(w => w.isClosed).map(w => w.dayOfWeek)),
    [weekdaySettings]
  );

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => Number(selectedDate.slice(0, 4)) || 2026);
  const [calMonth, setCalMonth] = useState(() => (Number(selectedDate.slice(5, 7)) || 1) - 1);

  const isToday = selectedDate === todayStr;
  const weekdayName = getArabicWeekdayName(selectedDate);
  const [, mPart, dPart] = selectedDate.split('-');
  const dayNum = dPart ? Number(dPart) : NaN;
  const monthIdx = mPart ? Number(mPart) - 1 : -1;
  const dayAndMonthLabel =
    !isNaN(dayNum) && monthIdx >= 0 && monthIdx < 12
      ? `${dayNum} ${ARABIC_MONTH_NAMES[monthIdx]}`
      : selectedDate;

  const openCalendarModal = () => {
    const [y, m] = selectedDate.split('-').map(Number);
    if (y && m) {
      setCalYear(y);
      setCalMonth(m - 1);
    }
    setCalendarOpen(true);
  };

  const stepMonth = (delta: number) => {
    const next = new Date(calYear, calMonth + delta, 1);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());
  };

  const monthLabel = useMemo(
    () =>
      new Date(calYear, calMonth, 1).toLocaleDateString('ar-EG', {
        month: 'long',
        year: 'numeric'
      }),
    [calYear, calMonth]
  );

  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
    const startIdx = (firstDay.getDay() + 1) % 7; // Saturday first
    const cells: Array<{ day: number | null; dateStr: string; count: number; isClinicHoliday: boolean }> = [];

    for (let i = 0; i < startIdx; i++) {
      cells.push({ day: null, dateStr: '', count: 0, isClinicHoliday: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(calYear, calMonth, d, 12, 0, 0).getDay();
      cells.push({
        day: d,
        dateStr,
        count: countByDate ? countByDate.get(dateStr) || 0 : 0,
        isClinicHoliday: closedWeekdaySet.has(dow)
      });
    }
    return cells;
  }, [calYear, calMonth, countByDate, closedWeekdaySet]);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#f6fbfa] border border-[#d6e8e4] rounded-2xl p-2">
        <div className="flex items-center justify-between gap-1 sm:gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onSelectDate(addDaysToYmd(selectedDate, -1))}
            className="shrink-0 px-1.5 sm:px-2.5 py-2 rounded-xl bg-white hover:bg-[#e7f5f2] border border-[#dce8eb] text-[#172f3d] font-bold text-[11px] sm:text-xs flex items-center gap-0.5 sm:gap-1 transition-colors cursor-pointer active:scale-95"
            title="اليوم السابق"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#087e83]" />
            <span>السابق</span>
          </button>

          <button
            type="button"
            onClick={openCalendarModal}
            className="flex-1 sm:flex-initial text-[11px] sm:text-sm font-extrabold text-[#172f3d] hover:text-[#087e83] bg-white hover:bg-[#e7f5f2] border border-[#bfe2db] hover:border-[#087e83] shadow-2xs active:scale-[0.98] px-2 sm:px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 leading-snug text-center whitespace-nowrap"
            title="اضغط لاختيار التاريخ من التقويم"
          >
            <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#087e83] shrink-0" />
            <span className="whitespace-nowrap">
              {weekdayName} {dayAndMonthLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectDate(addDaysToYmd(selectedDate, 1))}
            className="shrink-0 px-1.5 sm:px-2.5 py-2 rounded-xl bg-white hover:bg-[#e7f5f2] border border-[#dce8eb] text-[#172f3d] font-bold text-[11px] sm:text-xs flex items-center gap-0.5 sm:gap-1 transition-colors cursor-pointer active:scale-95"
            title="اليوم القادم"
          >
            <span>القادم</span>
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#087e83]" />
          </button>
        </div>

        {(!isToday || !isDayFilterActive) && (
          <button
            type="button"
            onClick={() => onSelectDate(todayStr)}
            className="px-3.5 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>العودة لليوم</span>
          </button>
        )}
      </div>

      {calendarOpen && (
        <div
          onClick={() => setCalendarOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#dce8eb] space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#087e83]" />
                <h3 className="text-base font-extrabold text-[#172f3d]">
                  اختيار تاريخ {labelPrefix}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer"
                title="الشهر السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-extrabold text-[#172f3d]">{monthLabel}</span>
              <button
                type="button"
                onClick={() => stepMonth(1)}
                className="p-2 rounded-xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] cursor-pointer"
                title="الشهر القادم"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold">
              {[
                { label: 'السبت', dow: 6 },
                { label: 'الأحد', dow: 0 },
                { label: 'الاثنين', dow: 1 },
                { label: 'الثلاثاء', dow: 2 },
                { label: 'الأربعاء', dow: 3 },
                { label: 'الخميس', dow: 4 },
                { label: 'الجمعة', dow: 5 }
              ].map(d => (
                <div
                  key={d.label}
                  className={`py-1 ${closedWeekdaySet.has(d.dow) ? 'text-rose-600 font-extrabold' : 'text-slate-400'}`}
                >
                  {d.label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                if (!cell.day) {
                  return <div key={`empty-${idx}`} className="min-h-[48px] rounded-xl bg-slate-50/40" />;
                }
                const isCellSelected = cell.dateStr === selectedDate;
                const isCellToday = cell.dateStr === todayStr;
                const isHoliday = cell.isClinicHoliday;
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => {
                      onSelectDate(cell.dateStr);
                      setCalendarOpen(false);
                    }}
                    className={`min-h-[48px] py-0.5 rounded-xl border flex flex-col items-center justify-center font-mono text-xs font-bold transition-all cursor-pointer ${
                      isCellSelected
                        ? 'bg-[#087e83] text-white border-[#087e83] shadow-sm'
                        : isCellToday
                        ? 'bg-[#e7f5f2] text-[#087e83] border-[#087e83]'
                        : isHoliday
                        ? 'bg-rose-50/85 border-rose-200 hover:bg-rose-100/75 text-rose-800'
                        : 'bg-white border-slate-200 hover:bg-[#f0f6f5] text-slate-700'
                    }`}
                  >
                    <span>{cell.day}</span>
                    {cell.count > 0 && (
                      <span
                        className={`text-[9px] font-sans font-extrabold px-1.5 rounded-full leading-tight ${
                          isCellSelected
                            ? 'bg-white/25 text-white'
                            : 'bg-[#e7f5f2] text-[#087e83]'
                        }`}
                      >
                        {cell.count}
                      </span>
                    )}
                    {isHoliday && (
                      <span
                        className={`text-[8px] font-sans font-extrabold leading-none mt-0.5 ${
                          isCellSelected ? 'text-white/90' : 'text-rose-600'
                        }`}
                      >
                        إجازة
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  onSelectDate(todayStr);
                  setCalendarOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>العودة لليوم ({todayStr})</span>
              </button>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
