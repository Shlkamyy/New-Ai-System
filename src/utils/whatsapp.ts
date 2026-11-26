import {
  ClinicUnit,
  Patient,
  WhatsAppTemplate,
  WhatsAppTimingDirection,
  WhatsAppTimingUnit,
  WhatsAppTriggerEvent
} from '../types/clinic';
import { convertArabicDigitsToWestern, formatTimeToArabicPeriod, getArabicWeekdayName } from './arabic';

export const CLINIC_DISPLAY_NAME = 'عيادات د. شلقامي لطب الأسنان';

export const WHATSAPP_TIMING_UNIT_MINUTES: Record<WhatsAppTimingUnit, number> = {
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
  month: 43200
};

export const WHATSAPP_TIMING_UNIT_LABELS: Record<WhatsAppTimingUnit, string> = {
  minute: 'دقيقة',
  hour: 'ساعة',
  day: 'يوم',
  week: 'أسبوع',
  month: 'شهر'
};

export const WHATSAPP_TIMING_DIRECTION_LABELS: Record<WhatsAppTimingDirection, string> = {
  at: 'عند',
  before: 'قبل',
  after: 'بعد'
};

export const WHATSAPP_TRIGGER_LABELS: Record<WhatsAppTriggerEvent, string> = {
  patient_created: 'إنشاء ملف مريض',
  appointment_created: 'إنشاء موعد',
  appointment_reminder: 'إنشاء موعد',
  invoice_issued: 'إنشاء فاتورة',
  invoice_procedure: 'اختيار إجراء معين في فاتورة',
  payment_received: 'إنشاء دفعة',
  post_op_care: 'إنشاء فاتورة',
  manual: 'بدون حدث'
};

export function computeTimingOffsetMinutes(
  direction: WhatsAppTimingDirection,
  value: number,
  unit: WhatsAppTimingUnit
): number {
  if (direction === 'at') return 0;
  const safeVal = Math.max(1, Math.round(Number(value) || 1));
  const multiplier = WHATSAPP_TIMING_UNIT_MINUTES[unit] || 1;
  return direction === 'before' ? -(safeVal * multiplier) : safeVal * multiplier;
}

export function parseTimingFromTemplate(tmpl: Pick<WhatsAppTemplate, 'timingOffsetMinutes' | 'timingDirection' | 'timingValue' | 'timingUnit'>): {
  direction: WhatsAppTimingDirection;
  value: number;
  unit: WhatsAppTimingUnit;
} {
  if (tmpl.timingDirection && (tmpl.timingDirection === 'at' || tmpl.timingDirection === 'before' || tmpl.timingDirection === 'after')) {
    return {
      direction: tmpl.timingDirection,
      value: Math.max(1, Number(tmpl.timingValue) || 1),
      unit: tmpl.timingUnit || 'hour'
    };
  }
  const offset = Number(tmpl.timingOffsetMinutes) || 0;
  if (offset === 0) {
    return { direction: 'at', value: 1, unit: 'hour' };
  }
  const direction: WhatsAppTimingDirection = offset < 0 ? 'before' : 'after';
  const abs = Math.abs(offset);
  const unitsOrder: WhatsAppTimingUnit[] = ['month', 'week', 'day', 'hour', 'minute'];
  for (const unit of unitsOrder) {
    const mult = WHATSAPP_TIMING_UNIT_MINUTES[unit];
    if (abs % mult === 0) {
      return { direction, value: Math.max(1, abs / mult), unit };
    }
  }
  return { direction, value: Math.max(1, abs), unit: 'minute' };
}

export function formatWhatsAppTriggerLabel(tmpl: WhatsAppTemplate): string {
  if (tmpl.triggerEvent === 'manual') {
    return 'بدون حدث (إرسال يدوي)';
  }

  const { direction, value, unit } = parseTimingFromTemplate(tmpl);
  const dirLabel = WHATSAPP_TIMING_DIRECTION_LABELS[direction];
  const unitLabel = WHATSAPP_TIMING_UNIT_LABELS[unit];

  let eventLabel = WHATSAPP_TRIGGER_LABELS[tmpl.triggerEvent] || 'إنشاء موعد';
  if (tmpl.triggerEvent === 'invoice_procedure') {
    eventLabel = tmpl.procedureName
      ? `اختيار إجراء (${tmpl.procedureName}) في فاتورة`
      : 'اختيار إجراء معين في فاتورة';
  }

  if (direction === 'at') {
    return `${dirLabel} ${eventLabel}`;
  }
  return `${dirLabel} ${eventLabel} بـ ${value} ${unitLabel}`;
}

export function computeScheduledForFromOffset(
  baseDateStr: string,
  baseTimeStr: string | undefined,
  offsetMinutes: number
): string {
  if (!offsetMinutes) return baseDateStr;
  const [y, m, d] = (baseDateStr || '').split('-').map(Number);
  if (!y || !m || !d) return baseDateStr;
  const [hh, mm] = (baseTimeStr || '12:00').split(':').map(Number);
  const dt = new Date(y, m - 1, d, isNaN(hh) ? 12 : hh, isNaN(mm) ? 0 : mm, 0);
  dt.setMinutes(dt.getMinutes() + offsetMinutes);
  const outY = dt.getFullYear();
  const outM = String(dt.getMonth() + 1).padStart(2, '0');
  const outD = String(dt.getDate()).padStart(2, '0');
  const outH = String(dt.getHours()).padStart(2, '0');
  const outMin = String(dt.getMinutes()).padStart(2, '0');
  if (!baseTimeStr && Math.abs(offsetMinutes) % 1440 === 0) {
    return `${outY}-${outM}-${outD}`;
  }
  return `${outY}-${outM}-${outD} ${outH}:${outMin}`;
}

