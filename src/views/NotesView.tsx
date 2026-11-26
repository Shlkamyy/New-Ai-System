import React, { useState, useMemo } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  StickyNote,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  CheckSquare,
  Users,
  MessageCircle,
  FileText
} from 'lucide-react';
import { normalizeArabic } from '../utils/arabic';

export interface SystemNoteItem {
  id: string;
  sourceType: 'patient' | 'task' | 'staff_comment';
  sourceTitle: string;
  content: string;
  authorName: string;
  authorRole?: string;
  createdAt: string;
  patientId?: string;
  patientName?: string;
  taskId?: string;
  toothNumber?: number;
}

export const NotesView: React.FC = () => {
  const { patients, tasks, staffComments, currentUser, goToPatient, setActiveView } = useClinic();

  const isAdmin = currentUser.role === 'admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'patient' | 'task' | 'staff_comment'>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Aggregate all notes across the system
  const allNotes = useMemo(() => {
    const list: SystemNoteItem[] = [];

    // 1. Patient notes
    patients.forEach(p => {
      if (Array.isArray(p.notes)) {
        p.notes.forEach(n => {
          list.push({
            id: `pat_note_${n.id}`,
            sourceType: 'patient',
            sourceTitle: `ملف المريض: ${p.name}`,
            content: n.content,
            authorName: n.authorName || 'موظف',
            authorRole: n.authorRole,
            createdAt: n.createdAt || p.registeredDate,
            patientId: p.id,
            patientName: p.name,
            toothNumber: n.toothNumber
          });
        });
      }
    });

    // 2. Task descriptions / notes
    tasks.forEach(t => {
      if (t.description && t.description.trim()) {
        list.push({
          id: `task_desc_${t.id}`,
          sourceType: 'task',
          sourceTitle: `مهمة: ${t.title}`,
          content: t.description,
          authorName: t.assignedTo || 'الإدارة',
          createdAt: t.dueDate,
          taskId: t.id
        });
      }
    });

    // 3. Staff comments
    staffComments.forEach(sc => {
      if (sc.content && sc.content.trim()) {
        list.push({
          id: `staff_comment_${sc.id}`,
          sourceType: 'staff_comment',
          sourceTitle: `كومنتات الموظفين (${sc.staffName})`,
          content: sc.content,
          authorName: sc.staffName,
          createdAt: sc.createdAt
        });
      }
    });

    // Sort descending by date
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [patients, tasks, staffComments]);

  // Unique staff authors for filter
  const staffAuthors = useMemo(() => {
    const set = new Set<string>();
    allNotes.forEach(n => {
      if (n.authorName) set.add(n.authorName);
    });
    return Array.from(set);
  }, [allNotes]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    const q = normalizeArabic(searchQuery.trim().toLowerCase());
    return allNotes.filter(n => {
      if (sourceFilter !== 'all' && n.sourceType !== sourceFilter) return false;
      if (selectedStaff !== 'all' && n.authorName !== selectedStaff) return false;

      if (q) {
        const text = normalizeArabic(
          `${n.sourceTitle} ${n.content} ${n.authorName} ${n.patientName || ''}`.toLowerCase()
        );
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [allNotes, searchQuery, sourceFilter, selectedStaff]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p className="text-base font-bold">عذراً، هذه الصفحة مخصصة لمدير النظام فقط.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-3 sm:px-6 py-4 pb-20 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center flex-shrink-0 shadow-2xs">
            <StickyNote className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d]">ملاحظات النظام الشاملة</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              عرض تجميعي لكل الملاحظات المسجلة في ملفات المرضى، المهام، وتعليقات الموظفين ({filteredNotes.length} ملاحظة)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          className="px-4 py-2.5 rounded-2xl bg-[#f0f6f5] hover:bg-[#e2efec] text-[#087e83] font-extrabold text-xs flex items-center justify-center gap-2 border border-[#bfe2db] transition-all cursor-pointer select-none"
        >
          <Filter className="w-4 h-4" />
          <span>فلاتر البحث والمصادر</span>
          {isFiltersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Filters Bar */}
      {isFiltersOpen && (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5 animate-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث في محتوى الملاحظات أو الأسماء..."
                className="w-full bg-[#f4f8f9] border border-[#dce8eb] rounded-2xl pr-10 pl-3.5 py-2.5 text-xs text-[#172f3d] placeholder:text-slate-400 focus:outline-none focus:border-[#087e83]"
              />
            </div>

            {/* Source Type Filter */}
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as any)}
              className="bg-[#f4f8f9] border border-[#dce8eb] rounded-2xl px-3.5 py-2.5 text-xs font-bold text-[#172f3d] focus:outline-none focus:border-[#087e83] cursor-pointer"
            >
              <option value="all">كل المصادر</option>
              <option value="patient">ملاحظات ملفات المرضى</option>
              <option value="task">تفاصيل وملاحظات المهام</option>
              <option value="staff_comment">كومنتات وتعليقات الموظفين</option>
            </select>

            {/* Staff Author Filter */}
            <select
              value={selectedStaff}
              onChange={e => setSelectedStaff(e.target.value)}
              className="bg-[#f4f8f9] border border-[#dce8eb] rounded-2xl px-3.5 py-2.5 text-xs font-bold text-[#172f3d] focus:outline-none focus:border-[#087e83] cursor-pointer"
            >
              <option value="all">كل كاتب الملاحظة</option>
              {staffAuthors.map(author => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Notes List */}
      {filteredNotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredNotes.map(note => {
            const isPatientNote = note.sourceType === 'patient';
            const isTaskNote = note.sourceType === 'task';
            return (
              <div
                key={note.id}
                className="bg-white border border-[#dce8eb] rounded-3xl p-4 shadow-2xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                        isPatientNote
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : isTaskNote
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {isPatientNote ? <Users className="w-3 h-3" /> : isTaskNote ? <CheckSquare className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                      <span>
                        {isPatientNote ? 'ملاحظة مريض' : isTaskNote ? 'تفاصيل مهمة' : 'تعليق موظف'}
                      </span>
                    </span>

                    <span className="text-[11px] font-mono text-slate-400" dir="ltr">
                      {note.createdAt ? note.createdAt.slice(0, 16).replace('T', ' ') : ''}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs sm:text-sm font-extrabold text-[#172f3d]">
                      {note.sourceTitle}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-700 bg-[#f8fafc] border border-slate-100 rounded-2xl p-3 mt-2 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 font-bold">
                    <User className="w-3.5 h-3.5 text-[#087e83]" />
                    <span>كاتب الملاحظة: {note.authorName}</span>
                    {note.toothNumber && (
                      <span className="text-[10px] bg-sky-50 text-sky-800 px-1.5 py-0.5 rounded-md font-mono">
                        سنة #{note.toothNumber}
                      </span>
                    )}
                  </div>

                  {note.patientId && (
                    <button
                      type="button"
                      onClick={() => goToPatient(note.patientId!)}
                      className="px-3 py-1 rounded-xl bg-[#e7f5f2] hover:bg-[#d6ede8] text-[#087e83] font-bold text-xs cursor-pointer transition-colors"
                    >
                      فتح الملف
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#dce8eb] rounded-3xl p-12 text-center text-slate-400 space-y-2">
          <StickyNote className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
          <p className="text-sm font-bold">لا توجد ملاحظات مطابقة للبحث</p>
        </div>
      )}
    </div>
  );
};
