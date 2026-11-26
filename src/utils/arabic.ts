/**
 * Normalizes Arabic text for flexible, order-independent search.
 * Handles:
 * - أ / إ / آ / ا -> ا
 * - ى -> ي
 * - ة -> ه
 * - Diacritics (Harakat) removal
 * - Tatweel (ـ) removal
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    // Remove diacritics
    .replace(/[\u064B-\u0652]/g, '')
    // Remove tatweel
    .replace(/\u0640/g, '')
    // Normalize Alef
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Ya and Alef Maqsura
    .replace(/[ى]/g, 'ي')
    // Normalize Ta Marbuta
    .replace(/[ة]/g, 'ه');
}

export function normalizeArabicCompact(text: string): string {
  return normalizeArabic(text).replace(/\s+/g, '');
}

/**
 * Checks if search query matches target text with word-order independent AND semantics.
 * Supports space-insensitive matching for Arabic compound names (e.g. عبدالقادر / عبد القادر, ابوطالب / ابو طالب).
 */
export function matchArabicTerms(target: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;

  const normalizedTarget = normalizeArabic(target);
  const compactTarget = normalizedTarget.replace(/\s+/g, '');
  const terms = query
    .trim()
    .split(/\s+/)
    .map(t => normalizeArabic(t))
    .filter(Boolean);

  if (terms.length === 0) return true;

  return terms.every(
    term =>
      normalizedTarget.includes(term) ||
      (term.length >= 4 && compactTarget.includes(term))
  );
}

/**
 * Scores how closely `target` matches `query` (0 = no match).
 * Ranking priority:
 * 1. Exact full string match
 * 2. Full string starts with full query / contiguous phrase match
 * 3. Per-term exact word match (with bonus for first word / in-order position)
 * 4. Per-term word prefix match
 * 5. Substring within a single word
 * 6. Cross-space compact match (lowest priority, e.g. "نورهان محمود" for "هانم")
 */
export function scoreArabicTextMatch(target: string | undefined, query: string): number {
  if (!query || !query.trim() || !target) return 0;

  const normQuery = normalizeArabic(query).replace(/\s+/g, ' ').trim();
  if (!normQuery) return 0;

  const normTarget = normalizeArabic(target).replace(/\s+/g, ' ').trim();
  if (!normTarget) return 0;

  const compactTarget = normTarget.replace(/\s+/g, '');
  const terms = normQuery.split(' ').filter(Boolean);
  if (terms.length === 0) return 0;

  const targetTokens = normTarget.split(' ').filter(Boolean);
  let totalScore = 0;

  for (let tIdx = 0; tIdx < terms.length; tIdx++) {
    const term = terms[tIdx];
    let bestTermScore = 0;

    for (let wIdx = 0; wIdx < targetTokens.length; wIdx++) {
      const token = targetTokens[wIdx];
      let candidate = 0;
      if (token === term) {
        candidate = 1000 + (wIdx === tIdx ? 180 : wIdx === 0 ? 120 : Math.max(0, 60 - wIdx * 10));
      } else if (token.startsWith(term)) {
        const lengthRatio = Math.round((term.length / Math.max(term.length, token.length)) * 120);
        candidate = 520 + lengthRatio + (wIdx === tIdx ? 90 : wIdx === 0 ? 60 : Math.max(0, 30 - wIdx * 5));
      } else {
        const subIdx = token.indexOf(term);
        if (subIdx !== -1) {
          candidate = 180 + Math.max(0, 40 - subIdx * 5) + Math.max(0, 20 - wIdx * 4);
        }
      }
      if (candidate > bestTermScore) {
        bestTermScore = candidate;
      }
    }

    if (bestTermScore === 0) {
      if (normTarget.includes(term)) {
        bestTermScore = 110;
      } else if (term.length >= 4 && compactTarget.includes(term)) {
        bestTermScore = 20;
      } else {
        return 0;
      }
    }

    totalScore += bestTermScore;
  }

  // Whole-query phrase bonuses
  if (normTarget === normQuery) {
    totalScore += 3000;
  } else if (normTarget.startsWith(normQuery)) {
    totalScore += 750;
  } else if (normTarget.includes(normQuery)) {
    totalScore += 280;
  }

  // Slightly prefer tighter name matches when token scores tie (e.g. "هانم" > "هانم محمد")
  totalScore -= Math.min(80, Math.max(0, targetTokens.length - terms.length) * 12);
  totalScore -= Math.min(40, Math.floor(Math.max(0, normTarget.length - normQuery.length) / 3));

  return Math.max(1, totalScore);
}

