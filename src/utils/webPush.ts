import {
  Appointment,
  AttendanceRecord,
  ClinicUnit,
  StaffAlertSettings,
  StaffMember,
  WeekdaySetting
} from '../types/clinic';
import { addDaysToYmd, formatCairoTime, getCairoNowParts } from './arabic';
import {
  getAlertNotificationChannel,
  getEffectiveMobilePushChannel,
  isStaffExemptFromAttendanceOnDate,
  isStaffTargetedForAlert,
  parseAppointmentMinutes24,
  resolveEmployeeDefaultUnitForToday
} from './staffAlerts';

const DEVICE_ID_STORAGE_KEY = 'clinicflow_push_device_id';

export function getOrCreatePushDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `dev_${crypto.randomUUID()}`
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `dev_fallback_${Date.now()}`;
  }
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Converts a YYYY-MM-DD date and minutes-from-midnight in Africa/Cairo timezone
 * into an exact UTC epoch millisecond timestamp.
 */
export function cairoDateTimeToEpochMs(dateStr: string, minutesFromMidnight: number): number {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return Date.now();
  const wholeMinutes = Math.round(minutesFromMidnight);
  const dayOffset = Math.floor(wholeMinutes / 1440);
  const modMinutes = ((wholeMinutes % 1440) + 1440) % 1440;
  const targetHour = Math.floor(modMinutes / 60);
  const targetMin = modMinutes % 60;

  // Start with a UTC+2 guess and refine using actual Cairo Intl parts
  const baseUtc = Date.UTC(y, m - 1, d + dayOffset, targetHour, targetMin, 0);
  let guess = baseUtc - 2 * 3600 * 1000;

  for (let i = 0; i < 2; i++) {
    const parts = getCairoNowParts(new Date(guess));
    const shownUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const diffMs = baseUtc - shownUtc;
    if (diffMs === 0) break;
    guess += diffMs;
  }

  return guess;
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existingReg = await navigator.serviceWorker.getRegistration('/');
    if (!existingReg) {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function ensurePushSubscription(
  staffId: string,
  staffName: string,
  notificationChannel: 'website_only' | 'mobile_and_website'
): Promise<{ ok: boolean; subscription?: PushSubscription; deviceId: string; reason?: string }> {
  const deviceId = getOrCreatePushDeviceId();
  if (!isWebPushSupported()) {
    return {
      ok: false,
      deviceId,
      reason: isIOSDevice() && !isStandalonePWA() ? 'ios_needs_pwa' : 'unsupported'
    };
  }

  if (Notification.permission !== 'granted') {
    return { ok: false, deviceId, reason: 'permission_not_granted' };
  }

  try {
    const reg = await getReadyServiceWorkerRegistration();
    if (!reg || !reg.pushManager) {
      return { ok: false, deviceId, reason: 'no_sw' };
    }

    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) {
      return { ok: false, deviceId, reason: 'server_unavailable' };
    }
    const { publicKey } = (await keyRes.json()) as { publicKey?: string };
    if (!publicKey) {
      return { ok: false, deviceId, reason: 'missing_vapid' };
    }

    const expectedKeyBytes = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();

    if (sub && sub.options?.applicationServerKey) {
      const currentKeyBytes = new Uint8Array(sub.options.applicationServerKey);
      if (!uint8ArraysEqual(currentKeyBytes, expectedKeyBytes)) {
        try {
          await sub.unsubscribe();
        } catch {}
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKeyBytes
      });
    }

    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        staffId,
        staffName,
        subscription: sub.toJSON(),
        notificationChannel
      })
    });

    if (!subRes.ok) {
      return { ok: false, deviceId, reason: 'subscribe_failed' };
    }

    return { ok: true, subscription: sub, deviceId };
  } catch (err) {
    console.warn('[WebPush] ensurePushSubscription error:', err);
    return { ok: false, deviceId, reason: 'subscribe_error' };
  }
}

