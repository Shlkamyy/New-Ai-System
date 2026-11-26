import React, { useState } from 'react';
import { Check, MessageCircle, Phone, PhoneOff, X } from 'lucide-react';
import { Patient } from '../types/clinic';
import { useClinic } from '../context/ClinicContext';
import {
  getPreferredPatientWhatsAppPhone,
  isPhoneMarkedNoWhatsApp,
  normalizePhoneKey
} from '../utils/whatsapp';
import { convertArabicDigitsToWestern } from '../utils/arabic';

interface RegisterWhatsAppModalProps {
  patient: Patient;
  onClose: () => void;
}

export const RegisterWhatsAppModal: React.FC<RegisterWhatsAppModalProps> = ({
  patient,
  onClose
}) => {
  const {
    registerPatientWhatsAppPhone,
    setPatientDefaultWhatsAppPhone,
    setPatientPhoneNoWhatsApp
  } = useClinic();

  const [newPhone, setNewPhone] = useState('');
  const [slot, setSlot] = useState<'secondary' | 'primary'>(
    patient.phone ? 'secondary' : 'primary'
  );
  const [errorMsg, setErrorMsg] = useState('');

  const primaryMarked = isPhoneMarkedNoWhatsApp(patient, patient.phone);
  const secondaryMarked = Boolean(
    patient.secondaryPhone && isPhoneMarkedNoWhatsApp(patient, patient.secondaryPhone)
  );
  const preferredPhone = getPreferredPatientWhatsAppPhone(patient);

  const handleSaveNewPhone = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = convertArabicDigitsToWestern(newPhone).trim();
    const digits = normalizePhoneKey(cleaned);
    if (!digits || digits.length < 8) {
      setErrorMsg('يرجى إدخال رقم واتساب صحيح');
      return;
    }
    registerPatientWhatsAppPhone(patient.id, cleaned, slot);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <MessageCircle className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#172f3d]">تسجيل / اختيار رقم الواتساب</h3>
              <p className="text-[11px] text-slate-500 font-semibold">{patient.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing numbers quick controls */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-500 block">الأرقام المسجلة حالياً:</span>

          {patient.phone && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-slate-200 bg-slate-50/70">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-mono font-bold text-[#172f3d]" dir="ltr">
                    {patient.phone}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                    الأساسي
                  </span>
                  {preferredPhone === patient.phone && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      مختار للواتساب
                    </span>
                  )}
                  {primaryMarked && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                      لا يوجد واتساب
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {primaryMarked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPatientPhoneNoWhatsApp(patient.id, patient.phone, false);
                      setPatientDefaultWhatsAppPhone(patient.id, 'primary');
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    تفعيل واتساب
                  </button>
                ) : (
                  <>
                    {patient.secondaryPhone && preferredPhone !== patient.phone && (
                      <button
                        type="button"
                        onClick={() => {
                          setPatientDefaultWhatsAppPhone(patient.id, 'primary');
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-xl bg-[#e7f5f2] hover:bg-[#d5ece7] text-[#087e83] text-[11px] font-bold cursor-pointer"
                      >
                        اختيار للواتساب
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPatientPhoneNoWhatsApp(patient.id, patient.phone, true)}
                      className="px-2 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <PhoneOff className="w-3 h-3" />
                      <span>بدون واتساب</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {patient.secondaryPhone && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl border border-slate-200 bg-slate-50/70">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-mono font-bold text-[#172f3d]" dir="ltr">
                    {patient.secondaryPhone}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                    إضافي
                  </span>
                  {preferredPhone === patient.secondaryPhone && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      مختار للواتساب
                    </span>
                  )}
                  {secondaryMarked && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                      لا يوجد واتساب
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {secondaryMarked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPatientPhoneNoWhatsApp(patient.id, patient.secondaryPhone!, false);
                      setPatientDefaultWhatsAppPhone(patient.id, 'secondary');
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    تفعيل واتساب
                  </button>
                ) : (
                  <>
                    {preferredPhone !== patient.secondaryPhone && (
                      <button
                        type="button"
                        onClick={() => {
                          setPatientDefaultWhatsAppPhone(patient.id, 'secondary');
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-xl bg-[#e7f5f2] hover:bg-[#d5ece7] text-[#087e83] text-[11px] font-bold cursor-pointer"
                      >
                        اختيار للواتساب
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setPatientPhoneNoWhatsApp(patient.id, patient.secondaryPhone!, true)
                      }
                      className="px-2 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <PhoneOff className="w-3 h-3" />
                      <span>بدون واتساب</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Register a new WhatsApp phone */}
        <form onSubmit={handleSaveNewPhone} className="space-y-3 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-extrabold text-[#172f3d] block mb-1.5">
              تسجيل رقم واتساب آخر للمريض:
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                dir="ltr"
                value={newPhone}
                onChange={e => {
                  setNewPhone(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="01xxxxxxxxx"
                autoFocus
                className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono font-bold text-[#172f3d] focus:border-[#087e83] focus:outline-none text-left"
              />
            </div>
            {errorMsg && <p className="text-[11px] font-bold text-rose-600 mt-1">{errorMsg}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setSlot('secondary')}
              className={`p-2 rounded-xl border text-center cursor-pointer transition-colors ${
                slot === 'secondary'
                  ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              حفظ كرقم إضافي للواتساب
            </button>
            <button
              type="button"
              onClick={() => setSlot('primary')}
              className={`p-2 rounded-xl border text-center cursor-pointer transition-colors ${
                slot === 'primary'
                  ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              تحديث الرقم الأساسي
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>حفظ وتفعيل للواتساب</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
