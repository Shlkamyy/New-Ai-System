import React, { useMemo, useState, useEffect } from 'react';
import {
  useClinic,
  DEFAULT_ROLE_PERMISSIONS,
  STAFF_ROLE_LABELS
} from '../context/ClinicContext';
import { ClinicColorListKey, ClinicUnit, StaffMember, StaffPermissions, StaffRole } from '../types/clinic';
import {
  Settings,
  Clock,
  Shield,
  UserCheck,
  Stethoscope,
  Building,
  RotateCcw,
  Check,
  CheckCircle2,
  Moon,
  Sun,
  Plus,
  Pencil,
  Trash2,
  Power,
  X,
  Share2,
  ClipboardCheck,
  Tag,
  Users,
  KeyRound,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Cloud,
  RefreshCw,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  ShieldAlert,
  TrendingDown,
  ListChecks,
  ArrowUp,
  ArrowDown,
  Palette,
  Home,
  CalendarCheck
} from 'lucide-react';

import { clearAllLargeDatasets } from '../utils/storage';
import { formatCairoTime, getCairoNowParts } from '../utils/arabic';
import { CLINIC_COLOR_PRESETS, getCustomColorBadgeStyle, getFollowUpStatusColorHex } from '../utils/colors';
import { DAY_OFF_UNIT_ID } from '../utils/staffAlerts';

