import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, ChevronDown, UserCheck, Plus } from 'lucide-react';
import { Patient } from '../types/clinic';
import { matchArabicTerms, matchPhone, scorePatientSearchMatch, scorePhoneMatch } from '../utils/arabic';

export function sortPatientsNewestFirst(patients: Patient[]): Patient[] {
  return [...patients].sort((a, b) => {
    const dateA = a.registeredDate || '';
    const dateB = b.registeredDate || '';
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }

    const createdA = a.createdAt ? Date.parse(a.createdAt) : 0;
    const createdB = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (!isNaN(createdA) && !isNaN(createdB) && createdA !== createdB) {
      return createdB - createdA;
    }

    const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
    const isTsA = numA > 1_000_000_000_000;
    const isTsB = numB > 1_000_000_000_000;

    if (isTsA !== isTsB) {
      return isTsB ? 1 : -1;
    }
    return numB - numA;
  });
}

interface PatientSearchSelectProps {
  patients: Patient[];
  selectedPatientId: string;
  onSelect: (patient: Patient) => void;
  onClear?: () => void;
  isPredetermined?: boolean;
  autoFocus?: boolean;
  focusKey?: string | number;
  placeholder?: string;
  onCreateNew?: (initialQuery: string) => void;
  renderBadge?: (patient: Patient) => React.ReactNode;
}

export const PatientSearchSelect: React.FC<PatientSearchSelectProps> = ({
  patients,
  selectedPatientId,
  onSelect,
  onClear,
  isPredetermined = false,
  autoFocus = true,
  focusKey,
  placeholder = 'ابحث باسم المريض أو رقم الموبايل...',
  onCreateNew,
  renderBadge
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedPatient = useMemo(
    () => patients.find(p => p.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const sortedPatients = useMemo(() => sortPatientsNewestFirst(patients), [patients]);

  const filteredPatients = useMemo(() => {
    const q = query.trim();
    if (!q) return sortedPatients.slice(0, 60);
    const matched = sortedPatients.filter(
      p =>
        matchArabicTerms(p.name, q) ||
        matchPhone(p.phone, q) ||
        matchPhone(p.secondaryPhone, q) ||
        (p.patientCode && p.patientCode.toLowerCase().includes(q.toLowerCase()))
    );
    const scoreMap = new Map<string, number>();
    matched.forEach(p => {
      scoreMap.set(
        p.id,
        Math.max(
          scorePatientSearchMatch({ name: p.name, phone: p.phone, patientCode: p.patientCode }, q),
          scorePhoneMatch(p.secondaryPhone, q) * 5
        )
      );
    });
    return matched
      .sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0))
      .slice(0, 60);
  }, [sortedPatients, query]);

  // Auto-focus when opening form without predetermined patient
  useEffect(() => {
    if (isPredetermined || !autoFocus || selectedPatientId) return;

    const focusNow = () => {
      if (inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
        setIsDropdownOpen(true);
      }
    };

    focusNow();
    const timer = window.setTimeout(focusNow, 50);
    return () => window.clearTimeout(timer);
  }, [isPredetermined, autoFocus, focusKey, selectedPatientId]);

  // Reset search query when selected patient changes cleanly
  useEffect(() => {
    if (!selectedPatientId) {
      setQuery('');
    }
  }, [selectedPatientId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isDropdownOpen]);

  if (selectedPatient) {
    return (
      <div className="p-2.5 rounded-xl border border-[#bfe2db] bg-[#f2faf8] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#087e83] text-white flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-xs text-[#172f3d] truncate">{selectedPatient.name}</div>
            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2" dir="ltr">
              <span>{selectedPatient.phone}</span>
              {selectedPatient.outstandingBalance > 0 && (
                <span className="text-amber-700 font-sans font-bold" dir="rtl">
                  · متبقي: {selectedPatient.outstandingBalance.toLocaleString()} ج.م
                </span>
              )}
            </div>
          </div>
        </div>

        {onClear && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setQuery('');
              window.setTimeout(() => {
                inputRef.current?.focus();
                setIsDropdownOpen(true);
              }, 30);
            }}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-600 hover:text-[#087e83] text-[10px] font-bold flex items-center gap-1 flex-shrink-0 cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>تغيير</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus={!isPredetermined && autoFocus}
          onFocus={() => setIsDropdownOpen(true)}
          onClick={() => setIsDropdownOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            setIsDropdownOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pr-9 pl-14 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#172f3d] focus:border-[#087e83] focus:ring-2 focus:ring-[#087e83]/15 focus:outline-none"
        />
        <div className="absolute left-2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
                setIsDropdownOpen(true);
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              title="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsDropdownOpen(prev => !prev);
              if (!isDropdownOpen) inputRef.current?.focus();
            }}
            className="p-1 text-slate-400 hover:text-[#087e83] rounded cursor-pointer"
            title="عرض القائمة"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180 text-[#087e83]' : ''}`} />
          </button>
        </div>
      </div>

      {isDropdownOpen && (
        <div className="mt-1.5 border border-[#bfe2db] rounded-xl bg-white shadow-lg overflow-hidden animate-in fade-in duration-100">
          <div className="px-3 py-1.5 bg-[#f4fbf9] border-b border-[#e2f0ed] flex items-center justify-between text-[10px] font-bold text-[#087e83]">
            <span>
              {query.trim()
                ? `نتائج البحث (${filteredPatients.length})`
                : `أحدث ملفات المرضى (${patients.length})`}
            </span>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              إغلاق
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
            {filteredPatients.length > 0 ? (
              filteredPatients.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    setQuery('');
                    setIsDropdownOpen(false);
                  }}
                  className="w-full text-right px-3 py-2 hover:bg-[#e7f5f2] flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-slate-800 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-2">
                      <span>ملف: {p.registeredDate}</span>
                      {renderBadge && renderBadge(p)}
                    </div>
                  </div>
                  <span className="text-slate-500 font-mono text-[11px] flex-shrink-0" dir="ltr">
                    {p.phone}
                  </span>
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-slate-400 text-xs space-y-1.5">
                <div>لا يوجد مريض مطابق لـ "{query}"</div>
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onCreateNew(query.trim());
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#e7f5f2] text-[#087e83] font-bold text-[11px] hover:bg-[#d5eee8] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة "{query.trim()}" كمريض جديد</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
