import React, { useState, useMemo, useEffect, useRef, startTransition } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  UserPlus,
  Search,
  Phone,
  MessageCircle,
  Eye,
  Filter,
  ChevronDown,
  Building2,
  Stethoscope,
  Share2,
  Users,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  MoreVertical,
  FileText,
  CreditCard,
  Tag,
  Calendar,
  Trash2,
  X,
  Check,
  Plus,
  StickyNote
} from 'lucide-react';
import {
  convertArabicDigitsToWestern,
  normalizeArabic,
  normalizeEgyptianPhone,
  scoreArabicTextMatch,
  scorePatientSearchMatch,
  scorePhoneMatch
} from '../utils/arabic';
import {
  buildWhatsAppUrl,
  getPreferredPatientWhatsAppPhone,
  isPreferredWhatsAppMissing
} from '../utils/whatsapp';
import { getCustomColorActiveStyle, getCustomColorBadgeStyle, getFollowUpStatusColorHex } from '../utils/colors';
import { ColoredSelect } from '../components/ColoredSelect';
import { RegisterWhatsAppModal } from '../components/RegisterWhatsAppModal';

export const PatientsView: React.FC = () => {
  const {
    patients,
    appointments,
    invoices,
    payments,
    goToPatient,
    setIsQuickActionOpen,
    setActiveView,
    updatePatient,
    changePatientFollowUpStatus,
    deletePatient,
    patientTags,
    addPatientTag,
    patientFollowUpStatuses,
    listItemColors,
    hasPermission,
    isPatientAllowed,
    restrictedUnit,
    patientsViewState,
    setPatientsViewState
  } = useClinic();
  const canAddPatients = hasPermission('addPatients');
  const canEditPatients = hasPermission('editPatients');
  const canDeletePatients = hasPermission('deletePatients');
  const canAddAppointments = hasPermission('addAppointments');
  const canAddInvoicesPayments = hasPermission('addInvoicesPayments');

  const [openPatientMenuId, setOpenPatientMenuId] = useState<string | null>(null);
  const [confirmDeletePatientId, setConfirmDeletePatientId] = useState<string | null>(null);
  const [tagModalPatientId, setTagModalPatientId] = useState<string | null>(null);
  const [customTagInput, setCustomTagInput] = useState('');
  const [registerWaPatientId, setRegisterWaPatientId] = useState<string | null>(null);
  const registerWaPatient = useMemo(
    () => (registerWaPatientId ? patients.find(p => p.id === registerWaPatientId) || null : null),
    [registerWaPatientId, patients]
  );

  useEffect(() => {
    if (!openPatientMenuId) return;
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-patient-menu-root="true"]')) {
        setOpenPatientMenuId(null);
        setConfirmDeletePatientId(null);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [openPatientMenuId]);

  const tagModalPatient = useMemo(
    () => (tagModalPatientId ? patients.find(p => p.id === tagModalPatientId) || null : null),
    [tagModalPatientId, patients]
  );

  const handleTogglePatientTag = (patientId: string, tag: string) => {
    const target = patients.find(p => p.id === patientId);
    if (!target) return;
    const existing = target.tags || [];
    const nextTags = existing.includes(tag)
      ? existing.filter(t => t !== tag)
      : [...existing, tag];
    updatePatient(patientId, { tags: nextTags });
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagModalPatient || !customTagInput.trim()) return;
    const clean = customTagInput.trim();
    addPatientTag(clean);
    const existing = tagModalPatient.tags || [];
    if (!existing.includes(clean)) {
      updatePatient(tagModalPatient.id, { tags: [...existing, clean] });
    }
    setCustomTagInput('');
  };

  const searchQuery = patientsViewState.searchQuery;
  const selectedTag = patientsViewState.filterTag;
  const selectedStatus = patientsViewState.filterStatus;
  const onlyWithDebt = patientsViewState.filterDebtOnly;
  const sortBy = patientsViewState.sortBy;
  const currentPage = patientsViewState.currentPage;
  const pageSize = patientsViewState.pageSize;

  const [selectedDoctor, setSelectedDoctor] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedReferral, setSelectedReferral] = useState<string>('all');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const [localSearch, setLocalSearch] = useState<string>(() => searchQuery);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(() => searchQuery);
  const lastPushedSearchRef = useRef<string>(searchQuery);

  // Sync only if context searchQuery was modified externally (not by our own debounce push)
  useEffect(() => {
    if (searchQuery !== lastPushedSearchRef.current) {
      lastPushedSearchRef.current = searchQuery;
      setLocalSearch(searchQuery);
      setDebouncedSearch(searchQuery);
    }
  }, [searchQuery]);

  // Debounce local filter updates smoothly without touching input state
  useEffect(() => {
    if (!localSearch.trim()) {
      startTransition(() => {
        setDebouncedSearch('');
      });
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setDebouncedSearch(localSearch);
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [localSearch]);

  // Persist settled search query to context in a low-priority transition without feeding back into input
  useEffect(() => {
    if (debouncedSearch === lastPushedSearchRef.current) return;
    lastPushedSearchRef.current = debouncedSearch;
    startTransition(() => {
      setPatientsViewState(prev =>
        prev.searchQuery === debouncedSearch ? prev : { ...prev, searchQuery: debouncedSearch, currentPage: 1 }
      );
    });
  }, [debouncedSearch, setPatientsViewState]);

  const setSearchQuery = (val: string) => {
    setLocalSearch(val);
    setDebouncedSearch(val);
    lastPushedSearchRef.current = val;
    startTransition(() => {
      setPatientsViewState(prev =>
        prev.searchQuery === val ? prev : { ...prev, searchQuery: val, currentPage: 1 }
      );
    });
  };
  const setSelectedTag = (val: string) =>
    setPatientsViewState(prev => ({ ...prev, filterTag: val, currentPage: 1 }));
  const setSelectedStatus = (val: string) =>
    setPatientsViewState(prev => ({ ...prev, filterStatus: val, currentPage: 1 }));
  const setOnlyWithDebt = (val: boolean) =>
    setPatientsViewState(prev => ({ ...prev, filterDebtOnly: val, currentPage: 1 }));
  const setSortBy = (val: typeof patientsViewState.sortBy) =>
    setPatientsViewState(prev => ({ ...prev, sortBy: val, currentPage: 1 }));
  const setCurrentPage = (updater: number | ((p: number) => number)) =>
    setPatientsViewState(prev => ({
      ...prev,
      currentPage: typeof updater === 'function' ? updater(prev.currentPage) : updater
    }));
  const setPageSize = (val: number) =>
    setPatientsViewState(prev => ({ ...prev, pageSize: val, currentPage: 1 }));

  const scopedPatients = useMemo(
    () => patients.filter(p => isPatientAllowed(p.id)),
    [patients, isPatientAllowed]
  );

  // Pre-normalize searchable fields and sort keys once per scopedPatients change
  const indexedPatients = useMemo(() => {
    const map = new Map<
      string,
      {
        normName: string;
        compactName: string;
        cleanPhone: string;
        cleanSecPhone: string;
        codeLower: string;
        normAddr: string;
        compactAddr: string;
        normDoc: string;
        compactDoc: string;
        normRef: string;
        compactRef: string;
        createdMs: number;
        numId: number;
      }
    >();
    for (let i = 0; i < scopedPatients.length; i++) {
      const p = scopedPatients[i];
      const c = p.createdAt ? Date.parse(p.createdAt) : 0;
      const n = parseInt(p.id.replace(/\D/g, ''), 10) || 0;
      const normName = normalizeArabic(p.name || '');
      const normAddr = p.address ? normalizeArabic(p.address) : '';
      const normDoc = p.doctorName ? normalizeArabic(p.doctorName) : '';
      const normRef = p.referralSource ? normalizeArabic(p.referralSource) : '';
      map.set(p.id, {
        normName,
        compactName: normName.replace(/\s+/g, ''),
        cleanPhone: normalizeEgyptianPhone(p.phone || ''),
        cleanSecPhone: normalizeEgyptianPhone(p.secondaryPhone || ''),
        codeLower: (p.patientCode || '').toLowerCase(),
        normAddr,
        compactAddr: normAddr.replace(/\s+/g, ''),
        normDoc,
        compactDoc: normDoc.replace(/\s+/g, ''),
        normRef,
        compactRef: normRef.replace(/\s+/g, ''),
        createdMs: isNaN(c) ? 0 : c,
        numId: n
      });
    }
    return map;
  }, [scopedPatients]);

  // Live financial totals fallback so newly loaded or edited invoices/payments reflect immediately without refresh
  const financialTotalsMap = useMemo(() => {
    const map = new Map<string, { billed: number; paid: number; hasInv: boolean; hasPay: boolean }>();
    invoices.forEach(inv => {
      if (inv.status === 'voided') return;
      const cur = map.get(inv.patientId) || { billed: 0, paid: 0, hasInv: false, hasPay: false };
      cur.billed += inv.netTotal || 0;
      cur.hasInv = true;
      map.set(inv.patientId, cur);
    });
    payments.forEach(pay => {
      if (pay.status === 'voided') return;
      const cur = map.get(pay.patientId) || { billed: 0, paid: 0, hasInv: false, hasPay: false };
      cur.paid += pay.amount || 0;
      cur.hasPay = true;
      map.set(pay.patientId, cur);
    });
    return map;
  }, [invoices, payments]);

  const getLiveFinancials = (pat: (typeof patients)[number]) => {
    const entry = financialTotalsMap.get(pat.id);
    if (entry && (entry.hasInv || entry.hasPay)) {
      return {
        totalBilled: entry.billed,
        totalPaid: entry.paid,
        outstandingBalance: Math.max(0, entry.billed - entry.paid)
      };
    }
    return {
      totalBilled: pat.totalBilled || 0,
      totalPaid: pat.totalPaid || 0,
      outstandingBalance: pat.outstandingBalance || 0
    };
  };

  // Collect distinct metadata options
  const allTags = useMemo(() => {
    return patientTags;
  }, [patientTags]);

  const allDoctors = useMemo(() => {
    const set = new Set<string>();
    scopedPatients.forEach(p => {
      if (p.doctorName) set.add(p.doctorName);
    });
    return Array.from(set).sort();
  }, [scopedPatients]);

  const allBranches = useMemo(() => {
    const set = new Set<string>();
    scopedPatients.forEach(p => {
      if (p.branchName) set.add(p.branchName);
    });
    return Array.from(set).sort();
  }, [scopedPatients]);

  const allReferrals = useMemo(() => {
    const set = new Set<string>();
    scopedPatients.forEach(p => {
      if (p.referralSource) {
        // base referral source before any bracket
        const base = p.referralSource.split('(')[0].trim();
        if (base) set.add(base);
      }
    });
    return Array.from(set).sort();
  }, [scopedPatients]);

  const visitCountsByPatient = useMemo(() => {
    const counts = new Map<string, number>();
    appointments.forEach(a => {
      if (a.status !== 'cancelled') {
        counts.set(a.patientId, (counts.get(a.patientId) || 0) + 1);
      }
    });
    return counts;
  }, [appointments]);

  const patientTagsSet = useMemo(() => new Set(patientTags), [patientTags]);

  // Filter & Sort logic
  const filteredPatients = useMemo(() => {
    const q = debouncedSearch.trim();
    const qLower = q.toLowerCase();
    const qTerms = q
      ? q
          .split(/\s+/)
          .map(t => normalizeArabic(t))
          .filter(Boolean)
      : [];
    const qDigits = q ? convertArabicDigitsToWestern(q).replace(/\D/g, '') : '';

    const matched = scopedPatients.filter(p => {
      // Text search using pre-indexed normalized fields
      if (q) {
        const idx = indexedPatients.get(p.id);
        const matchTermsIn = (normField: string, compactField: string) =>
          Boolean(normField) &&
          qTerms.length > 0 &&
          qTerms.every(
            term =>
              normField.includes(term) ||
              (term.length >= 4 && compactField.includes(term))
          );

        const matchName = idx ? matchTermsIn(idx.normName, idx.compactName) : false;
        const matchPrimaryPhone = Boolean(qDigits && idx?.cleanPhone && idx.cleanPhone.includes(qDigits));
        const matchSecPhone = Boolean(qDigits && idx?.cleanSecPhone && idx.cleanSecPhone.includes(qDigits));
        const matchCode = idx?.codeLower ? idx.codeLower.includes(qLower) : false;
        const matchAddr = idx ? matchTermsIn(idx.normAddr, idx.compactAddr) : false;
        const matchDoc = idx ? matchTermsIn(idx.normDoc, idx.compactDoc) : false;
        const matchRef = idx ? matchTermsIn(idx.normRef, idx.compactRef) : false;

        if (!matchName && !matchPrimaryPhone && !matchSecPhone && !matchCode && !matchAddr && !matchDoc && !matchRef) {
          return false;
        }
      }

      // Tag filter (ignore tags deleted from settings)
      if (selectedTag !== 'all') {
        if (!patientTagsSet.has(selectedTag) || !(p.tags && p.tags.includes(selectedTag))) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== 'all' && p.followUpStatus !== selectedStatus) return false;

      // Doctor filter
      if (selectedDoctor !== 'all' && p.doctorName !== selectedDoctor) return false;

      // Branch filter
      if (selectedBranch !== 'all' && p.branchName !== selectedBranch) return false;

      // Referral filter
      if (selectedReferral !== 'all' && !(p.referralSource || '').includes(selectedReferral)) return false;

      // Outstanding debt filter (live)
      if (onlyWithDebt) {
        const liveFin = getLiveFinancials(p);
        if (liveFin.outstandingBalance <= 0) return false;
      }

      return true;
    });

    const relevanceMap = new Map<string, number>();
    if (q) {
      matched.forEach(p => {
        const s = Math.max(
          scorePatientSearchMatch(
            {
              name: p.name,
              phone: p.phone,
              patientCode: p.patientCode,
              address: p.address,
              doctorName: p.doctorName
            },
            q
          ),
          scorePhoneMatch(p.secondaryPhone, q) * 5,
          scoreArabicTextMatch(p.referralSource, q)
        );
        relevanceMap.set(p.id, s);
      });
    }

    const compareBySortBy = (a: (typeof patients)[number], b: (typeof patients)[number]): number => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'ar');
      }
      if (sortBy === 'debt_desc') {
        return getLiveFinancials(b).outstandingBalance - getLiveFinancials(a).outstandingBalance;
      }
      if (sortBy === 'billed_desc') {
        return getLiveFinancials(b).totalBilled - getLiveFinancials(a).totalBilled;
      }
      if (sortBy === 'visits_desc') {
        return (visitCountsByPatient.get(b.id) || 0) - (visitCountsByPatient.get(a.id) || 0);
      }
      if (sortBy === 'registered_asc') {
        const dA = a.registeredDate || '';
        const dB = b.registeredDate || '';
        if (dA !== dB) return dA.localeCompare(dB);
        const mA = indexedPatients.get(a.id);
        const mB = indexedPatients.get(b.id);
        if (mA && mB) {
          if (mA.createdMs && mB.createdMs && mA.createdMs !== mB.createdMs) {
            return mA.createdMs - mB.createdMs;
          }
          return mA.numId - mB.numId;
        }
        return 0;
      }

      // registered_desc (newest created files first)
      const dA = a.registeredDate || '';
      const dB = b.registeredDate || '';
      if (dA !== dB) return dB.localeCompare(dA);
      const mA = indexedPatients.get(a.id);
      const mB = indexedPatients.get(b.id);
      if (mA && mB) {
        if (mA.createdMs && mB.createdMs && mA.createdMs !== mB.createdMs) {
          return mB.createdMs - mA.createdMs;
        }
        const isTsA = mA.numId > 1_000_000_000_000;
        const isTsB = mB.numId > 1_000_000_000_000;
        if (isTsA !== isTsB) return isTsB ? 1 : -1;
        return mB.numId - mA.numId;
      }
      return 0;
    };

    return matched.sort((a, b) => {
      if (q) {
        const scoreDiff = (relevanceMap.get(b.id) || 0) - (relevanceMap.get(a.id) || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }
      return compareBySortBy(a, b);
    });
  }, [
    scopedPatients,
    indexedPatients,
    financialTotalsMap,
    patientTagsSet,
    visitCountsByPatient,
    debouncedSearch,
    selectedTag,
    selectedStatus,
    selectedDoctor,
    selectedBranch,
    selectedReferral,
    onlyWithDebt,
    sortBy
  ]);

  // Reset page when filter changes
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedPatients = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredPatients.slice(startIndex, startIndex + pageSize);
  }, [filteredPatients, safeCurrentPage, pageSize]);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredPatients.length);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* 2. Top Controls Bar */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">
              المرضى
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#e7f5f2] text-[#087e83]">
              {scopedPatients.length.toLocaleString('ar-EG')}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsFilterExpanded(prev => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                isFilterExpanded ? 'bg-[#e7f5f2] border-[#bfe2db] text-[#087e83]' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>فلاتر متقدمة</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isFilterExpanded ? 'rotate-180' : ''}`} />
            </button>

            {canAddPatients && (
              <button
                type="button"
                onClick={() => setIsQuickActionOpen(true, 'patient')}
                className="px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة مريض جديد</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            name="patient_list_search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={localSearch}
            onChange={e => {
              setLocalSearch(e.target.value);
            }}
            placeholder="ابحث بالاسم، كود المريض (P-xxxx)، رقم الموبايل، الطبيب، أو العنوان..."
            className="w-full pr-10 pl-10 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs sm:text-sm font-semibold focus:bg-white focus:border-[#087e83] focus:outline-none transition-colors"
          />
          {localSearch.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
              }}
              title="مسح البحث"
              aria-label="مسح البحث"
              className="w-7 h-7 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute left-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Expandable Filters Tray */}
        {isFilterExpanded && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in">
            {/* Status */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">حالة المتابعة CRM</label>
              <select
                value={selectedStatus}
                onChange={e => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              >
                <option value="all">جميع الحالات</option>
                {patientFollowUpStatuses.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* Doctor */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">الطبيب المعالج</label>
              <select
                value={selectedDoctor}
                onChange={e => {
                  setSelectedDoctor(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              >
                <option value="all">جميع الأطباء</option>
                {allDoctors.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">الفرع / العيادة</label>
              <select
                value={restrictedUnit ? restrictedUnit.name : selectedBranch}
                disabled={Boolean(restrictedUnit)}
                onChange={e => {
                  setSelectedBranch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold disabled:bg-slate-50"
              >
                {restrictedUnit ? (
                  <option value={restrictedUnit.name}>{restrictedUnit.name}</option>
                ) : (
                  <>
                    <option value="all">جميع الفروع</option>
                    {allBranches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Referral Source */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">مصدر المعرفة / الإحالة</label>
              <select
                value={selectedReferral}
                onChange={e => {
                  setSelectedReferral(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              >
                <option value="all">جميع المصادر</option>
                {allReferrals.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Tag */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">التصنيف والخدمات</label>
              <select
                value={selectedTag}
                onChange={e => {
                  setSelectedTag(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              >
                <option value="all">جميع التصنيفات</option>
                {allTags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Sort by */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">ترتيب النتائج</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              >
                <option value="registered_desc">الأحدث تسجيلاً</option>
                <option value="registered_asc">الأقدم تسجيلاً</option>
                <option value="name">أبجدياً (أ - ي)</option>
                <option value="debt_desc">الأعلى مديونية أولاً</option>
                <option value="billed_desc">الأعلى قيمة علاج أولاً</option>
                <option value="visits_desc">الأكثر زيارات أولاً</option>
              </select>
            </div>

            {/* Debt Filter Toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer w-full text-xs font-bold text-[#172f3d] hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={onlyWithDebt}
                  onChange={e => {
                    setOnlyWithDebt(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="rounded text-[#087e83] w-4 h-4 accent-[#087e83]"
                />
                <span>مديونية مستحقة فقط (&gt; 0 ج.م)</span>
              </label>
            </div>

            {/* Reset Filter Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTag('all');
                  setSelectedStatus('all');
                  setSelectedDoctor('all');
                  setSelectedBranch('all');
                  setSelectedReferral('all');
                  setOnlyWithDebt(false);
                  setSortBy('registered_desc');
                  setCurrentPage(1);
                }}
                className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة تعيين الفلاتر</span>
              </button>
            </div>
          </div>
        )}

        {/* View & Pagination Bar Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div>
            {filteredPatients.length > 0 ? (
              <span>
                عرض النتائج من <strong className="text-[#172f3d]">{(startIndex + 1).toLocaleString('ar-EG')}</strong> إلى{' '}
                <strong className="text-[#172f3d]">{endIndex.toLocaleString('ar-EG')}</strong> (من إجمالي{' '}
                <strong className="text-[#087e83]">{filteredPatients.length.toLocaleString('ar-EG')}</strong> مريض)
              </span>
            ) : (
              <span>لا توجد نتائج مطابقة</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">عدد النتائج بالصفحة:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Patients List Grid */}
      <div className="space-y-2.5">
        {paginatedPatients.length > 0 ? (
          paginatedPatients.map(pat => {
            const liveFin = getLiveFinancials(pat);
            const hasDebt = liveFin.outstandingBalance > 0;
            const visibleTags = (pat.tags || []).filter(t => patientTags.includes(t));
            const isMenuOpen = openPatientMenuId === pat.id;
            const isConfirmingDelete = confirmDeletePatientId === pat.id;
            const hasAnyMenuAction = true;
            const preferredWaPhone = getPreferredPatientWhatsAppPhone(pat) || pat.phone;
            const isWaMissing = isPreferredWhatsAppMissing(pat, preferredWaPhone);

            return (
              <div
                key={pat.id}
                className={`relative p-4 rounded-3xl bg-white border border-[#dce8eb] shadow-sm hover:border-[#087e83] hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isMenuOpen ? 'z-30 border-[#087e83]' : ''
                }`}
              >
                {/* Identity & Basic Info */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#e6f4f1] to-[#c2e4dd] text-[#087e83] font-bold text-base flex items-center justify-center flex-shrink-0 shadow-sm">
                    {pat.name.slice(0, 1)}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => goToPatient(pat.id)}
                        className="font-extrabold text-[#172f3d] text-sm sm:text-base hover:text-[#087e83] hover:underline truncate"
                      >
                        {pat.name}
                      </button>

                      {pat.patientCode && (
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">
                          {pat.patientCode}
                        </span>
                      )}

                      <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
                        {pat.gender || 'أنثى'} · {pat.age ? `${pat.age} سنة` : 'السن غير مسجل'}
                      </span>
                    </div>

                    {/* Metadata & Subtitles */}
                    <div className="flex items-center gap-3 text-xs text-slate-500 font-mono flex-wrap" dir="ltr">
                      <a
                        href={`tel:${pat.phone}`}
                        className="hover:text-[#087e83] flex items-center gap-1 font-semibold"
                        title="اتصال هاتف"
                      >
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{pat.phone}</span>
                      </a>

                      {pat.secondaryPhone && (
                        <span className="text-slate-400 text-[11px]">
                          (إضافي: {pat.secondaryPhone})
                        </span>
                      )}

                      {pat.doctorName && (
                        <span className="font-sans text-slate-500 flex items-center gap-1" dir="rtl">
                          <Stethoscope className="w-3 h-3 text-[#087e83]" />
                          <span>{pat.doctorName}</span>
                        </span>
                      )}

                      {pat.branchName && (
                        <span className="font-sans text-slate-400 flex items-center gap-1" dir="rtl">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{pat.branchName}</span>
                        </span>
                      )}

                      {pat.address && (
                        <span className="font-sans text-slate-400" dir="rtl">
                          · {pat.address}
                        </span>
                      )}
                    </div>

                    {/* Referral & Tags */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {pat.referralSource && (
                        <span
                          style={getCustomColorBadgeStyle(listItemColors.referralSources?.[pat.referralSource])}
                          className="text-[10px] bg-[#eef7f8] border border-[#d2e8ea] text-[#087e83] px-2 py-0.5 rounded-md font-medium flex items-center gap-1"
                        >
                          <Share2 className="w-2.5 h-2.5" />
                          <span>{pat.referralSource}</span>
                        </span>
                      )}

                      {visibleTags.length > 0 && (
                        visibleTags.map(t => (
                          <span
                            key={t}
                            style={getCustomColorBadgeStyle(listItemColors.patientTags?.[t])}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                              listItemColors.patientTags?.[t]
                                ? ''
                                : t === 'VIP'
                                ? 'bg-amber-100 text-amber-900 font-bold border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-transparent'
                            }`}
                          >
                            #{t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial status & Action buttons */}
                <div className="flex items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 flex-shrink-0">
                  {/* Financial Snapshot */}
                  <div className="text-right lg:text-left pl-3 border-l lg:border-l border-slate-100 min-w-[120px]">
                    <span className="text-[10px] text-slate-400 block font-semibold">الرصيد المتبقي</span>
                    <span
                      className={`text-sm sm:text-base font-extrabold font-mono tabular-nums ${
                        hasDebt ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {hasDebt ? `${liveFin.outstandingBalance.toLocaleString('ar-EG')} ج.م` : 'خالص ✓'}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      مسدد: {liveFin.totalPaid.toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <div onClick={e => e.stopPropagation()}>
                        <ColoredSelect
                          value={
                            pat.followUpStatus && patientFollowUpStatuses.includes(pat.followUpStatus)
                              ? pat.followUpStatus
                              : ''
                          }
                          onChange={val => {
                            if (!val) return;
                            changePatientFollowUpStatus(pat.id, val, { actionSource: 'patients_list' });
                          }}
                          placeholder="-- حالة المتابعة --"
                          options={patientFollowUpStatuses.map(st => ({
                            value: st,
                            label: st,
                            colorHex: getFollowUpStatusColorHex(st, listItemColors.followUpStatuses)
                          }))}
                          className="w-36 sm:w-40"
                          ariaLabel={`تغيير حالة متابعة ${pat.name}`}
                        />
                      </div>

                      <a
                        href={buildWhatsAppUrl(preferredWaPhone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                          isWaMissing
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 opacity-50 hover:opacity-80'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                        }`}
                        title={
                          isWaMissing
                            ? `لا يوجد واتساب على هذا الرقم (${preferredWaPhone}) — اضغط للتحقق في واتساب`
                            : 'فتح محادثة واتساب'
                        }
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>

                      <a
                        href={`tel:${pat.phone}`}
                        className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shadow-sm"
                        title="اتصال هاتفي"
                      >
                        <Phone className="w-4 h-4" />
                      </a>

                      <button
                        type="button"
                        onClick={() => goToPatient(pat.id)}
                        className="px-3.5 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>فتح الملف</span>
                      </button>

                      {hasAnyMenuAction && (
                      <div className="relative flex-shrink-0" data-patient-menu-root="true">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmDeletePatientId(null);
                            setOpenPatientMenuId(prev => (prev === pat.id ? null : pat.id));
                          }}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                            isMenuOpen
                              ? 'bg-[#087e83] text-white shadow-sm'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                          }`}
                          title="خيارات المريض"
                          aria-label="خيارات المريض"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute left-0 top-full mt-1.5 z-50 w-48 bg-white border border-[#d6e5e8] rounded-2xl shadow-2xl py-1.5 text-xs font-bold text-[#172f3d] animate-in fade-in duration-100">
                            {canAddAppointments && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenPatientMenuId(null);
                                  setIsQuickActionOpen(true, 'appointment', { patientId: pat.id });
                                }}
                                className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                <span>إنشاء ميعاد جديد</span>
                              </button>
                            )}

                            {canAddInvoicesPayments && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenPatientMenuId(null);
                                    setIsQuickActionOpen(true, 'invoice', { patientId: pat.id });
                                  }}
                                  className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#087e83]" />
                                  <span>إضافة فاتورة</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenPatientMenuId(null);
                                    setIsQuickActionOpen(true, 'payment', { patientId: pat.id });
                                  }}
                                  className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>إضافة دفع</span>
                                </button>
                              </>
                            )}

                            {canEditPatients && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenPatientMenuId(null);
                                  setCustomTagInput('');
                                  setTagModalPatientId(pat.id);
                                }}
                                className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <Tag className="w-3.5 h-3.5 text-amber-600" />
                                <span>إضافة تاج</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setOpenPatientMenuId(null);
                                goToPatient(pat.id, { focusNotes: true });
                              }}
                              className="w-full px-3 py-2 text-right hover:bg-[#f0f8f6] hover:text-[#087e83] flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <StickyNote className="w-3.5 h-3.5 text-teal-600" />
                              <span>فتح الملاحظات</span>
                            </button>

                            {canDeletePatients && (
                              <>
                                <div className="my-1 border-t border-slate-100" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isConfirmingDelete) {
                                      setConfirmDeletePatientId(pat.id);
                                      return;
                                    }
                                    deletePatient(pat.id);
                                    setConfirmDeletePatientId(null);
                                    setOpenPatientMenuId(null);
                                  }}
                                  className={`w-full px-3 py-2 text-right flex items-center gap-2 transition-colors cursor-pointer ${
                                    isConfirmingDelete
                                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                                      : 'text-rose-600 hover:bg-rose-50'
                                  }`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{isConfirmingDelete ? 'تأكيد حذف المريض' : 'حذف المريض'}</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>

                    {isWaMissing && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
                        <span>لا يوجد واتساب على هذا الرقم</span>
                        <button
                          type="button"
                          onClick={() => setRegisterWaPatientId(pat.id)}
                          className="text-[#087e83] underline hover:text-[#06686c] cursor-pointer"
                        >
                          (تسجيل رقم واتساب)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-10 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 space-y-3">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-600 text-sm">لم يتم العثور على أي مريض يطابق هذا البحث أو الفلتر</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedTag('all');
                setSelectedStatus('all');
                setSelectedDoctor('all');
                setSelectedBranch('all');
                setSelectedReferral('all');
                setOnlyWithDebt(false);
                setCurrentPage(1);
              }}
              className="px-4 py-2 bg-[#087e83] text-white rounded-xl text-xs font-bold shadow-sm"
            >
              إعادة تعيين جميع الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* 4. Bottom Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white border border-[#dce8eb] rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="text-xs text-slate-500 font-semibold">
            صفحة <strong className="text-[#172f3d]">{safeCurrentPage}</strong> من{' '}
            <strong className="text-[#172f3d]">{totalPages}</strong>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 flex items-center gap-1"
            >
              <ChevronRight className="w-4 h-4" />
              <span>السابق</span>
            </button>

            {/* Quick page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = safeCurrentPage - 2 + i;
              if (safeCurrentPage <= 3) pageNum = i + 1;
              else if (safeCurrentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
              if (pageNum < 1 || pageNum > totalPages) return null;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-xl text-xs font-bold font-mono transition-colors ${
                    safeCurrentPage === pageNum
                      ? 'bg-[#087e83] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 flex items-center gap-1"
            >
              <span>القادم</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Patient Tags Quick Editor Modal */}
      {tagModalPatient && (
        <div
          onClick={() => setTagModalPatientId(null)}
          className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#172f3d]">وسوم / تاجات المريض</h3>
                  <p className="text-[11px] text-slate-500 font-semibold">{tagModalPatient.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTagModalPatientId(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(tagModalPatient.tags || []).filter(t => patientTags.includes(t)).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 block">التاجات الحالية للمريض (اضغط × للإزالة):</span>
                <div className="flex flex-wrap gap-1.5">
                  {(tagModalPatient.tags || []).filter(t => patientTags.includes(t)).map(tag => (
                    <span
                      key={tag}
                      style={getCustomColorBadgeStyle(listItemColors.patientTags?.[tag])}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db]"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleTogglePatientTag(tagModalPatient.id, tag)}
                        className="w-4 h-4 rounded-full hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center transition-colors cursor-pointer"
                        title="إزالة التاج من المريض"
                        aria-label={`إزالة ${tag}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500">اختر من الوسوم الجاهزة:</span>
                <button
                  type="button"
                  onClick={() => {
                    setTagModalPatientId(null);
                    setActiveView('settings');
                  }}
                  className="text-[11px] font-bold text-[#087e83] hover:underline cursor-pointer"
                >
                  حذف / تعديل التاجات في الإعدادات
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {patientTags.map(tag => {
                  const isActive = (tagModalPatient.tags || []).includes(tag);
                  const tagColor = listItemColors.patientTags?.[tag];
                  const chipStyle = tagColor
                    ? isActive
                      ? getCustomColorActiveStyle(tagColor)
                      : getCustomColorBadgeStyle(tagColor)
                    : undefined;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTogglePatientTag(tagModalPatient.id, tag)}
                      style={chipStyle}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                        isActive
                          ? 'bg-[#087e83] text-white border-[#087e83]'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#087e83]'
                      }`}
                    >
                      {isActive ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleAddCustomTag} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={customTagInput}
                onChange={e => setCustomTagInput(e.target.value)}
                placeholder="أو اكتب تاج مخصص جديد..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={!customTagInput.trim()}
                className="px-3.5 py-2 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] disabled:opacity-50 text-[#087e83] font-bold text-xs cursor-pointer"
              >
                إضافة
              </button>
            </form>

            <button
              type="button"
              onClick={() => setTagModalPatientId(null)}
              className="w-full py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
            >
              تم
            </button>
          </div>
        </div>
      )}
      {registerWaPatient && (
        <RegisterWhatsAppModal
          patient={registerWaPatient}
          onClose={() => setRegisterWaPatientId(null)}
        />
      )}
    </div>
  );
};