export interface PendingPushAlertPayload {
  alertId: string;
  type: 'appointment' | 'shift_start' | 'shift_end';
  title: string;
  body: string;
  tag: string;
  view: string;
  url: string;
  appointmentId?: string;
  triggerAtMs: number;
}

export function buildPendingPushAlerts(params: {
  appointments: Appointment[];
  attendance: AttendanceRecord[];
  staffAlertSettings: StaffAlertSettings;
  currentUser: StaffMember;
  units?: ClinicUnit[];
  weekdaySettings?: WeekdaySetting[];
  nowDate?: Date;
}): { pendingAlerts: PendingPushAlertPayload[]; resolvedAppointmentIds: string[] } {
  const {
    appointments,
    attendance,
    staffAlertSettings,
    currentUser,
    units,
    weekdaySettings,
    nowDate = new Date()
  } = params;
  const cairo = getCairoNowParts(nowDate);
  const todayStr = cairo.dateStr;
  const tomorrowStr = addDaysToYmd(todayStr, 1);

  const pendingAlerts: PendingPushAlertPayload[] = [];
  const resolvedAppointmentIds: string[] = [];

  const apptPushEnabled =
    staffAlertSettings.appointmentFollowUpEnabled &&
    getAlertNotificationChannel(staffAlertSettings, 'appointment') === 'mobile_and_website' &&
    isStaffTargetedForAlert(
      currentUser.id,
      staffAlertSettings.appointmentTargetMode,
      staffAlertSettings.appointmentTargetStaffIds
    );

  const delayMinutes = Math.max(1, Number(staffAlertSettings.appointmentDelayMinutes) || 15);
  for (const appt of appointments) {
    if (appt.date !== todayStr && appt.date !== tomorrowStr) continue;

    const isResolved =
      appt.status === 'cancelled' ||
      appt.status === 'no_show' ||
      appt.status === 'arrived' ||
      appt.status === 'completed';

    if (isResolved) {
      resolvedAppointmentIds.push(appt.id);
      continue;
    }

    if (!apptPushEnabled) continue;

    if (currentUser.role !== 'admin' && currentUser.restrictedBranchId) {
      if (appt.unitId !== currentUser.restrictedBranchId) continue;
    }

    if (currentUser.permissions?.appointmentsOwnOnly) {
      if (!currentUser.doctorId || appt.doctorId !== currentUser.doctorId) continue;
    }

    const startMin = parseAppointmentMinutes24(appt.time);
    if (startMin === null) continue;

    const triggerAtMs = cairoDateTimeToEpochMs(appt.date, startMin + delayMinutes);
    pendingAlerts.push({
      alertId: `appt_${appt.id}`,
      type: 'appointment',
      title: `معاد ${appt.patientName}`,
      body: `مر على الموعد المحدد (${formatCairoTime(appt.time)}) — يرجى تحديد تمت الزيارة أم لم تتم`,
      tag: `staff_alert_${appt.id}`,
      view: 'staff_alerts',
      url: '/?view=staff_alerts',
      appointmentId: appt.id,
      triggerAtMs
    });
  }

  const shiftPushEnabled =
    staffAlertSettings.shiftReminderEnabled !== false &&
    getAlertNotificationChannel(staffAlertSettings, 'shift') === 'mobile_and_website' &&
    isStaffTargetedForAlert(
      currentUser.id,
      staffAlertSettings.shiftTargetMode,
      staffAlertSettings.shiftTargetStaffIds
    );

  if (shiftPushEnabled) {
    const startStr = currentUser.shiftStartTime;
    const endStr = currentUser.shiftEndTime;
    const startMin = startStr ? parseAppointmentMinutes24(startStr) : null;
    const endMin = endStr ? parseAppointmentMinutes24(endStr) : null;
    const isOvernight = startMin !== null && endMin !== null && endMin <= startMin;
    const anyActiveShift = attendance.find(r => r.userId === currentUser.id && r.status === 'active');
    const nowMs = nowDate.getTime();
    const REPEAT_STEP_MIN = 5;
    const MAX_REPEAT_OFFSET_MIN = 120;

    for (const dayStr of [todayStr, tomorrowStr]) {
      if (isStaffExemptFromAttendanceOnDate(currentUser, dayStr)) continue;
      const dayRecords = attendance.filter(r => r.userId === currentUser.id && r.date === dayStr);
      const activeRecord = dayRecords.find(r => r.status === 'active');

      const dayNoonDate = new Date(cairoDateTimeToEpochMs(dayStr, 12 * 60));
      const defaultUnit =
        units && weekdaySettings
          ? resolveEmployeeDefaultUnitForToday(currentUser, units, weekdaySettings, dayNoonDate)
          : undefined;

      if (startStr && startMin !== null && dayRecords.length === 0 && !(dayStr === todayStr && anyActiveShift)) {
        const dayMidnightMs = cairoDateTimeToEpochMs(addDaysToYmd(dayStr, 1), 0);
        const startEpochMs = cairoDateTimeToEpochMs(dayStr, startMin);
        const currentBucket =
          nowMs >= startEpochMs
            ? Math.floor((nowMs - startEpochMs) / (REPEAT_STEP_MIN * 60_000)) * REPEAT_STEP_MIN
            : -1;

        for (let offset = 0; offset <= MAX_REPEAT_OFFSET_MIN; offset += REPEAT_STEP_MIN) {
          const triggerAtMs = cairoDateTimeToEpochMs(dayStr, startMin + offset);
          if (triggerAtMs >= dayMidnightMs) break;
          // Skip stale past slots except keep the current overdue 5-min bucket if within today
          if (triggerAtMs < nowMs - 4 * 60_000 && offset !== currentBucket) continue;
          pendingAlerts.push({
            alertId: `shift_start_${currentUser.id}_${dayStr}_m${offset}`,
            type: 'shift_start',
            title: 'تذكير بدء الشفت',
            body:
              offset === 0
                ? `حان موعد بدء الشفت (${formatCairoTime(startStr)})${defaultUnit?.name ? ` · ${defaultUnit.name}` : ''}`
                : `تذكير بدء الشفت — المقرر ${formatCairoTime(startStr)} (لم يتم تسجيل الحضور منذ ${offset} د)${defaultUnit?.name ? ` · ${defaultUnit.name}` : ''}`,
            tag: `staff_shift_start_${currentUser.id}_${dayStr}_m${offset}`,
            view: 'dashboard',
            url: '/?view=dashboard',
            triggerAtMs
          });
        }
      }

      if (endStr && endMin !== null && (activeRecord || dayStr === tomorrowStr)) {
        const endUnitName = activeRecord?.unitName || defaultUnit?.name;
        const endTargetDate = isOvernight ? addDaysToYmd(dayStr, 1) : dayStr;
        const endMidnightMs = cairoDateTimeToEpochMs(addDaysToYmd(endTargetDate, 1), 0);
        const endEpochMs = cairoDateTimeToEpochMs(endTargetDate, endMin);
        const currentBucket =
          nowMs >= endEpochMs
            ? Math.floor((nowMs - endEpochMs) / (REPEAT_STEP_MIN * 60_000)) * REPEAT_STEP_MIN
            : -1;

        for (let offset = 0; offset <= MAX_REPEAT_OFFSET_MIN; offset += REPEAT_STEP_MIN) {
          const triggerAtMs = cairoDateTimeToEpochMs(endTargetDate, endMin + offset);
          // Midnight auto-ends open shifts at 00:00, so stop shift-end push reminders at midnight
          if (triggerAtMs >= endMidnightMs) break;
          if (triggerAtMs < nowMs - 4 * 60_000 && offset !== currentBucket) continue;
          pendingAlerts.push({
            alertId: `shift_end_${currentUser.id}_${dayStr}_m${offset}`,
            type: 'shift_end',
            title: 'تذكير إنهاء الشفت',
            body:
              offset === 0
                ? `انتهى موعد الشفت (${formatCairoTime(endStr)}) — يرجى تسجيل الانصراف${endUnitName ? ` · ${endUnitName}` : ''}`
                : `تذكير إنهاء الشفت — انتهى منذ ${offset} د (${formatCairoTime(endStr)})${endUnitName ? ` · ${endUnitName}` : ''}`,
            tag: `staff_shift_end_${currentUser.id}_${dayStr}_m${offset}`,
            view: 'dashboard',
            url: '/?view=dashboard',
            triggerAtMs
          });
        }
      }
    }
  }

  return { pendingAlerts, resolvedAppointmentIds };
}

