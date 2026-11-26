import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Check } from 'lucide-react';

interface AnalogTimePickerModalProps {
  isOpen: boolean;
  initialTime24: string;
  patientName?: string;
  title?: string;
  onConfirm: (newTime24: string) => void;
  onClose: () => void;
}

function parse24ToParts(time24: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
  if (!time24) return { hour12: 2, minute: 0, period: 'PM' };
  const clean = time24.trim();
  if (clean.includes('AM') || clean.includes('PM')) {
    const isPM = clean.includes('PM');
    const [hStr, mStr] = clean.replace(/[^0-9:]/g, '').split(':');
    let h = parseInt(hStr || '12', 10);
    if (isNaN(h) || h < 1 || h > 12) h = 12;
    let m = parseInt(mStr || '0', 10);
    if (isNaN(m) || m < 0 || m > 59) m = 0;
    return { hour12: h, minute: m, period: isPM ? 'PM' : 'AM' };
  }
  const [hStr, mStr] = clean.split(':');
  const h24 = parseInt(hStr || '14', 10);
  const m = parseInt(mStr || '0', 10);
  const safeH24 = isNaN(h24) ? 14 : Math.max(0, Math.min(23, h24));
  const safeM = isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
  const period: 'AM' | 'PM' = safeH24 >= 12 ? 'PM' : 'AM';
  const hour12 = safeH24 % 12 === 0 ? 12 : safeH24 % 12;
  return { hour12, minute: safeM, period };
}

