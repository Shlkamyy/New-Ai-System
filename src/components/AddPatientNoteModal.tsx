import React, { useState, useRef, useEffect } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  X,
  Mic,
  Square,
  Activity,
  AlertCircle,
  StickyNote
} from 'lucide-react';
import { ToothIcon } from './ToothIcon';

interface AddPatientNoteModalProps {
  isOpen: boolean;
  patientId: string | null;
  patientName: string;
  onClose: () => void;
}

export const AddPatientNoteModal: React.FC<AddPatientNoteModalProps> = ({
  isOpen,
  patientId,
  patientName,
  onClose
}) => {
  const { addPatientNote, hasPermission } = useClinic();
  const canAddClinicalNotes = hasPermission('addClinicalNotes');

  const [noteText, setNoteText] = useState('');
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [showToothChart, setShowToothChart] = useState(false);

  const toggleToothSelection = (code: number) => {
    setSelectedTeeth(prev =>
      prev.includes(code) ? prev.filter(t => t !== code) : [...prev, code]
    );
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | undefined>(undefined);
  const [recordedDuration, setRecordedDuration] = useState<number | undefined>(undefined);
  const [recordingError, setRecordingError] = useState('');
  const [micPermissionInfo, setMicPermissionInfo] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSecsRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const cleanupMedia = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    if (isOpen) {
      setNoteText('');
      setSelectedTeeth([]);
      setShowToothChart(false);
      setRecordedAudioUrl(undefined);
      setRecordedDuration(undefined);
      setRecordingSeconds(0);
      setRecordingError('');
      setMicPermissionInfo(null);
      const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    } else {
      cleanupMedia();
    }
  }, [isOpen, patientId]);

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, []);

  if (!isOpen || !patientId || !canAddClinicalNotes) return null;

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const startAudioRecording = async () => {
    setRecordingError('');
    setMicPermissionInfo(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('المتصفح الحالي لا يدعم التسجيل الصوتي المباشر');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeOptions = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const supportedMime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, {
        ...(supportedMime ? { mimeType: supportedMime } : {}),
        audioBitsPerSecond: 16000
      });
      audioChunksRef.current = [];
      recordingSecsRef.current = 0;
      setRecordingSeconds(0);

      recorder.ondataavailable = ev => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const dur = Math.max(1, recordingSecsRef.current);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setRecordedAudioUrl(reader.result);
            setRecordedDuration(dur);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      recordingTimerRef.current = window.setInterval(() => {
        recordingSecsRef.current += 1;
        setRecordingSeconds(recordingSecsRef.current);
        if (recordingSecsRef.current >= 60) {
          stopVoiceRecording();
        }
      }, 1000);
    } catch (err) {
      const errName = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setRecordingError('لم يتم العثور على ميكروفون متصل بالجهاز');
      } else {
        setRecordingError('يرجى السماح بصلاحية الميكروفون من إعدادات المتصفح لبدء التسجيل الصوتي');
        setMicPermissionInfo('افتح إعدادات الموقع في المتصفح ← الأذونات ← الميكروفون ← سماح.');
      }
    }
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      stopVoiceRecording();
      return;
    }
    await startAudioRecording();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() && !recordedAudioUrl) return;
    const contentToSave = noteText.trim() || `تسجيل صوتي سريري (${recordedDuration || 1} ثانية)`;
    addPatientNote(
      patientId,
      contentToSave,
      selectedTeeth.length > 0 ? selectedTeeth : undefined,
      recordedAudioUrl,
      recordedDuration
    );
    cleanupMedia();
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center flex-shrink-0">
              <StickyNote className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-[#172f3d]">إضافة ملاحظة للمريض</h3>
              <p className="text-[11px] text-slate-500 font-semibold truncate">{patientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          {/* Note Text */}
          <textarea
            ref={textareaRef}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            placeholder="اكتب الملاحظة السريرية أو تفاصيل المتابعة هنا..."
            className="w-full p-3 rounded-2xl border border-slate-200 bg-[#fbfdfd] text-xs sm:text-sm font-medium focus:border-[#087e83] focus:outline-none"
          />

          {/* Selected Teeth Chips */}
          {selectedTeeth.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#e7f5f2] border border-[#bfe2db] text-xs font-bold text-[#087e83] flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>الأسنان المحددة:</span>
                {selectedTeeth.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-[#9fd4ca] text-[11px] font-mono font-extrabold text-[#087e83]"
                  >
                    <span>سن {t}</span>
                    <button
                      type="button"
                      onClick={() => toggleToothSelection(t)}
                      className="text-rose-500 hover:text-rose-700 cursor-pointer"
                      aria-label={`إزالة سن ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeeth([])}
                className="text-rose-600 hover:underline cursor-pointer text-[11px]"
              >
                إلغاء الكل
              </button>
            </div>
          )}

          {/* Recorded Voice Preview */}
          {recordedAudioUrl && (
            <div className="p-2.5 rounded-2xl bg-[#f0f8f6] border border-[#bfe2db] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <audio controls src={recordedAudioUrl} className="h-8 w-full max-w-xs" />
                <span className="text-[11px] font-mono font-bold text-[#087e83] whitespace-nowrap">
                  ({recordedDuration || 1} ث)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRecordedAudioUrl(undefined);
                  setRecordedDuration(undefined);
                }}
                className="text-[11px] font-bold text-rose-600 hover:underline self-end sm:self-center cursor-pointer"
              >
                حذف التسجيل
              </button>
            </div>
          )}

          {/* Recording Error */}
          {recordingError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{recordingError}</span>
              </div>
              {micPermissionInfo && <p className="text-[11px] font-normal">{micPermissionInfo}</p>}
            </div>
          )}

          {/* Action Row: Voice Note + Tooth Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleVoiceRecording}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isRecording
                  ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {isRecording ? <Square className="w-3.5 h-3.5 fill-rose-600" /> : <Mic className="w-3.5 h-3.5" />}
              <span>
                {isRecording
                  ? `إيقاف التسجيل (0:${String(recordingSeconds).padStart(2, '0')} / 1:00)`
                  : 'تسجيل فويس نوت'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowToothChart(prev => !prev)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                showToothChart || selectedTeeth.length > 0
                  ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                  : 'bg-[#e7f5f2]/70 border-[#bfe2db] text-[#087e83] hover:bg-[#d5eee8]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>اختيار رقم السن {selectedTeeth.length > 0 ? `(${selectedTeeth.length})` : ''}</span>
            </button>
          </div>

          {/* Inline Interactive 4-Quadrant Palmer Dental Chart */}
          {showToothChart && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 p-2 bg-[#fbfdfd] rounded-2xl border border-slate-200" dir="ltr">
                {/* Upper Right (18..11) */}
                <div className="border-r-2 border-b-2 border-[#087e83] pr-1 sm:pr-2 pb-2 text-right">
                  <div className="text-[9px] font-bold text-slate-400 mb-1 truncate">UR · علوي يمين</div>
                  <div className="grid grid-cols-8 gap-0.5 items-end justify-items-center">
                    {[8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                      const code = 10 + num;
                      return (
                        <ToothIcon
                          key={code}
                          num={num}
                          arch="upper"
                          size="quadrant"
                          selected={selectedTeeth.includes(code)}
                          onClick={() => toggleToothSelection(code)}
                          title={`سن ${code}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Upper Left (21..28) */}
                <div className="border-b-2 border-[#087e83] pl-1 sm:pl-2 pb-2 text-left">
                  <div className="text-[9px] font-bold text-slate-400 mb-1 truncate">UL · علوي يسار</div>
                  <div className="grid grid-cols-8 gap-0.5 items-end justify-items-center">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                      const code = 20 + num;
                      return (
                        <ToothIcon
                          key={code}
                          num={num}
                          arch="upper"
                          size="quadrant"
                          selected={selectedTeeth.includes(code)}
                          onClick={() => toggleToothSelection(code)}
                          title={`سن ${code}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Lower Right (48..41) */}
                <div className="border-r-2 border-[#087e83] pr-1 sm:pr-2 pt-2 text-right">
                  <div className="text-[9px] font-bold text-slate-400 mb-1 truncate">LR · سفلي يمين</div>
                  <div className="grid grid-cols-8 gap-0.5 items-start justify-items-center">
                    {[8, 7, 6, 5, 4, 3, 2, 1].map(num => {
                      const code = 40 + num;
                      return (
                        <ToothIcon
                          key={code}
                          num={num}
                          arch="lower"
                          size="quadrant"
                          selected={selectedTeeth.includes(code)}
                          onClick={() => toggleToothSelection(code)}
                          title={`سن ${code}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Lower Left (31..38) */}
                <div className="pl-1 sm:pl-2 pt-2 text-left">
                  <div className="text-[9px] font-bold text-slate-400 mb-1 truncate">LL · سفلي يسار</div>
                  <div className="grid grid-cols-8 gap-0.5 items-start justify-items-center">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                      const code = 30 + num;
                      return (
                        <ToothIcon
                          key={code}
                          num={num}
                          arch="lower"
                          size="quadrant"
                          selected={selectedTeeth.includes(code)}
                          onClick={() => toggleToothSelection(code)}
                          title={`سن ${code}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowToothChart(false)}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد الاختيار {selectedTeeth.length > 0 ? `(${selectedTeeth.length})` : ''}
                </button>
                {selectedTeeth.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeeth([]);
                      setShowToothChart(false);
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                  >
                    إلغاء وتحديد ملاحظة عامة
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Save / Cancel */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={!noteText.trim() && !recordedAudioUrl}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-50 text-white font-bold text-xs shadow-sm cursor-pointer"
            >
              حفظ الملاحظة
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
