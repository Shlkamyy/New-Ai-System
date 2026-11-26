import React from 'react';

export interface ClinicColorPreset {
  hex: string;
  label: string;
}

export const CLINIC_COLOR_PRESETS: ClinicColorPreset[] = [
  { hex: '#087e83', label: 'تيل العيادة' },
  { hex: '#059669', label: 'أخضر زمردي' },
  { hex: '#0ea5e9', label: 'سماوي' },
  { hex: '#2563eb', label: 'أزرق' },
  { hex: '#7c3aed', label: 'بنفسجي' },
  { hex: '#db2777', label: 'وردي' },
  { hex: '#e11d48', label: 'أحمر' },
  { hex: '#d97706', label: 'برتقالي' },
  { hex: '#64748b', label: 'رمادي' },
  { hex: '#0f172a', label: 'كحلي داكن' }
];

export function normalizeHexColor(value?: string): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const fullMatch = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (fullMatch) {
    return `#${fullMatch[1]}`.toLowerCase();
  }
  return undefined;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const norm = normalizeHexColor(hex);
  if (!norm) return null;
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  return { r, g, b };
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return `rgba(100, 116, 139, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Ensures badge foreground text remains legible on a light tinted background
 * even when a very bright color (like bright yellow or cyan) is picked.
 */
export function getReadableForegroundHex(hex: string): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return '#334155';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  if (luminance > 0.65) {
    const factor = 0.52;
    const r = Math.max(0, Math.round(rgb.r * factor));
    const g = Math.max(0, Math.round(rgb.g * factor));
    const b = Math.max(0, Math.round(rgb.b * factor));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return normalizeHexColor(hex) || '#334155';
}

export function getCustomColorBadgeStyle(hex?: string): React.CSSProperties | undefined {
  const norm = normalizeHexColor(hex);
  if (!norm) return undefined;
  return {
    backgroundColor: hexToRgba(norm, 0.12),
    borderColor: hexToRgba(norm, 0.36),
    color: getReadableForegroundHex(norm)
  };
}

export function getCustomColorActiveStyle(hex?: string): React.CSSProperties | undefined {
  const norm = normalizeHexColor(hex);
  if (!norm) return undefined;
  const rgb = parseHexRgb(norm);
  const luminance = rgb ? (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 : 0.3;
  return {
    backgroundColor: norm,
    borderColor: norm,
    color: luminance > 0.72 ? '#0f172a' : '#ffffff'
  };
}

export const SYSTEM_FOLLOW_UP_STATUSES: string[] = [
  'عميل محتمل',
  'قيد المتابعة',
  'تم تحديد ميعاد',
  'حضر للعيادة',
  'فيدباك',
  'خلص شغل',
  'غير مهتم'
];

export const DEFAULT_FOLLOW_UP_STATUS_COLORS: Record<string, string> = {
  'عميل محتمل': '#64748b',
  'قيد المتابعة': '#7c3aed',
  'تم تحديد ميعاد': '#2563eb',
  'حضر للعيادة': '#087e83',
  'فيدباك': '#059669',
  'خلص شغل': '#059669',
  'غير مهتم': '#e11d48'
};

export const SYSTEM_PATIENT_TAGS: string[] = [];

export const DEFAULT_PATIENT_TAG_COLORS: Record<string, string> = {};

export function getPatientTagColorHex(
  tag?: string,
  customMap?: Record<string, string>
): string | undefined {
  if (!tag) return undefined;
  const custom = normalizeHexColor(customMap?.[tag]);
  if (custom) return custom;
  return DEFAULT_PATIENT_TAG_COLORS[tag];
}

export function getFollowUpStatusColorHex(
  status?: string,
  customMap?: Record<string, string>
): string | undefined {
  if (!status) return undefined;
  const custom = normalizeHexColor(customMap?.[status]);
  if (custom) return custom;
  return DEFAULT_FOLLOW_UP_STATUS_COLORS[status];
}

export function getFollowUpStatusBadgeStyle(
  status?: string,
  customMap?: Record<string, string>
): React.CSSProperties | undefined {
  return getCustomColorBadgeStyle(getFollowUpStatusColorHex(status, customMap));
}

export const APPOINTMENT_STATUS_COLOR_HEX: Record<
  'booked' | 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'no_show',
  { label: string; hex: string }
> = {
  booked: { label: 'محجوز', hex: '#64748b' },
  confirmed: { label: 'مؤكد', hex: '#2563eb' },
  arrived: { label: 'وصل العيادة', hex: '#d97706' },
  completed: { label: 'تمت الزيارة', hex: '#059669' },
  cancelled: { label: 'ملغي', hex: '#e11d48' },
  no_show: { label: 'لم يحضر', hex: '#dc2626' }
};

