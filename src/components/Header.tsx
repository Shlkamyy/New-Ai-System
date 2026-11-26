import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Menu,
  Search,
  Bell,
  CheckCircle2,
  XCircle,
  Settings,
  Clock,
  BellRing,
  LogIn,
  LogOut,
  MapPin,
  AlertCircle
} from 'lucide-react';
import { formatCairoTime, getCairoNowParts } from '../utils/arabic';
import {
  getAlertNotificationChannel,
  getDueStaffAppointmentAlerts,
  getDueStaffShiftAlerts,
  isMidnightAutoEndedAttendance
} from '../utils/staffAlerts';

const WhatsAppLogoIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`pointer-events-none ${className}`}
    aria-hidden="true"
  >
    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
  </svg>
);

/**
 * 1. الأزرار الأربعة الثابتة في أعلى الشاشة:
 * اليمين: السايد منيو + جرس تنبيهات الموظف
 * اليسار: تنبيهات واتساب + البحث الشامل
 */
export const PersistentActionButtons: React.FC<{
  containerClassName?: string;
  hideMenuButton?: boolean;
}> = ({ containerClassName = '', hideMenuButton = false }) => {
  const {
    setIsDrawerOpen,
    setIsGlobalSearchOpen,
    whatsappAlerts,
    setActiveView,
    appointments,
    attendance,
    staffAlertSettings,
    staffAlertSnoozeUntil,
    setStaffAlertSnoozeUntil,
    updateAppointmentStatus,
    currentUser,
    goToPatient,
    isTestNotificationDue,
    dismissTestNotification,
    staffMembers,
    units,
    weekdaySettings,
    triggerShiftActionFromAlert,
    recordStaffAlertTrigger,
    recordStaffAlertInteraction,
    staffAlertLogs,
    openAttendanceShiftEdit,
    isUnitAllowed,
    isPatientAllowed
  } = useClinic();

  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60000));
  const [showEmptyBubble, setShowEmptyBubble] = useState(false);
  const [shiftActionBusy, setShiftActionBusy] = useState<'shift_start' | 'shift_end' | null>(null);
  const [shiftBubbleError, setShiftBubbleError] = useState<{ type: 'shift_start' | 'shift_end'; text: string } | null>(null);
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const loggedTriggerKeysRef = useRef<Set<string>>(new Set());

  // Tick every 15 seconds but only trigger a re-render when the minute actually changes
  useEffect(() => {
    const id = window.setInterval(() => {
      const m = Math.floor(Date.now() / 60000);
      setNowMinute(prev => (prev === m ? prev : m));
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  // Precise wake-up timer when 5-minute snooze expires
  useEffect(() => {
    if (!staffAlertSnoozeUntil) return;
    const remaining = staffAlertSnoozeUntil - Date.now();
    if (remaining <= 0) {
      setStaffAlertSnoozeUntil(null);
      notifiedIdsRef.current.clear();
      return;
    }
    const timer = window.setTimeout(() => {
      setStaffAlertSnoozeUntil(null);
      notifiedIdsRef.current.clear();
      setNowMinute(Math.floor(Date.now() / 60000));
    }, remaining + 50);
    return () => window.clearTimeout(timer);
  }, [staffAlertSnoozeUntil, setStaffAlertSnoozeUntil]);

  const evalDate = useMemo(() => new Date(nowMinute * 60000), [nowMinute]);
  const evalDateStr = useMemo(() => getCairoNowParts(evalDate).dateStr, [evalDate]);

  const todayScopedAppointments = useMemo(
    () =>
      appointments.filter(
        a =>
          a.date === evalDateStr &&
          a.status !== 'cancelled' &&
          a.status !== 'no_show' &&
          a.status !== 'arrived' &&
          a.status !== 'completed' &&
          isUnitAllowed(a.unitId, a.unitName)
      ),
    [appointments, evalDateStr, isUnitAllowed]
  );

  const dueAlerts = useMemo(
    () =>
      getDueStaffAppointmentAlerts(
        todayScopedAppointments,
        staffAlertSettings,
        currentUser,
        evalDate
      ),
    [todayScopedAppointments, staffAlertSettings, currentUser, evalDate]
  );

  const allowedUnits = useMemo(
    () => units.filter(u => isUnitAllowed(u.id, u.name)),
    [units, isUnitAllowed]
  );

  const dueShiftAlerts = useMemo(
    () =>
      getDueStaffShiftAlerts(
        currentUser,
        attendance,
        staffAlertSettings,
        evalDate,
        allowedUnits,
        weekdaySettings
      ),
    [currentUser, attendance, staffAlertSettings, evalDate, allowedUnits, weekdaySettings]
  );

  const unresolvedMidnightAutoEndLogs = useMemo(() => {
    if (currentUser.role !== 'admin') return [];
    const activeStaffIds = new Set(staffMembers.filter(s => !s.isDisabled).map(s => s.id));
    return staffAlertLogs.filter(l => {
      if (l.status !== 'active' || typeof l.targetKey !== 'string' || !l.targetKey.startsWith('shift_auto_end_')) {
        return false;
      }
      const recId = l.targetKey.slice('shift_auto_end_'.length);
      const rec = attendance.find(a => a.id === recId);
      if (!rec || !isMidnightAutoEndedAttendance(rec)) return false;
      return activeStaffIds.has(rec.userId);
    });
  }, [currentUser.role, staffAlertLogs, attendance, staffMembers]);

  const nonShiftDueCount =
    dueAlerts.length + unresolvedMidnightAutoEndLogs.length + (isTestNotificationDue ? 1 : 0);
  const totalDueCount = nonShiftDueCount + dueShiftAlerts.length;

  const isSnoozed = staffAlertSnoozeUntil !== null && Date.now() < staffAlertSnoozeUntil;
  const shouldAutoShowBubble = nonShiftDueCount > 0 && !isSnoozed;
  const isBubbleOpen = shouldAutoShowBubble || showEmptyBubble;

  // Log due staff alerts once per key for Admin alert history & interaction tracking
  useEffect(() => {
    if (dueAlerts.length === 0 && dueShiftAlerts.length === 0) return;
    const apptChannel = getAlertNotificationChannel(staffAlertSettings, 'appointment');
    const shiftChannel = getAlertNotificationChannel(staffAlertSettings, 'shift');
    const activeStaff = staffMembers.filter(s => !s.isDisabled);

    dueAlerts.forEach(appt => {
      const key = `appt_${appt.id}`;
      if (loggedTriggerKeysRef.current.has(key)) return;
      loggedTriggerKeysRef.current.add(key);

      const targetIds =
        staffAlertSettings.appointmentTargetMode === 'specific'
          ? staffAlertSettings.appointmentTargetStaffIds || []
          : activeStaff.map(s => s.id);
      const targetNames = targetIds
        .map(id => staffMembers.find(s => s.id === id)?.name)
        .filter((n): n is string => Boolean(n));

      recordStaffAlertTrigger({
        targetKey: key,
        alertType: 'appointment',
        title: `معاد ${appt.patientName}`,
        message: `مر على الموعد المحدد (${formatCairoTime(appt.time)}) — ${appt.doctorName} · ${appt.unitName}`,
        patientId: appt.patientId,
        patientName: appt.patientName,
        appointmentId: appt.id,
        appointmentDate: appt.date,
        appointmentTime: appt.time,
        targetStaffIds: targetIds,
        targetStaffNames:
          staffAlertSettings.appointmentTargetMode === 'specific' ? targetNames : ['جميع الموظفين'],
        channel: apptChannel
      });
    });

    dueShiftAlerts.forEach(sAlert => {
      const key = sAlert.id;
      if (loggedTriggerKeysRef.current.has(key)) return;
      loggedTriggerKeysRef.current.add(key);

      recordStaffAlertTrigger({
        targetKey: key,
        alertType: sAlert.type,
        title: `${sAlert.title} — ${currentUser.name}`,
        message: sAlert.message,
        appointmentDate: evalDateStr,
        appointmentTime: sAlert.scheduledTime,
        targetStaffIds: [currentUser.id],
        targetStaffNames: [currentUser.name],
        channel: shiftChannel
      });
    });
  }, [dueAlerts, dueShiftAlerts, staffAlertSettings, staffMembers, currentUser.id, currentUser.name, evalDateStr, recordStaffAlertTrigger]);

  // Trigger mobile / browser Web Notification per item's delivery channel
  useEffect(() => {
    const apptMobile =
      getAlertNotificationChannel(staffAlertSettings, 'appointment') === 'mobile_and_website';
    const shiftMobile =
      getAlertNotificationChannel(staffAlertSettings, 'shift') === 'mobile_and_website';
    if (!apptMobile && !shiftMobile) return;
    if ((dueAlerts.length === 0 && dueShiftAlerts.length === 0) || isSnoozed) return;
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    type ExtendedNotificationOptions = NotificationOptions & {
      renotify?: boolean;
      vibrate?: number[];
      actions?: Array<{ action: string; title: string }>;
      data?: Record<string, unknown>;
    };

    const triggerWebNotification = (params: {
      title: string;
      body: string;
      tag: string;
      alertType: 'appointment' | 'shift_start' | 'shift_end';
      appointmentId?: string;
      view: 'staff_alerts' | 'attendance' | 'dashboard';
      url: string;
    }) => {
      const actions =
        params.alertType === 'appointment'
          ? [
              { action: 'completed', title: '🟢 تمت الزيارة' },
              { action: 'no_show', title: '🔴 لم تتم الزيارة' }
            ]
          : params.alertType === 'shift_start'
          ? [{ action: 'shift_start', title: '🟢 بدأ الشفت' }]
          : [{ action: 'shift_end', title: '🔴 إنهاء الشفت' }];

      const options: ExtendedNotificationOptions = {
        body: params.body,
        tag: params.tag,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        requireInteraction: true,
        renotify: true,
        silent: false,
        vibrate: [300, 120, 300, 120, 450],
        actions,
        data: {
          url: params.url,
          view: params.view,
          appointmentId: params.appointmentId || null,
          alertType: params.alertType
        }
      };
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then(reg => reg.showNotification(params.title, options))
          .catch(() => {
            try {
              new Notification(params.title, {
                body: params.body,
                tag: params.tag,
                icon: '/pwa-192x192.png',
                requireInteraction: true,
                silent: false
              });
            } catch {}
          });
      } else {
        try {
          new Notification(params.title, {
            body: params.body,
            tag: params.tag,
            icon: '/pwa-192x192.png',
            requireInteraction: true,
            silent: false
          });
        } catch {}
      }
    };

    if (apptMobile) {
      dueAlerts.forEach(appt => {
        if (notifiedIdsRef.current.has(appt.id)) return;
        notifiedIdsRef.current.add(appt.id);
        triggerWebNotification({
          title: `معاد ${appt.patientName}`,
          body: `مر على الموعد المحدد (${formatCairoTime(appt.time)}) — يرجى تحديد تمت الزيارة أم لم تتم`,
          tag: `staff_alert_${appt.id}`,
          alertType: 'appointment',
          appointmentId: appt.id,
          view: 'staff_alerts',
          url: '/?view=staff_alerts'
        });
      });
    }

    if (shiftMobile) {
      dueShiftAlerts.forEach(sAlert => {
        const shiftNotifKey = `${sAlert.id}_step_${sAlert.reminderStep}`;
        if (notifiedIdsRef.current.has(shiftNotifKey)) return;
        notifiedIdsRef.current.add(shiftNotifKey);
        triggerWebNotification({
          title: sAlert.title,
          body: sAlert.message,
          tag: `staff_shift_${sAlert.id}`,
          alertType: sAlert.type,
          view: 'dashboard',
          url: '/?view=dashboard'
        });
      });
    }
  }, [
    dueAlerts,
    dueShiftAlerts,
    isSnoozed,
    staffAlertSettings.notificationChannel,
    staffAlertSettings.appointmentNotificationChannel,
    staffAlertSettings.shiftNotificationChannel
  ]);

  const handleStaffBellClick = () => {
    if (nonShiftDueCount > 0) {
      if (isSnoozed) {
        setStaffAlertSnoozeUntil(null);
      } else {
        setStaffAlertSnoozeUntil(Date.now() + 5 * 60 * 1000);
        dueAlerts.forEach(appt => {
          recordStaffAlertInteraction({
            targetKey: `appt_${appt.id}`,
            action: 'snoozed',
            actionLabel: 'تم تأجيل التنبيه لمدة 5 دقائق (Snooze)',
            newStatus: 'snoozed',
            source: 'جرس التنبيهات'
          });
        });
      }
      setShowEmptyBubble(false);
    } else {
      setShowEmptyBubble(prev => !prev);
    }
  };

  const pendingAlertsCount = useMemo(
    () =>
      whatsappAlerts.filter(
        a => (a.status === 'pending' || a.status === 'opened') && isPatientAllowed(a.patientId)
      ).length,
    [whatsappAlerts, isPatientAllowed]
  );

  const btnBaseClass =
    'relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl bg-white/95 hover:bg-white active:bg-slate-100 dark:bg-[#16242f]/95 dark:hover:bg-[#1d2f3d] text-[#087e83] dark:text-[#2dd4bf] shadow-md shadow-slate-900/5 border border-slate-200/90 dark:border-[#23394a] backdrop-blur-md transition-transform active:scale-95 flex-shrink-0 cursor-pointer pointer-events-auto touch-manipulation select-none [-webkit-tap-highlight-color:transparent]';

  return (
    <div
      className={`relative flex items-center justify-between pointer-events-none ${containerClassName}`}
      aria-label="أزرار التحكم العلوية الثابتة"
    >
      {/* الجانب الأيمن: زر السايد منيو + زر جرس تنبيهات الموظف */}
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto relative">
        {/* 1. زر السايد منيو (يظهر في الموبايل والتابلت فقط) */}
        {!hideMenuButton && (
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className={btnBaseClass}
            aria-label="فتح القائمة الجانبية"
            title="فتح القائمة الجانبية (السايد منيو)"
          >
            <Menu className="w-5 h-5 stroke-[2.3] pointer-events-none" />
          </button>
        )}

        {/* 2. زر جرس تنبيهات الموظف */}
        <button
          type="button"
          onClick={handleStaffBellClick}
          className={`${btnBaseClass} ${
            nonShiftDueCount > 0 && !isSnoozed
              ? 'ring-2 ring-amber-400/70 border-amber-300'
              : ''
          }`}
          aria-label="تنبيهات الموظف"
          title={
            nonShiftDueCount > 0
              ? isSnoozed
                ? 'إظهار التنبيهات المؤجلة'
                : 'تأجيل التنبيه لمدة 5 دقائق'
              : 'تنبيهات الموظف'
          }
        >
          <Bell
            className={`w-5 h-5 stroke-[2.3] pointer-events-none ${
              nonShiftDueCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''
            }`}
          />
          {nonShiftDueCount > 0 && (
            <span className="pointer-events-none absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-[#dc2626] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-[#121e27] shadow-sm animate-pulse">
              {nonShiftDueCount}
            </span>
          )}
        </button>

        {/* بابل تنبيهات الموظف المنبثقة تلقائياً من الجرس */}
        {isBubbleOpen && (
          <div
            role="alertdialog"
            aria-label="تنبيهات الموظف"
            className="pointer-events-auto absolute top-[calc(100%+10px)] right-0 w-[min(320px,calc(100vw-24px))] bg-white dark:bg-[#121e27] border-2 border-[#087e83]/40 dark:border-[#2dd4bf]/40 rounded-3xl shadow-2xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            {/* مثلث البابل يشير مباشرة إلى زر الجرس */}
            <div
              className={`absolute -top-2 ${
                hideMenuButton ? 'right-[14px] sm:right-[15px]' : 'right-[59px] sm:right-[67px]'
              } w-3.5 h-3.5 rotate-45 bg-white dark:bg-[#121e27] border-t-2 border-l-2 border-[#087e83]/40 dark:border-[#2dd4bf]/40`}
              aria-hidden="true"
            />

            <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-[#087e83] dark:text-[#2dd4bf]" />
                <span className="text-xs font-extrabold text-[#172f3d] dark:text-white">
                  تنبيهات الموظف
                </span>
              </div>
              {nonShiftDueCount > 0 ? (
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                  اضغط الجرس للتأجيل 5 د
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  {currentUser.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmptyBubble(false);
                        setActiveView('staff_alerts');
                      }}
                      className="text-[10px] font-bold text-[#087e83] dark:text-[#2dd4bf] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Settings className="w-3 h-3" />
                      <span>الإعدادات</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowEmptyBubble(false)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer px-1"
                    aria-label="إغلاق"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {totalDueCount > 0 ? (
              <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-0.5">
                {isTestNotificationDue && (
                  <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800">
                      <BellRing className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>إشعار تجريبي بعد دقيقة</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 font-semibold">
                      وصل التنبيه التجريبي بنجاح! نظام تنبيهات الموظف يعمل الآن.
                    </p>
                    <button
                      type="button"
                      onClick={dismissTestNotification}
                      className="w-full py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                    >
                      تم الاستلام (إغلاق)
                    </button>
                  </div>
                )}

                {unresolvedMidnightAutoEndLogs.map(autoLog => {
                  const recId = autoLog.targetKey.slice('shift_auto_end_'.length);
                  return (
                    <div
                      key={autoLog.id}
                      className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-amber-900 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <span>{autoLog.title}</span>
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-white text-amber-800 border border-amber-200">
                          ١٢ منتصف الليل
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 font-semibold leading-snug">
                        {autoLog.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowEmptyBubble(false);
                          openAttendanceShiftEdit(recId);
                        }}
                        className="w-full py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer touch-manipulation"
                      >
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>تحديد وقت الانصراف الفعلي</span>
                      </button>
                    </div>
                  );
                })}

                {dueShiftAlerts.map(sAlert => {
                  const isStart = sAlert.type === 'shift_start';
                  const isBusy = shiftActionBusy === sAlert.type;
                  const errForThis =
                    shiftBubbleError?.type === sAlert.type ? shiftBubbleError.text : null;

                  return (
                    <div
                      key={sAlert.id}
                      className={`p-2.5 rounded-2xl border space-y-2 ${
                        isStart
                          ? 'bg-[#f0f9f8] border-[#bfe2db]'
                          : 'bg-rose-50/70 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-extrabold flex items-center gap-1 ${
                            isStart ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>{sAlert.title}</span>
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold bg-white px-1.5 py-0.5 rounded-lg border ${
                            isStart
                              ? 'text-emerald-700 border-emerald-200'
                              : 'text-rose-700 border-rose-200'
                          }`}
                          dir="ltr"
                        >
                          {formatCairoTime(sAlert.scheduledTime)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-700 font-semibold leading-snug">
                        {sAlert.message}
                      </p>

                      {sAlert.unitName && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600">
                          <MapPin className="w-3 h-3 text-[#087e83] flex-shrink-0" />
                          <span>
                            {isStart ? 'الفرع الافتراضي اليوم:' : 'فرع الشفت الحالي:'}{' '}
                            <strong className="text-[#172f3d]">{sAlert.unitName}</strong>
                          </span>
                        </div>
                      )}

                      {errForThis && (
                        <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span>{errForThis}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={Boolean(shiftActionBusy)}
                        onClick={async () => {
                          setShiftBubbleError(null);
                          setShiftActionBusy(sAlert.type);
                          const res = await triggerShiftActionFromAlert(sAlert.type, 'بابل الجرس');
                          setShiftActionBusy(null);
                          if (!res.success && res.error) {
                            setShiftBubbleError({ type: sAlert.type, text: res.error });
                          } else {
                            setShowEmptyBubble(false);
                          }
                        }}
                        className={`w-full py-2 px-2.5 rounded-xl text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-60 touch-manipulation ${
                          isStart
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        {isBusy ? (
                          <MapPin className="w-3.5 h-3.5 animate-pulse flex-shrink-0" />
                        ) : isStart ? (
                          <LogIn className="w-3.5 h-3.5 flex-shrink-0" />
                        ) : (
                          <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                        <span>
                          {isBusy
                            ? 'جاري التحقق من الموقع...'
                            : isStart
                            ? 'بدأ الشفت'
                            : 'إنهاء الشفت'}
                        </span>
                      </button>
                    </div>
                  );
                })}

                {dueAlerts.map(appt => (
                  <div
                    key={appt.id}
                    className="p-2.5 rounded-2xl bg-[#f7fbfa] dark:bg-[#16242f] border border-[#dce8eb] dark:border-[#23394a] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => goToPatient(appt.patientId)}
                        className="text-right text-xs font-extrabold text-[#172f3d] dark:text-white hover:text-[#087e83] leading-snug cursor-pointer"
                      >
                        معاد {appt.patientName}
                      </button>
                      <span
                        className="text-[10px] font-mono font-bold text-[#087e83] dark:text-[#2dd4bf] bg-white dark:bg-[#0e171f] px-1.5 py-0.5 rounded-lg border border-[#dce8eb] dark:border-[#23394a] flex-shrink-0"
                        dir="ltr"
                      >
                        {formatCairoTime(appt.time)}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      {appt.doctorName} · {appt.unitName}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.id, 'completed')}
                        className="py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-xs transition-transform cursor-pointer touch-manipulation"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 pointer-events-none" />
                        <span>تمت الزيارة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.id, 'no_show')}
                        className="py-2 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-xs transition-transform cursor-pointer touch-manipulation"
                      >
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0 pointer-events-none" />
                        <span>لم تتم الزيارة</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-slate-500 dark:text-slate-400 font-semibold">
                لا توجد تنبيهات نشطة الآن.
              </div>
            )}
          </div>
        )}
      </div>

      {/* الجانب الأيسر (تم التبديل): تنبيهات الواتساب أولاً بأيقونة واتساب + البحث الشامل */}
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        {/* 3. زر تنبيهات الواتساب (بأيقونة واتساب) */}
        <button
          type="button"
          onClick={() => setActiveView('whatsapp')}
          className={btnBaseClass}
          title="التنبيهات ورسائل واتساب"
          aria-label="رسائل واتساب"
        >
          <WhatsAppLogoIcon className="w-5 h-5 text-[#10b981]" />
          {pendingAlertsCount > 0 && (
            <span className="pointer-events-none absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-[#dc2626] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-[#121e27] shadow-sm animate-pulse">
              {pendingAlertsCount}
            </span>
          )}
        </button>

        {/* 4. زر البحث الشامل */}
        <button
          type="button"
          onClick={() => setIsGlobalSearchOpen(true)}
          className={btnBaseClass}
          title="بحث شامل عن مريض أو ملاحظة"
          aria-label="البحث الشامل"
        >
          <Search className="w-5 h-5 stroke-[2.3] pointer-events-none" />
        </button>
      </div>
    </div>
  );
};

/**
 * 2. لوجو د. شلقامي في المنتصف
 * يظهر في أول الصفحة ويختفي مع السكرول (غير مثبت) حتى لا يضايق العرض
 */
export const DrShlkamyLogo: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  const { setActiveView } = useClinic();

  return (
    <div
      onClick={() => setActiveView('dashboard')}
      className={`inline-flex items-center justify-center gap-2 cursor-pointer select-none group transition-opacity hover:opacity-90 ${className}`}
      title="الرجوع للرئيسية - Dr Shlkamy"
    >
      {/* Dental Tooth Logo Badge */}
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-[#087e83] via-[#0b9399] to-[#12a19c] p-0.5 shadow-md shadow-[#087e83]/20 flex-shrink-0 group-hover:scale-105 transition-transform">
        <div className="w-full h-full bg-white dark:bg-[#121e27] rounded-[14px] flex items-center justify-center text-[#087e83] dark:text-[#2dd4bf]">
          <svg viewBox="0 0 48 48" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 6c-5 0-9 4-9 10 0 5 3 8 4 14 1 7 4 12 8 12 2 0 3-4 4-9 1-4 2-5 3-5s2 1 3 5c1 5 2 9 4 9 4 0 7-5 8-12 1-6 4-9 4-14 0-6-4-10-9-10-5 0-7 3-10 3s-5-3-10-3Z"/>
          </svg>
        </div>
      </div>

      {/* Brand Text: Dr Shlkamy */}
      <span className="font-signature text-2xl sm:text-3xl text-[#087e83] dark:text-[#2dd4bf] leading-none whitespace-nowrap" dir="ltr">
        Dr Shlkamy
      </span>
    </div>
  );
};

/**
 * 3. المكون المجمع الافتراضي Header (للتوافق)
 */
export const Header: React.FC = () => {
  return (
    <div className="w-full relative px-3 pt-2 pb-2">
      <PersistentActionButtons />
      <div className="-mt-10 flex justify-center items-center pointer-events-auto">
        <DrShlkamyLogo />
      </div>
    </div>
  );
};