export async function syncPushScheduleToServer(params: {
  appointments: Appointment[];
  attendance: AttendanceRecord[];
  staffAlertSettings: StaffAlertSettings;
  currentUser: StaffMember;
  units?: ClinicUnit[];
  weekdaySettings?: WeekdaySetting[];
  subscription?: PushSubscription | null;
}): Promise<{ ok: boolean; subscribed: boolean }> {
  const { appointments, attendance, staffAlertSettings, currentUser, units, weekdaySettings, subscription } = params;
  const deviceId = getOrCreatePushDeviceId();
  const { pendingAlerts, resolvedAppointmentIds } = buildPendingPushAlerts({
    appointments,
    attendance,
    staffAlertSettings,
    currentUser,
    units,
    weekdaySettings
  });

  try {
    const res = await fetch('/api/push/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        staffId: currentUser.id,
        staffName: currentUser.name,
        subscription: subscription ? subscription.toJSON() : undefined,
        notificationChannel: getEffectiveMobilePushChannel(staffAlertSettings),
        pendingAlerts,
        resolvedAppointmentIds
      })
    });
    if (!res.ok) return { ok: false, subscribed: false };
    const data = (await res.json()) as { ok?: boolean; subscribed?: boolean };
    return { ok: Boolean(data.ok), subscribed: Boolean(data.subscribed) };
  } catch {
    return { ok: false, subscribed: false };
  }
}