export const SettingsView: React.FC = () => {
  const {
    doctors,
    addDoctor,
    updateDoctor,
    toggleDoctorDisabled,
    deleteDoctor,
    units,
    addUnit,
    updateUnit,
    toggleUnitDisabled,
    deleteUnit,
    weekdaySettings,
    updateWeekdaySetting,
    patients,
    listItemColors,
    setListItemColor,
    referralSources,
    addReferralSource,
    updateReferralSource,
    deleteReferralSource,
    reorderReferralSources,
    patientTags,
    addPatientTag,
    updatePatientTag,
    deletePatientTag,
    reorderPatientTags,
    expenseCategories,
    addExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory,
    reorderExpenseCategories,
    patientFollowUpStatuses,
    addPatientFollowUpStatus,
    updatePatientFollowUpStatus,
    deletePatientFollowUpStatus,
    reorderPatientFollowUpStatuses,
    patientRequiredFields,
    updatePatientRequiredFields,
    staffMembers,
    addStaffMember,
    updateStaffMember,
    toggleStaffDisabled,
    deleteStaffMember,
    toggleStaffAttendanceExempt,
    grantStaffAttendanceLeave,
    removeStaffAttendanceLeave,
    updateStaffPermission,
    applyRolePresetPermissions,
    currentUser,
    setCurrentUser,
    cairoTodayStr,
    darkMode,
    setDarkMode,
    clinicStartHour,
    clinicEndHour,
    updateClinicWorkingHours,
    cloudUser,
    cloudSynced,
    cloudError,
    cloudNeedsConsoleSetup,
    retryCloudConnect,
    pushLocalChangesToCloud
  } = useClinic();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const [cloudActionBusy, setCloudActionBusy] = useState(false);
  const [cloudActionMsg, setCloudActionMsg] = useState('');
  const [cloudActionErr, setCloudActionErr] = useState('');

  const handleRetryCloudConnect = async () => {
    setCloudActionErr('');
    setCloudActionMsg('');
    setCloudActionBusy(true);
    const res = await retryCloudConnect();
    setCloudActionBusy(false);
    if (!res.success) {
      setCloudActionErr(res.error || 'تعذر الاتصال بقاعدة البيانات السحابية');
    } else {
      setCloudActionMsg('تم الاتصال بقاعدة البيانات السحابية الموحدة بنجاح!');
      setTimeout(() => setCloudActionMsg(''), 3500);
    }
  };

  const handleForcePushCloud = async () => {
    setCloudActionErr('');
    setCloudActionMsg('');
    setCloudActionBusy(true);
    try {
      await pushLocalChangesToCloud();
      setCloudActionMsg('تمت مزامنة كافة التعديلات إلى قاعدة البيانات الرئيسية بنجاح!');
      setTimeout(() => setCloudActionMsg(''), 3500);
    } catch (err) {
      setCloudActionErr(err instanceof Error ? err.message : 'تعذر مزامنة التعديلات');
    } finally {
      setCloudActionBusy(false);
    }
  };

  type PermissionActionType = 'add' | 'edit' | 'delete' | 'view';

  interface PermissionItemMeta {
    key: keyof StaffPermissions;
    action: PermissionActionType;
    label: string;
    shortLabel: string;
    desc: string;
  }

  interface PermissionGroupMeta {
    id: string;
    title: string;
    items: PermissionItemMeta[];
  }

  const PERMISSION_GROUPS: PermissionGroupMeta[] = [
    {
      id: 'appointments',
      title: 'المواعيد والحجوزات',
      items: [
        { key: 'viewAppointments', action: 'view', label: 'عرض المواعيد', shortLabel: 'عرض', desc: 'الاطلاع على جدول وتقويم المواعيد' },
        { key: 'addAppointments', action: 'add', label: 'إضافة مواعيد', shortLabel: 'إضافة', desc: 'حجز موعد جديد في الجدول' },
        { key: 'editAppointments', action: 'edit', label: 'تعديل مواعيد', shortLabel: 'تعديل', desc: 'تغيير الوقت والمدة والحالة' },
        { key: 'deleteAppointments', action: 'delete', label: 'حذف مواعيد', shortLabel: 'حذف', desc: 'حذف الموعد نهائياً' },
        { key: 'appointmentsOwnOnly', action: 'view', label: 'مواعيده فقط', shortLabel: 'مواعيده فقط', desc: 'إظهار مواعيد الطبيب نفسه فقط' }
      ]
    },
    {
      id: 'patients',
      title: 'ملفات المرضى',
      items: [
        { key: 'viewPatients', action: 'view', label: 'عرض المرضى', shortLabel: 'عرض', desc: 'الاطلاع على سجل وملفات المرضى' },
        { key: 'addPatients', action: 'add', label: 'إضافة مرضى', shortLabel: 'إضافة', desc: 'فتح ملف مريض جديد' },
        { key: 'editPatients', action: 'edit', label: 'تعديل مرضى', shortLabel: 'تعديل', desc: 'تعديل البيانات الأساسية والتاجات' },
        { key: 'deletePatients', action: 'delete', label: 'حذف مرضى', shortLabel: 'حذف', desc: 'حذف ملف المريض نهائياً' },
        { key: 'patientsOwnOnly', action: 'view', label: 'إظهار مرضى الطبيب فقط', shortLabel: 'مرضاه فقط', desc: 'إظهار المرضى الذين لديهم موعد مسجل مع هذا الطبيب، مهما كانت حالة الموعد' }
      ]
    },
    {
      id: 'clinical',
      title: 'الملاحظات السريرية',
      items: [
        { key: 'viewClinicalNotes', action: 'view', label: 'عرض الملاحظات', shortLabel: 'عرض', desc: 'الاطلاع على الملاحظات السريرية' },
        { key: 'addClinicalNotes', action: 'add', label: 'إضافة ملاحظة سريرية', shortLabel: 'إضافة', desc: 'كتابة ملاحظة نصية أو تسجيل صوتي' },
        { key: 'editClinicalNotes', action: 'edit', label: 'تعديل الملاحظات والأسنان', shortLabel: 'تعديل', desc: 'تعديل الملاحظات ومخطط الأسنان' },
        { key: 'deleteClinicalNotes', action: 'delete', label: 'حذف ملاحظة سريرية', shortLabel: 'حذف', desc: 'حذف الملاحظات السريرية' },
        { key: 'hideAdminNotes', action: 'delete', label: 'إخفاء ملاحظات الأدمن', shortLabel: 'إخفاء ملاحظات الأدمن', desc: 'حجب الملاحظات السريرية التي كتبها الأدمن عن هذا الموظف' }
      ]
    },
    {
      id: 'billing',
      title: 'الفواتير والمدفوعات والتقارير',
      items: [
        { key: 'viewInvoicesPayments', action: 'view', label: 'عرض الفواتير والمدفوعات', shortLabel: 'عرض', desc: 'الاطلاع على الفواتير والمدفوعات' },
        { key: 'addInvoicesPayments', action: 'add', label: 'إضافة فواتير ودفعات', shortLabel: 'إضافة', desc: 'إصدار فاتورة واستلام دفعة' },
        { key: 'editInvoicesPayments', action: 'edit', label: 'تعديل الفواتير', shortLabel: 'تعديل', desc: 'تعديل البنود والخصم في الفاتورة' },
        { key: 'deleteInvoicesPayments', action: 'delete', label: 'حذف / إلغاء فواتير ودفعات', shortLabel: 'حذف', desc: 'إلغاء فاتورة أو سند قبض' },
        { key: 'viewFinancialReports', action: 'view', label: 'التقارير المالية', shortLabel: 'التقارير', desc: 'عرض ملخص الإيرادات والأرباح' }
      ]
    },
    {
      id: 'expenses',
      title: 'مصروفات العيادة',
      items: [
        { key: 'viewExpenses', action: 'view', label: 'عرض المصروفات', shortLabel: 'عرض', desc: 'الاطلاع على سجل مصروفات العيادة' },
        { key: 'addExpenses', action: 'add', label: 'إضافة مصروف', shortLabel: 'إضافة', desc: 'تسجيل بند مصروف جديد' },
        { key: 'editExpenses', action: 'edit', label: 'تعديل مصروف', shortLabel: 'تعديل', desc: 'تعديل مبلغ أو تفاصيل المصروف' },
        { key: 'deleteExpenses', action: 'delete', label: 'حذف مصروف', shortLabel: 'حذف', desc: 'حذف بند مصروف مسجل' }
      ]
    },
    {
      id: 'tasks',
      title: 'المهام اليومية',
      items: [
        { key: 'viewTasks', action: 'view', label: 'عرض المهام', shortLabel: 'عرض', desc: 'الاطلاع على قائمة المهام اليومية' },
        { key: 'addTasks', action: 'add', label: 'إضافة مهمة', shortLabel: 'إضافة', desc: 'إنشاء مهمة جديدة للفريق' },
        { key: 'editTasks', action: 'edit', label: 'تعديل / إنجاز مهمة', shortLabel: 'تعديل', desc: 'تعديل المهمة وتحديد الإنجاز' },
        { key: 'deleteTasks', action: 'delete', label: 'حذف مهمة', shortLabel: 'حذف', desc: 'حذف المهام نهائياً' }
      ]
    },
    {
      id: 'procedures',
      title: 'الإجراءات والأسعار',
      items: [
        { key: 'viewProcedures', action: 'view', label: 'عرض الإجراءات والأسعار', shortLabel: 'عرض', desc: 'الاطلاع على قائمة الخدمات والأسعار' },
        { key: 'addProcedures', action: 'add', label: 'إضافة إجراء', shortLabel: 'إضافة', desc: 'إضافة خدمة طبية جديدة' },
        { key: 'editProcedures', action: 'edit', label: 'تعديل إجراء / سعر', shortLabel: 'تعديل', desc: 'تعديل اسم أو سعر الإجراء' },
        { key: 'deleteProcedures', action: 'delete', label: 'حذف إجراء', shortLabel: 'حذف', desc: 'حذف إجراء من القائمة' }
      ]
    },
    {
      id: 'system',
      title: 'الشفتات وإعدادات العيادة',
      items: [
        { key: 'manualAttendance', action: 'edit', label: 'الحضور اليدوي', shortLabel: 'الحضور اليدوي', desc: 'تسجيل حضور استثنائي وخروج إداري' },
        { key: 'manageSettings', action: 'edit', label: 'إعدادات العيادة والصلاحيات', shortLabel: 'إعدادات العيادة', desc: 'تعديل الإعدادات وإدارة الموظفين' }
      ]
    }
  ];

  const PERMISSION_ITEMS = PERMISSION_GROUPS.flatMap(g =>
    g.items.map(item => ({ ...item, groupTitle: g.title }))
  );

  const actionPillColors: Record<PermissionActionType, { active: string; badge: string }> = {
    add: {
      active: 'bg-emerald-600 text-white border-emerald-600 shadow-2xs',
      badge: 'bg-emerald-100 text-emerald-800'
    },
    edit: {
      active: 'bg-blue-600 text-white border-blue-600 shadow-2xs',
      badge: 'bg-blue-100 text-blue-800'
    },
    delete: {
      active: 'bg-rose-600 text-white border-rose-600 shadow-2xs',
      badge: 'bg-rose-100 text-rose-800'
    },
    view: {
      active: 'bg-amber-600 text-white border-amber-600 shadow-2xs',
      badge: 'bg-amber-100 text-amber-800'
    }
  };

  // Current User / Admin Account Credentials State
  const [myUsername, setMyUsername] = useState(currentUser.username || '');
  const [myEmail, setMyEmail] = useState(
    currentUser.email || (currentUser.id === 'user_shlkamy' ? 'muhammed.shlkamy@gmail.com' : '')
  );
  const [myPassword, setMyPassword] = useState(currentUser.password || '');
  const [myRecoveryPin, setMyRecoveryPin] = useState(currentUser.recoveryPin || '');
  const [showMyPassword, setShowMyPassword] = useState(false);
  const [myCredsError, setMyCredsError] = useState('');
  const [myCredsSaved, setMyCredsSaved] = useState(false);

  useEffect(() => {
    setMyUsername(currentUser.username || '');
    setMyEmail(currentUser.email || (currentUser.id === 'user_shlkamy' ? 'muhammed.shlkamy@gmail.com' : ''));
    setMyPassword(currentUser.password || '');
    setMyRecoveryPin(currentUser.recoveryPin || '');
    setMyCredsError('');
  }, [currentUser.id, currentUser.username, currentUser.email, currentUser.password, currentUser.recoveryPin]);

  const handleSaveMyCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setMyCredsError('');
    setMyCredsSaved(false);

    const cleanUsername = myUsername.trim();
    const cleanEmail = myEmail.trim();
    const cleanPin = myRecoveryPin.trim();

    const cleanPassword = myPassword.trim();

    if (!cleanUsername || cleanUsername.length < 3) {
      setMyCredsError('اسم المستخدم يجب أن يكون ٣ أحرف على الأقل');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      setMyCredsError('كلمة المرور يجب أن تكون ٤ أحرف أو أرقام على الأقل');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setMyCredsError('يرجى إدخال بريد إلكتروني صحيح للاستعادة');
      return;
    }
    const duplicate = staffMembers.find(
      s => s.id !== currentUser.id && (s.username || '').trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      setMyCredsError(`اسم المستخدم "${cleanUsername}" مستخدم بالفعل لموظف آخر (${duplicate.name})`);
      return;
    }

    updateStaffMember(currentUser.id, {
      username: cleanUsername,
      password: cleanPassword,
      email: cleanEmail,
      recoveryPin: cleanPin || '2026'
    });
    setMyCredsSaved(true);
    setTimeout(() => setMyCredsSaved(false), 3500);
  };

  // Staff Roster CRUD State
  const [showAddStaffForm, setShowAddStaffForm] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRecoveryPin, setNewStaffRecoveryPin] = useState('');
  const [showNewStaffPassword, setShowNewStaffPassword] = useState(false);
  const [newStaffError, setNewStaffError] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('receptionist');
  const [newStaffJobTitle, setNewStaffJobTitle] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffBranch, setNewStaffBranch] = useState('عيادة ١ و ٢');
  const [newStaffShiftStart, setNewStaffShiftStart] = useState('');
  const [newStaffShiftEnd, setNewStaffShiftEnd] = useState('');
  const [newStaffDefaultUnitByDay, setNewStaffDefaultUnitByDay] = useState<Record<number, string>>({});
  const [newStaffRestrictedBranchId, setNewStaffRestrictedBranchId] = useState('');
  const [newStaffExemptAttendance, setNewStaffExemptAttendance] = useState(false);
  const [newStaffDoctorId, setNewStaffDoctorId] = useState('');
  const [newInlineDoctorSpecialty, setNewInlineDoctorSpecialty] = useState('');
  const [newInlineDoctorColor, setNewInlineDoctorColor] = useState('#087e83');
  const [newStaffPermissions, setNewStaffPermissions] = useState<StaffPermissions>({
    ...DEFAULT_ROLE_PERMISSIONS.receptionist
  });

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffUsername, setEditStaffUsername] = useState('');
  const [editStaffPassword, setEditStaffPassword] = useState('');
  const [editStaffEmail, setEditStaffEmail] = useState('');
  const [editStaffRecoveryPin, setEditStaffRecoveryPin] = useState('');
  const [showEditStaffPassword, setShowEditStaffPassword] = useState(false);
  const [editStaffError, setEditStaffError] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<StaffRole>('receptionist');
  const [editStaffJobTitle, setEditStaffJobTitle] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffBranch, setEditStaffBranch] = useState('');
  const [editStaffShiftStart, setEditStaffShiftStart] = useState('');
  const [editStaffShiftEnd, setEditStaffShiftEnd] = useState('');
  const [editStaffDefaultUnitByDay, setEditStaffDefaultUnitByDay] = useState<Record<number, string>>({});
  const [editStaffRestrictedBranchId, setEditStaffRestrictedBranchId] = useState('');
  const [editStaffExemptAttendance, setEditStaffExemptAttendance] = useState(false);
  const [editStaffDoctorId, setEditStaffDoctorId] = useState('');
  const [editInlineDoctorSpecialty, setEditInlineDoctorSpecialty] = useState('');
  const [editInlineDoctorColor, setEditInlineDoctorColor] = useState('#087e83');
  const [leaveDateByStaffId, setLeaveDateByStaffId] = useState<Record<string, string>>({});

  const [expandedPermissionsStaffId, setExpandedPermissionsStaffId] = useState<string | null>(null);
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string | null>(null);
  const [staffSavedMsg, setStaffSavedMsg] = useState('');

  const handleNewStaffRoleChange = (role: StaffRole) => {
    setNewStaffRole(role);
    setNewStaffPermissions({ ...DEFAULT_ROLE_PERMISSIONS[role] });
  };

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setNewStaffError('');
    setStaffSavedMsg('');
    if (!newStaffName.trim()) {
      setNewStaffError('يرجى إدخال اسم الموظف');
      return;
    }

    const cleanUsername = newStaffUsername.trim();
    const cleanPassword = newStaffPassword.trim();
    const cleanEmail = newStaffEmail.trim();
    if (!cleanUsername || cleanUsername.length < 3) {
      setNewStaffError('يرجى تحديد اسم مستخدم للموظف لا يقل عن ٣ أحرف');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      setNewStaffError('يرجى تحديد كلمة مرور للموظف لا تقل عن ٤ أحرف أو أرقام');
      return;
    }
    const duplicate = staffMembers.find(
      s => (s.username || '').trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      setNewStaffError(`اسم المستخدم "${cleanUsername}" مستخدم بالفعل للموظف (${duplicate.name})`);
      return;
    }

    const cleanedDayUnits: Record<number, string> = {};
    Object.entries(newStaffDefaultUnitByDay).forEach(([k, v]) => {
      if (v) cleanedDayUnits[Number(k)] = v;
    });

    const createdName = newStaffName.trim();
    const createdPhone = newStaffPhone.trim() || '01000000000';
    let resolvedDoctorId = newStaffDoctorId || undefined;
    if (newStaffDoctorId === '__create_new__') {
      const createdDoc = addDoctor({
        name: createdName,
        specialty: newInlineDoctorSpecialty.trim() || 'طب وجراحة الأسنان',
        phone: createdPhone,
        color: newInlineDoctorColor || '#087e83',
        isDisabled: false
      });
      resolvedDoctorId = createdDoc.id;
    }

    addStaffMember({
      name: createdName,
      username: cleanUsername,
      password: cleanPassword,
      email: cleanEmail || undefined,
      recoveryPin: newStaffRecoveryPin.trim() || undefined,
      role: newStaffRole,
      jobTitle: newStaffJobTitle.trim() || STAFF_ROLE_LABELS[newStaffRole],
      phone: createdPhone,
      branchName: newStaffBranch.trim() || 'عيادة ١ و ٢',
      shiftStartTime: newStaffShiftStart.trim() || undefined,
      shiftEndTime: newStaffShiftEnd.trim() || undefined,
      defaultUnitByDay: Object.keys(cleanedDayUnits).length > 0 ? cleanedDayUnits : undefined,
      restrictedBranchId: newStaffRestrictedBranchId || undefined,
      exemptFromAttendance: newStaffExemptAttendance,
      doctorId: resolvedDoctorId,
      isDisabled: false,
      permissions: { ...newStaffPermissions }
    });
    setStaffSavedMsg(`تم حفظ الموظف "${createdName}" باسم المستخدم (@${cleanUsername}) بنجاح!`);
    setTimeout(() => setStaffSavedMsg(''), 5000);
    setNewStaffName('');
    setNewStaffUsername('');
    setNewStaffPassword('');
    setNewStaffEmail('');
    setNewStaffRecoveryPin('');
    setShowNewStaffPassword(false);
    setNewStaffError('');
    setNewStaffRole('receptionist');
    setNewStaffJobTitle('');
    setNewStaffPhone('');
    setNewStaffBranch('عيادة ١ و ٢');
    setNewStaffShiftStart('');
    setNewStaffShiftEnd('');
    setNewStaffDefaultUnitByDay({});
    setNewStaffRestrictedBranchId('');
    setNewStaffExemptAttendance(false);
    setNewStaffDoctorId('');
    setNewInlineDoctorSpecialty('');
    setNewInlineDoctorColor('#087e83');
    setNewStaffPermissions({ ...DEFAULT_ROLE_PERMISSIONS.receptionist });
    setShowAddStaffForm(false);
  };

  const startEditStaff = (s: StaffMember) => {
    setEditingStaffId(s.id);
    setEditStaffName(s.name);
    setEditStaffUsername(s.username || '');
    setEditStaffPassword(s.password || '');
    setEditStaffEmail(s.email || '');
    setEditStaffRecoveryPin(s.recoveryPin || '');
    setShowEditStaffPassword(false);
    setEditStaffError('');
    setEditStaffRole(s.role);
    setEditStaffJobTitle(s.jobTitle);
    setEditStaffPhone(s.phone);
    setEditStaffBranch(s.branchName || '');
    setEditStaffShiftStart(s.shiftStartTime || '');
    setEditStaffShiftEnd(s.shiftEndTime || '');
    setEditStaffDefaultUnitByDay({ ...(s.defaultUnitByDay || {}) });
    setEditStaffRestrictedBranchId(s.restrictedBranchId || '');
    setEditStaffExemptAttendance(Boolean(s.exemptFromAttendance));
    setEditStaffDoctorId(s.doctorId || '');
    setEditInlineDoctorSpecialty('');
    setEditInlineDoctorColor('#087e83');
    setConfirmDeleteStaffId(null);
  };

  const handleSaveEditStaff = (e: React.FormEvent, member: StaffMember) => {
    e.preventDefault();
    setEditStaffError('');
    if (!editStaffName.trim()) return;

    const cleanUsername = editStaffUsername.trim();
    const cleanPassword = editStaffPassword.trim();
    if (!cleanUsername || cleanUsername.length < 3) {
      setEditStaffError('اسم المستخدم يجب أن يكون ٣ أحرف على الأقل');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      setEditStaffError('كلمة المرور يجب أن تكون ٤ أحرف أو أرقام على الأقل');
      return;
    }
    const duplicate = staffMembers.find(
      s => s.id !== member.id && (s.username || '').trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      setEditStaffError(`اسم المستخدم "${cleanUsername}" مستخدم بالفعل للموظف (${duplicate.name})`);
      return;
    }

    const cleanedDayUnits: Record<number, string> = {};
    Object.entries(editStaffDefaultUnitByDay).forEach(([k, v]) => {
      if (v) cleanedDayUnits[Number(k)] = v;
    });

    const resolvedName = editStaffName.trim();
    const resolvedPhone = editStaffPhone.trim();
    let resolvedDoctorId: string | undefined = editStaffDoctorId || undefined;
    if (editStaffDoctorId === '__create_new__') {
      const createdDoc = addDoctor({
        name: resolvedName,
        specialty: editInlineDoctorSpecialty.trim() || 'طب وجراحة الأسنان',
        phone: resolvedPhone || '01000000000',
        color: editInlineDoctorColor || '#087e83',
        isDisabled: false
      });
      resolvedDoctorId = createdDoc.id;
    }

    const roleChanged = member.role !== editStaffRole;
    updateStaffMember(member.id, {
      name: resolvedName,
      username: cleanUsername,
      password: cleanPassword,
      email: editStaffEmail.trim() || undefined,
      recoveryPin: editStaffRecoveryPin.trim() || undefined,
      role: editStaffRole,
      jobTitle: editStaffJobTitle.trim() || STAFF_ROLE_LABELS[editStaffRole],
      phone: resolvedPhone,
      branchName: editStaffBranch.trim(),
      shiftStartTime: editStaffShiftStart.trim() || undefined,
      shiftEndTime: editStaffShiftEnd.trim() || undefined,
      defaultUnitByDay: Object.keys(cleanedDayUnits).length > 0 ? cleanedDayUnits : undefined,
      restrictedBranchId: editStaffRestrictedBranchId || undefined,
      exemptFromAttendance: editStaffExemptAttendance,
      doctorId: resolvedDoctorId
    });
    if (member.id === currentUser.id) {
      setMyUsername(cleanUsername);
      setMyPassword(cleanPassword);
      setMyEmail(editStaffEmail.trim());
      setMyRecoveryPin(editStaffRecoveryPin.trim());
    }
    if (roleChanged) {
      applyRolePresetPermissions(member.id, editStaffRole);
    }
    setStaffSavedMsg(`تم تحديث بيانات الموظف "${resolvedName}" (@${cleanUsername}) بنجاح!`);
    setTimeout(() => setStaffSavedMsg(''), 5000);
    setEditingStaffId(null);
  };

  // Shared List Reorder & Color Picker State
  const [openColorPickerKey, setOpenColorPickerKey] = useState<string | null>(null);

  const moveArrayItem = <T,>(arr: T[], index: number, delta: -1 | 1): T[] => {
    const target = index + delta;
    if (index < 0 || target < 0 || target >= arr.length) return arr;
    const copy = [...arr];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    return copy;
  };

  const renderItemColorPalette = (listKey: ClinicColorListKey, itemName: string, pickerKey: string) => {
    if (openColorPickerKey !== pickerKey) return null;
    const currentColor = listItemColors?.[listKey]?.[itemName];
    return (
      <div className="pt-2 mt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
        {CLINIC_COLOR_PRESETS.map(preset => {
          const isSelected = currentColor?.toLowerCase() === preset.hex.toLowerCase();
          return (
            <button
              key={preset.hex}
              type="button"
              onClick={() => setListItemColor(listKey, itemName, preset.hex)}
              title={preset.label}
              aria-label={preset.label}
              className={`w-5 h-5 rounded-full border transition-transform cursor-pointer flex items-center justify-center ${
                isSelected ? 'scale-110 ring-2 ring-offset-1 ring-[#172f3d] border-white' : 'border-slate-300/80 hover:scale-110'
              }`}
              style={{ backgroundColor: preset.hex }}
            >
              {isSelected && <Check className="w-3 h-3 text-white drop-shadow" />}
            </button>
          );
        })}
        <label
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 cursor-pointer hover:border-[#087e83]"
          title="اختيار لون مخصص"
        >
          <input
            type="color"
            value={currentColor || '#087e83'}
            onChange={e => setListItemColor(listKey, itemName, e.target.value)}
            className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
          />
          <span>مخصص</span>
        </label>
        {currentColor && (
          <button
            type="button"
            onClick={() => setListItemColor(listKey, itemName, undefined)}
            className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold cursor-pointer"
          >
            بدون لون
          </button>
        )}
      </div>
    );
  };

  // Referral Sources CRUD UI State
  const [newReferralInput, setNewReferralInput] = useState('');
  const [editingReferral, setEditingReferral] = useState<string | null>(null);
  const [editReferralValue, setEditReferralValue] = useState('');
  const [confirmDeleteReferral, setConfirmDeleteReferral] = useState<string | null>(null);

  const handleCreateReferral = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReferralInput.trim()) return;
    addReferralSource(newReferralInput.trim());
    setNewReferralInput('');
  };

  const handleSaveEditReferral = (e: React.FormEvent, oldVal: string) => {
    e.preventDefault();
    if (!editReferralValue.trim()) return;
    updateReferralSource(oldVal, editReferralValue.trim());
    setEditingReferral(null);
  };

  // Patient Tags CRUD UI State
  const [newTagInput, setNewTagInput] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagValue, setEditTagValue] = useState('');
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);
  const [busyTagAction, setBusyTagAction] = useState<string | null>(null);

  const tagUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    patients.forEach(p => {
      (p.tags || []).forEach(t => {
        if (t) counts.set(t, (counts.get(t) || 0) + 1);
      });
    });
    return counts;
  }, [patients]);

  const allManageableTags = useMemo(() => {
    return patientTags;
  }, [patientTags]);

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    addPatientTag(newTagInput.trim());
    setNewTagInput('');
  };

  const handleSaveEditTag = async (e: React.FormEvent, oldTag: string) => {
    e.preventDefault();
    const nextVal = editTagValue.trim();
    if (!nextVal || busyTagAction) return;
    setBusyTagAction(oldTag);
    try {
      await updatePatientTag(oldTag, nextVal);
      setEditingTag(null);
    } finally {
      setBusyTagAction(null);
    }
  };

  // Expense Categories CRUD UI State
  const [newExpCatName, setNewExpCatName] = useState('');
  const [newExpCatDefault, setNewExpCatDefault] = useState('');
  const [editingExpCat, setEditingExpCat] = useState<string | null>(null);
  const [editExpCatName, setEditExpCatName] = useState('');
  const [editExpCatDefault, setEditExpCatDefault] = useState('');
  const [confirmDeleteExpCat, setConfirmDeleteExpCat] = useState<string | null>(null);

  const handleCreateExpenseCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpCatName.trim()) return;
    const amt = newExpCatDefault.trim() !== '' ? Number(newExpCatDefault) : undefined;
    addExpenseCategory(newExpCatName.trim(), amt !== undefined && !isNaN(amt) && amt > 0 ? amt : undefined);
    setNewExpCatName('');
    setNewExpCatDefault('');
  };

  const handleSaveEditExpenseCategory = (e: React.FormEvent, oldName: string) => {
    e.preventDefault();
    if (!editExpCatName.trim()) return;
    const amt = editExpCatDefault.trim() !== '' ? Number(editExpCatDefault) : undefined;
    updateExpenseCategory(oldName, editExpCatName.trim(), amt !== undefined && !isNaN(amt) && amt > 0 ? amt : undefined);
    setEditingExpCat(null);
  };

  // Patient Follow-Up Statuses CRUD UI State
  const [newFollowUpStatusInput, setNewFollowUpStatusInput] = useState('');
  const [editingFollowUpStatus, setEditingFollowUpStatus] = useState<string | null>(null);
  const [editFollowUpStatusValue, setEditFollowUpStatusValue] = useState('');
  const [confirmDeleteFollowUpStatus, setConfirmDeleteFollowUpStatus] = useState<string | null>(null);

  const handleCreateFollowUpStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFollowUpStatusInput.trim()) return;
    addPatientFollowUpStatus(newFollowUpStatusInput.trim());
    setNewFollowUpStatusInput('');
  };

  const handleSaveEditFollowUpStatus = (e: React.FormEvent, oldStatus: string) => {
    e.preventDefault();
    if (!editFollowUpStatusValue.trim()) return;
    updatePatientFollowUpStatus(oldStatus, editFollowUpStatusValue.trim());
    setEditingFollowUpStatus(null);
  };

  // Clinic Units CRUD UI State
  const [showAddUnitForm, setShowAddUnitForm] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitChairs, setNewUnitChairs] = useState(1);
  const [newUnitDesc, setNewUnitDesc] = useState('');
  const [newUnitLat, setNewUnitLat] = useState('');
  const [newUnitLng, setNewUnitLng] = useState('');
  const [newUnitRadius, setNewUnitRadius] = useState(50);

  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editUnitChairs, setEditUnitChairs] = useState(1);
  const [editUnitDesc, setEditUnitDesc] = useState('');
  const [editUnitLat, setEditUnitLat] = useState('');
  const [editUnitLng, setEditUnitLng] = useState('');
  const [editUnitRadius, setEditUnitRadius] = useState(50);

  const [unitGpsError, setUnitGpsError] = useState('');
  const [unitGpsBusy, setUnitGpsBusy] = useState(false);
  const [gpsPermissionModal, setGpsPermissionModal] = useState<{
    target: 'new' | 'edit';
    status: 'prompt' | 'denied' | 'iframe_blocked' | 'unavailable' | 'timeout' | 'unsupported';
    detail?: string;
  } | null>(null);

  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState<string | null>(null);

  const requestDeviceGps = (target: 'new' | 'edit', highAccuracy = true) => {
    setUnitGpsError('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsPermissionModal({
        target,
        status: 'unsupported',
        detail: 'المتصفح الحالي لا يدعم خدمة تحديد الموقع الجغرافي (GPS).'
      });
      setUnitGpsError('المتصفح لا يدعم تحديد الموقع الجغرافي (GPS)');
      return;
    }

    setUnitGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUnitGpsBusy(false);
        setGpsPermissionModal(null);
        const latStr = pos.coords.latitude.toFixed(6);
        const lngStr = pos.coords.longitude.toFixed(6);
        if (target === 'new') {
          setNewUnitLat(latStr);
          setNewUnitLng(lngStr);
        } else {
          setEditUnitLat(latStr);
          setEditUnitLng(lngStr);
        }
      },
      err => {
        // If high accuracy timed out, retry once with lower accuracy / cached position
        if (err.code === 3 && highAccuracy) {
          requestDeviceGps(target, false);
          return;
        }
        setUnitGpsBusy(false);
        const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
        if (err.code === 1) {
          setGpsPermissionModal({
            target,
            status: isEmbedded ? 'iframe_blocked' : 'denied',
            detail: err.message
          });
          setUnitGpsError('تم رفض صلاحية الموقع — اضغط لتفعيل إذن الوصول للموقع');
        } else if (err.code === 3) {
          setGpsPermissionModal({
            target,
            status: 'timeout',
            detail: err.message
          });
          setUnitGpsError('انتهت مهلة تحديد الموقع. تأكد من تفعيل GPS في الجهاز وأعد المحاولة.');
        } else {
          setGpsPermissionModal({
            target,
            status: 'unavailable',
            detail: err.message
          });
          setUnitGpsError('تعذر التقاط إشارة الموقع حالياً. يمكنك المحاولة مرة أخرى أو إدخال الإحداثيات يدوياً.');
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 10000 : 12000,
        maximumAge: highAccuracy ? 0 : 60000
      }
    );
  };

  const fillUnitGpsFromDevice = async (target: 'new' | 'edit') => {
    setUnitGpsError('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsPermissionModal({
        target,
        status: 'unsupported',
        detail: 'المتصفح الحالي لا يدعم خدمة تحديد الموقع الجغرافي (GPS).'
      });
      setUnitGpsError('المتصفح لا يدعم تحديد الموقع الجغرافي (GPS)');
      return;
    }

    let permState: PermissionState | null = null;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        permState = res.state;
      }
    } catch {
      permState = null;
    }

    if (permState === 'prompt') {
      setGpsPermissionModal({ target, status: 'prompt' });
      return;
    }
    if (permState === 'denied') {
      const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
      setGpsPermissionModal({ target, status: isEmbedded ? 'iframe_blocked' : 'denied' });
      return;
    }

    requestDeviceGps(target, true);
  };

  const handleCreateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) return;
    const parsedLat = newUnitLat.trim() !== '' ? Number(newUnitLat) : undefined;
    const parsedLng = newUnitLng.trim() !== '' ? Number(newUnitLng) : undefined;
    addUnit({
      name: newUnitName.trim(),
      chairCount: Math.max(1, Number(newUnitChairs) || 1),
      description: newUnitDesc.trim() || 'وحدة كشف وعلاج الأسنان',
      isDisabled: false,
      latitude: parsedLat !== undefined && !isNaN(parsedLat) ? parsedLat : undefined,
      longitude: parsedLng !== undefined && !isNaN(parsedLng) ? parsedLng : undefined,
      allowedRadiusMeters: Math.min(50, Math.max(10, Number(newUnitRadius) || 50))
    });
    setNewUnitName('');
    setNewUnitChairs(1);
    setNewUnitDesc('');
    setNewUnitLat('');
    setNewUnitLng('');
    setNewUnitRadius(50);
    setUnitGpsError('');
    setShowAddUnitForm(false);
  };

  const startEditUnit = (u: ClinicUnit) => {
    setEditingUnitId(u.id);
    setEditUnitName(u.name);
    setEditUnitChairs(u.chairCount);
    setEditUnitDesc(u.description);
    setEditUnitLat(u.latitude !== undefined ? String(u.latitude) : '');
    setEditUnitLng(u.longitude !== undefined ? String(u.longitude) : '');
    setEditUnitRadius(Math.min(50, Math.max(10, u.allowedRadiusMeters || 50)));
    setUnitGpsError('');
    setConfirmDeleteUnitId(null);
  };

  const handleSaveEditUnit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editUnitName.trim()) return;
    const parsedLat = editUnitLat.trim() !== '' ? Number(editUnitLat) : undefined;
    const parsedLng = editUnitLng.trim() !== '' ? Number(editUnitLng) : undefined;
    updateUnit(id, {
      name: editUnitName.trim(),
      chairCount: Math.max(1, Number(editUnitChairs) || 1),
      description: editUnitDesc.trim(),
      latitude: parsedLat !== undefined && !isNaN(parsedLat) ? parsedLat : undefined,
      longitude: parsedLng !== undefined && !isNaN(parsedLng) ? parsedLng : undefined,
      allowedRadiusMeters: Math.min(50, Math.max(10, Number(editUnitRadius) || 50))
    });
    setEditingUnitId(null);
  };

  // Doctors Roster CRUD UI State
  const DOCTOR_COLORS = ['#087e83', '#1d4ed8', '#7c3aed', '#0f766e', '#be123c', '#b45309'];
  const [showAddDoctorForm, setShowAddDoctorForm] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocSpecialty, setNewDocSpecialty] = useState('');
  const [newDocPhone, setNewDocPhone] = useState('');
  const [newDocColor, setNewDocColor] = useState('#087e83');

  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocSpecialty, setEditDocSpecialty] = useState('');
  const [editDocPhone, setEditDocPhone] = useState('');
  const [editDocColor, setEditDocColor] = useState('#087e83');

  const [confirmDeleteDoctorId, setConfirmDeleteDoctorId] = useState<string | null>(null);

  const handleCreateDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;
    addDoctor({
      name: newDocName.trim(),
      specialty: newDocSpecialty.trim() || 'طب وجراحة الفم والأسنان',
      phone: newDocPhone.trim() || '01000000000',
      color: newDocColor,
      isDisabled: false
    });
    setNewDocName('');
    setNewDocSpecialty('');
    setNewDocPhone('');
    setNewDocColor('#087e83');
    setShowAddDoctorForm(false);
  };

  const startEditDoctor = (d: { id: string; name: string; specialty: string; phone: string; color: string }) => {
    setEditingDoctorId(d.id);
    setEditDocName(d.name);
    setEditDocSpecialty(d.specialty);
    setEditDocPhone(d.phone);
    setEditDocColor(d.color || '#087e83');
    setConfirmDeleteDoctorId(null);
  };

  const handleSaveEditDoctor = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editDocName.trim()) return;
    updateDoctor(id, {
      name: editDocName.trim(),
      specialty: editDocSpecialty.trim(),
      phone: editDocPhone.trim(),
      color: editDocColor
    });
    setEditingDoctorId(null);
  };

  const [confirmReset, setConfirmReset] = useState(false);

  const handleResetData = async () => {
    localStorage.clear();
    await clearAllLargeDatasets();
    window.location.reload();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm">
        <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d] flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#087e83]" />
          <span>الإعدادات</span>
        </h1>
      </div>

      {/* Cloud Sync Settings Card */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('cloud')}
          aria-expanded={Boolean(openSections.cloud)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.cloud ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <Cloud className="w-5 h-5 text-[#087e83]" />
            <span>قاعدة البيانات السحابية الموحدة</span>
          </h2>
          {openSections.cloud ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.cloud && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-400">
                يتصل كل موظف تلقائياً بقاعدة البيانات الرئيسية عبر اسم المستخدم وكلمة المرور فقط بدون الحاجة لحساب Google
              </p>
              {cloudUser ? (
                <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>{cloudSynced ? 'متصل ومتزامن لحظياً' : 'متصل بقاعدة البيانات'}</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                  {cloudNeedsConsoleSetup ? 'بانتظار تفعيل Anonymous Auth' : 'وضع محلي مؤقت'}
                </span>
              )}
            </div>

        {(cloudActionErr || cloudError) && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{cloudActionErr || cloudError}</span>
          </div>
        )}

        {cloudActionMsg && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{cloudActionMsg}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <div className="font-bold text-slate-700">
              {cloudUser ? 'حالة الربط بين البريفيو والبرودكشن وجميع الأجهزة:' : 'تعذر الاتصال التلقائي بالسحابة:'}
            </div>
            <div className="font-semibold text-[#087e83] mt-0.5">
              {cloudUser
                ? 'تلقائي بالكامل — أي تعديل أو موظف جديد يظهر فوراً على جميع الأجهزة'
                : 'فعّل خيار Anonymous من Firebase Console (Authentication -> Sign-in method) ثم أعد المحاولة'}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {cloudUser ? (
              <button
                type="button"
                onClick={handleForcePushCloud}
                disabled={cloudActionBusy}
                className="px-3.5 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cloudActionBusy ? 'animate-spin' : ''}`} />
                <span>مزامنة التعديلات المحلية الآن</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRetryCloudConnect}
                disabled={cloudActionBusy}
                className="px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Cloud className="w-4 h-4" />
                <span>{cloudActionBusy ? 'جاري الاتصال...' : 'إعادة الاتصال بالسحابة'}</span>
              </button>
            )}
          </div>
        </div>

        {/* App Build Version & PWA Cache Diagnostics */}
        <div className="p-3.5 rounded-2xl bg-[#f7fbfb] border border-[#d6e5e8] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-extrabold text-[#172f3d]">
              إصدار التطبيق المحمّل على هذا الجهاز
            </div>
            <div className="text-[11px] text-slate-600 font-mono" dir="ltr">
              Build: <span className="font-bold text-[#087e83]">{typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'}</span>
              {' · '}
              {typeof __APP_BUILT_AT__ !== 'undefined'
                ? new Date(__APP_BUILT_AT__).toLocaleString('en-GB', {
                    timeZone: 'Africa/Cairo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })
                : 'dev'}
              {typeof window !== 'undefined' ? ` · ${window.location.host}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
                if ('serviceWorker' in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.map(r => r.update().catch(() => {})));
                }
              } catch {}
              window.location.reload();
            }}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-[#bfe2db] text-[#087e83] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer flex-shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث قسري ومسح الكاش</span>
          </button>
        </div>
          </div>
        )}
      </div>

      {/* 0. My Account Login & Email Recovery Settings */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('account')}
          aria-expanded={Boolean(openSections.account)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.account ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#087e83]" />
            <span>حسابي</span>
          </h2>
          {openSections.account ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.account && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-400">
                إعداد اسم المستخدم وكلمة المرور وربط البريد الإلكتروني لاستعادة كلمة المرور عند نسيانها
              </p>
              {myCredsSaved && (
                <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>تم حفظ بيانات الدخول</span>
                </span>
              )}
            </div>

        {myCredsError && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{myCredsError}</span>
          </div>
        )}

        <form onSubmit={handleSaveMyCredentials} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                اسم المستخدم للدخول (Username) *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={myUsername}
                  onChange={e => setMyUsername(e.target.value)}
                  placeholder="shlkamy"
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  required
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                كلمة المرور *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showMyPassword ? 'text' : 'password'}
                  value={myPassword}
                  onChange={e => setMyPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full pr-9 pl-9 py-2 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  required
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowMyPassword(v => !v)}
                  className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showMyPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                البريد الإلكتروني المرتبط (لاستعادة كلمة المرور) *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  value={myEmail}
                  onChange={e => setMyEmail(e.target.value)}
                  placeholder="muhammed.shlkamy@gmail.com"
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-mono font-semibold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  required
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                رمز استعادة الأمان (Recovery PIN)
              </label>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={myRecoveryPin}
                  onChange={e => setMyRecoveryPin(e.target.value)}
                  placeholder="مثال: 2026"
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <p className="text-[11px] text-slate-500">
              عند نسيان كلمة المرور، سيتم التحقق عبر البريد الإلكتروني <span className="font-mono font-bold text-[#087e83]" dir="ltr">{myEmail || 'muhammed.shlkamy@gmail.com'}</span> مع رمز الاستعادة.
            </p>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>حفظ بيانات حسابي</span>
            </button>
          </div>
        </form>
          </div>
        )}
      </div>

      {/* 0. Appearance & Theme (Dark Mode) */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('appearance')}
          aria-expanded={Boolean(openSections.appearance)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.appearance ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            {darkMode ? <Moon className="w-5 h-5 text-teal-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
            <span>المظهر</span>
          </h2>
          {openSections.appearance ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.appearance && (
          <div className="pt-4 animate-in fade-in duration-150">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDarkMode(false)}
            className={`p-4 rounded-2xl border text-right transition-all flex items-center gap-3.5 ${
              !darkMode
                ? 'border-[#087e83] bg-[#e6f4f1] text-[#087e83] ring-2 ring-[#087e83]/20 shadow-sm'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-xs">
              <Sun className="w-5 h-5 text-amber-500" />
            </div>
            <div className="font-extrabold text-sm flex items-center gap-2">
              <span>الوضع النهاري</span>
              {!darkMode && <Check className="w-4 h-4 text-[#087e83]" />}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setDarkMode(true)}
            className={`p-4 rounded-2xl border text-right transition-all flex items-center gap-3.5 ${
              darkMode
                ? 'border-teal-500 bg-teal-950/20 text-teal-400 ring-2 ring-teal-500/30 shadow-sm'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center flex-shrink-0 shadow-xs">
              <Moon className="w-5 h-5 text-teal-400" />
            </div>
            <div className="font-extrabold text-sm flex items-center gap-2">
              <span>الوضع الليلي</span>
              {darkMode && <Check className="w-4 h-4 text-teal-400" />}
            </div>
          </button>
        </div>
          </div>
        )}
      </div>

      {/* 1. Working Hours & Weekly Closed Days (إجازات أسبوعية) */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('hours')}
          aria-expanded={Boolean(openSections.hours)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.hours ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#087e83]" />
            <span>مواعيد العمل</span>
          </h2>
          {openSections.hours ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.hours && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">

        <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f8fbfa] p-4 rounded-2xl border border-[#d6e5e8]">
          <div>
            <div className="font-extrabold text-xs text-[#172f3d]">ساعات العمل العامة للعيادة (اختصارات الحجز)</div>
            <div className="text-[11px] text-slate-500">حدد ساعات البداية والنهاية لتظهر في اختصارات الوقت عند إنشاء موعد جديد</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-bold">من:</span>
              <select
                value={clinicStartHour}
                onChange={e => updateClinicWorkingHours(Number(e.target.value), clinicEndHour)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-mono font-bold text-xs focus:border-[#087e83] focus:outline-none"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? '12:00 ص' : i === 12 ? '12:00 م' : i > 12 ? `${i - 12}:00 م` : `${i}:00 ص`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-bold">إلى:</span>
              <select
                value={clinicEndHour}
                onChange={e => updateClinicWorkingHours(clinicStartHour, Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-mono font-bold text-xs focus:border-[#087e83] focus:outline-none"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? '12:00 ص' : i === 12 ? '12:00 م' : i > 12 ? `${i - 12}:00 م` : `${i}:00 ص`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {weekdaySettings.map(ws => (
            <div
              key={ws.dayOfWeek}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-slate-800 w-20">{ws.dayName}</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={ws.isClosed}
                    onChange={e => updateWeekdaySetting(ws.dayOfWeek, { isClosed: e.target.checked })}
                    className="w-4 h-4 rounded text-rose-600 cursor-pointer"
                  />
                  <span className={ws.isClosed ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                    {ws.isClosed ? 'إجازة أسبوعية مغلقة (لا حجوزات)' : 'يوم عمل متاح'}
                  </span>
                </label>
              </div>

              {!ws.isClosed && (
                <div className="flex items-center gap-2.5 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-semibold">الفرع الافتراضي:</span>
                    <select
                      value={ws.defaultUnitId}
                      onChange={e => updateWeekdaySetting(ws.dayOfWeek, { defaultUnitId: e.target.value })}
                      className="px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#172f3d] focus:border-[#087e83] focus:outline-none"
                    >
                      {units.filter(u => !u.isDisabled).map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name.split('-')[0].trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="font-mono font-bold text-[#087e83] bg-[#e7f5f2] px-2.5 py-1 rounded-lg">
                    {ws.startHour > 12 ? `${ws.startHour - 12}:00 م` : `${ws.startHour}:00 ص`} إلى{' '}
                    {ws.endHour > 12 ? `${ws.endHour - 12}:00 م` : `${ws.endHour}:00 ص`}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
          </div>
        )}
      </div>

      {/* 2. Clinic Units / Operating Chairs */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('units')}
          aria-expanded={Boolean(openSections.units)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.units ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <Building className="w-5 h-5 text-[#087e83]" />
            <span>الفروع ({units.length})</span>
          </h2>
          {openSections.units ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.units && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-slate-400">إدارة فروع ووحدات العيادة وإحداثيات الحضور</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddUnitForm(prev => !prev);
                  setEditingUnitId(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {showAddUnitForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{showAddUnitForm ? 'إلغاء' : 'إضافة وحدة / كرسي'}</span>
              </button>
            </div>

        {/* Inline Add New Unit Form */}
        {showAddUnitForm && (
          <form
            onSubmit={handleCreateUnit}
            className="p-4 rounded-2xl border border-[#bfe2db] bg-[#f4fbf9] space-y-3 animate-in fade-in duration-150"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم الوحدة / الكرسي *</label>
                <input
                  type="text"
                  value={newUnitName}
                  onChange={e => setNewUnitName(e.target.value)}
                  placeholder="مثال: عيادة ٣ - وحدة الزراعة والليزر"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">عدد الكراسي</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newUnitChairs}
                  onChange={e => setNewUnitChairs(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">الوصف والتجهيزات</label>
              <input
                type="text"
                value={newUnitDesc}
                onChange={e => setNewUnitDesc(e.target.value)}
                placeholder="مثال: مجهزة بأشعة ديجيتال وميكروسكوب جراحي"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:border-[#087e83] focus:outline-none"
              />
            </div>

            {/* Branch GPS Geofence Fields */}
            <div className="p-3 rounded-xl bg-white border border-[#d6e5e8] space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] font-extrabold text-[#087e83] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>موقع الفرع الجغرافي للتحقق من الشفت (GPS)</span>
                </span>
                <button
                  type="button"
                  disabled={unitGpsBusy}
                  onClick={() => {
                    void fillUnitGpsFromDevice('new');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="w-3 h-3" />
                  <span>{unitGpsBusy ? 'جاري التحديد...' : 'تحديد موقعي الحالي (GPS)'}</span>
                </button>
              </div>
              {unitGpsError && (
                <div className="flex items-center justify-between gap-2 flex-wrap p-2 rounded-lg bg-rose-50 border border-rose-200">
                  <p className="text-[11px] font-bold text-rose-600">{unitGpsError}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setGpsPermissionModal({
                        target: 'new',
                        status: typeof window !== 'undefined' && window.self !== window.top ? 'iframe_blocked' : 'denied'
                      })
                    }
                    className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                  >
                    تفعيل إذن الموقع
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">خط العرض (Latitude)</label>
                  <input
                    type="text"
                    value={newUnitLat}
                    onChange={e => setNewUnitLat(e.target.value)}
                    placeholder="30.044420"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">خط الطول (Longitude)</label>
                  <input
                    type="text"
                    value={newUnitLng}
                    onChange={e => setNewUnitLng(e.target.value)}
                    placeholder="31.235712"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">النطاق المسموح (متر — حد أقصى 50م)</label>
                  <input
                    type="number"
                    min={10}
                    max={50}
                    value={newUnitRadius}
                    onChange={e => setNewUnitRadius(Math.min(50, Math.max(10, Number(e.target.value) || 50)))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddUnitForm(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
              >
                حفظ الوحدة
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {units.map(u => {
            const isEditing = editingUnitId === u.id;
            const isConfirmingDelete = confirmDeleteUnitId === u.id;

            if (isEditing) {
              return (
                <form
                  key={u.id}
                  onSubmit={e => handleSaveEditUnit(e, u.id)}
                  className="p-4 rounded-2xl border-2 border-[#087e83] bg-[#f6fbfa] space-y-2.5"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editUnitName}
                      onChange={e => setEditUnitName(e.target.value)}
                      placeholder="اسم الوحدة"
                      className="col-span-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                      required
                    />
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editUnitChairs}
                      onChange={e => setEditUnitChairs(Number(e.target.value) || 1)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold"
                      title="عدد الكراسي"
                    />
                  </div>
                  <input
                    type="text"
                    value={editUnitDesc}
                    onChange={e => setEditUnitDesc(e.target.value)}
                    placeholder="الوصف"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                  />

                  {/* Edit Branch GPS Coordinates */}
                  <div className="p-2.5 rounded-xl bg-white border border-[#d6e5e8] space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-[10px] font-extrabold text-[#087e83] flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span>إحداثيات الفرع (GPS)</span>
                      </span>
                      <button
                        type="button"
                        disabled={unitGpsBusy}
                        onClick={() => {
                          void fillUnitGpsFromDevice('edit');
                        }}
                        className="px-2 py-1 rounded-lg bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MapPin className="w-3 h-3" />
                        <span>{unitGpsBusy ? 'جاري التحديد...' : 'تحديد موقعي الحالي (GPS)'}</span>
                      </button>
                    </div>
                    {unitGpsError && (
                      <div className="flex items-center justify-between gap-2 flex-wrap p-1.5 rounded-lg bg-rose-50 border border-rose-200">
                        <p className="text-[10px] font-bold text-rose-600">{unitGpsError}</p>
                        <button
                          type="button"
                          onClick={() =>
                            setGpsPermissionModal({
                              target: 'edit',
                              status: typeof window !== 'undefined' && window.self !== window.top ? 'iframe_blocked' : 'denied'
                            })
                          }
                          className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                        >
                          تفعيل إذن الموقع
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <label className="block text-[9px] text-slate-500 font-bold">Latitude</label>
                        <input
                          type="text"
                          value={editUnitLat}
                          onChange={e => setEditUnitLat(e.target.value)}
                          placeholder="30.0444"
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-mono"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-500 font-bold">Longitude</label>
                        <input
                          type="text"
                          value={editUnitLng}
                          onChange={e => setEditUnitLng(e.target.value)}
                          placeholder="31.2357"
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-mono"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-500 font-bold">النطاق (حد أقصى 50م)</label>
                        <input
                          type="number"
                          min={10}
                          max={50}
                          value={editUnitRadius}
                          onChange={e => setEditUnitRadius(Math.min(50, Math.max(10, Number(e.target.value) || 50)))}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-mono font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingUnitId(null)}
                      className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 rounded-lg bg-[#087e83] text-white text-xs font-bold cursor-pointer"
                    >
                      حفظ التعديل
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div
                key={u.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  u.isDisabled
                    ? 'border-slate-200 bg-slate-50/80 opacity-75'
                    : 'border-slate-200 bg-[#fbfdfd]'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`font-bold text-sm ${u.isDisabled ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                      {u.name}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                        {u.chairCount} كرسي
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.isDisabled
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {u.isDisabled ? 'معطّلة' : 'نشط ومتاح'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{u.description}</p>
                  {u.latitude != null && u.longitude != null ? (
                    <div className="text-[10px] font-mono text-[#087e83] flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>GPS: {u.latitude.toFixed(4)}, {u.longitude.toFixed(4)} (نطاق {Math.min(50, u.allowedRadiusMeters || 50)} م)</span>
                    </div>
                  ) : (
                    <div className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>لم يتم تحديد إحداثيات GPS للعيادة (مطلوب للبصمة ضمن 50 م)</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  {isConfirmingDelete ? (
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="text-[11px] font-bold text-rose-700">تأكيد حذف الوحدة؟</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            deleteUnit(u.id);
                            setConfirmDeleteUnitId(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          نعم، حذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUnitId(null)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditUnit(u)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-700 hover:text-[#087e83] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleUnitDisabled(u.id)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                            u.isDisabled
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          <span>{u.isDisabled ? 'تفعيل' : 'تعطيل'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteUnitId(u.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
          </div>
        )}
      </div>

      {/* 3. Doctors Roster */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('doctors')}
          aria-expanded={Boolean(openSections.doctors)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.doctors ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-[#087e83]" />
            <span>الأطباء ({doctors.length})</span>
          </h2>
          {openSections.doctors ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.doctors && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-slate-400">إضافة وتعديل وتخصيص ألوان الأطباء</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddDoctorForm(prev => !prev);
                  setEditingDoctorId(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {showAddDoctorForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{showAddDoctorForm ? 'إلغاء' : 'إضافة طبيب'}</span>
              </button>
            </div>

        {/* Inline Add New Doctor Form */}
        {showAddDoctorForm && (
          <form
            onSubmit={handleCreateDoctor}
            className="p-4 rounded-2xl border border-[#bfe2db] bg-[#f4fbf9] space-y-3 animate-in fade-in duration-150"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم الطبيب *</label>
                <input
                  type="text"
                  value={newDocName}
                  onChange={e => setNewDocName(e.target.value)}
                  placeholder="مثال: د. سارة محمود"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم الهاتف</label>
                <input
                  type="tel"
                  value={newDocPhone}
                  onChange={e => setNewDocPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono focus:border-[#087e83] focus:outline-none"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">التخصص السريري</label>
                <input
                  type="text"
                  value={newDocSpecialty}
                  onChange={e => setNewDocSpecialty(e.target.value)}
                  placeholder="مثال: أخصائي علاج الجذور والتركيبات"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:border-[#087e83] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">اللون المميز</label>
                <div className="flex items-center gap-1.5">
                  {DOCTOR_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewDocColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                        newDocColor === c ? 'border-slate-800 scale-110' : 'border-white'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddDoctorForm(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
              >
                حفظ الطبيب
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {doctors.map(d => {
            const isEditing = editingDoctorId === d.id;
            const isConfirmingDelete = confirmDeleteDoctorId === d.id;
            const avatarLetter = d.name.replace(/^د\.\s*/, '').trim().slice(0, 1) || 'د';

            if (isEditing) {
              return (
                <form
                  key={d.id}
                  onSubmit={e => handleSaveEditDoctor(e, d.id)}
                  className="p-4 rounded-2xl border-2 border-[#087e83] bg-[#f6fbfa] space-y-2.5"
                >
                  <input
                    type="text"
                    value={editDocName}
                    onChange={e => setEditDocName(e.target.value)}
                    placeholder="اسم الطبيب"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                    required
                  />
                  <input
                    type="text"
                    value={editDocSpecialty}
                    onChange={e => setEditDocSpecialty(e.target.value)}
                    placeholder="التخصص"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                  />
                  <input
                    type="tel"
                    value={editDocPhone}
                    onChange={e => setEditDocPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono"
                    dir="ltr"
                  />
                  <div className="flex items-center gap-1.5">
                    {DOCTOR_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditDocColor(c)}
                        className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                          editDocColor === c ? 'border-slate-800 scale-110' : 'border-white'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingDoctorId(null)}
                      className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 rounded-lg bg-[#087e83] text-white text-xs font-bold cursor-pointer"
                    >
                      حفظ التعديل
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div
                key={d.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  d.isDisabled
                    ? 'border-slate-200 bg-slate-50/80 opacity-75'
                    : 'border-slate-200 bg-[#fbfdfd]'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                        style={{ backgroundColor: d.color || '#087e83' }}
                      >
                        {avatarLetter}
                      </div>
                      <div className="min-w-0">
                        <h3 className={`font-bold text-xs sm:text-sm truncate ${d.isDisabled ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                          {d.name}
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono" dir="ltr">{d.phone}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        d.isDisabled
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {d.isDisabled ? 'معطّل' : 'نشط'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{d.specialty}</p>
                </div>

                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                  {isConfirmingDelete ? (
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="text-[11px] font-bold text-rose-700">تأكيد الحذف؟</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            deleteDoctor(d.id);
                            setConfirmDeleteDoctorId(null);
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          نعم
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDoctorId(null)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditDoctor(d)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-700 hover:text-[#087e83] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleDoctorDisabled(d.id)}
                          className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                            d.isDisabled
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          <span>{d.isDisabled ? 'تفعيل' : 'تعطيل'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteDoctorId(d.id)}
                        className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
          </div>
        )}
      </div>

      {/* 3.5 Referral Sources (مصدر معرفة العيادة) */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('referrals')}
          aria-expanded={Boolean(openSections.referrals)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.referrals ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <Share2 className="w-5 h-5 text-[#087e83]" />
            <span>مصادر معرفة العيادة ({referralSources.length})</span>
          </h2>
          {openSections.referrals ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.referrals && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <span className="text-xs text-slate-400 block">تظهر في نموذج إضافة مريض جديد</span>

        <form onSubmit={handleCreateReferral} className="flex items-center gap-2">
          <input
            type="text"
            value={newReferralInput}
            onChange={e => setNewReferralInput(e.target.value)}
            placeholder="أضف مصدر معرفة جديد (مثال: تيك توك، إعلان ممول، دكتور محول...)"
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-semibold focus:border-[#087e83] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newReferralInput.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة</span>
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {referralSources.map((src, idx) => {
            const isEditing = editingReferral === src;
            const isConfirming = confirmDeleteReferral === src;
            const pickerKey = `referral:${src}`;
            const customColor = listItemColors.referralSources?.[src];
            const colorBadgeStyle = getCustomColorBadgeStyle(customColor);

            if (isEditing) {
              return (
                <form
                  key={src}
                  onSubmit={e => handleSaveEditReferral(e, src)}
                  className="p-2.5 rounded-2xl border-2 border-[#087e83] bg-white flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={editReferralValue}
                    onChange={e => setEditReferralValue(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:border-[#087e83] focus:outline-none"
                    autoFocus
                    required
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-[#087e83] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> حفظ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingReferral(null)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              );
            }

            return (
              <div
                key={src}
                className="px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-[#fbfdfd]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => reorderReferralSources(moveArrayItem(referralSources, idx, -1))}
                        className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                        title="تحريك لأعلى"
                        aria-label="تحريك لأعلى"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === referralSources.length - 1}
                        onClick={() => reorderReferralSources(moveArrayItem(referralSources, idx, 1))}
                        className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                        title="تحريك لأسفل"
                        aria-label="تحريك لأسفل"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <span
                      className={`font-bold text-xs truncate ${
                        colorBadgeStyle ? 'px-2 py-0.5 rounded-full border' : 'text-slate-800'
                      }`}
                      style={colorBadgeStyle}
                    >
                      {src}
                    </span>
                  </div>

                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] font-bold text-rose-700">حذف؟</span>
                      <button
                        type="button"
                        onClick={() => {
                          deleteReferralSource(src);
                          setConfirmDeleteReferral(null);
                        }}
                        className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        نعم
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteReferral(null)}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setOpenColorPickerKey(prev => (prev === pickerKey ? null : pickerKey))}
                        className={`p-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                          openColorPickerKey === pickerKey
                            ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-[#087e83]'
                        }`}
                        title="اختيار لون"
                        aria-label="اختيار لون"
                      >
                        {customColor ? (
                          <span
                            className="w-3 h-3 rounded-full border border-black/15"
                            style={{ backgroundColor: customColor }}
                          />
                        ) : (
                          <Palette className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReferral(src);
                          setEditReferralValue(src);
                          setConfirmDeleteReferral(null);
                        }}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-700 hover:text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteReferral(src)}
                        className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف</span>
                      </button>
                    </div>
                  )}
                </div>
                {renderItemColorPalette('referralSources', src, pickerKey)}
              </div>
            );
          })}
        </div>
          </div>
        )}
      </div>

      {/* 3.6 Required vs Optional Fields in New Patient Form */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('requiredFields')}
          aria-expanded={Boolean(openSections.requiredFields)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.requiredFields ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[#087e83]" />
            <span>الحقول الإلزامية عند إنشاء مريض جديد</span>
          </h2>
          {openSections.requiredFields ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.requiredFields && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <span className="text-xs text-slate-400 block">تحديد ما يجب إدخاله إجبارياً وما هو اختياري</span>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Name is always required */}
          <div className="p-3.5 rounded-2xl border border-[#bfe2db] bg-[#f4fbf9] flex items-center justify-between gap-2">
            <div>
              <div className="font-bold text-xs text-[#172f3d]">اسم المريض بالكامل</div>
              <div className="text-[10px] text-slate-500 mt-0.5">حقل أساسي لتعريف الملف</div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#087e83] text-white text-[10px] font-bold flex-shrink-0">
              إلزامي دائماً
            </span>
          </div>

          {(
            [
              { key: 'phone', label: 'رقم الموبايل الأساسي', sub: 'مع التحقق من الرقم المصري' },
              { key: 'secondaryPhone', label: 'رقم هاتف إضافي / واتساب', sub: 'هاتف الطوارئ أو رقم آخر' },
              { key: 'age', label: 'السن', sub: 'العمر بالسنوات' },
              { key: 'gender', label: 'النوع (ذكر / أنثى)', sub: 'تحديد نوع المريض' },
              { key: 'referralSource', label: 'مصدر المعرفة بالعيادة', sub: 'كيف وصل المريض للعيادة' }
            ] as const
          ).map(item => {
            const isRequired = patientRequiredFields[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => updatePatientRequiredFields({ [item.key]: !isRequired })}
                className={`p-3.5 rounded-2xl border text-right transition-all flex items-center justify-between gap-2 cursor-pointer ${
                  isRequired
                    ? 'border-[#087e83] bg-[#e7f5f2] shadow-xs'
                    : 'border-slate-200 bg-[#fbfdfd] hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="font-bold text-xs text-[#172f3d]">{item.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{item.sub}</div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex-shrink-0 border ${
                    isRequired
                      ? 'bg-[#087e83] text-white border-[#087e83]'
                      : 'bg-white text-slate-500 border-slate-200'
                  }`}
                >
                  {isRequired ? 'إلزامي *' : 'اختياري'}
                </span>
              </button>
            );
          })}
        </div>
          </div>
        )}
      </div>

      {/* 3.7 Patient Tags Management (إدارة التاجات والوسوم) */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('tags')}
          aria-expanded={Boolean(openSections.tags)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.tags ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#087e83]" />
            <span>التاجات ({allManageableTags.length})</span>
          </h2>
          {openSections.tags ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.tags && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <span className="text-xs text-slate-400 block">إضافة أو تعديل أو حذف تاج نهائياً من النظام ومن ملفات المرضى</span>

        <form onSubmit={handleCreateTag} className="flex items-center gap-2">
          <input
            type="text"
            value={newTagInput}
            onChange={e => setNewTagInput(e.target.value)}
            placeholder="أضف تاج جديد (مثال: متابعة تقويم، خصم عائلي، حالة عاجلة...)"
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-semibold focus:border-[#087e83] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newTagInput.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة</span>
          </button>
        </form>

        {allManageableTags.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {allManageableTags.map(tag => {
              const isEditing = editingTag === tag;
              const isConfirming = confirmDeleteTag === tag;
              const usedCount = tagUsageCounts.get(tag) || 0;
              const configuredIdx = patientTags.indexOf(tag);
              const pickerKey = `tag:${tag}`;
              const customColor = listItemColors.patientTags?.[tag];
              const colorBadgeStyle = getCustomColorBadgeStyle(customColor);

              if (isEditing) {
                return (
                  <form
                    key={tag}
                    onSubmit={e => handleSaveEditTag(e, tag)}
                    className="p-2.5 rounded-2xl border-2 border-[#087e83] bg-white flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={editTagValue}
                      onChange={e => setEditTagValue(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:border-[#087e83] focus:outline-none"
                      autoFocus
                      required
                    />
                    <button
                      type="submit"
                      disabled={busyTagAction === tag}
                      className="px-2.5 py-1.5 rounded-lg bg-[#087e83] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                    >
                      <Check className="w-3.5 h-3.5" /> {busyTagAction === tag ? 'جاري الحفظ...' : 'حفظ'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTag(null)}
                      className="px-2 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                );
              }

              return (
                <div
                  key={tag}
                  className="px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-[#fbfdfd]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {configuredIdx >= 0 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            disabled={configuredIdx === 0}
                            onClick={() => reorderPatientTags(moveArrayItem(patientTags, configuredIdx, -1))}
                            className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                            title="تحريك لأعلى"
                            aria-label="تحريك لأعلى"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={configuredIdx === patientTags.length - 1}
                            onClick={() => reorderPatientTags(moveArrayItem(patientTags, configuredIdx, 1))}
                            className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                            title="تحريك لأسفل"
                            aria-label="تحريك لأسفل"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <span
                        className={`font-bold text-xs truncate ${
                          colorBadgeStyle ? 'px-2 py-0.5 rounded-full border' : 'text-slate-800'
                        }`}
                        style={colorBadgeStyle}
                      >
                        #{tag}
                      </span>
                      {usedCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83] flex-shrink-0">
                          {usedCount} مريض
                        </span>
                      )}
                    </div>

                    {isConfirming ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] font-bold text-rose-700">حذف نهائي؟</span>
                        <button
                          type="button"
                          disabled={busyTagAction === tag}
                          onClick={async () => {
                            if (busyTagAction) return;
                            setBusyTagAction(tag);
                            try {
                              await deletePatientTag(tag);
                              setConfirmDeleteTag(null);
                            } finally {
                              setBusyTagAction(null);
                            }
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-[11px] font-bold cursor-pointer"
                        >
                          {busyTagAction === tag ? 'جاري الحذف...' : 'نعم'}
                        </button>
                        <button
                          type="button"
                          disabled={busyTagAction === tag}
                          onClick={() => setConfirmDeleteTag(null)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer disabled:opacity-60"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setOpenColorPickerKey(prev => (prev === pickerKey ? null : pickerKey))}
                          className={`p-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                            openColorPickerKey === pickerKey
                              ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-[#087e83]'
                          }`}
                          title="اختيار لون"
                          aria-label="اختيار لون"
                        >
                          {customColor ? (
                            <span
                              className="w-3 h-3 rounded-full border border-black/15"
                              style={{ backgroundColor: customColor }}
                            />
                          ) : (
                            <Palette className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTag(tag);
                            setEditTagValue(tag);
                            setConfirmDeleteTag(null);
                          }}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-700 hover:text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTag(tag)}
                          className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {renderItemColorPalette('patientTags', tag, pickerKey)}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-3">لا توجد تاجات مضافة حالياً.</p>
        )}
          </div>
        )}
      </div>

      {/* 3.8 Expense Categories (with default optional price) */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('expenseCategories')}
          aria-expanded={Boolean(openSections.expenseCategories)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.expenseCategories ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-[#087e83]" />
            <span>تصنيفات مصروفات العيادة ({expenseCategories.length})</span>
          </h2>
          {openSections.expenseCategories ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.expenseCategories && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <span className="text-xs text-slate-400 block">
              تظهر في قائمة إضافة وتعديل المصروفات — يمكنك تحديد سعر افتراضي لكل بند يتم تعبئته تلقائياً مع إمكانية تعديله
            </span>

            <form onSubmit={handleCreateExpenseCategory} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                value={newExpCatName}
                onChange={e => setNewExpCatName(e.target.value)}
                placeholder="اسم تصنيف المصروف (مثال: مستلزمات أسنان، كهرباء...)"
                className="sm:col-span-7 px-3 py-2.5 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-semibold focus:border-[#087e83] focus:outline-none"
              />
              <input
                type="number"
                min={0}
                value={newExpCatDefault}
                onChange={e => setNewExpCatDefault(e.target.value)}
                placeholder="سعر افتراضي (اختياري)"
                className="sm:col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newExpCatName.trim()}
                className="sm:col-span-2 px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة</span>
              </button>
            </form>

            {expenseCategories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {expenseCategories.map((cat, idx) => {
                  const isEditing = editingExpCat === cat.name;
                  const isConfirming = confirmDeleteExpCat === cat.name;
                  const pickerKey = `exp:${cat.name}`;
                  const customColor = listItemColors.expenseCategories?.[cat.name];
                  const colorBadgeStyle = getCustomColorBadgeStyle(customColor);

                  if (isEditing) {
                    return (
                      <form
                        key={cat.name}
                        onSubmit={e => handleSaveEditExpenseCategory(e, cat.name)}
                        className="p-2.5 rounded-2xl border-2 border-[#087e83] bg-white flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="text"
                          value={editExpCatName}
                          onChange={e => setEditExpCatName(e.target.value)}
                          placeholder="اسم التصنيف"
                          className="flex-1 min-w-[130px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:border-[#087e83] focus:outline-none"
                          autoFocus
                          required
                        />
                        <input
                          type="number"
                          min={0}
                          value={editExpCatDefault}
                          onChange={e => setEditExpCatDefault(e.target.value)}
                          placeholder="السعر الافتراضي"
                          className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1.5 rounded-lg bg-[#087e83] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> حفظ
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingExpCat(null)}
                          className="px-2 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={cat.name}
                      className="px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-[#fbfdfd]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => reorderExpenseCategories(moveArrayItem(expenseCategories, idx, -1))}
                              className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                              title="تحريك لأعلى"
                              aria-label="تحريك لأعلى"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === expenseCategories.length - 1}
                              onClick={() => reorderExpenseCategories(moveArrayItem(expenseCategories, idx, 1))}
                              className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                              title="تحريك لأسفل"
                              aria-label="تحريك لأسفل"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                          <span
                            className={`font-bold text-xs truncate ${
                              colorBadgeStyle ? 'px-2 py-0.5 rounded-full border' : 'text-slate-800'
                            }`}
                            style={colorBadgeStyle}
                          >
                            {cat.name}
                          </span>
                          {cat.defaultAmount && cat.defaultAmount > 0 ? (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#e7f5f2] text-[#087e83] flex-shrink-0">
                              افتراضي: {cat.defaultAmount.toLocaleString()} ج.م
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">بدون سعر افتراضي</span>
                          )}
                        </div>

                        {isConfirming ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-bold text-rose-700">حذف؟</span>
                            <button
                              type="button"
                              onClick={() => {
                                deleteExpenseCategory(cat.name);
                                setConfirmDeleteExpCat(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                            >
                              نعم
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteExpCat(null)}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setOpenColorPickerKey(prev => (prev === pickerKey ? null : pickerKey))}
                              className={`p-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                                openColorPickerKey === pickerKey
                                  ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#087e83]'
                              }`}
                              title="اختيار لون"
                              aria-label="اختيار لون"
                            >
                              {customColor ? (
                                <span
                                  className="w-3 h-3 rounded-full border border-black/15"
                                  style={{ backgroundColor: customColor }}
                                />
                              ) : (
                                <Palette className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingExpCat(cat.name);
                                setEditExpCatName(cat.name);
                                setEditExpCatDefault(cat.defaultAmount && cat.defaultAmount > 0 ? String(cat.defaultAmount) : '');
                                setConfirmDeleteExpCat(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-700 hover:text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>تعديل</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteExpCat(cat.name)}
                              className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          </div>
                        )}
                      </div>
                      {renderItemColorPalette('expenseCategories', cat.name, pickerKey)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-3">لا توجد تصنيفات مضافة حالياً.</p>
            )}
          </div>
        )}
      </div>

      {/* 3.9 Patient Follow-Up Statuses */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('followUpStatuses')}
          aria-expanded={Boolean(openSections.followUpStatuses)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.followUpStatuses ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-[#087e83]" />
            <span>حالات متابعة المرضى ({patientFollowUpStatuses.length})</span>
          </h2>
          {openSections.followUpStatuses ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.followUpStatuses && (
          <div className="pt-4 space-y-4 animate-in fade-in duration-150">
            <span className="text-xs text-slate-400 block">
              تظهر في قائمة متابعة المرضى وملف المريض (إضافة، تعديل، وحذف الحالات)
            </span>

            <form onSubmit={handleCreateFollowUpStatus} className="flex items-center gap-2">
              <input
                type="text"
                value={newFollowUpStatusInput}
                onChange={e => setNewFollowUpStatusInput(e.target.value)}
                placeholder="أضف حالة متابعة جديدة (مثال: بانتظار الأشعة، مؤجل...)"
                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-[#fbfdfd] text-xs font-semibold focus:border-[#087e83] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newFollowUpStatusInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة</span>
              </button>
            </form>

            {patientFollowUpStatuses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {patientFollowUpStatuses.map((st, idx) => {
                  const isEditing = editingFollowUpStatus === st;
                  const isConfirming = confirmDeleteFollowUpStatus === st;
                  const pickerKey = `fu:${st}`;
                  const customColor = getFollowUpStatusColorHex(st, listItemColors.followUpStatuses);
                  const colorBadgeStyle = getCustomColorBadgeStyle(customColor);

                  if (isEditing) {
                    return (
                      <form
                        key={st}
                        onSubmit={e => handleSaveEditFollowUpStatus(e, st)}
                        className="p-2.5 rounded-2xl border-2 border-[#087e83] bg-white flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={editFollowUpStatusValue}
                          onChange={e => setEditFollowUpStatusValue(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:border-[#087e83] focus:outline-none"
                          autoFocus
                          required
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1.5 rounded-lg bg-[#087e83] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> حفظ
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFollowUpStatus(null)}
                          className="px-2 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={st}
                      className="px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-[#fbfdfd]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => reorderPatientFollowUpStatuses(moveArrayItem(patientFollowUpStatuses, idx, -1))}
                              className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                              title="تحريك لأعلى"
                              aria-label="تحريك لأعلى"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === patientFollowUpStatuses.length - 1}
                              onClick={() => reorderPatientFollowUpStatuses(moveArrayItem(patientFollowUpStatuses, idx, 1))}
                              className="p-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-[#087e83] hover:border-[#087e83] disabled:opacity-30 cursor-pointer"
                              title="تحريك لأسفل"
                              aria-label="تحريك لأسفل"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                          <span
                            className={`font-bold text-xs truncate ${
                              colorBadgeStyle ? 'px-2 py-0.5 rounded-full border' : 'text-slate-800'
                            }`}
                            style={colorBadgeStyle}
                          >
                            {st}
                          </span>
                        </div>

                        {isConfirming ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-bold text-rose-700">حذف؟</span>
                            <button
                              type="button"
                              onClick={() => {
                                deletePatientFollowUpStatus(st);
                                setConfirmDeleteFollowUpStatus(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                            >
                              نعم
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFollowUpStatus(null)}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setOpenColorPickerKey(prev => (prev === pickerKey ? null : pickerKey))}
                              className={`p-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                                openColorPickerKey === pickerKey
                                  ? 'bg-[#e7f5f2] border-[#087e83] text-[#087e83]'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#087e83]'
                              }`}
                              title="اختيار لون"
                              aria-label="اختيار لون"
                            >
                              {customColor ? (
                                <span
                                  className="w-3 h-3 rounded-full border border-black/15"
                                  style={{ backgroundColor: customColor }}
                                />
                              ) : (
                                <Palette className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFollowUpStatus(st);
                                setEditFollowUpStatusValue(st);
                                setConfirmDeleteFollowUpStatus(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-700 hover:text-[#087e83] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>تعديل</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFollowUpStatus(st)}
                              className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          </div>
                        )}
                      </div>
                      {renderItemColorPalette('followUpStatuses', st, pickerKey)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-3">لا توجد حالات مضافة حالياً.</p>
            )}
          </div>
        )}
      </div>

      {/* 4. Staff Roster & Granular RBAC Permissions */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('staff')}
          aria-expanded={Boolean(openSections.staff)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.staff ? 'pb-3 border-b border-slate-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-[#172f3d] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#087e83]" />
            <span>الموظفين و الصلاحيات ({staffMembers.length})</span>
          </h2>
          {openSections.staff ? (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {openSections.staff && (
          <div className="pt-4 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-400">
                إضافة، تعديل، تعطيل أو حذف الموظفين وتخصيص صلاحيات كل موظف بدقة
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowAddStaffForm(prev => !prev);
                  setEditingStaffId(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {showAddStaffForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{showAddStaffForm ? 'إلغاء' : 'إضافة موظف'}</span>
              </button>
            </div>

        {staffSavedMsg && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{staffSavedMsg}</span>
          </div>
        )}

        {/* Inline Add New Staff Form */}
        {showAddStaffForm && (
          <form
            onSubmit={handleCreateStaff}
            className="p-4 rounded-2xl border border-[#bfe2db] bg-[#f4fbf9] space-y-3 animate-in fade-in duration-150"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم الموظف *</label>
                <input
                  type="text"
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  placeholder="مثال: سارة (استقبال)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:border-[#087e83] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الدور / الفئة الوظيفية</label>
                <select
                  value={newStaffRole}
                  onChange={e => handleNewStaffRoleChange(e.target.value as StaffRole)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:border-[#087e83] focus:outline-none"
                >
                  {(Object.keys(STAFF_ROLE_LABELS) as StaffRole[]).map(r => (
                    <option key={r} value={r}>
                      {STAFF_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">المسمى الوظيفي</label>
                <input
                  type="text"
                  value={newStaffJobTitle}
                  onChange={e => setNewStaffJobTitle(e.target.value)}
                  placeholder="مثال: مسؤولة حجز واستقبال"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم الموبايل</label>
                <input
                  type="tel"
                  value={newStaffPhone}
                  onChange={e => setNewStaffPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono focus:border-[#087e83] focus:outline-none"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الفرع / العيادة</label>
                <input
                  type="text"
                  value={newStaffBranch}
                  onChange={e => setNewStaffBranch(e.target.value)}
                  placeholder="مثال: عيادة ١ و ٢"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:border-[#087e83] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">بداية الشفت (من)</label>
                  <input
                    type="time"
                    value={newStaffShiftStart}
                    onChange={e => setNewStaffShiftStart(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">نهاية الشفت (إلى)</label>
                  <input
                    type="time"
                    value={newStaffShiftEnd}
                    onChange={e => setNewStaffShiftEnd(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">تقييد الوصول لفرع واحد (اختياري)</label>
                <select
                  value={newStaffRestrictedBranchId}
                  onChange={e => setNewStaffRestrictedBranchId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:border-[#087e83] focus:outline-none"
                >
                  <option value="">كل الفروع (بدون تقييد)</option>
                  {units.filter(u => !u.isDisabled).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">ربط بملف طبيب (اختياري)</label>
                <select
                  value={newStaffDoctorId}
                  onChange={e => setNewStaffDoctorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:border-[#087e83] focus:outline-none"
                >
                  <option value="">غير مرتبط بطبيب</option>
                  {doctors.filter(d => !d.isDisabled).map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                  ))}
                  <option value="__create_new__">+ إنشاء طبيب جديد وربطه تلقائياً</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newStaffExemptAttendance}
                    onChange={e => setNewStaffExemptAttendance(e.target.checked)}
                    className="w-4 h-4 accent-[#087e83] rounded"
                  />
                  <span>غير مطالب بالبصمة (يعمل من المنزل)</span>
                </label>
              </div>
            </div>

            {newStaffDoctorId === '__create_new__' && (
              <div className="p-3 rounded-xl bg-white border border-[#bfe2db] grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#087e83] mb-1">تخصص الطبيب الجديد</label>
                  <input
                    type="text"
                    value={newInlineDoctorSpecialty}
                    onChange={e => setNewInlineDoctorSpecialty(e.target.value)}
                    placeholder="مثال: جراحة وتجميل الأسنان"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#087e83] mb-1">لون الطبيب في الجدول</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newInlineDoctorColor}
                      onChange={e => setNewInlineDoctorColor(e.target.value)}
                      className="w-9 h-8 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <span className="text-[11px] font-mono text-slate-500">{newInlineDoctorColor}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Login Credentials for New Employee */}
            <div className="pt-2 border-t border-[#d8ece8] space-y-2.5">
              <div className="text-[11px] font-bold text-[#172f3d] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#087e83]" />
                <span>بيانات تسجيل الدخول للموظف (Username & Password)</span>
              </div>
              {newStaffError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{newStaffError}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم المستخدم (Username) *</label>
                  <input
                    type="text"
                    value={newStaffUsername}
                    onChange={e => setNewStaffUsername(e.target.value)}
                    placeholder="مثال: sara"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">كلمة المرور *</label>
                  <div className="relative">
                    <input
                      type={showNewStaffPassword ? 'text' : 'password'}
                      value={newStaffPassword}
                      onChange={e => setNewStaffPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full pr-3 pl-8 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold focus:border-[#087e83] focus:outline-none"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewStaffPassword(v => !v)}
                      className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showNewStaffPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    value={newStaffEmail}
                    onChange={e => setNewStaffEmail(e.target.value)}
                    placeholder="staff@clinic.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono focus:border-[#087e83] focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">رمز الاستعادة PIN (اختياري)</label>
                  <input
                    type="text"
                    value={newStaffRecoveryPin}
                    onChange={e => setNewStaffRecoveryPin(e.target.value)}
                    placeholder="مثال: 1234"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono focus:border-[#087e83] focus:outline-none"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* Default Branch Per Weekday for New Employee */}
            <div className="pt-2 border-t border-[#d8ece8] space-y-2">
              <div className="text-[11px] font-bold text-[#172f3d] flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-[#087e83]" />
                <span>الفرع الافتراضي للموظف حسب اليوم (يستخدم في تسجيل الشفت):</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {weekdaySettings.map(ws => (
                  <div key={ws.dayOfWeek} className="bg-white p-2 rounded-xl border border-[#d6e5e8]">
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">{ws.dayName}</label>
                    <select
                      value={newStaffDefaultUnitByDay[ws.dayOfWeek] || ''}
                      onChange={e =>
                        setNewStaffDefaultUnitByDay(prev => ({
                          ...prev,
                          [ws.dayOfWeek]: e.target.value
                        }))
                      }
                      className="w-full px-1.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-bold"
                    >
                      <option value="">افتراضي العيادة</option>
                      <option value={DAY_OFF_UNIT_ID}>إجازة</option>
                      {units.filter(u => !u.isDisabled).map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name.split('-')[0].trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Granular Permissions Selection for New Employee */}
            <div className="pt-2 border-t border-[#d8ece8] space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-[11px] font-bold text-[#172f3d] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#087e83]" />
                  <span>صلاحيات الموظف (عرض / إضافة / تعديل / حذف لكل قسم):</span>
                </span>
                <span className="text-[10px] text-slate-500">تم تعبئة الصلاحيات الافتراضية للدور ويمكنك تخصيص كل زر</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {PERMISSION_GROUPS.map(group => (
                  <div
                    key={group.id}
                    className="p-2.5 rounded-2xl bg-white border border-[#d6e5e8] space-y-2"
                  >
                    <div className="text-[11px] font-extrabold text-[#087e83]">{group.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map(p => {
                        const enabled = Boolean(newStaffPermissions[p.key]);
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() =>
                              setNewStaffPermissions(prev => ({ ...prev, [p.key]: !prev[p.key] }))
                            }
                            title={p.desc}
                            className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              enabled
                                ? actionPillColors[p.action].active
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            <span>{enabled ? '✓' : '✕'}</span>
                            <span>{p.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddStaffForm(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-xs cursor-pointer"
              >
                حفظ الموظف
              </button>
            </div>
          </form>
        )}

        {/* Staff Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {staffMembers.map(member => {
            const isCurrent = currentUser.id === member.id;
            const isEditing = editingStaffId === member.id;
            const isConfirmingDelete = confirmDeleteStaffId === member.id;
            const isExpandedPerms = expandedPermissionsStaffId === member.id;
            const enabledCount = PERMISSION_ITEMS.filter(p => Boolean(member.permissions[p.key])).length;

            if (isEditing) {
              return (
                <form
                  key={member.id}
                  onSubmit={e => handleSaveEditStaff(e, member)}
                  className="p-4 rounded-2xl border-2 border-[#087e83] bg-[#f6fbfa] space-y-2.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editStaffName}
                      onChange={e => setEditStaffName(e.target.value)}
                      placeholder="اسم الموظف"
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                      required
                    />
                    <select
                      value={editStaffRole}
                      onChange={e => setEditStaffRole(e.target.value as StaffRole)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                    >
                      {(Object.keys(STAFF_ROLE_LABELS) as StaffRole[]).map(r => (
                        <option key={r} value={r}>
                          {STAFF_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editStaffJobTitle}
                      onChange={e => setEditStaffJobTitle(e.target.value)}
                      placeholder="المسمى الوظيفي"
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                    />
                    <input
                      type="tel"
                      value={editStaffPhone}
                      onChange={e => setEditStaffPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                  <input
                    type="text"
                    value={editStaffBranch}
                    onChange={e => setEditStaffBranch(e.target.value)}
                    placeholder="العيادة / الفرع"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">بداية الشفت (من)</label>
                      <input
                        type="time"
                        value={editStaffShiftStart}
                        onChange={e => setEditStaffShiftStart(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">نهاية الشفت (إلى)</label>
                      <input
                        type="time"
                        value={editStaffShiftEnd}
                        onChange={e => setEditStaffShiftEnd(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">تقييد الوصول لفرع واحد (اختياري)</label>
                      <select
                        value={editStaffRestrictedBranchId}
                        onChange={e => setEditStaffRestrictedBranchId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                      >
                        <option value="">كل الفروع (بدون تقييد)</option>
                        {units.filter(u => !u.isDisabled).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ربط بملف طبيب (اختياري)</label>
                      <select
                        value={editStaffDoctorId}
                        onChange={e => setEditStaffDoctorId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                      >
                        <option value="">غير مرتبط بطبيب</option>
                        {doctors.filter(d => !d.isDisabled).map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                        ))}
                        <option value="__create_new__">+ إنشاء طبيب جديد وربطه تلقائياً</option>
                      </select>
                    </div>
                  </div>

                  {editStaffDoctorId === '__create_new__' && (
                    <div className="p-2 rounded-xl bg-white border border-[#bfe2db] grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editInlineDoctorSpecialty}
                        onChange={e => setEditInlineDoctorSpecialty(e.target.value)}
                        placeholder="تخصص الطبيب الجديد (مثال: تقويم)"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500">اللون:</span>
                        <input
                          type="color"
                          value={editInlineDoctorColor}
                          onChange={e => setEditInlineDoctorColor(e.target.value)}
                          className="w-8 h-7 rounded border border-slate-200 cursor-pointer"
                        />
                        <span className="text-[10px] font-mono text-slate-500">{editInlineDoctorColor}</span>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editStaffExemptAttendance}
                      onChange={e => setEditStaffExemptAttendance(e.target.checked)}
                      className="w-4 h-4 accent-[#087e83] rounded"
                    />
                    <span>غير مطالب بالبصمة (يعمل من المنزل)</span>
                  </label>

                  {/* Edit Login Credentials */}
                  <div className="p-2.5 rounded-xl bg-white border border-[#d6e5e8] space-y-2">
                    <div className="text-[11px] font-bold text-[#087e83] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>بيانات الدخول (تعديل اسم المستخدم وكلمة المرور)</span>
                    </div>
                    {editStaffError && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{editStaffError}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">اسم المستخدم *</label>
                        <input
                          type="text"
                          value={editStaffUsername}
                          onChange={e => setEditStaffUsername(e.target.value)}
                          placeholder="username"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                          required
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">كلمة المرور *</label>
                        <div className="relative">
                          <input
                            type={showEditStaffPassword ? 'text' : 'password'}
                            value={editStaffPassword}
                            onChange={e => setEditStaffPassword(e.target.value)}
                            placeholder="••••••"
                            className="w-full pr-2.5 pl-7 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                            required
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditStaffPassword(v => !v)}
                            className="absolute left-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showEditStaffPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">البريد الإلكتروني للاستعادة</label>
                        <input
                          type="email"
                          value={editStaffEmail}
                          onChange={e => setEditStaffEmail(e.target.value)}
                          placeholder="email@example.com"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono focus:bg-white focus:border-[#087e83] focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">رمز الاستعادة (PIN)</label>
                        <input
                          type="text"
                          value={editStaffRecoveryPin}
                          onChange={e => setEditStaffRecoveryPin(e.target.value)}
                          placeholder="مثال: 2026"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono focus:bg-white focus:border-[#087e83] focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Edit Per-Day Default Branch for Staff */}
                  <div className="p-2.5 rounded-xl bg-white border border-[#d6e5e8] space-y-2">
                    <div className="text-[11px] font-bold text-[#087e83] flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5" />
                      <span>الفرع الافتراضي للموظف حسب اليوم</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {weekdaySettings.map(ws => (
                        <div key={ws.dayOfWeek} className="bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                          <label className="block text-[9px] font-bold text-slate-500 mb-0.5">{ws.dayName}</label>
                          <select
                            value={editStaffDefaultUnitByDay[ws.dayOfWeek] || ''}
                            onChange={e =>
                              setEditStaffDefaultUnitByDay(prev => ({
                                ...prev,
                                [ws.dayOfWeek]: e.target.value
                              }))
                            }
                            className="w-full px-1 py-1 rounded border border-slate-200 bg-white text-[10px] font-bold"
                          >
                            <option value="">افتراضي العيادة</option>
                            <option value={DAY_OFF_UNIT_ID}>إجازة</option>
                            {units.filter(u => !u.isDisabled).map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name.split('-')[0].trim()}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {member.role !== editStaffRole && (
                    <p className="text-[10px] text-amber-700 font-semibold">
                      تنبيه: تغيير الدور سيُعيد ضبط الصلاحيات للافتراضي لهذا الدور (ويمكنك تخصيصها بعد الحفظ).
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingStaffId(null)}
                      className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 rounded-lg bg-[#087e83] text-white text-xs font-bold cursor-pointer"
                    >
                      حفظ التعديل
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div
                key={member.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  member.isDisabled
                    ? 'border-slate-200 bg-slate-50/80 opacity-75'
                    : isCurrent
                    ? 'border-[#087e83] bg-[#f7fcfb]'
                    : 'border-slate-200 bg-[#fbfdfd]'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#e7f5f2] text-[#087e83] flex items-center justify-center font-extrabold text-xs flex-shrink-0">
                        {member.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className={`font-bold text-xs sm:text-sm truncate ${member.isDisabled ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                            {member.name}
                          </h3>
                          {isCurrent && (
                            <span className="text-[10px] font-bold bg-[#087e83] text-white px-2 py-0.5 rounded-full">
                              الحساب النشط
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          {member.jobTitle} · {STAFF_ROLE_LABELS[member.role]}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        member.isDisabled
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {member.isDisabled ? 'معطّل' : 'نشط'}
                    </span>
                  </div>

                  {/* Login Credentials Summary Badge */}
                  <div className="flex items-center justify-between flex-wrap gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Lock className="w-3 h-3 text-[#087e83] flex-shrink-0" />
                      {member.username ? (
                        <span className="font-mono font-bold text-[#172f3d]" dir="ltr">
                          @{member.username}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-bold">بدون اسم مستخدم</span>
                      )}
                      {member.email && (
                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]" dir="ltr">
                          · {member.email}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        member.password
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {member.password ? 'كلمة مرور مفعّلة' : 'بدون كلمة مرور'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono" dir="ltr">{member.phone}</span>
                    <span>{member.branchName || 'عيادة ١ و ٢'}</span>
                  </div>
                  {(member.shiftStartTime || member.shiftEndTime) && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#087e83] bg-[#e7f5f2] px-2.5 py-1 rounded-xl">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        مواعيد الشفت:{' '}
                        {member.shiftStartTime ? formatCairoTime(member.shiftStartTime) : '--'}
                        {' ← '}
                        {member.shiftEndTime ? formatCairoTime(member.shiftEndTime) : '--'}
                      </span>
                    </div>
                  )}

                  {/* Branch restriction, Doctor Link, WFH Exempt & Leave Status */}
                  {(member.restrictedBranchId || member.doctorId || member.exemptFromAttendance || (member.attendanceExemptDates || []).includes(cairoTodayStr) || member.defaultUnitByDay?.[getCairoNowParts().weekday] === DAY_OFF_UNIT_ID) && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {member.restrictedBranchId && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                          <Building className="w-3 h-3" />
                          <span>مقيد بالفرع: {units.find(u => u.id === member.restrictedBranchId)?.name || member.restrictedBranchId}</span>
                        </span>
                      )}
                      {member.doctorId && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                          <Stethoscope className="w-3 h-3" />
                          <span>طبيب: {doctors.find(d => d.id === member.doctorId)?.name || member.doctorId}</span>
                        </span>
                      )}
                      {member.exemptFromAttendance && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                          <Home className="w-3 h-3" />
                          <span>معفى من البصمة (من المنزل)</span>
                        </span>
                      )}
                      {((member.attendanceExemptDates || []).includes(cairoTodayStr) || member.defaultUnitByDay?.[getCairoNowParts().weekday] === DAY_OFF_UNIT_ID) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <CalendarCheck className="w-3 h-3" />
                          <span>إجازة حضور اليوم</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Admin Quick Attendance Leave & WFH Exemption Controls */}
                  {member.role !== 'admin' && (
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                          <Home className="w-3 h-3 text-[#087e83]" />
                          <span>الحضور وإجازة البصمة</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleStaffAttendanceExempt(member.id)}
                          className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer ${
                            member.exemptFromAttendance
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {member.exemptFromAttendance ? 'معفى من البصمة ✓' : 'إعفاء دائم (عمل من المنزل)'}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <input
                          type="date"
                          value={leaveDateByStaffId[member.id] || cairoTodayStr}
                          onChange={e =>
                            setLeaveDateByStaffId(prev => ({ ...prev, [member.id]: e.target.value }))
                          }
                          className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-mono bg-slate-50"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            grantStaffAttendanceLeave(member.id, leaveDateByStaffId[member.id] || cairoTodayStr)
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#e7f5f2] hover:bg-[#d5eee8] text-[#087e83] border border-[#bfe2db] text-[10px] font-bold cursor-pointer"
                        >
                          منح إجازة حضور ليوم
                        </button>
                      </div>

                      {(member.attendanceExemptDates || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {(member.attendanceExemptDates || []).map(ld => (
                            <span
                              key={ld}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-mono font-bold"
                            >
                              <span>{ld}</span>
                              <button
                                type="button"
                                onClick={() => removeStaffAttendanceLeave(member.id, ld)}
                                className="hover:text-rose-700 cursor-pointer"
                                title="إلغاء إجازة هذا اليوم"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Expandable Per-Employee Permission Toggles */}
                {isExpandedPerms && (
                  <div className="pt-2.5 border-t border-slate-200 space-y-2.5 animate-in fade-in duration-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#172f3d]">
                        تخصيص الصلاحيات ({enabledCount}/{PERMISSION_ITEMS.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => applyRolePresetPermissions(member.id, member.role)}
                        className="text-[10px] font-bold text-[#087e83] hover:underline cursor-pointer"
                      >
                        استعادة افتراضي الدور
                      </button>
                    </div>
                    <div className="space-y-2">
                      {PERMISSION_GROUPS.map(group => (
                        <div
                          key={group.id}
                          className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5"
                        >
                          <div className="text-[11px] font-extrabold text-[#172f3d]">{group.title}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {group.items.map(p => {
                              const allowed = Boolean(member.permissions[p.key]);
                              const isProtectedSelfSetting =
                                isCurrent &&
                                p.key === 'manageSettings' &&
                                allowed &&
                                !staffMembers.some(s => s.id !== member.id && !s.isDisabled && s.permissions.manageSettings);

                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  disabled={isProtectedSelfSetting}
                                  onClick={() => updateStaffPermission(member.id, p.key, !allowed)}
                                  title={p.desc}
                                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition-colors ${
                                    isProtectedSelfSetting
                                      ? `${actionPillColors[p.action].active} opacity-60 cursor-not-allowed`
                                      : allowed
                                      ? `${actionPillColors[p.action].active} cursor-pointer`
                                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer'
                                  }`}
                                >
                                  <span>{allowed ? '✓' : '✕'}</span>
                                  <span>{p.shortLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 flex-wrap">
                  {isConfirmingDelete ? (
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="text-[11px] font-bold text-rose-700">تأكيد حذف الموظف؟</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            deleteStaffMember(member.id);
                            setConfirmDeleteStaffId(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          نعم، حذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteStaffId(null)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => startEditStaff(member)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#087e83] text-slate-700 hover:text-[#087e83] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPermissionsStaffId(isExpandedPerms ? null : member.id)
                          }
                          className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                            isExpandedPerms
                              ? 'bg-[#087e83] text-white border-[#087e83]'
                              : 'bg-[#e7f5f2] border-[#bfe2db] text-[#087e83] hover:bg-[#d6ede8]'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          <span>الصلاحيات ({enabledCount}/{PERMISSION_ITEMS.length})</span>
                        </button>

                        {!isCurrent && !member.isDisabled && (
                          <button
                            type="button"
                            onClick={() => setCurrentUser(member)}
                            className="px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="التبديل لهذا الحساب لمعاينة صلاحياته"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>تبديل للحساب</span>
                          </button>
                        )}
                      </div>

                      {!isCurrent && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleStaffDisabled(member.id)}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                              member.isDisabled
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                            <span>{member.isDisabled ? 'تفعيل' : 'تعطيل'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmDeleteStaffId(member.id)}
                            className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>حذف</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive Quick Permissions Matrix (RBAC) */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-extrabold text-[#172f3d] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#087e83]" />
              <span>مصفوفة ضبط الصلاحيات السريعة (RBAC)</span>
            </h3>
            <span className="text-[11px] text-slate-400">اضغط على أي خلية لتفعيل أو حجب الصلاحية فوراً</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 min-w-[180px]">الصلاحية</th>
                  {staffMembers.map(member => (
                    <th key={member.id} className="p-3 text-center min-w-[120px]">
                      <div className="font-extrabold text-[#172f3d] truncate">{member.name}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {STAFF_ROLE_LABELS[member.role]}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMISSION_GROUPS.map(group => (
                  <React.Fragment key={group.id}>
                    <tr className="bg-[#f4f9f9] border-y border-[#dce8eb]">
                      <td
                        colSpan={staffMembers.length + 1}
                        className="px-3 py-2 text-xs font-extrabold text-[#087e83]"
                      >
                        {group.title}
                      </td>
                    </tr>
                    {group.items.map(perm => (
                      <tr key={perm.key} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${actionPillColors[perm.action].badge}`}
                            >
                              {perm.shortLabel}
                            </span>
                            <span className="font-bold text-slate-800">{perm.label}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{perm.desc}</div>
                        </td>
                        {staffMembers.map(member => {
                          const allowed = Boolean(member.permissions[perm.key]);
                          const isProtectedSelfSetting =
                            currentUser.id === member.id &&
                            perm.key === 'manageSettings' &&
                            allowed &&
                            !staffMembers.some(s => s.id !== member.id && !s.isDisabled && s.permissions.manageSettings);

                          return (
                            <td key={member.id} className="p-2.5 text-center">
                              <button
                                type="button"
                                disabled={isProtectedSelfSetting}
                                onClick={() => updateStaffPermission(member.id, perm.key, !allowed)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                  isProtectedSelfSetting
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 opacity-70 cursor-not-allowed'
                                    : allowed
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 cursor-pointer'
                                    : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer'
                                }`}
                              >
                                {perm.key === 'hideAdminNotes' || perm.key === 'appointmentsOwnOnly' || perm.key === 'patientsOwnOnly'
                                  ? allowed
                                    ? '✓ مفعّل'
                                    : '✕ غير مفعّل'
                                  : allowed
                                  ? '✓ مسموح'
                                  : '✕ محجوب'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        )}
      </div>

      {/* 5. System Reset Danger Zone */}
      <div className="bg-white border border-rose-200 rounded-3xl p-4 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('reset')}
          aria-expanded={Boolean(openSections.reset)}
          className={`w-full flex items-center justify-between gap-2 text-right cursor-pointer ${
            openSections.reset ? 'pb-3 border-b border-rose-100' : ''
          }`}
        >
          <h2 className="text-base font-extrabold text-rose-800 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-rose-600" />
            <span>إعادة ضبط البيانات</span>
          </h2>
          {openSections.reset ? (
            <ChevronDown className="w-5 h-5 text-rose-400 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-rose-400 flex-shrink-0" />
          )}
        </button>

        {openSections.reset && (
          <div className="pt-4 flex items-center justify-between flex-wrap gap-3 animate-in fade-in duration-150">
            <p className="text-xs text-slate-500">
              مسح البيانات المحلية وإعادة التطبيق للوضع الافتراضي الأولي
            </p>
            {confirmReset ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-rose-700">تأكيد إعادة ضبط كل البيانات؟</span>
                <button
                  type="button"
                  onClick={handleResetData}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
                >
                  نعم، إعادة الضبط
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors cursor-pointer"
              >
                إعادة الضبط للوضع الافتراضي
              </button>
            )}
          </div>
        )}
      </div>

      {/* GPS Location Permission Modal */}
      {gpsPermissionModal && (
        <div
          onClick={() => setGpsPermissionModal(null)}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white border border-[#dce8eb] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    gpsPermissionModal.status === 'prompt'
                      ? 'bg-[#e7f5f2] text-[#087e83]'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {gpsPermissionModal.status === 'prompt' ? (
                    <MapPin className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#172f3d]">
                    {gpsPermissionModal.status === 'prompt'
                      ? 'إذن تحديد الموقع الجغرافي (GPS)'
                      : 'تفعيل صلاحية الموقع للفرع'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ضبط إحداثيات العيادة للتحقق من الحضور والانصراف
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGpsPermissionModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-700">
              {gpsPermissionModal.status === 'prompt' && (
                <div className="p-3.5 rounded-2xl bg-[#f4fbf9] border border-[#bfe2db] text-[#172f3d]">
                  اضغط على زر <span className="font-extrabold text-[#087e83]">«السماح بالوصول للموقع الآن»</span> بالأسفل، ثم اختر <span className="font-bold">السماح (Allow)</span> في نافذة المتصفح لالتقاط إحداثيات الفرع الحالي تلقائياً.
                </div>
              )}

              {(gpsPermissionModal.status === 'denied' || gpsPermissionModal.status === 'iframe_blocked') && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                    {gpsPermissionModal.status === 'iframe_blocked'
                      ? 'نافذة المعاينة المدمجة أو المتصفح تمنع طلب الموقع تلقائياً. يمكنك طلب الإذن مباشرة أو فتح التطبيق في نافذة مستقلة لظهور نافذة السماح.'
                      : 'تم حظر إذن الموقع الجغرافي سابقاً في المتصفح، لذا لم تظهر نافذة السماح.'}
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-[11px]">
                    <div className="font-extrabold text-[#172f3d]">خطوات السماح يدوياً من المتصفح:</div>
                    <div>١. اضغط على أيقونة <span className="font-bold">القفل 🔒</span> أو <span className="font-bold">الإعدادات ⚙️</span> بجانب رابط الموقع في الأعلى.</div>
                    <div>٢. فعّل خيار <span className="font-bold">الموقع الجغرافي (Location) ← السماح (Allow)</span>.</div>
                    <div>٣. تأكد من تشغيل خدمة الموقع (GPS) في الجهاز ثم اضغط «محاولة طلب الإذن الآن».</div>
                  </div>
                </div>
              )}

              {gpsPermissionModal.status === 'timeout' && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                  استغرق التقاط إحداثيات الـ GPS وقتاً طويلاً. يمكنك المحاولة مرة أخرى بالقرب من نافذة أو إدخال خط العرض والطول يدوياً من خرائط جوجل.
                </div>
              )}

              {gpsPermissionModal.status === 'unavailable' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  تعذر تحديد الموقع من الجهاز حالياً. تأكد من تفعيل خدمة الموقع (GPS) أو أدخل خط العرض والطول يدوياً.
                </div>
              )}

              {gpsPermissionModal.status === 'unsupported' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                  {gpsPermissionModal.detail || 'المتصفح لا يدعم خدمة تحديد الموقع الجغرافي (GPS).'}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              {gpsPermissionModal.status !== 'unsupported' && (
                <button
                  type="button"
                  disabled={unitGpsBusy}
                  onClick={() => requestDeviceGps(gpsPermissionModal.target, true)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <MapPin className="w-4 h-4" />
                  <span>
                    {unitGpsBusy
                      ? 'جاري تحديد الموقع...'
                      : gpsPermissionModal.status === 'prompt'
                      ? 'السماح بالوصول للموقع الآن'
                      : 'محاولة طلب الإذن الآن'}
                  </span>
                </button>
              )}

              {gpsPermissionModal.status === 'iframe_blocked' && typeof window !== 'undefined' && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setGpsPermissionModal(null)}
                  className="py-2.5 px-3.5 rounded-xl bg-[#e7f5f2] hover:bg-[#d5eee8] border border-[#bfe2db] text-[#087e83] font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح في نافذة مستقلة</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setGpsPermissionModal(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