export function normalizeWhatsAppPhone(phone: string): string {
  const digits = convertArabicDigitsToWestern(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0020')) return '20' + digits.slice(4);
  if (digits.startsWith('0')) return '2' + digits;
  if (digits.length === 10 && digits.startsWith('1')) return '20' + digits;
  return digits;
}

export function normalizePhoneKey(phone?: string): string {
  return normalizeWhatsAppPhone(phone || '');
}

export function isPhoneMarkedNoWhatsApp(
  patient?: Pick<Patient, 'noWhatsAppPhones'> | null,
  phone?: string
): boolean {
  if (!patient?.noWhatsAppPhones || patient.noWhatsAppPhones.length === 0) return false;
  const targetKey = normalizePhoneKey(phone);
  if (!targetKey) return false;
  return patient.noWhatsAppPhones.some(p => normalizePhoneKey(p) === targetKey);
}

export function getPreferredPatientWhatsAppPhone(
  patient?: Pick<Patient, 'phone' | 'secondaryPhone' | 'defaultWhatsAppPhone' | 'noWhatsAppPhones'> | null
): string {
  if (!patient) return '';
  const primary = (patient.phone || '').trim();
  const secondary = (patient.secondaryPhone || '').trim();

  if (patient.defaultWhatsAppPhone === 'secondary' && secondary) {
    return secondary;
  }
  if (patient.defaultWhatsAppPhone === 'primary' && primary) {
    return primary;
  }

  if (primary && !isPhoneMarkedNoWhatsApp(patient, primary)) {
    return primary;
  }
  if (secondary && !isPhoneMarkedNoWhatsApp(patient, secondary)) {
    return secondary;
  }
  return primary || secondary;
}

export function isPreferredWhatsAppMissing(
  patient?: Pick<Patient, 'phone' | 'secondaryPhone' | 'defaultWhatsAppPhone' | 'noWhatsAppPhones'> | null,
  explicitPhone?: string
): boolean {
  if (!patient) return false;
  const activePhone = (explicitPhone || '').trim() || getPreferredPatientWhatsAppPhone(patient);
  if (!activePhone) return false;
  return isPhoneMarkedNoWhatsApp(patient, activePhone);
}

export function hasAnyNoWhatsAppPhone(
  patient?: Pick<Patient, 'noWhatsAppPhones'> | null
): boolean {
  return Boolean(patient?.noWhatsAppPhones && patient.noWhatsAppPhones.length > 0);
}

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  if (!cleanPhone) return '#';
  const trimmedMsg = (message || '').trim();
  if (!trimmedMsg) {
    return `https://wa.me/${cleanPhone}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(trimmedMsg)}`;
}

export function openWhatsAppChat(phone: string, message?: string): void {
  const url = buildWhatsAppUrl(phone, message);
  if (url === '#' || typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export interface WhatsAppRenderContext {
  patientName?: string;
  unitId?: string;
  unitName?: string;
  clinicAddress?: string;
  date?: string;
  dayName?: string;
  time?: string;
  doctorName?: string;
  procedure?: string;
  amount?: string | number;
  balance?: string | number;
  invoiceNumber?: string;
}

export function resolveClinicAddress(
  units: ClinicUnit[],
  unitId?: string,
  unitName?: string
): string {
  const byId = unitId ? units.find(u => u.id === unitId) : undefined;
  if (byId?.description?.trim()) return byId.description.trim();

  const byName = unitName
    ? units.find(u => u.name === unitName || unitName.includes(u.name) || u.name.includes(unitName))
    : undefined;
  if (byName?.description?.trim()) return byName.description.trim();

  const firstActive = units.find(u => !u.isDisabled && u.description?.trim()) || units.find(u => u.description?.trim());
  return firstActive?.description?.trim() || '';
}

export function renderWhatsAppTemplate(
  template: string,
  ctx: WhatsAppRenderContext,
  units: ClinicUnit[] = []
): string {
  const clinicAddress =
    ctx.clinicAddress?.trim() || resolveClinicAddress(units, ctx.unitId, ctx.unitName);
  const resolvedUnitName =
    ctx.unitName ||
    (ctx.unitId ? units.find(u => u.id === ctx.unitId)?.name : '') ||
    '';
  const resolvedDayName = ctx.dayName || getArabicWeekdayName(ctx.date);
  const resolvedTime = ctx.time ? formatTimeToArabicPeriod(ctx.time) : '';

  return (template || '')
    .replace(/\{\{patient_name\}\}/g, ctx.patientName || '')
    .replace(/\{\{clinic_name\}\}/g, CLINIC_DISPLAY_NAME)
    .replace(/\{\{clinic_address\}\}/g, clinicAddress)
    .replace(/\{\{unit_name\}\}/g, resolvedUnitName)
    .replace(/\{\{date\}\}/g, ctx.date || '')
    .replace(/\{\{day_name\}\}/g, resolvedDayName)
    .replace(/\{\{time\}\}/g, resolvedTime)
    .replace(/\{\{doctor_name\}\}/g, ctx.doctorName || '')
    .replace(/\{\{procedure\}\}/g, ctx.procedure || '')
    .replace(/\{\{amount\}\}/g, ctx.amount !== undefined ? String(ctx.amount) : '')
    .replace(/\{\{balance\}\}/g, ctx.balance !== undefined ? String(ctx.balance) : '')
    .replace(/\{\{invoice_number\}\}/g, ctx.invoiceNumber || '');
}
