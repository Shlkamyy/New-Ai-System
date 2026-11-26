import React, { useState, useEffect, useMemo } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Bell,
  Clock,
  Smartphone,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BellRing,
  Check,
  Send,
  Users,
  History,
  Search,
  Trash2,
  UserCheck,
  Eye,
  LogIn,
  LogOut,
  MapPin
} from 'lucide-react';
import { formatCairoTime, formatRelativeTimeArabic, getCairoNowParts } from '../utils/arabic';
import {
  getAlertNotificationChannel,
  getDueStaffAppointmentAlerts,
  getDueStaffShiftAlerts,
  getEffectiveMobilePushChannel
} from '../utils/staffAlerts';
import { isIOSDevice, isStandalonePWA, sendImmediateTestPush } from '../utils/webPush';
import { NotificationChannelMode, StaffAlertTargetMode } from '../types/clinic';

export const StaffAlertsView: React.FC = () => {
  const {
    appointments,
    attendance,
    staffMembers,
    staffAlertSettings,
    staffAlertLogs,
    updateStaffAlertSettings,
    updateAppointmentStatus,
    currentUser,
    setStaffAlertSnoozeUntil,
    scheduleTestNotificationInOneMinute,
    testNotificationTriggerAt,
    isTestNotificationDue,
    dismissTestNotification,
    webPushReady,
    refreshWebPushSubscription,
    setActiveView,
    goToPatient,
    deleteStaffAlertLog,
    clearStaffAlertLogs,
    units,
    weekdaySettings,
    triggerShiftActionFromAlert,
    openAttendanceShiftEdit
  } = useClinic();

  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'active' | 'snoozed' | 'resolved' | 'dismissed'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'appointment' | 'shift' | 'test'>('all');
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [testNoticeMsg, setTestNoticeMsg] = useState<string>('');
  const [isSendingNow, setIsSendingNow] = useState<boolean>(false);
  const [shiftActionBusy, setShiftActionBusy] = useState<'shift_start' | 'shift_end' | null>(null);
  const [shiftInlineMsg, setShiftInlineMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    const intervalMs = testNotificationTriggerAt && !isTestNotificationDue ? 1000 : 15000;
    const id = window.setInterval(() => setNowTick(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [testNotificationTriggerAt, isTestNotificationDue]);

  const activeStaffList = useMemo(
    () => staffMembers.filter(s => !s.isDisabled),
    [staffMembers]
  );

  const dueAlerts = getDueStaffAppointmentAlerts(
    appointments,
    staffAlertSettings,
    currentUser,
    new Date(nowTick)
  );
  const dueShiftAlerts = getDueStaffShiftAlerts(
    currentUser,
    attendance,
    staffAlertSettings,
    new Date(nowTick),
    units,
    weekdaySettings
  );
  const totalDueCount = dueAlerts.length + dueShiftAlerts.length + (isTestNotificationDue ? 1 : 0);
  const testSecondsLeft =
    testNotificationTriggerAt && !isTestNotificationDue
      ? Math.max(0, Math.ceil((testNotificationTriggerAt - nowTick) / 1000))
      : 0;

  const presetMinutes = [5, 10, 15, 20, 30, 45, 60];

  const apptChannel = getAlertNotificationChannel(staffAlertSettings, 'appointment');
  const shiftChannel = getAlertNotificationChannel(staffAlertSettings, 'shift');
  const apptTargetMode: StaffAlertTargetMode = staffAlertSettings.appointmentTargetMode || 'all';
  const shiftTargetMode: StaffAlertTargetMode = staffAlertSettings.shiftTargetMode || 'all';
  const apptTargetStaffIds = staffAlertSettings.appointmentTargetStaffIds || [];
  const shiftTargetStaffIds = staffAlertSettings.shiftTargetStaffIds || [];

  const handleRequestMobilePermission = async (): Promise<boolean> => {
    setTestNoticeMsg('');
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setNotifPermission('unsupported');
      setTestNoticeMsg(
        isIOSDevice() && !isStandalonePWA()
          ? 'على الآيفون: يرجى تثبيت التطبيق على الشاشة الرئيسية أولاً (مشاركة -> إضافة للشاشة الرئيسية) ثم فتحه لتفعيل إشعارات الخلفية.'
          : 'المتصفح الحالي لا يدعم إشعارات الخلفية (Web Push).'
      );
      return false;
    }
    try {
      const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        const subscribed = await refreshWebPushSubscription();
        if (subscribed) {
          setTestNoticeMsg('تم تفعيل إشعارات الموبايل والخلفية بنجاح — ستصل الإشعارات حتى لو كان الموقع مغلقاً.');
          return true;
        }
        setTestNoticeMsg('تم السماح بالإشعارات ولكن تعذر ربط خدمة الخلفية (تأكد من الاتصال بالإنترنت أو إعادة فتح التطبيق المثبت).');
        return false;
      } else {
        setTestNoticeMsg('لم يتم السماح بالإشعارات من المتصفح — يرجى تفعيل الإذن من إعدادات المتصفح/الجهاز.');
        return false;
      }
    } catch {
      setTestNoticeMsg('تعذر طلب إذن الإشعارات في هذا المتصفح.');
      return false;
    }
  };

  const handleItemChannelChange = async (
    itemType: 'appointment' | 'shift',
    channel: NotificationChannelMode
  ) => {
    if (itemType === 'appointment') {
      updateStaffAlertSettings({ appointmentNotificationChannel: channel });
    } else {
      updateStaffAlertSettings({ shiftNotificationChannel: channel });
    }
    if (channel === 'mobile_and_website') {
      await handleRequestMobilePermission();
    }
  };

  const toggleTargetStaff = (itemType: 'appointment' | 'shift', staffId: string) => {
    const currentIds = itemType === 'appointment' ? apptTargetStaffIds : shiftTargetStaffIds;
    const exists = currentIds.includes(staffId);
    const nextIds = exists ? currentIds.filter(id => id !== staffId) : [...currentIds, staffId];
    if (itemType === 'appointment') {
      updateStaffAlertSettings({ appointmentTargetMode: 'specific', appointmentTargetStaffIds: nextIds });
    } else {
      updateStaffAlertSettings({ shiftTargetMode: 'specific', shiftTargetStaffIds: nextIds });
    }
  };

  const handleSendImmediatePush = async () => {
    setTestNoticeMsg('');
    setIsSendingNow(true);
    try {
      if (notifPermission !== 'granted') {
        const ok = await handleRequestMobilePermission();
        if (!ok) return;
      }
      const res = await sendImmediateTestPush({
        staffId: currentUser.id,
        staffName: currentUser.name,
        notificationChannel: getEffectiveMobilePushChannel(staffAlertSettings)
      });
      if (res.ok) {
        setTestNoticeMsg('تم إرسال إشعار الخلفية الفوري بنجاح — تحقق من شريط إشعارات الموبايل/الجهاز.');
      } else {
        setTestNoticeMsg('تعذر إرسال إشعار الخلفية الفوري: ' + (res.error || 'يرجى المحاولة مرة أخرى'));
      }
    } finally {
      setIsSendingNow(false);
    }
  };

  const filteredAlertLogs = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return staffAlertLogs.filter(log => {
      if (historyStatusFilter !== 'all' && log.status !== historyStatusFilter) return false;
      if (historyTypeFilter === 'appointment' && log.alertType !== 'appointment') return false;
      if (historyTypeFilter === 'shift' && log.alertType !== 'shift_start' && log.alertType !== 'shift_end') {
        return false;
      }
      if (historyTypeFilter === 'test' && log.alertType !== 'test') return false;
      if (q) {
        const hay = [
          log.title,
          log.message,
          log.patientName || '',
          log.lastInteractionBy || '',
          log.lastInteractionLabel || '',
          ...(log.interactions || []).map(i => `${i.staffName} ${i.actionLabel}`)
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [staffAlertLogs, historySearch, historyStatusFilter, historyTypeFilter]);

  const formatTimestampAr = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const parts = getCairoNowParts(d);
    return `${parts.dateStr} · ${formatCairoTime(parts.timeStr)}`;
  };

  const renderChannelSelector = (
    itemType: 'appointment' | 'shift',
    selectedChannel: NotificationChannelMode
  ) => (
    <div className="space-y-2.5 pt-3 border-t border-slate-100">
      <label className="block text-xs font-extrabold text-[#172f3d]">
        مكان وصول الإشعار (الويبسايت فقط أم الموبايل والويبسايت)
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => handleItemChannelChange(itemType, 'website_only')}
          className={`p-3 rounded-2xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
            selectedChannel === 'website_only'
              ? 'bg-[#e7f5f2] border-[#087e83] ring-2 ring-[#087e83]/15'
              : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              selectedChannel === 'website_only'
                ? 'bg-[#087e83] text-white'
                : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#172f3d]">الويبسايت فقط</span>
              {selectedChannel === 'website_only' && <Check className="w-4 h-4 text-[#087e83]" />}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              يظهر كبابل داخل الموقع من الجرس العلوي فقط.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleItemChannelChange(itemType, 'mobile_and_website')}
          className={`p-3 rounded-2xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
            selectedChannel === 'mobile_and_website'
              ? 'bg-[#e7f5f2] border-[#087e83] ring-2 ring-[#087e83]/15'
              : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              selectedChannel === 'mobile_and_website'
                ? 'bg-[#087e83] text-white'
                : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#172f3d]">الموبايل والويبسايت</span>
              {selectedChannel === 'mobile_and_website' && <Check className="w-4 h-4 text-[#087e83]" />}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              يرسل إشعاراً على الموبايل والمتصفح بجانب الجرس داخل الموقع.
            </p>
          </div>
        </button>
      </div>

      {selectedChannel === 'mobile_and_website' && (
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-start gap-2 text-slate-700 font-semibold">
            <BellRing className="w-4 h-4 text-[#087e83] flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div>
                حالة إشعارات الجهاز:{' '}
                {notifPermission === 'granted' ? (
                  <span className="text-emerald-700 font-extrabold">
                    {webPushReady ? 'مسموح ويعمل في الخلفية والموقع مغلق' : 'مسموح (جاري ربط الخلفية...)'}
                  </span>
                ) : notifPermission === 'denied' ? (
                  <span className="text-rose-700 font-extrabold">محظور من المتصفح</span>
                ) : notifPermission === 'unsupported' ? (
                  <span className="text-amber-700 font-extrabold">
                    {isIOSDevice() && !isStandalonePWA()
                      ? 'يتطلب تثبيت التطبيق PWA على الشاشة الرئيسية للآيفون'
                      : 'غير مدعوم في هذا المتصفح'}
                  </span>
                ) : (
                  <span className="text-amber-700 font-extrabold">في انتظار السماح</span>
                )}
              </div>
              {notifPermission === 'granted' && webPushReady && (
                <div className="text-[11px] text-emerald-700 font-medium">
                  ✓ هذا الجهاز مشترك في إشعارات الخلفية بأولوية عالية (Web Push + اهتزاز قوي).
                </div>
              )}
            </div>
          </div>
          {notifPermission !== 'unsupported' && (notifPermission !== 'granted' || !webPushReady) && (
            <button
              type="button"
              onClick={handleRequestMobilePermission}
              className="px-3 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-[11px] cursor-pointer self-start sm:self-center flex-shrink-0"
            >
              {notifPermission === 'granted' ? 'ربط إشعارات الخلفية' : 'تفعيل إشعارات الموبايل'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderStaffTargetSelector = (
    itemType: 'appointment' | 'shift',
    targetMode: StaffAlertTargetMode,
    targetIds: string[]
  ) => (
    <div className="space-y-2.5 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-extrabold text-[#172f3d] flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[#087e83]" />
          <span>يظهر هذا الإشعار لمين من الموظفين؟</span>
        </label>
        {targetMode === 'specific' && (
          <span className="text-[11px] font-bold text-[#087e83] bg-[#e7f5f2] px-2.5 py-0.5 rounded-lg">
            محدد: {targetIds.length} من {activeStaffList.length}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() =>
            itemType === 'appointment'
              ? updateStaffAlertSettings({ appointmentTargetMode: 'all' })
              : updateStaffAlertSettings({ shiftTargetMode: 'all' })
          }
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
            targetMode === 'all'
              ? 'bg-[#087e83] text-white border-[#087e83]'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#087e83]'
          }`}
        >
          جميع الموظفين (الكل)
        </button>

        <button
          type="button"
          onClick={() =>
            itemType === 'appointment'
              ? updateStaffAlertSettings({ appointmentTargetMode: 'specific' })
              : updateStaffAlertSettings({ shiftTargetMode: 'specific' })
          }
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
            targetMode === 'specific'
              ? 'bg-[#087e83] text-white border-[#087e83]'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#087e83]'
          }`}
        >
          موظفين محددين
        </button>
      </div>

      {targetMode === 'specific' && (
        <div className="p-3 rounded-2xl bg-[#f8fbfa] border border-[#dce8eb] space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
            <span className="font-bold text-slate-500">اختر الموظفين المستهدفين لهذا التنبيه:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allIds = activeStaffList.map(s => s.id);
                  if (itemType === 'appointment') {
                    updateStaffAlertSettings({ appointmentTargetStaffIds: allIds });
                  } else {
                    updateStaffAlertSettings({ shiftTargetStaffIds: allIds });
                  }
                }}
                className="font-bold text-[#087e83] hover:underline cursor-pointer"
              >
                تحديد الكل
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => {
                  if (itemType === 'appointment') {
                    updateStaffAlertSettings({ appointmentTargetStaffIds: [] });
                  } else {
                    updateStaffAlertSettings({ shiftTargetStaffIds: [] });
                  }
                }}
                className="font-bold text-rose-600 hover:underline cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeStaffList.map(member => {
              const checked = targetIds.includes(member.id);
              return (
                <label
                  key={member.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    checked
                      ? 'bg-white border-[#087e83] shadow-xs'
                      : 'bg-white/60 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTargetStaff(itemType, member.id)}
                    className="w-4 h-4 accent-[#087e83] rounded cursor-pointer flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-[#172f3d] truncate">{member.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {member.jobTitle}
                      {itemType === 'shift' && member.shiftStartTime && member.shiftEndTime
                        ? ` · ${formatCairoTime(member.shiftStartTime)} - ${formatCairoTime(member.shiftEndTime)}`
                        : ''}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {targetIds.length === 0 && (
            <div className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              لم يتم اختيار أي موظف حالياً — لن يظهر هذا التنبيه لأي حساب حتى تحدد موظفاً واحداً على الأقل.
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-[#172f3d]">تنبيهات الموظف</h1>
            <p className="text-xs text-slate-500">
              إدارة الإشعارات التلقائية وتحديد الموظفين المستهدفين وسجل التفاعلات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <button
            type="button"
            disabled={isSendingNow}
            onClick={handleSendImmediatePush}
            className="px-3 py-1.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border border-[#bfe2db] font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSendingNow ? 'جاري الإرسال...' : 'إشعار فوري'}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                await handleRequestMobilePermission();
              } else if (!webPushReady) {
                await refreshWebPushSubscription();
              }
              scheduleTestNotificationInOneMinute();
              setNowTick(Date.now());
              setTestNoticeMsg('تم جدولة إشعار تجريبي على السيرفر — يمكنك إغلاق الموقع الآن وسيصلك الإشعار خلال ٦٠ ثانية.');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>
              {testSecondsLeft > 0
                ? `متبقي ${testSecondsLeft} ثانية للإشعار...`
                : 'جرب إشعار بعد دقيقة (والموقع مغلق)'}
            </span>
          </button>

          <span
            className={`text-xs font-extrabold px-3 py-1.5 rounded-xl border ${
              totalDueCount > 0
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {totalDueCount > 0 ? `${totalDueCount} تنبيه نشط الآن` : 'لا توجد تنبيهات معلقة حالياً'}
          </span>
        </div>
      </div>

      {/* Admin Tabs: Settings vs Historical Alert & Interaction Log */}
      {isAdmin && (
        <div className="bg-white border border-[#dce8eb] rounded-2xl p-1.5 shadow-sm inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#087e83] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>إعدادات التنبيهات والتنبيهات النشطة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#087e83] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل التنبيهات والتفاعلات</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'history'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#e7f5f2] text-[#087e83]'
              }`}
            >
              {staffAlertLogs.length}
            </span>
          </button>
        </div>
      )}

      {isTestNotificationDue && (
        <div className="p-4 rounded-3xl bg-emerald-50 border border-emerald-300 flex items-center justify-between gap-3 flex-wrap shadow-sm">
          <div className="flex items-center gap-2.5 text-emerald-900">
            <BellRing className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <div className="text-sm font-extrabold">إشعار تجريبي بعد دقيقة</div>
              <div className="text-xs text-emerald-800">وصل التنبيه التجريبي بنجاح ويعمل الآن!</div>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissTestNotification}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
          >
            تم الاستلام (إغلاق)
          </button>
        </div>
      )}

      {testNoticeMsg && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span>{testNoticeMsg}</span>
        </div>
      )}

      {(!isAdmin || activeTab === 'settings') ? (
        <div className="space-y-5">
          {/* Item Card 1: Overdue Appointment Follow-up Alert */}
          <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-extrabold text-[#172f3d]">
                      ١. متابعة حالة الموعد بعد وقته المحدد
                    </h2>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        staffAlertSettings.appointmentFollowUpEnabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {staffAlertSettings.appointmentFollowUpEnabled ? 'مفعل' : 'متوقف'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  updateStaffAlertSettings({
                    appointmentFollowUpEnabled: !staffAlertSettings.appointmentFollowUpEnabled
                  })
                }
                className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                  staffAlertSettings.appointmentFollowUpEnabled ? 'bg-[#087e83]' : 'bg-slate-300'
                }`}
                aria-label="تفعيل أو إيقاف تنبيه متابعة المواعيد"
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    staffAlertSettings.appointmentFollowUpEnabled ? 'left-1' : 'right-1'
                  }`}
                />
              </button>
            </div>

            {/* Delay Minutes Configuration */}
            <div className="space-y-3">
              <label className="block text-xs font-extrabold text-[#172f3d]">
                عدد الدقائق بعد ميعاد الحجز قبل ظهور التنبيه
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-[#f4f9f8] border border-[#cde3df] rounded-xl px-3 py-1.5">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={staffAlertSettings.appointmentDelayMinutes}
                    onChange={e => {
                      const val = Math.max(1, Math.min(480, Number(e.target.value) || 1));
                      updateStaffAlertSettings({ appointmentDelayMinutes: val });
                    }}
                    className="w-16 text-center font-mono font-extrabold text-sm text-[#087e83] bg-white border border-[#bfe2db] rounded-lg py-1 focus:outline-none focus:border-[#087e83]"
                  />
                  <span className="text-xs font-bold text-[#172f3d]">دقيقة</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {presetMinutes.map(min => {
                    const active = staffAlertSettings.appointmentDelayMinutes === min;
                    return (
                      <button
                        key={min}
                        type="button"
                        onClick={() => updateStaffAlertSettings({ appointmentDelayMinutes: min })}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#087e83] text-white border-[#087e83]'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#087e83]'
                        }`}
                      >
                        {min} د
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Staff Targeting for Appointment Alerts */}
            {renderStaffTargetSelector('appointment', apptTargetMode, apptTargetStaffIds)}

            {/* Delivery Channel for Appointment Alerts */}
            {renderChannelSelector('appointment', apptChannel)}

            {totalDueCount > 0 && (
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStaffAlertSnoozeUntil(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-xs font-bold cursor-pointer"
                >
                  إظهار البابل الآن
                </button>
              </div>
            )}
          </div>

          {/* Item Card 2: Shift Start & End Reminder */}
          <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db] flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-extrabold text-[#172f3d]">
                      ٢. تذكير الموظف ببدء وإنهاء الشفت
                    </h2>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        staffAlertSettings.shiftReminderEnabled !== false
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {staffAlertSettings.shiftReminderEnabled !== false ? 'مفعل' : 'متوقف'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    يُرسل تذكيراً تلقائياً متكرراً كل ٥ دقائق للموظف عند حلول ساعة بدء الشفت (حتى يسجل الحضور) وعند حلول ساعة انتهاء الشفت (حتى ينهي الشفت)، وإذا تجاوزت الساعة ١٢ منتصف الليل يُغلق الشفت تلقائياً مع إرسال إشعار للإدارة لتحديد وقت الانصراف الفعلي.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  updateStaffAlertSettings({
                    shiftReminderEnabled: !(staffAlertSettings.shiftReminderEnabled !== false)
                  })
                }
                className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                  staffAlertSettings.shiftReminderEnabled !== false ? 'bg-[#087e83]' : 'bg-slate-300'
                }`}
                aria-label="تفعيل أو إيقاف تذكير بدء وإنهاء الشفت"
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    staffAlertSettings.shiftReminderEnabled !== false ? 'left-1' : 'right-1'
                  }`}
                />
              </button>
            </div>

            {/* Staff Targeting for Shift Alerts */}
            {renderStaffTargetSelector('shift', shiftTargetMode, shiftTargetStaffIds)}

            {/* Delivery Channel for Shift Alerts */}
            {renderChannelSelector('shift', shiftChannel)}

            {(dueShiftAlerts.length > 0 || shiftInlineMsg) && (
              <div className="space-y-2 pt-3 border-t border-slate-100">
                {shiftInlineMsg && (
                  <div
                    className={`p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                      shiftInlineMsg.type === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    {shiftInlineMsg.type === 'error' ? (
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span>{shiftInlineMsg.text}</span>
                  </div>
                )}

                {dueShiftAlerts.map(sAlert => {
                  const isStart = sAlert.type === 'shift_start';
                  const isBusy = shiftActionBusy === sAlert.type;
                  return (
                    <div
                      key={sAlert.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 flex-wrap ${
                        isStart
                          ? 'border-[#bfe2db] bg-[#f4fbf9]'
                          : 'border-rose-200 bg-rose-50/70'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div
                          className={`text-xs font-extrabold ${
                            isStart ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {sAlert.title}
                        </div>
                        <div className="text-xs text-slate-700 font-semibold">{sAlert.message}</div>
                        {sAlert.unitName && (
                          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#087e83]" />
                            <span>
                              {isStart ? 'الفرع الافتراضي اليوم:' : 'فرع الشفت:'} {sAlert.unitName}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(shiftActionBusy)}
                        onClick={async () => {
                          setShiftInlineMsg(null);
                          setShiftActionBusy(sAlert.type);
                          const res = await triggerShiftActionFromAlert(sAlert.type, 'صفحة تنبيهات الموظف');
                          setShiftActionBusy(null);
                          if (!res.success && res.error) {
                            setShiftInlineMsg({ type: 'error', text: res.error });
                          } else {
                            setShiftInlineMsg({
                              type: 'success',
                              text: isStart
                                ? `تم بدء الشفت بنجاح (${res.unitName || ''})`
                                : `تم إنهاء الشفت بنجاح (${res.unitName || ''})`
                            });
                          }
                        }}
                        className={`px-3.5 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60 ${
                          isStart
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        {isBusy ? (
                          <MapPin className="w-3.5 h-3.5 animate-pulse" />
                        ) : isStart ? (
                          <LogIn className="w-3.5 h-3.5" />
                        ) : (
                          <LogOut className="w-3.5 h-3.5" />
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
              </div>
            )}
          </div>

          {/* Live Preview / Currently Due Appointments */}
          <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-extrabold text-[#172f3d] flex items-center justify-between">
              <span>المواعيد المستحقة للتنبيه حالياً (اليوم)</span>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83]">
                {dueAlerts.length}
              </span>
            </h3>

            {dueAlerts.length > 0 ? (
              <div className="space-y-2">
                {dueAlerts.map(appt => (
                  <div
                    key={appt.id}
                    className="p-3 rounded-2xl border border-amber-200 bg-amber-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-extrabold text-[#172f3d]">
                        معاد {appt.patientName}
                      </div>
                      <div className="text-[11px] text-slate-600 font-semibold mt-0.5">
                        الساعة {formatCairoTime(appt.time)} · {appt.doctorName} · {appt.unitName}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.id, 'completed', 'staff_alerts')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تمت الزيارة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(appt.id, 'no_show', 'staff_alerts')}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>لم تتم الزيارة</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                لا توجد مواعيد متأخرة عن وقتها تحتاج لمتابعة في هذه اللحظة.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Admin Tab: Historical Staff Alerts & Interaction Tracking */
        <div className="space-y-4">
          <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-[#172f3d] flex items-center gap-2">
                  <History className="w-4 h-4 text-[#087e83]" />
                  <span>أرشيف التنبيهات القديمة وتفاعلات الموظفين</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  متابعة كل تنبيه تم إطلاقه ومن قام بالرد عليه أو تأجيله أو إغلاقه بالوقت والتاريخ
                </p>
              </div>

              {staffAlertLogs.length > 0 && (
                <div>
                  {!confirmClearLogs ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearLogs(true)}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>مسح السجل بالكامل</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          clearStaffAlertLogs();
                          setConfirmClearLogs(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                      >
                        تأكيد المسح
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearLogs(false)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Search & Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="relative md:col-span-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="ابحث بالمريض، الموظف، أو التفاعل..."
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:bg-white focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <select
                value={historyTypeFilter}
                onChange={e => setHistoryTypeFilter(e.target.value as typeof historyTypeFilter)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
              >
                <option value="all">كل أنواع التنبيهات</option>
                <option value="appointment">تنبيهات المواعيد</option>
                <option value="shift">تذكيرات الشفت</option>
                <option value="test">التنبيهات التجريبية</option>
              </select>

              <select
                value={historyStatusFilter}
                onChange={e => setHistoryStatusFilter(e.target.value as typeof historyStatusFilter)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"
              >
                <option value="all">كل الحالات ({staffAlertLogs.length})</option>
                <option value="active">نشط بدون تفاعل</option>
                <option value="snoozed">مؤجل (Snooze 5 د)</option>
                <option value="resolved">تم التفاعل والتنفيذ</option>
                <option value="dismissed">تم الإغلاق</option>
              </select>
            </div>
          </div>

          {filteredAlertLogs.length > 0 ? (
            <div className="space-y-3">
              {filteredAlertLogs.map(log => {
                const statusBadge =
                  log.status === 'resolved'
                    ? { label: 'تم التفاعل والتنفيذ', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                    : log.status === 'snoozed'
                    ? { label: 'تم التأجيل (Snooze)', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
                    : log.status === 'dismissed'
                    ? { label: 'تم الاستلام والإغلاق', cls: 'bg-slate-100 text-slate-700 border-slate-200' }
                    : { label: 'نشط (بانتظار رد)', cls: 'bg-rose-50 text-rose-700 border-rose-200' };

                const typeLabel =
                  log.alertType === 'appointment'
                    ? 'متابعة موعد'
                    : log.alertType === 'shift_start'
                    ? 'بدء شفت'
                    : log.alertType === 'shift_end'
                    ? 'إنهاء شفت'
                    : 'إشعار تجريبي';

                const staffInteractions = (log.interactions || []).filter(i => i.staffId !== 'system');

                return (
                  <div
                    key={log.id}
                    className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-[#e7f5f2] text-[#087e83] border border-[#bfe2db]">
                            {typeLabel}
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                          {log.channel && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                              {log.channel === 'mobile_and_website' ? 'موبايل + ويبسايت' : 'ويبسايت فقط'}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-extrabold text-[#172f3d]">{log.title}</h3>
                        <p className="text-xs text-slate-600">{log.message}</p>
                        <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400 font-semibold pt-0.5">
                          <span>أُطلق: {formatTimestampAr(log.triggeredAt)} ({formatRelativeTimeArabic(log.triggeredAt)})</span>
                          {log.targetStaffNames && log.targetStaffNames.length > 0 && (
                            <span>المستهدفون: {log.targetStaffNames.join('، ')}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isAdmin && log.targetKey?.startsWith('shift_auto_end_') && (
                          <button
                            type="button"
                            onClick={() =>
                              openAttendanceShiftEdit(log.targetKey.slice('shift_auto_end_'.length))
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>تعديل وقت الانصراف</span>
                          </button>
                        )}
                        {log.patientId && (
                          <button
                            type="button"
                            onClick={() => goToPatient(log.patientId!)}
                            className="px-2.5 py-1.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>ملف المريض</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteStaffAlertLog(log.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="حذف من السجل"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Interactions Box */}
                    <div className="p-3 rounded-2xl bg-[#f8fbfa] border border-[#dce8eb] space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-[#172f3d]">
                        <span className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-[#087e83]" />
                          <span>تفاعلات الموظفين مع التنبيه</span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {staffInteractions.length > 0
                            ? `${staffInteractions.length} تفاعل`
                            : 'لم يتفاعل أحد بعد'}
                        </span>
                      </div>

                      {log.interactions && log.interactions.length > 0 && (
                        <div className="space-y-1.5">
                          {log.interactions.map(inter => {
                            const isSystem = inter.staffId === 'system';
                            return (
                              <div
                                key={inter.id}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs px-2.5 py-1.5 rounded-xl border ${
                                  isSystem
                                    ? 'bg-white/60 border-slate-200/80 text-slate-500'
                                    : 'bg-white border-[#cde3df] text-[#172f3d]'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-[#087e83]">{inter.staffName}:</span>
                                  <span className="font-bold">{inter.actionLabel}</span>
                                  {inter.source && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                      {inter.source}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 flex-shrink-0" dir="ltr">
                                  {formatTimestampAr(inter.timestamp)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-[#dce8eb] rounded-3xl p-10 text-center space-y-2">
              <History className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-500">
                {staffAlertLogs.length === 0
                  ? 'لا توجد تنبيهات مسجلة في الأرشيف حتى الآن'
                  : 'لا توجد نتائج مطابقة للبحث أو الفلتر المحدد'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