/**
 * Normalizes Egyptian phone numbers.
 * Converts +20 10... or 002010... or 010... into standardized digits for matching.
 */
export function normalizeEgyptianPhone(phone: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0020')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('20') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (!digits.startsWith('0') && digits.length === 10) {
    digits = '0' + digits;
  }
  return digits;
}

/**
 * Validates whether a phone string is a valid Egyptian mobile number.
 * Supports 010, 011, 012, 015 (11 digits after normalizing +20/0020 prefixes).
 */
export function isValidEgyptianMobile(phone: string): boolean {
  if (!phone || !phone.trim()) return false;
  const normalized = normalizeEgyptianPhone(phone);
  return /^01[0125]\d{8}$/.test(normalized);
}

/**
 * Converts Arabic-Indic (٠-٩) and Eastern Arabic (۰-۹) digits to Western ASCII digits (0-9).
 */
export function convertArabicDigitsToWestern(input: string): string {
  if (!input) return '';
  return input
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Determines whether a search/create query represents a phone number rather than a person's name.
 */
export function isLikelyPhoneQuery(query: string): boolean {
  if (!query || !query.trim()) return false;
  const western = convertArabicDigitsToWestern(query).trim();
  if (/[a-zA-Z\u0600-\u06FF]/.test(western)) return false;
  const digitsOnly = western.replace(/\D/g, '');
  if (digitsOnly.length < 3) return false;
  return /^[+\d\s\-()]+$/.test(western);
}

/**
 * Checks if phone matches query.
 */
export function matchPhone(phone: string | undefined, query: string): boolean {
  if (!phone || !query) return false;
  const cleanPhone = normalizeEgyptianPhone(phone);
  const cleanQuery = convertArabicDigitsToWestern(query).replace(/\D/g, '');
  if (!cleanQuery) return false;
  return cleanPhone.includes(cleanQuery);
}

export function scorePhoneMatch(phone: string | undefined, query: string): number {
  if (!phone || !query) return 0;
  const cleanPhone = normalizeEgyptianPhone(phone);
  const cleanQuery = convertArabicDigitsToWestern(query).replace(/\D/g, '');
  if (!cleanQuery) return 0;
  if (cleanPhone === cleanQuery) return 4000;
  if (cleanPhone.startsWith(cleanQuery)) return 2200 + cleanQuery.length * 10;
  if (cleanPhone.endsWith(cleanQuery)) return 1600 + cleanQuery.length * 10;
  if (cleanPhone.includes(cleanQuery)) return 900 + cleanQuery.length * 10;
  return 0;
}

export interface PatientSearchableFields {
  name?: string;
  phone?: string;
  patientCode?: string;
  address?: string;
  doctorName?: string;
}

/**
 * Scores a patient record against a user search query (name > code/phone > secondary fields).
 */
export function scorePatientSearchMatch(
  patient: PatientSearchableFields,
  query: string
): number {
  const trimmed = query.trim();
  if (!trimmed) return 0;

  let best = 0;

  const nameScore = scoreArabicTextMatch(patient.name, trimmed);
  if (nameScore > 0) {
    best = Math.max(best, nameScore * 10);
  }

  const codeClean = convertArabicDigitsToWestern(patient.patientCode || '').trim().toLowerCase();
  const queryClean = convertArabicDigitsToWestern(trimmed).trim().toLowerCase();
  if (codeClean && queryClean) {
    if (codeClean === queryClean) best = Math.max(best, 35000);
    else if (codeClean.startsWith(queryClean)) best = Math.max(best, 15000);
    else if (codeClean.includes(queryClean)) best = Math.max(best, 6000);
  }

  const phoneScore = scorePhoneMatch(patient.phone, trimmed);
  if (phoneScore > 0) {
    best = Math.max(best, phoneScore * 5);
  }

  if (best === 0) {
    const addrScore = scoreArabicTextMatch(patient.address, trimmed);
    const docScore = scoreArabicTextMatch(patient.doctorName, trimmed);
    best = Math.max(addrScore, docScore);
  }

  return best;
}

export interface Time12h {
  hour12: string;
  minute: string;
  period: 'AM' | 'PM';
  periodAr: 'ص' | 'م';
  formatted: string;
}

/**
 * Parses any 24h or 12h time string into 12-hour AM/PM components.
 */
export function parseTimeTo12h(time24: string): Time12h {
  if (!time24) return { hour12: '12', minute: '00', period: 'AM', periodAr: 'ص', formatted: '12:00 AM' };

  if (time24.includes('AM') || time24.includes('PM')) {
    const isPM = time24.includes('PM');
    const cleanTime = time24.replace(/[^0-9:]/g, '');
    const [h, m] = cleanTime.split(':');
    const paddedHour = (h || '12').padStart(2, '0');
    const paddedMinute = (m || '00').padStart(2, '0');
    return {
      hour12: paddedHour,
      minute: paddedMinute,
      period: isPM ? 'PM' : 'AM',
      periodAr: isPM ? 'م' : 'ص',
      formatted: `${paddedHour}:${paddedMinute} ${isPM ? 'PM' : 'AM'}`
    };
  }

  const [hourStr, minuteStr] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = (minuteStr || '00').padStart(2, '0');
  if (isNaN(hour)) return { hour12: '12', minute: '00', period: 'AM', periodAr: 'ص', formatted: time24 };

  const isPM = hour >= 12;
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;

  const paddedHour = String(hour).padStart(2, '0');
  return {
    hour12: paddedHour,
    minute,
    period: isPM ? 'PM' : 'AM',
    periodAr: isPM ? 'م' : 'ص',
    formatted: `${paddedHour}:${minute} ${isPM ? 'PM' : 'AM'}`
  };
}

export const CAIRO_TIMEZONE = 'Africa/Cairo';

export interface CairoNowParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  time12h: string; // hh:mm AM/PM
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const CAIRO_PARTS_FORMATTER = (() => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CAIRO_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23'
    });
  } catch {
    return null;
  }
})();