export async function scheduleServerTestPush(params: {
  staffId: string;
  staffName: string;
  notificationChannel: 'website_only' | 'mobile_and_website';
  delayMs?: number;
  triggerAtMs?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const ensured = await ensurePushSubscription(
    params.staffId,
    params.staffName,
    params.notificationChannel
  );
  if (!ensured.ok || !ensured.subscription) {
    return { ok: false, reason: ensured.reason || 'not_subscribed' };
  }

  try {
    const res = await fetch('/api/push/schedule-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: ensured.deviceId,
        staffId: params.staffId,
        staffName: params.staffName,
        subscription: ensured.subscription.toJSON(),
        delayMs: params.delayMs ?? 60_000,
        triggerAtMs: params.triggerAtMs
      })
    });
    if (!res.ok) return { ok: false, reason: 'server_error' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export async function sendImmediateTestPush(params: {
  staffId: string;
  staffName: string;
  notificationChannel: 'website_only' | 'mobile_and_website';
}): Promise<{ ok: boolean; error?: string }> {
  const ensured = await ensurePushSubscription(
    params.staffId,
    params.staffName,
    params.notificationChannel
  );
  if (!ensured.ok || !ensured.subscription) {
    return { ok: false, error: ensured.reason || 'not_subscribed' };
  }

  try {
    const res = await fetch('/api/push/send-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: ensured.deviceId,
        staffId: params.staffId,
        staffName: params.staffName,
        subscription: ensured.subscription.toJSON()
      })
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'send_failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export async function sendStaffPushAlert(params: {
  targetStaffIds: string[];
  alertId: string;
  title: string;
  body: string;
  url?: string;
  view?: string;
}): Promise<void> {
  if (!params.targetStaffIds.length) return;
  try {
    await fetch('/api/push/notify-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
  } catch {
    // Non-blocking background push trigger
  }
}