function partsTo24(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let h24 = hour12 % 12;
  if (period === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export const AnalogTimePickerModal: React.FC<AnalogTimePickerModalProps> = ({
  isOpen,
  initialTime24,
  patientName,
  title = 'تعديل ميعاد الساعة',
  onConfirm,
  onClose
}) => {
  const [hour12, setHour12] = useState<number>(2);
  const [minute, setMinute] = useState<number>(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('PM');
  const [dialMode, setDialMode] = useState<'hour' | 'minute'>('hour');
  const dialRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const parsed = parse24ToParts(initialTime24);
      setHour12(parsed.hour12);
      setMinute(parsed.minute);
      setPeriod(parsed.period);
      setDialMode('hour');
    }
  }, [isOpen, initialTime24]);

  if (!isOpen) return null;

  const updateFromPointer = (clientX: number, clientY: number, isEnd = false) => {
    const el = dialRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;

    if (dialMode === 'hour') {
      const step = Math.round(deg / 30) % 12;
      const picked = step === 0 ? 12 : step;
      setHour12(picked);
      if (isEnd) setDialMode('minute');
    } else {
      const step = Math.round(deg / 6) % 60;
      setMinute(step);
    }
  };

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minuteMarks = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const handAngleDeg = dialMode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const handRad = ((handAngleDeg - 90) * Math.PI) / 180;
  const handRadius = 86;
  const handX = 120 + handRadius * Math.cos(handRad);
  const handY = 120 + handRadius * Math.sin(handRad);

  const formattedHour = String(hour12).padStart(2, '0');
  const formattedMinute = String(minute).padStart(2, '0');

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xs sm:max-w-sm bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-2xl space-y-4 select-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-[#172f3d] truncate">{title}</h3>
              {patientName && (
                <p className="text-[11px] font-semibold text-slate-500 truncate">{patientName}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Digital Header Display + AM / PM Selector */}
        <div className="flex items-center justify-between gap-3 bg-[#f4fbf9] border border-[#bfe2db] rounded-2xl p-3" dir="ltr">
          <div className="flex items-center gap-1 font-mono text-2xl font-extrabold text-[#172f3d] tabular-nums">
            <button
              type="button"
              onClick={() => setDialMode('hour')}
              className={`px-2.5 py-1 rounded-xl transition-colors cursor-pointer ${
                dialMode === 'hour'
                  ? 'bg-[#087e83] text-white shadow-xs'
                  : 'bg-white text-[#172f3d] hover:bg-[#e7f5f2]'
              }`}
            >
              {formattedHour}
            </button>
            <span className="text-[#087e83]">:</span>
            <button
              type="button"
              onClick={() => setDialMode('minute')}
              className={`px-2.5 py-1 rounded-xl transition-colors cursor-pointer ${
                dialMode === 'minute'
                  ? 'bg-[#087e83] text-white shadow-xs'
                  : 'bg-white text-[#172f3d] hover:bg-[#e7f5f2]'
              }`}
            >
              {formattedMinute}
            </button>
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#dce8eb]">
            <button
              type="button"
              onClick={() => setPeriod('AM')}
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                period === 'AM' ? 'bg-[#087e83] text-white shadow-2xs' : 'text-slate-500 hover:text-[#087e83]'
              }`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => setPeriod('PM')}
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                period === 'PM' ? 'bg-[#087e83] text-white shadow-2xs' : 'text-slate-500 hover:text-[#087e83]'
              }`}
            >
              PM
            </button>
          </div>
        </div>

        {/* Interactive Analog Clock Dial */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-[11px] font-bold text-slate-500">
            {dialMode === 'hour' ? 'اختر الساعة من قرص الساعة' : 'اختر الدقائق من قرص الساعة'}
          </div>

          <div
            ref={dialRef}
            onPointerDown={e => {
              isDraggingRef.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              updateFromPointer(e.clientX, e.clientY, false);
            }}
            onPointerMove={e => {
              if (!isDraggingRef.current) return;
              updateFromPointer(e.clientX, e.clientY, false);
            }}
            onPointerUp={e => {
              if (!isDraggingRef.current) return;
              isDraggingRef.current = false;
              updateFromPointer(e.clientX, e.clientY, true);
            }}
            className="relative w-60 h-60 rounded-full bg-[#f4f8f9] border-2 border-[#d4e7ea] shadow-inner touch-none cursor-pointer"
            dir="ltr"
          >
            {/* SVG Hand */}
            <svg viewBox="0 0 240 240" className="w-full h-full pointer-events-none">
              <circle cx="120" cy="120" r="112" fill="none" stroke="#e4eff1" strokeWidth="1" />
              <line
                x1="120"
                y1="120"
                x2={handX}
                y2={handY}
                stroke="#087e83"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={handX} cy={handY} r="17" fill="#087e83" opacity="0.92" />
              <circle cx="120" cy="120" r="5" fill="#087e83" />
            </svg>

            {/* Numbers around the face */}
            {dialMode === 'hour'
              ? hours.map((h, idx) => {
                  const angleRad = ((idx * 30 - 90) * Math.PI) / 180;
                  const r = 86;
                  const x = 120 + r * Math.cos(angleRad);
                  const y = 120 + r * Math.sin(angleRad);
                  const active = hour12 === h;
                  return (
                    <span
                      key={h}
                      style={{ left: `${x}px`, top: `${y}px` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-extrabold pointer-events-none transition-colors ${
                        active ? 'text-white' : 'text-[#172f3d]'
                      }`}
                    >
                      {h}
                    </span>
                  );
                })
              : minuteMarks.map((m, idx) => {
                  const angleRad = ((idx * 30 - 90) * Math.PI) / 180;
                  const r = 86;
                  const x = 120 + r * Math.cos(angleRad);
                  const y = 120 + r * Math.sin(angleRad);
                  const active = minute === m;
                  return (
                    <span
                      key={m}
                      style={{ left: `${x}px`, top: `${y}px` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-extrabold pointer-events-none transition-colors ${
                        active ? 'text-white' : 'text-[#172f3d]'
                      }`}
                    >
                      {String(m).padStart(2, '0')}
                    </span>
                  );
                })}
          </div>

          {/* Quick Minute Chips */}
          <div className="flex items-center justify-center gap-1.5 pt-1" dir="ltr">
            {[0, 15, 30, 45].map(qm => (
              <button
                key={qm}
                type="button"
                onClick={() => setMinute(qm)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border transition-colors cursor-pointer ${
                  minute === qm
                    ? 'bg-[#087e83] text-white border-[#087e83]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#087e83]'
                }`}
              >
                :{String(qm).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(partsTo24(hour12, minute, period));
              onClose();
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>حفظ الميعاد ({formattedHour}:{formattedMinute} {period})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