/**
 * Returns the current date & time components in Egypt time (Africa/Cairo),
 * independent of the host browser or server timezone offset.
 */
export function getCairoNowParts(dateInput: Date = new Date()): CairoNowParts {
  try {
    if (!CAIRO_PARTS_FORMATTER) {
      throw new Error('Formatter unavailable');
    }
    const parts = CAIRO_PARTS_FORMATTER.formatToParts(dateInput);
    const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';
    const year = parseInt(getVal('year'), 10);
    const month = parseInt(getVal('month'), 10);
    const day = parseInt(getVal('day'), 10);
    let hour = parseInt(getVal('hour'), 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(getVal('minute'), 10);
    const second = parseInt(getVal('second'), 10);
    const weekdayStr = getVal('weekday');
    const weekday = WEEKDAY_MAP[weekdayStr] ?? new Date(year, month - 1, day).getDay();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      weekday,
      dateStr,
      timeStr,
      time12h: parseTimeTo12h(timeStr).formatted
    };
  } catch {
    // Fallback to UTC+2 (Egypt Standard Time)
    const utcPlus2 = new Date(dateInput.getTime() + 2 * 3600 * 1000);
    const year = utcPlus2.getUTCFullYear();
    const month = utcPlus2.getUTCMonth() + 1;
    const day = utcPlus2.getUTCDate();
    const hour = utcPlus2.getUTCHours();
    const minute = utcPlus2.getUTCMinutes();
    const second = utcPlus2.getUTCSeconds();
    const weekday = utcPlus2.getUTCDay();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      weekday,
      dateStr,
      timeStr,
      time12h: parseTimeTo12h(timeStr).formatted
    };
  }
}

/**
 * Safely adds days to a YYYY-MM-DD date string without UTC shift.
 */
