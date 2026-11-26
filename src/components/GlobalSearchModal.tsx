import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useClinic } from '../context/ClinicContext';
import { Search, X, User, FileText, ArrowLeft, Phone } from 'lucide-react';
import {
  matchArabicTerms,
  matchPhone,
  scoreArabicTextMatch,
  scorePatientSearchMatch,
  scorePhoneMatch
} from '../utils/arabic';
import { sortPatientsNewestFirst } from './PatientSearchSelect';

const MAX_RENDERED_RESULTS = 100;

export const GlobalSearchModal: React.FC = () => {
  const {
    isGlobalSearchOpen,
    setIsGlobalSearchOpen,
    patients,
    goToPatient,
    currentUser,
    hasPermission,
    staffMembers,
    isPatientAllowed
  } = useClinic();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isGlobalSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [isGlobalSearchOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery('');
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Keyboard shortcut listener for Cmd+K / Ctrl+K and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      }
      if (e.key === 'Escape' && isGlobalSearchOpen) {
        setIsGlobalSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGlobalSearchOpen, setIsGlobalSearchOpen]);

  const trimmedQuery = debouncedQuery.trim();
  const canViewClinicalNotes = hasPermission('viewClinicalNotes');
  const shouldHideAdminNotes = currentUser.role !== 'admin' && hasPermission('hideAdminNotes');

  const visiblePatients = useMemo(
    () => (isGlobalSearchOpen ? patients.filter(p => isPatientAllowed(p.id)) : []),
    [isGlobalSearchOpen, patients, isPatientAllowed]
  );

  const staffRoleByName = useMemo(() => {
    const map = new Map<string, string>();
    staffMembers.forEach(s => {
      if (s.name) map.set(s.name, s.role);
    });
    return map;
  }, [staffMembers]);

  // Search patients (most relevant matches first, then newest created files)
  const matchingPatients = useMemo(() => {
    if (!isGlobalSearchOpen || !trimmedQuery) return [];
    const matched = sortPatientsNewestFirst(
      visiblePatients.filter(
        p =>
          matchArabicTerms(p.name, trimmedQuery) ||
          matchPhone(p.phone, trimmedQuery) ||
          matchPhone(p.secondaryPhone, trimmedQuery) ||
          (p.address && matchArabicTerms(p.address, trimmedQuery))
      )
    );
    const scoreMap = new Map<string, number>();
    matched.forEach(p => {
      scoreMap.set(
        p.id,
        Math.max(
          scorePatientSearchMatch(
            { name: p.name, phone: p.phone, patientCode: p.patientCode, address: p.address },
            trimmedQuery
          ),
          scorePhoneMatch(p.secondaryPhone, trimmedQuery) * 5
        )
      );
    });
    return matched.sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0));
  }, [isGlobalSearchOpen, trimmedQuery, visiblePatients]);

  // Search notes (respecting clinical note visibility & hideAdminNotes permission)
  const matchingNotes = useMemo(() => {
    const list: { patientId: string; patientName: string; noteContent: string; date: string }[] = [];
    if (!isGlobalSearchOpen || !canViewClinicalNotes || trimmedQuery.length < 2) {
      return list;
    }
    visiblePatients.forEach(pat => {
      pat.notes?.forEach(note => {
        if (shouldHideAdminNotes) {
          const authorRole = staffRoleByName.get(note.authorName);
          const isAdminNote = authorRole ? authorRole === 'admin' : Boolean(note.isAdminAuthored);
          if (isAdminNote) return;
        }
        if (matchArabicTerms(note.content, trimmedQuery)) {
          list.push({
            patientId: pat.id,
            patientName: pat.name,
            noteContent: note.content,
            date: note.createdAt
          });
        }
      });
    });
    return list.sort((a, b) => scoreArabicTextMatch(b.noteContent, trimmedQuery) - scoreArabicTextMatch(a.noteContent, trimmedQuery));
  }, [isGlobalSearchOpen, canViewClinicalNotes, trimmedQuery, visiblePatients, shouldHideAdminNotes, staffRoleByName]);

  if (!isGlobalSearchOpen) return null;

  const displayedPatients = matchingPatients.slice(0, MAX_RENDERED_RESULTS);
  const displayedNotes = matchingNotes.slice(0, MAX_RENDERED_RESULTS);

  return (
    <div
      onClick={() => setIsGlobalSearchOpen(false)}
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 pt-16 sm:pt-20"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#d6e5e8] flex flex-col overflow-hidden max-h-[80vh] animate-in zoom-in-95 duration-150"
      >
        {/* Search Input Bar */}
        <div className="p-3.5 sm:p-4 border-b border-[#e2eaee] flex items-center gap-3 bg-[#fafcfc]">
          <Search className="w-5 h-5 text-[#087e83] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث بالاسم، رقم الموبايل، أو نص ملاحظة طبية..."
            className="flex-1 bg-transparent text-sm sm:text-base font-semibold text-[#172f3d] placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
            >
              مسح
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsGlobalSearchOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Results Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {!trimmedQuery ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <Search className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-500">ابحث بالاسم أو الهاتف</p>
            </div>
          ) : (
            <>
              {/* Patients matches */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                  <span>نتائج ملفات المرضى ({matchingPatients.length})</span>
                </div>
                {matchingPatients.length > 0 ? (
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white">
                    {displayedPatients.map(pat => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => {
                          setIsGlobalSearchOpen(false);
                          goToPatient(pat.id);
                        }}
                        className="w-full text-right p-3 hover:bg-[#e7f5f2] flex items-center justify-between transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#e6f4f1] text-[#087e83] flex items-center justify-center font-bold flex-shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                              <span>{pat.name}</span>
                              {pat.outstandingBalance > 0 && (
                                <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded">
                                  متبقي: {pat.outstandingBalance.toLocaleString()} ج.م
                                </span>
                              )}
                            </div>
                            <div className="text-slate-400 font-mono text-[11px] flex items-center gap-2 mt-0.5" dir="ltr">
                              <Phone className="w-3 h-3 inline text-slate-400" />
                              <span>{pat.phone}</span>
                              {pat.address && <span className="text-slate-400 font-sans" dir="rtl">· {pat.address}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[#087e83] font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          <span>فتح الملف</span>
                          <ArrowLeft className="w-4 h-4" />
                        </div>
                      </button>
                    ))}
                    {matchingPatients.length > MAX_RENDERED_RESULTS && (
                      <div className="p-2.5 text-center text-[11px] font-semibold text-slate-500 bg-slate-50">
                        يتم عرض أول {MAX_RENDERED_RESULTS} نتيجة فقط — اكتب حروفاً إضافية لتضييق البحث
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 text-center text-slate-400 bg-slate-50 rounded-xl">
                    لا يوجد مريض يطابق هذا البحث
                  </div>
                )}
              </div>

              {/* Notes matches */}
              {matchingNotes.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    <span>ملاحظات سريرية مطابقة ({matchingNotes.length})</span>
                  </div>
                  <div className="space-y-2">
                    {displayedNotes.map((note, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setIsGlobalSearchOpen(false);
                          goToPatient(note.patientId);
                        }}
                        className="w-full text-right p-3 rounded-xl border border-slate-200 hover:border-[#087e83] bg-white hover:bg-slate-50 transition-all flex items-start gap-2.5"
                      >
                        <FileText className="w-4 h-4 text-[#087e83] flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[#087e83] mb-1">
                            {note.patientName}
                          </div>
                          <p className="text-slate-600 line-clamp-2 text-xs leading-relaxed">
                            "{note.noteContent}"
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
};