export function addDaysToYmd(baseYmd: string, days: number): string {
  const [y, m, d] = (baseYmd || '').split('-').map(Number);
  if (!y || !m || !d) return baseYmd;
  const dt = new Date(y, m - 1, d + days, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Returns the most recent clinic working day strictly before `fromYmd`,
 * skipping days marked `isClosed` in weekdaySettings.
 */
export function getPreviousWorkingDayYmd(
  fromYmd: string,
  weekdaySettings: Array<{ dayOfWeek: number; isClosed: boolean }> = []
): string {
  const base = fromYmd || getCairoNowParts().dateStr;
  for (let offset = 1; offset <= 14; offset++) {
    const candidate = addDaysToYmd(base, -offset);
    const [y, m, d] = candidate.split('-').map(Number);
    if (!y || !m || !d) continue;
    const dow = new Date(y, m - 1, d, 12, 0, 0).getDay();
    const setting = weekdaySettings.find(w => w.dayOfWeek === dow);
    if (!setting || !setting.isClosed) {
      return candidate;
    }
  }
  return addDaysToYmd(base, -1);
}

/**
 * Formats 24h time string "HH:mm" to 12h AM/PM representation e.g. "02:00 PM"
 */
export function formatCairoTime(time24: string): string {
  if (!time24) return '';
  return parseTimeTo12h(time24).formatted;
}

const ARABIC_WEEKDAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * Returns the Arabic weekday name (e.g. "الأحد", "الإثنين") for a YYYY-MM-DD or ISO date string.
 */
export function getArabicWeekdayName(dateInput?: string): string {
  if (!dateInput) return '';
  const trimmed = dateInput.trim();
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    if (y && m && d) {
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      return ARABIC_WEEKDAY_NAMES[dt.getDay()] || '';
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const cairo = getCairoNowParts(parsed);
    return ARABIC_WEEKDAY_NAMES[cairo.weekday] || '';
  }
  return '';
}

/**
 * Formats any 24h or 12h time string to Arabic 12-hour period ("05:30 مساءً" / "10:00 صباحاً").
 */
export function formatTimeToArabicPeriod(timeStr?: string): string {
  if (!timeStr || !timeStr.trim()) return '';
  const trimmed = timeStr.trim();
  if (trimmed.includes('صباحاً') || trimmed.includes('مساءً')) {
    return trimmed;
  }
  if (trimmed.includes('ص') && !trimmed.includes('AM') && !trimmed.includes('PM')) {
    return trimmed.replace(/ص/g, 'صباحاً').trim();
  }
  if (trimmed.includes('م') && !trimmed.includes('AM') && !trimmed.includes('PM')) {
    return trimmed.replace(/م/g, 'مساءً').trim();
  }
  const parsed = parseTimeTo12h(trimmed);
  const periodLabel = parsed.period === 'PM' ? 'مساءً' : 'صباحاً';
  return `${parsed.hour12}:${parsed.minute} ${periodLabel}`;
}

/**
 * Parses either an ISO datetime string or a YYYY-MM-DD date string safely in local time.
 */
function parseDateSafe(dateInput: string): number {
  if (!dateInput) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).getTime();
  }
  return new Date(dateInput).getTime();
}

/**
 * Formats relative time in Arabic (e.g., "منذ 15 دقيقة", "منذ ساعتين", "أمس", "منذ ٣ شهور")
 */
export function formatRelativeTimeArabic(dateIso: string): string {
  const ts = parseDateSafe(dateIso);
  if (isNaN(ts)) return '';
  const diffMs = Date.now() - ts;
  if (diffMs < 0) {
    const futureDays = Math.ceil(Math.abs(diffMs) / 86400000);
    if (futureDays === 0) return 'اليوم';
    if (futureDays === 1) return 'غداً';
    return `بعد ${futureDays} يوم`;
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'الآن';
  if (diffMin === 1) return 'منذ دقيقة';
  if (diffMin === 2) return 'منذ دقيقتين';
  if (diffMin < 11) return `منذ ${diffMin} دقائق`;
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHour === 1) return 'منذ ساعة';
  if (diffHour === 2) return 'منذ ساعتين';
  if (diffHour < 11) return `منذ ${diffHour} ساعات`;
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  if (diffDay === 1) return 'أمس';
  if (diffDay === 2) return 'أول أمس';
  if (diffDay < 7) return `منذ ${diffDay} أيام`;
  if (diffWeek === 1) return 'منذ أسبوع';
  if (diffWeek === 2) return 'منذ أسبوعين';
  if (diffDay < 30) return `منذ ${diffWeek} أسابيع`;
  if (diffMonth === 1) return 'منذ شهر';
  if (diffMonth === 2) return 'منذ شهرين';
  if (diffMonth < 11) return `منذ ${diffMonth} أشهر`;
  if (diffDay < 365) return `منذ ${diffMonth} شهراً`;
  if (diffYear === 1) return 'منذ سنة';
  if (diffYear === 2) return 'منذ سنتين';
  if (diffYear < 11) return `منذ ${diffYear} سنوات`;
  return `منذ ${diffYear} سنة`;
}

/**
 * Formats calendar-day relative time in Arabic between a YYYY-MM-DD date and a reference YYYY-MM-DD date.
 * Examples: "اليوم", "منذ يوم", "منذ يومين", "منذ 3 أيام", "منذ أسبوع", "منذ أسبوعين", "منذ 3 أسابيع", "منذ شهر"
 */
export function formatRelativeCalendarDaysArabic(dateInput: string, referenceYmd?: string): string {
  const cleanTarget = (dateInput || '').trim().slice(0, 10);
  const targetMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanTarget);
  if (!targetMatch) return formatRelativeTimeArabic(dateInput);

  const refStr = (referenceYmd || getCairoNowParts().dateStr).trim().slice(0, 10);
  const refMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refStr);
  if (!refMatch) return formatRelativeTimeArabic(dateInput);

  const targetUtc = Date.UTC(Number(targetMatch[1]), Number(targetMatch[2]) - 1, Number(targetMatch[3]));
  const refUtc = Date.UTC(Number(refMatch[1]), Number(refMatch[2]) - 1, Number(refMatch[3]));
  const diffDay = Math.round((refUtc - targetUtc) / 86400000);

  if (diffDay < 0) {
    const futureDays = Math.abs(diffDay);
    if (futureDays === 1) return 'غداً';
    if (futureDays === 2) return 'بعد يومين';
    return `بعد ${futureDays} أيام`;
  }
  if (diffDay === 0) return 'اليوم';
  if (diffDay === 1) return 'منذ يوم';
  if (diffDay === 2) return 'منذ يومين';
  if (diffDay < 7) return `منذ ${diffDay} أيام`;

  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek === 1) return 'منذ أسبوع';
  if (diffWeek === 2) return 'منذ أسبوعين';
  if (diffDay < 30) return `منذ ${diffWeek} أسابيع`;

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth === 1) return 'منذ شهر';
  if (diffMonth === 2) return 'منذ شهرين';
  if (diffMonth < 11) return `منذ ${diffMonth} أشهر`;
  if (diffDay < 365) return `منذ ${diffMonth} شهراً`;

  const diffYear = Math.floor(diffDay / 365);
  if (diffYear === 1) return 'منذ سنة';
  if (diffYear === 2) return 'منذ سنتين';
  if (diffYear < 11) return `منذ ${diffYear} سنوات`;
  return `منذ ${diffYear} سنة`;
}

/**
 * Returns Tailwind badge color classes based on recency of the given timestamp/date.
 */
export function getRelativeTimeBadgeClass(dateIso: string): string {
  const ts = parseDateSafe(dateIso);
  if (isNaN(ts)) return 'bg-slate-100 text-slate-600 border-slate-200';
  const diffHours = (Date.now() - ts) / 3600000;
  if (diffHours <= 24) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (diffHours <= 24 * 7) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (diffHours <= 24 * 30) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

export const CLINIC_ATTENDANCE_RADIUS_METERS = 50;

/**
 * Computes distance in meters between two GPS lat/lng coordinates (Haversine formula).
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Strict 50m geofence verification for shift clock-in / clock-out.
 * Blocks attendance unless branch coordinates are set and user is within <= 50m.
 */
export function verifyUnitGeofence(unit?: {
  name?: string;
  latitude?: number;
  longitude?: number;
  allowedRadiusMeters?: number;
}): Promise<{ ok: boolean; error?: string; distanceMeters?: number; maxRadiusMeters?: number }> {
  if (!unit || unit.latitude == null || unit.longitude == null) {
    return Promise.resolve({
      ok: false,
      error: `لم يتم تحديد الموقع الجغرافي لـ ${unit?.name || 'العيادة'}. يرجى من الإدارة ضبط موقع العيادة في الإعدادات أولاً.`
    });
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      error: 'المتصفح لا يدعم تحديد الموقع الجغرافي (GPS)'
    });
  }
  const lat = unit.latitude;
  const lng = unit.longitude;
  const maxRadius = Math.min(
    CLINIC_ATTENDANCE_RADIUS_METERS,
    Math.max(10, unit.allowedRadiusMeters || CLINIC_ATTENDANCE_RADIUS_METERS)
  );

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = calculateDistanceMeters(pos.coords.latitude, pos.coords.longitude, lat, lng);
        if (dist > maxRadius) {
          resolve({
            ok: false,
            error: `أنت خارج حدود ${unit.name || 'العيادة'}.`,
            distanceMeters: dist,
            maxRadiusMeters: maxRadius
          });
        } else {
          resolve({
            ok: true,
            distanceMeters: dist,
            maxRadiusMeters: maxRadius
          });
        }
      },
      () => {
        resolve({
          ok: false,
          error: 'يرجى السماح بالوصول إلى الموقع (GPS) لتسجيل الحضور والانصراف من داخل العيادة'
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}
