import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Patient,
  Appointment,
  AppointmentStatus,
  Invoice,
  Payment,
  Expense,
  Task,
  AttendanceRecord,
  WhatsAppTemplate,
  WhatsAppAlert,
  Doctor,
  ClinicUnit,
  WeekdaySetting,
  ProcedureItem,
  Operation,
  PatientFieldRequirements,
  StaffMember,
  StaffPermissions,
  StaffRole,
  AuditLogEntry,
  StaffComment,
  StaffAlertSettings,
  ExpenseCategoryItem,
  PatientFollowUpLogEntry,
  FinishedWorkActionType,
  ClinicColorListKey,
  ClinicListItemColors,
  StaffAlertLogEntry,
  StaffAlertLogStatus,
  StaffAlertLogType,
  StaffAlertInteraction,
  NotificationChannelMode,
  FollowUpViewPrefill
} from '../types/clinic';

import {
  INITIAL_EXPENSES,
  INITIAL_TASKS,
  INITIAL_ATTENDANCE,
  INITIAL_TEMPLATES,
  INITIAL_ALERTS,
  INITIAL_DOCTORS,
  INITIAL_UNITS,
  INITIAL_PROCEDURES,
  INITIAL_WEEKDAYS,
  getTodayDateString
} from '../data/mockData';
import { loadNativeArchive, NativeArchiveData } from '../data/nativeArchive';
import {
  formatCairoTime,
  formatTimeToArabicPeriod,
  getArabicWeekdayName,
  getCairoNowParts,
  CAIRO_TIMEZONE,
  CLINIC_ATTENDANCE_RADIUS_METERS,
  verifyUnitGeofence
} from '../utils/arabic';
import {
  buildWhatsAppUrl,
  computeScheduledForFromOffset,
  getPreferredPatientWhatsAppPhone,
  normalizePhoneKey,
  renderWhatsAppTemplate
} from '../utils/whatsapp';
import { SYSTEM_FOLLOW_UP_STATUSES, SYSTEM_PATIENT_TAGS } from '../utils/colors';
import { computeFeedbackTaskProgress, doesTaskOccurOnDate, isFeedbackTaskTitle } from '../utils/feedback';
import {
  FINISHED_WORK_STATUS_DONE,
  FINISHED_WORK_STATUS_NOT_INTERESTED,
  FINISHED_WORK_TASK_ID,
  FINISHED_WORK_TASK_TITLE,
  computeFinishedWorkTaskProgress,
  formatPostponeDaysArabic,
  getCairoDateStringFromIso,
  getYmdDiffDays,
  isFinishedWorkTaskTitle
} from '../utils/finishedWork';
import {
  MIDNIGHT_AUTO_END_REASON_PREFIX,
  findMidnightAutoEndCandidates,
  getDueStaffAppointmentAlerts,
  getDueStaffShiftAlerts,
  getEffectiveMobilePushChannel,
  isMidnightAutoEndedAttendance,
  parseAppointmentMinutes24,
  resolveEmployeeDefaultUnitForToday
} from '../utils/staffAlerts';
import {
  idbGet,
  idbGetDelta,
  idbSetDelta,
  idbDelete,
  StoredDeltaEntry,
  LargeDatasetKey,
  clearAllLargeDatasets,
  migrateLegacyLocalStorage
} from '../utils/storage';
import { onAuthStateChanged, signInAnonymously, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../firebase';
import {
  ADMIN_OWNER_EMAIL,
  OverlayCollectionName,
  OverlayDoc,
  PendingCloudOp,
  PendingCloudOpInput,
  PendingOverlayOp,
  applyPendingClinicConfig,
  applyPendingDocOps,
  applyPendingOverlayOps,
  applyPendingOverlayRecords,
  batchUpsertSyncOverlay,
  checkCloudInitialized,
  clearCloudOverlayCollection,
  clearPendingCloudOps,
  deleteCloudDoc,
  dequeuePendingCloudOpsBatch,
  enqueuePendingCloudOps,
  fetchCollectionFromServer,
  flushPendingQueuePersistenceNow,
  getPendingCloudCount,
  getPendingCloudOps,
  mergeSyncOverlay,
  normalizeAllowedEmails,
  removePendingCloudOpsByPredicate,
  sanitizeDocId,
  seedCollectionBatch,
  subscribeCollection,
  subscribeOverlayCollection,
  subscribePendingQueueChange,
  upsertCloudDoc,
  upsertSyncOverlay
} from '../utils/cloudSync';
import {
  ensurePushSubscription,
  scheduleServerTestPush,
  sendStaffPushAlert,
  syncPushScheduleToServer
} from '../utils/webPush';

export type ActiveView =
  | 'dashboard'
  | 'appointments'
  | 'patients'
  | 'patient_detail'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'attendance'
  | 'tasks'
  | 'whatsapp'
  | 'reports'
  | 'procedures'
  | 'excel_import'
  | 'settings'
  | 'audit_logs'
  | 'staff_comments'
  | 'staff_alerts'
  | 'patient_follow_up'
  | 'follow_up_logs'
  | 'notes';


export interface PatientsViewState {
  searchQuery: string;
  filterStatus: string;
  filterTag: string;
  filterDebtOnly: boolean;
  sortBy: 'name' | 'registered_desc' | 'registered_asc' | 'debt_desc' | 'billed_desc' | 'visits_desc';
  pageSize: number;
  currentPage: number;
}

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'مدير النظام',
  doctor: 'طبيب معالج',
  receptionist: 'استقبال وسكرتارية',
  nurse: 'تمريض ومساعدة',
  accountant: 'محاسب ومالية'
};

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, StaffPermissions> = {
  admin: {
    viewAppointments: true,
    addAppointments: true,
    editAppointments: true,
    deleteAppointments: true,
    appointmentsOwnOnly: false,
    viewPatients: true,
    addPatients: true,
    editPatients: true,
    deletePatients: true,
    viewClinicalNotes: true,
    addClinicalNotes: true,
    editClinicalNotes: true,
    deleteClinicalNotes: true,
    hideAdminNotes: false,
    viewInvoicesPayments: true,
    addInvoicesPayments: true,
    editInvoicesPayments: true,
    deleteInvoicesPayments: true,
    viewFinancialReports: true,
    viewExpenses: true,
    addExpenses: true,
    editExpenses: true,
    deleteExpenses: true,
    viewTasks: true,
    addTasks: true,
    editTasks: true,
    deleteTasks: true,
    viewProcedures: true,
    addProcedures: true,
    editProcedures: true,
    deleteProcedures: true,
    manualAttendance: true,
    manageSettings: true
  },
  doctor: {
    viewAppointments: true,
    addAppointments: true,
    editAppointments: true,
    deleteAppointments: false,
    appointmentsOwnOnly: false,
    viewPatients: true,
    addPatients: true,
    editPatients: true,
    deletePatients: false,
    patientsOwnOnly: true,
    viewClinicalNotes: true,
    addClinicalNotes: true,
    editClinicalNotes: true,
    deleteClinicalNotes: false,
    hideAdminNotes: false,
    viewInvoicesPayments: false,
    addInvoicesPayments: false,
    editInvoicesPayments: false,
    deleteInvoicesPayments: false,
    viewFinancialReports: false,
    viewExpenses: false,
    addExpenses: false,
    editExpenses: false,
    deleteExpenses: false,
    viewTasks: true,
    addTasks: true,
    editTasks: true,
    deleteTasks: false,
    viewProcedures: true,
    addProcedures: false,
    editProcedures: false,
    deleteProcedures: false,
    manualAttendance: false,
    manageSettings: false
  },
  receptionist: {
    viewAppointments: true,
    addAppointments: true,
    editAppointments: true,
    deleteAppointments: false,
    appointmentsOwnOnly: false,
    viewPatients: true,
    addPatients: true,
    editPatients: true,
    deletePatients: false,
    viewClinicalNotes: false,
    addClinicalNotes: false,
    editClinicalNotes: false,
    deleteClinicalNotes: false,
    hideAdminNotes: false,
    viewInvoicesPayments: true,
    addInvoicesPayments: true,
    editInvoicesPayments: false,
    deleteInvoicesPayments: false,
    viewFinancialReports: false,
    viewExpenses: false,
    addExpenses: false,
    editExpenses: false,
    deleteExpenses: false,
    viewTasks: true,
    addTasks: true,
    editTasks: true,
    deleteTasks: false,
    viewProcedures: true,
    addProcedures: false,
    editProcedures: false,
    deleteProcedures: false,
    manualAttendance: false,
    manageSettings: false
  },
  nurse: {
    viewAppointments: true,
    addAppointments: true,
    editAppointments: true,
    deleteAppointments: false,
    appointmentsOwnOnly: false,
    viewPatients: true,
    addPatients: false,
    editPatients: false,
    deletePatients: false,
    viewClinicalNotes: true,
    addClinicalNotes: true,
    editClinicalNotes: true,
    deleteClinicalNotes: false,
    hideAdminNotes: false,
    viewInvoicesPayments: false,
    addInvoicesPayments: false,
    editInvoicesPayments: false,
    deleteInvoicesPayments: false,
    viewFinancialReports: false,
    viewExpenses: false,
    addExpenses: false,
    editExpenses: false,
    deleteExpenses: false,
    viewTasks: true,
    addTasks: true,
    editTasks: true,
    deleteTasks: false,
    viewProcedures: true,
    addProcedures: false,
    editProcedures: false,
    deleteProcedures: false,
    manualAttendance: false,
    manageSettings: false
  },
  accountant: {
    viewAppointments: false,
    addAppointments: false,
    editAppointments: false,
    deleteAppointments: false,
    appointmentsOwnOnly: false,
    viewPatients: false,
    addPatients: false,
    editPatients: false,
    deletePatients: false,
    viewClinicalNotes: false,
    addClinicalNotes: false,
    editClinicalNotes: false,
    deleteClinicalNotes: false,
    hideAdminNotes: false,
    viewInvoicesPayments: true,
    addInvoicesPayments: true,
    editInvoicesPayments: true,
    deleteInvoicesPayments: true,
    viewFinancialReports: true,
    viewExpenses: true,
    addExpenses: true,
    editExpenses: true,
    deleteExpenses: true,
    viewTasks: false,
    addTasks: false,
    editTasks: false,
    deleteTasks: false,
    viewProcedures: true,
    addProcedures: true,
    editProcedures: true,
    deleteProcedures: false,
    manualAttendance: false,
    manageSettings: false
  }
};

function normalizeStaffPermissions(raw: unknown, role: StaffRole): StaffPermissions {
  const base = { ...DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.receptionist };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  const boolOr = (key: string, legacyKey: string | null, fallback: boolean): boolean => {
    if (typeof r[key] === 'boolean') return r[key] as boolean;
    if (legacyKey && typeof r[legacyKey] === 'boolean') return r[legacyKey] as boolean;
    return fallback;
  };

  return {
    viewAppointments: boolOr('viewAppointments', null, base.viewAppointments),
    addAppointments: boolOr('addAppointments', 'manageAppointments', base.addAppointments),
    editAppointments: boolOr('editAppointments', 'manageAppointments', base.editAppointments),
    deleteAppointments: boolOr('deleteAppointments', 'manageAppointments', base.deleteAppointments),
    appointmentsOwnOnly: typeof r.appointmentsOwnOnly === 'boolean' ? r.appointmentsOwnOnly : Boolean(base.appointmentsOwnOnly),

    viewPatients: boolOr('viewPatients', null, base.viewPatients),
    addPatients: boolOr('addPatients', 'managePatients', base.addPatients),
    editPatients: boolOr('editPatients', 'managePatients', base.editPatients),
    deletePatients: boolOr('deletePatients', 'managePatients', base.deletePatients),

    viewClinicalNotes: boolOr('viewClinicalNotes', null, base.viewClinicalNotes),
    addClinicalNotes: boolOr('addClinicalNotes', 'viewClinicalNotes', base.addClinicalNotes),
    editClinicalNotes: boolOr('editClinicalNotes', 'viewClinicalNotes', base.editClinicalNotes),
    deleteClinicalNotes: boolOr('deleteClinicalNotes', 'viewClinicalNotes', base.deleteClinicalNotes),
    hideAdminNotes: boolOr('hideAdminNotes', null, Boolean(base.hideAdminNotes)),

    viewInvoicesPayments: boolOr('viewInvoicesPayments', null, base.viewInvoicesPayments),
    addInvoicesPayments: boolOr('addInvoicesPayments', 'manageInvoicesPayments', base.addInvoicesPayments),
    editInvoicesPayments: boolOr('editInvoicesPayments', 'manageInvoicesPayments', base.editInvoicesPayments),
    deleteInvoicesPayments: boolOr('deleteInvoicesPayments', 'voidInvoicesPayments', base.deleteInvoicesPayments),
    viewFinancialReports: boolOr('viewFinancialReports', null, base.viewFinancialReports),

    viewExpenses: boolOr('viewExpenses', null, base.viewExpenses),
    addExpenses: boolOr('addExpenses', 'manageExpenses', base.addExpenses),
    editExpenses: boolOr('editExpenses', 'manageExpenses', base.editExpenses),
    deleteExpenses: boolOr('deleteExpenses', 'manageExpenses', base.deleteExpenses),

    viewTasks: boolOr('viewTasks', null, base.viewTasks),
    addTasks: boolOr('addTasks', null, base.addTasks),
    editTasks: boolOr('editTasks', null, base.editTasks),
    deleteTasks: boolOr('deleteTasks', null, base.deleteTasks),

    viewProcedures: boolOr('viewProcedures', null, base.viewProcedures),
    addProcedures: boolOr('addProcedures', null, base.addProcedures),
    editProcedures: boolOr('editProcedures', null, base.editProcedures),
    deleteProcedures: boolOr('deleteProcedures', null, base.deleteProcedures),

    manualAttendance: boolOr('manualAttendance', null, base.manualAttendance),
    manageSettings: boolOr('manageSettings', null, base.manageSettings)
  };
}

export type DeviceLayout = 'mobile' | 'tablet' | 'desktop';

const detectDeviceLayout = (): DeviceLayout => {
  if (typeof window === 'undefined') return 'desktop';

  const w = window.innerWidth;
  const h = window.innerHeight;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

  const isPhoneUA =
    /iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua));
  const isTabletUA =
    /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));

  if (w < 768) {
    return 'mobile';
  }

  // Phone rotated to landscape remains in mobile layout
  if (isPhoneUA && Math.min(w, h) < 560) {
    return 'mobile';
  }

  if (w >= 1024) {
    return 'desktop';
  }

  // Mobile browsers in "View as Desktop / Desktop Site" typically report ~980px width with a non-mobile UA
  if (w >= 960 && !isPhoneUA && !isTabletUA) {
    return 'desktop';
  }

  return 'tablet';
};

interface ClinicContextType {
  // State
  patients: Patient[];
  appointments: Appointment[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  tasks: Task[];
  attendance: AttendanceRecord[];
  whatsappTemplates: WhatsAppTemplate[];
  whatsappAlerts: WhatsAppAlert[];
  doctors: Doctor[];
  units: ClinicUnit[];
  staffMembers: StaffMember[];
  procedures: ProcedureItem[];
  operations: Operation[];
  weekdaySettings: WeekdaySetting[];
  referralSources: string[];
  patientTags: string[];
  expenseCategories: ExpenseCategoryItem[];
  patientFollowUpStatuses: string[];
  listItemColors: ClinicListItemColors;
  patientFollowUpLogs: PatientFollowUpLogEntry[];
  patientRequiredFields: PatientFieldRequirements;
  staffAlertSettings: StaffAlertSettings;
  staffAlertLogs: StaffAlertLogEntry[];
  staffAlertSnoozeUntil: number | null;
  testNotificationTriggerAt: number | null;
  isTestNotificationDue: boolean;
  webPushReady: boolean;
  refreshWebPushSubscription: () => Promise<boolean>;
  enableMobilePushNotifications: () => Promise<{ ok: boolean; permission: NotificationPermission | 'unsupported'; reason?: string }>;
  scheduleTestNotificationInOneMinute: () => void;
  dismissTestNotification: () => void;
  recordStaffAlertTrigger: (params: {
    targetKey: string;
    alertType: StaffAlertLogType;
    title: string;
    message: string;
    patientId?: string;
    patientName?: string;
    appointmentId?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    targetStaffIds?: string[];
    targetStaffNames?: string[];
    channel?: NotificationChannelMode;
  }) => void;
  recordStaffAlertInteraction: (params: {
    targetKey: string;
    action: string;
    actionLabel: string;
    newStatus?: StaffAlertLogStatus;
    source?: string;
    fallbackMeta?: {
      alertType: StaffAlertLogType;
      title: string;
      message: string;
      patientId?: string;
      patientName?: string;
      appointmentId?: string;
      appointmentDate?: string;
      appointmentTime?: string;
      channel?: NotificationChannelMode;
    };
  }) => void;
  deleteStaffAlertLog: (id: string) => void;
  clearStaffAlertLogs: () => void;
  currentDate: string; // YYYY-MM-DD
  cairoTodayStr: string; // Live Cairo YYYY-MM-DD
  activeView: ActiveView;
  selectedPatientId: string | null;
  patientDetailFocusNotes: boolean;
  clearPatientDetailFocusNotes: () => void;
  reportsInitialPeriod: 'today' | 'week' | 'month' | 'year' | 'all' | 'custom' | null;
  clearReportsInitialPeriod: () => void;
  openReportsForToday: () => void;
  currentUser: StaffMember;
  hasPermission: (permission: keyof StaffPermissions) => boolean;
  restrictedUnit: ClinicUnit | undefined;
  isUnitAllowed: (unitId?: string, branchName?: string) => boolean;
  isPatientAllowed: (patientId: string) => boolean;
  isDrawerOpen: boolean;
  isQuickActionOpen: boolean;
  isGlobalSearchOpen: boolean;
  isPWAInstallModalOpen: boolean;
  deviceLayout: DeviceLayout;
  quickActionInitialTab?: 'appointment' | 'patient' | 'invoice' | 'payment' | 'expense' | 'task';
  quickActionPrefill?: { date?: string; time?: string; unitId?: string; doctorId?: string; patientId?: string; appointmentId?: string; invoiceId?: string; amount?: number; toothNumber?: number; toothNumbers?: number[] };
  followUpViewPrefill: FollowUpViewPrefill | null;

  // Navigation & View Persistence
  setActiveView: (view: ActiveView) => void;
  navigateToPatientFollowUp: (prefill: FollowUpViewPrefill) => void;
  clearFollowUpViewPrefill: () => void;
  goToPatient: (patientId: string, options?: { focusNotes?: boolean }) => void;
  goBack: () => void;
  switchBottomTab: (
    tabId: 'dashboard' | 'appointments' | 'patients' | 'accounts',
    defaultView: ActiveView,
    forceTodayFilter?: 'invoices' | 'payments' | 'expenses'
  ) => void;
  registerScrollContainer: (el: HTMLElement | null) => void;
  scrollToTop: () => void;
  patientsViewState: PatientsViewState;
  setPatientsViewState: React.Dispatch<React.SetStateAction<PatientsViewState>>;
  invoicesTodayOnly: boolean;
  setInvoicesTodayOnly: (v: boolean) => void;
  paymentsTodayOnly: boolean;
  setPaymentsTodayOnly: (v: boolean) => void;
  expensesTodayOnly: boolean;
  setExpensesTodayOnly: (v: boolean) => void;
  setCurrentDate: (date: string) => void;
  resetToToday: () => void;
  stepDate: (days: number) => void;
  setIsDrawerOpen: (open: boolean) => void;
  setIsQuickActionOpen: (
    open: boolean,
    tab?: 'appointment' | 'patient' | 'invoice' | 'payment' | 'expense' | 'task',
    prefill?: { date?: string; time?: string; unitId?: string; doctorId?: string; patientId?: string; appointmentId?: string; invoiceId?: string; amount?: number; toothNumber?: number; toothNumbers?: number[] }
  ) => void;
  setIsGlobalSearchOpen: (open: boolean) => void;
  setIsPWAInstallModalOpen: (open: boolean) => void;
  setCurrentUser: (user: Pick<StaffMember, 'id'> | StaffMember) => void;

  // Mutations
  addPatient: (patient: Omit<Patient, 'id' | 'registeredDate' | 'totalBilled' | 'totalPaid' | 'outstandingBalance' | 'notes'> & { registeredDate?: string }) => Patient;
  updatePatient: (id: string, updates: Partial<Patient>) => void;
  setPatientDefaultWhatsAppPhone: (patientId: string, which: 'primary' | 'secondary') => void;
  setPatientPhoneNoWhatsApp: (patientId: string, phone: string, isNoWhatsApp: boolean) => void;
  registerPatientWhatsAppPhone: (patientId: string, newPhone: string, slot?: 'primary' | 'secondary') => void;
  deletePatient: (id: string) => void;
  addPatientNote: (patientId: string, content: string, toothNumber?: number | number[], audioDataUrl?: string, audioDurationSeconds?: number) => void;
  updatePatientNote: (patientId: string, noteId: string, content: string, toothNumber?: number | number[]) => void;
  deletePatientNote: (patientId: string, noteId: string) => void;
  togglePalmerTooth: (patientId: string, toothNumber: number) => void;

  addAppointment: (appt: Omit<Appointment, 'id' | 'createdAt'>) => { success: boolean; conflict?: Appointment };
  updateAppointmentStatus: (id: string, status: AppointmentStatus) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  checkAppointmentConflict: (date: string, time: string, durationMinutes: number, unitId: string, excludeId?: string) => Appointment | undefined;

  addInvoice: (invoice: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt'>) => Invoice;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  voidInvoice: (id: string) => void;

  addPayment: (payment: Omit<Payment, 'id' | 'receiptNumber' | 'createdAt'>) => Payment;
  updatePayment: (id: string, updates: Partial<Payment>) => void;
  voidPayment: (id: string) => void;
  payAllInvoices: (patientId: string, amount: number, method: Payment['paymentMethod'], notes?: string) => void;

  addExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

  addTask: (task: Omit<Task, 'id' | 'isCompleted'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTask: (id: string, targetDate?: string, completionSource?: string) => void;
  adminCompleteTask: (id: string, targetDate?: string, completionSource?: string) => void;
  deleteTask: (id: string) => void;

  shiftAlertFeedback: {
    type: 'loading' | 'success' | 'error';
    action: 'shift_start' | 'shift_end';
    text: string;
  } | null;
  clearShiftAlertFeedback: () => void;
  shiftStartSnoozeUntil: number | null;
  shiftEndSnoozeUntil: number | null;
  snoozeShiftStart: (minutes?: number) => void;
  snoozeShiftEnd: (minutes?: number) => void;
  triggerShiftActionFromAlert: (
    action: 'shift_start' | 'shift_end',
    source?: string,
    overrideUnitId?: string
  ) => Promise<{ success: boolean; error?: string; unitName?: string }>;

  clockIn: (
    unitId: string,
    isManual?: boolean,
    manualReason?: string,
    manualOverrides?: { userId?: string; userName?: string; date?: string; clockIn?: string },
    alertSource?: string
  ) => { success: boolean; error?: string };
  clockOut: (recordId: string, alertSource?: string) => void;
  editAttendanceRecord: (id: string, updates: Partial<AttendanceRecord>) => void;
  deleteAttendanceRecord: (id: string) => void;
  editingAttendanceId: string | null;
  openAttendanceShiftEdit: (recordId: string) => void;
  clearEditingAttendanceId: () => void;
  toggleStaffAttendanceExempt: (staffId: string) => void;
  grantStaffAttendanceLeave: (staffId: string, dateStr: string) => void;
  removeStaffAttendanceLeave: (staffId: string, dateStr: string) => void;

  sendWhatsAppAlert: (id: string) => void;
  confirmWhatsAppAlertSent: (id: string) => void;
  markWhatsAppAlertOpened: (id: string) => void;
  dismissWhatsAppAlert: (id: string, noWhatsApp?: boolean) => void;
  toggleWhatsAppTemplate: (id: string) => void;
  addWhatsAppTemplate: (template: Omit<WhatsAppTemplate, 'id'>) => void;
  updateWhatsAppTemplate: (id: string, updates: Partial<WhatsAppTemplate>) => void;

  addProcedure: (procedure: Omit<ProcedureItem, 'id'>) => void;
  updateProcedure: (id: string, updates: Partial<ProcedureItem>) => void;
  deleteProcedure: (id: string) => void;

  addOperation: (operation: Omit<Operation, 'id' | 'createdAt'>) => Operation;
  updateOperation: (id: string, updates: Partial<Operation>) => void;
  deleteOperation: (id: string) => void;

  importPatientsFromExcel: (rows: any[]) => number;
  exportDataToExcel: (type: 'patients' | 'invoices' | 'payments' | 'operations' | 'all') => Promise<void>;

  updateWeekdaySetting: (dayOfWeek: number, updates: Partial<WeekdaySetting>) => void;
  addUnit: (unit: Omit<ClinicUnit, 'id'>) => ClinicUnit;
  updateUnit: (id: string, updates: Partial<ClinicUnit>) => void;
  toggleUnitDisabled: (id: string) => void;
  deleteUnit: (id: string) => void;
  addDoctor: (doctor: Omit<Doctor, 'id'>) => Doctor;
  updateDoctor: (id: string, updates: Partial<Doctor>) => void;
  toggleDoctorDisabled: (id: string) => void;
  deleteDoctor: (id: string) => void;
  addStaffMember: (member: Omit<StaffMember, 'id'>) => StaffMember;
  updateStaffMember: (id: string, updates: Partial<StaffMember>) => void;
  toggleStaffDisabled: (id: string) => void;
  deleteStaffMember: (id: string) => void;
  updateStaffPermission: (id: string, key: keyof StaffPermissions, value: boolean) => void;
  applyRolePresetPermissions: (id: string, role: StaffRole) => void;
  addReferralSource: (source: string) => void;
  updateReferralSource: (oldSource: string, newSource: string) => void;
  deleteReferralSource: (source: string) => void;
  reorderReferralSources: (ordered: string[]) => void;
  addPatientTag: (tag: string) => void;
  updatePatientTag: (oldTag: string, newTag: string) => Promise<void>;
  deletePatientTag: (tag: string) => Promise<void>;
  reorderPatientTags: (ordered: string[]) => void;
  addExpenseCategory: (name: string, defaultAmount?: number) => void;
  updateExpenseCategory: (oldName: string, newName: string, defaultAmount?: number) => void;
  deleteExpenseCategory: (name: string) => void;
  reorderExpenseCategories: (ordered: ExpenseCategoryItem[]) => void;
  addPatientFollowUpStatus: (status: string) => void;
  updatePatientFollowUpStatus: (oldStatus: string, newStatus: string) => void;
  deletePatientFollowUpStatus: (status: string) => void;
  reorderPatientFollowUpStatuses: (ordered: string[]) => void;
  setListItemColor: (listKey: ClinicColorListKey, itemName: string, color?: string) => void;
  changePatientFollowUpStatus: (
    patientId: string,
    newStatus: string,
    notesOrOptions?:
      | string
      | {
          notes?: string;
          audioDataUrl?: string;
          audioDurationSeconds?: number;
          feedbackOutcome?: 'done' | 'not_done';
          feedbackDate?: string;
          taskType?: 'feedback' | 'finished_work';
          finishedWorkAction?: FinishedWorkActionType;
          finishedWorkAttempt?: number;
          snoozeUntilDate?: string;
          actionDate?: string;
          addTags?: string[];
          removeTags?: string[];
          keepCurrentStatus?: boolean;
        }
  ) => string | undefined;
  updatePatientFollowUpLog: (
    id: string,
    updates: Partial<
      Pick<
        PatientFollowUpLogEntry,
        'previousStatus' | 'newStatus' | 'notes' | 'audioDataUrl' | 'audioDurationSeconds'
      >
    >
  ) => void;
  deletePatientFollowUpLog: (id: string) => { reverted: boolean; previousStatus?: string };
  revertPatientFollowUpLog: (id: string) => { success: boolean; message: string };
  updatePatientRequiredFields: (updates: Partial<PatientFieldRequirements>) => void;
  updateStaffAlertSettings: (updates: Partial<StaffAlertSettings>) => void;
  setStaffAlertSnoozeUntil: (untilMs: number | null) => void;
  reloadNativeDatabase: () => Promise<void>;

  darkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;

  clinicStartHour: number;
  clinicEndHour: number;
  updateClinicWorkingHours: (start: number, end: number) => void;

  isLoggedIn: boolean;
  login: (usernameOrEmail: string, pass: string, rememberDevice?: boolean) => { success: boolean; error?: string };
  logout: () => void;
  resetPasswordByEmail: (
    email: string,
    verification: string,
    newPassword: string
  ) => { success: boolean; error?: string };

  archiveReady: boolean;
  cloudUser: { uid: string; email: string; displayName: string; isAnonymous?: boolean } | null;
  cloudAuthReady: boolean;
  cloudSynced: boolean;
  cloudAttendanceReady: boolean;
  completedShiftDates: Record<string, string>;
  cloudError: string | null;
  cloudNeedsConsoleSetup: boolean;
  pendingCloudCount: number;
  retryCloudConnect: () => Promise<{ success: boolean; error?: string }>;
  retryPendingCloudSync: () => Promise<{ success: boolean; error?: string }>;
  flushPendingCloudOps: () => Promise<void>;
  pushLocalChangesToCloud: () => Promise<void>;

  auditLogs: AuditLogEntry[];
  deleteAuditLogEntry: (id: string) => void;
  clearAuditLogs: () => void;
  revertAuditLogEntry: (id: string) => { success: boolean; message: string };
  logAuditAction: (
    action: AuditLogEntry['action'],
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    entityName: string,
    description: string,
    previousData?: any,
    newData?: any,
    targetView?: string,
    targetId?: string
  ) => void;

  staffComments: StaffComment[];
  addStaffComment: (
    staffId: string,
    content: string,
    options?: { durationDays?: number | null; durationLabel?: string }
  ) => void;
  repeatStaffComment: (id: string) => void;
  unrepeatStaffComment: (id: string) => void;
  hideStaffComment: (id: string) => void;
  restoreStaffComment: (
    id: string,
    options?: { durationDays?: number | null; durationLabel?: string }
  ) => void;
  deleteStaffComment: (id: string) => void;
}


const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

const LOCAL_STORAGE_PREFIX = 'cf_mai_';

const lastSavedJsonByKey = new Map<string, string>();
const dirtyLocalKeys = new Set<string>();

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    if (raw !== null) {
      lastSavedJsonByKey.set(key, raw);
      return JSON.parse(raw);
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return;
  }
  dirtyLocalKeys.delete(key);
  if (lastSavedJsonByKey.get(key) === json) {
    return;
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + key, json);
    lastSavedJsonByKey.set(key, json);
  } catch (e) {
    // Clean up any oversized legacy keys and retry once silently
    try {
      ['patients', 'appointments', 'invoices', 'payments', 'operations'].forEach(k =>
        localStorage.removeItem(LOCAL_STORAGE_PREFIX + k)
      );
      localStorage.setItem(LOCAL_STORAGE_PREFIX + key, json);
      lastSavedJsonByKey.set(key, json);
    } catch (retryErr) {
      console.warn('Storage warning for', key, retryErr, e);
    }
  }
}

function useDebouncedStorage<T>(key: string, value: T, delayMs: number = 200): void {
  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    dirtyLocalKeys.add(key);
    const timer = window.setTimeout(() => saveToStorage(key, value), delayMs);
    return () => window.clearTimeout(timer);
  }, [key, value, delayMs]);
}

function deduplicateInvoicesAndPayments(
  rawInvoices: Invoice[],
  rawPayments: Payment[]
): {
  invoices: Invoice[];
  payments: Payment[];
  droppedInvoices: Invoice[];
  droppedPayments: Payment[];
  hasChanges: boolean;
} {
  const activeInvs = rawInvoices.filter(i => i.status !== 'voided');
  const voidedInvs = rawInvoices.filter(i => i.status === 'voided');

  const invGroups = new Map<string, Invoice[]>();
  activeInvs.forEach(inv => {
    const key = `${inv.patientId}::${inv.date}::${Math.round((Number(inv.netTotal) || 0) * 100)}`;
    const arr = invGroups.get(key);
    if (arr) arr.push(inv);
    else invGroups.set(key, [inv]);
  });

  const pickCanonicalInvoice = (a: Invoice, b: Invoice): number => {
    const aIsArch = a.id.startsWith('inv_pat_');
    const bIsArch = b.id.startsWith('inv_pat_');
    if (aIsArch !== bIsArch) return aIsArch ? -1 : 1;
    const tA = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tB = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (!isNaN(tA) && !isNaN(tB) && tA !== tB) return tA - tB;
    if ((b.paidAmount || 0) !== (a.paidAmount || 0)) return (b.paidAmount || 0) - (a.paidAmount || 0);
    return a.id.localeCompare(b.id);
  };

  const keptActiveInvs: Invoice[] = [];
  const droppedInvoices: Invoice[] = [];
  const invRemap = new Map<string, Invoice>();
  const affectedPatientIds = new Set<string>();

  invGroups.forEach(group => {
    if (group.length === 1) {
      keptActiveInvs.push(group[0]);
      return;
    }
    const sorted = [...group].sort(pickCanonicalInvoice);
    const winner = sorted[0];
    keptActiveInvs.push(winner);
    affectedPatientIds.add(winner.patientId);
    for (let i = 1; i < sorted.length; i++) {
      droppedInvoices.push(sorted[i]);
      invRemap.set(sorted[i].id, winner);
    }
  });

  // Remap payments referencing dropped duplicate invoices onto the kept canonical invoice
  const mappedPayments = rawPayments.map(p => {
    const target = p.invoiceId ? invRemap.get(p.invoiceId) : undefined;
    if (!target) return p;
    return {
      ...p,
      invoiceId: target.id,
      invoiceNumber: target.invoiceNumber
    };
  });

  const activeInvIds = new Set(keptActiveInvs.map(i => i.id));
  const activePays = mappedPayments.filter(p => p.status !== 'voided');
  const voidedPays = mappedPayments.filter(p => p.status === 'voided');

  // Group payments by (patientId, date, amount) — keeping payments only separate if they belong to distinct active invoices
  const payGroups = new Map<string, Payment[]>();
  activePays.forEach(p => {
    const invKey = p.invoiceId && activeInvIds.has(p.invoiceId) ? p.invoiceId : 'UNLINKED';
    const key = `${p.patientId}::${p.date}::${Math.round((Number(p.amount) || 0) * 100)}::${invKey}`;
    const arr = payGroups.get(key);
    if (arr) arr.push(p);
    else payGroups.set(key, [p]);
  });

  const pickCanonicalPayment = (a: Payment, b: Payment): number => {
    const aIsArch = a.id.startsWith('pay_pat_');
    const bIsArch = b.id.startsWith('pay_pat_');
    if (aIsArch !== bIsArch) return aIsArch ? -1 : 1;
    const tA = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tB = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (!isNaN(tA) && !isNaN(tB) && tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  };

  const keptActivePays: Payment[] = [];
  const droppedPayments: Payment[] = [];

  payGroups.forEach(group => {
    if (group.length === 1) {
      keptActivePays.push(group[0]);
      return;
    }
    const sorted = [...group].sort(pickCanonicalPayment);
    keptActivePays.push(sorted[0]);
    affectedPatientIds.add(sorted[0].patientId);
    for (let i = 1; i < sorted.length; i++) {
      droppedPayments.push(sorted[i]);
    }
  });

  const hasChanges = droppedInvoices.length > 0 || droppedPayments.length > 0;
  if (!hasChanges) {
    return {
      invoices: rawInvoices,
      payments: rawPayments,
      droppedInvoices,
      droppedPayments,
      hasChanges: false
    };
  }

  // Recompute paidAmount / outstandingBalance / status for affected patients' invoices
  const paidByInvoiceId = new Map<string, number>();
  keptActivePays.forEach(p => {
    if (p.invoiceId) {
      paidByInvoiceId.set(p.invoiceId, (paidByInvoiceId.get(p.invoiceId) || 0) + (Number(p.amount) || 0));
    }
  });

  const finalActiveInvs = keptActiveInvs.map(inv => {
    if (!affectedPatientIds.has(inv.patientId)) return inv;
    const newPaid = paidByInvoiceId.get(inv.id) || 0;
    const newBalance = Math.max(0, inv.netTotal - newPaid);
    const nextStatus: Invoice['status'] =
      newBalance <= 0 && inv.netTotal > 0
        ? 'paid'
        : newPaid > 0 && newBalance > 0
        ? 'partial'
        : inv.netTotal === 0
        ? 'paid'
        : 'unpaid';
    return {
      ...inv,
      paidAmount: newPaid,
      outstandingBalance: newBalance,
      status: nextStatus
    };
  });

  return {
    invoices: [...finalActiveInvs, ...voidedInvs],
    payments: [...keptActivePays, ...voidedPays],
    droppedInvoices,
    droppedPayments,
    hasChanges: true
  };
}

function applyFinancialTotalsToPatients(
  pats: Patient[],
  invs: Invoice[],
  pays: Payment[]
): Patient[] {
  if (pats.length === 0) return pats;
  const billedMap = new Map<string, number>();
  const allInvoicePatIds = new Set<string>();
  invs.forEach(inv => {
    allInvoicePatIds.add(inv.patientId);
    if (inv.status !== 'voided') {
      billedMap.set(inv.patientId, (billedMap.get(inv.patientId) || 0) + (Number(inv.netTotal) || 0));
    }
  });

  const paidMap = new Map<string, number>();
  const allPaymentPatIds = new Set<string>();
  pays.forEach(pay => {
    allPaymentPatIds.add(pay.patientId);
    if (pay.status !== 'voided') {
      paidMap.set(pay.patientId, (paidMap.get(pay.patientId) || 0) + (Number(pay.amount) || 0));
    }
  });

  let hasChanges = false;
  const updated = pats.map(pat => {
    const hasAnyInv = allInvoicePatIds.has(pat.id);
    const hasAnyPay = allPaymentPatIds.has(pat.id);
    if (!hasAnyInv && !hasAnyPay) return pat;

    const newBilled = hasAnyInv ? (billedMap.get(pat.id) || 0) : pat.totalBilled;
    const newPaid = hasAnyPay ? (paidMap.get(pat.id) || 0) : pat.totalPaid;
    const newOutstanding = Math.max(0, newBilled - newPaid);

    if (
      pat.totalBilled === newBilled &&
      pat.totalPaid === newPaid &&
      pat.outstandingBalance === newOutstanding
    ) {
      return pat;
    }

    hasChanges = true;
    return {
      ...pat,
      totalBilled: newBilled,
      totalPaid: newPaid,
      outstandingBalance: newOutstanding
    };
  });

  return hasChanges ? updated : pats;
}

function normalizeBranchString(s?: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/١/g, '1')
    .replace(/٢/g, '2')
    .replace(/٣/g, '3')
    .replace(/تشان/g, 'تشاو')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

const INITIAL_REFERRAL_SOURCES: string[] = [
  'توصية صديق أو مريض سابق',
  'إنستجرام (Instagram)',
  'فيسبوك (Facebook)',
  'موقع العيادة الإلكتروني / جوجل',
  'يافطة العيادة في دمنهور',
  'زيارة مباشرة للعيادة',
  'أخرى'
];

const REMOVED_LEGACY_STATUS_TAGS = new Set<string>([
  FINISHED_WORK_STATUS_DONE,
  FINISHED_WORK_STATUS_NOT_INTERESTED
]);

const INITIAL_PATIENT_TAGS: string[] = [
  'VIP',
  'زراعة أسنان',
  'تقويم أسنان',
  'علاج جذور',
  'تبييض',
  'فوبيا أسنان',
  'متابعة خاصة',
  ...SYSTEM_PATIENT_TAGS
];

function mergeSystemPatientTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [...INITIAL_PATIENT_TAGS];
  }
  const list = raw
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(s => Boolean(s) && !REMOVED_LEGACY_STATUS_TAGS.has(s));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  for (const sysTag of SYSTEM_PATIENT_TAGS) {
    if (!seen.has(sysTag) && !REMOVED_LEGACY_STATUS_TAGS.has(sysTag)) {
      seen.add(sysTag);
      result.push(sysTag);
    }
  }
  return result;
}

function migrateLegacyTagsAndNormalizePatients(
  pats: Patient[],
  allowedTagsSet?: Set<string>
): { cleaned: Patient[]; migratedRecords: Patient[] } {
  let anyChanged = false;
  const migratedRecords: Patient[] = [];
  const cleaned = pats.map(p => {
    let nextStatus = p.followUpStatus === 'تم التواصل' ? 'قيد المتابعة' : p.followUpStatus;
    const rawTags = p.tags || [];
    const hadDoneTag = rawTags.includes(FINISHED_WORK_STATUS_DONE);
    const hadNotInterestedTag = rawTags.includes(FINISHED_WORK_STATUS_NOT_INTERESTED);

    if (hadNotInterestedTag && nextStatus !== FINISHED_WORK_STATUS_NOT_INTERESTED && !hadDoneTag) {
      nextStatus = FINISHED_WORK_STATUS_NOT_INTERESTED;
    } else if (hadDoneTag && nextStatus !== FINISHED_WORK_STATUS_DONE && nextStatus !== FINISHED_WORK_STATUS_NOT_INTERESTED) {
      nextStatus = FINISHED_WORK_STATUS_DONE;
    } else if (hadNotInterestedTag && nextStatus !== FINISHED_WORK_STATUS_DONE && nextStatus !== FINISHED_WORK_STATUS_NOT_INTERESTED) {
      nextStatus = FINISHED_WORK_STATUS_NOT_INTERESTED;
    }

    const filteredTags = rawTags.filter(t => {
      if (REMOVED_LEGACY_STATUS_TAGS.has(t)) return false;
      if (allowedTagsSet && allowedTagsSet.size > 0 && !allowedTagsSet.has(t)) return false;
      return true;
    });

    const statusChanged = nextStatus !== p.followUpStatus;
    const tagsChanged = filteredTags.length !== rawTags.length;

    if (!statusChanged && !tagsChanged) return p;

    anyChanged = true;
    const updated: Patient = {
      ...p,
      ...(statusChanged ? { followUpStatus: nextStatus } : {}),
      ...(tagsChanged ? { tags: filteredTags } : {})
    };
    if (hadDoneTag || hadNotInterestedTag) {
      migratedRecords.push(updated);
    }
    return updated;
  });

  return { cleaned: anyChanged ? cleaned : pats, migratedRecords };
}

const INITIAL_EXPENSE_CATEGORIES: ExpenseCategoryItem[] = [
  { name: 'مستلزمات أسنان' },
  { name: 'صيانة ومعامل' },
  { name: 'إيجار ومرافق' },
  { name: 'رواتب ومكافآت' },
  { name: 'ضيافة ونظافة' },
  { name: 'أخرى' }
];

const INITIAL_FOLLOW_UP_STATUSES: string[] = [...SYSTEM_FOLLOW_UP_STATUSES];

function mergeSystemFollowUpStatuses(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [...INITIAL_FOLLOW_UP_STATUSES];
  }
  const list = raw
    .map(s => {
      if (typeof s !== 'string') return '';
      const trimmed = s.trim();
      return trimmed === 'تم التواصل' ? 'قيد المتابعة' : trimmed;
    })
    .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  for (const sysStatus of SYSTEM_FOLLOW_UP_STATUSES) {
    if (!seen.has(sysStatus)) {
      seen.add(sysStatus);
      result.push(sysStatus);
    }
  }
  return result;
}

function normalizeExpenseCategories(raw: unknown): ExpenseCategoryItem[] {
  if (!Array.isArray(raw)) return INITIAL_EXPENSE_CATEGORIES;
  const seen = new Set<string>();
  const result: ExpenseCategoryItem[] = [];
  raw.forEach(item => {
    if (typeof item === 'string') {
      const name = item.trim();
      const key = name.toLowerCase();
      if (name && !seen.has(key)) {
        seen.add(key);
        result.push({ name });
      }
    } else if (item && typeof item === 'object') {
      const obj = item as { name?: unknown; defaultAmount?: unknown };
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      const key = name.toLowerCase();
      if (name && !seen.has(key)) {
        seen.add(key);
        const amt = Number(obj.defaultAmount);
        if (obj.defaultAmount !== undefined && obj.defaultAmount !== null && !isNaN(amt) && amt > 0) {
          result.push({ name, defaultAmount: amt });
        } else {
          result.push({ name });
        }
      }
    }
  });
  return result.length > 0 ? result : INITIAL_EXPENSE_CATEGORIES;
}

const DEFAULT_PATIENT_REQUIRED_FIELDS: PatientFieldRequirements = {
  phone: true,
  secondaryPhone: false,
  age: false,
  gender: false,
  referralSource: false
};

const DEFAULT_STAFF_ALERT_SETTINGS: StaffAlertSettings = {
  appointmentFollowUpEnabled: true,
  appointmentDelayMinutes: 15,
  appointmentTargetMode: 'all',
  appointmentTargetStaffIds: [],
  appointmentNotificationChannel: 'website_only',
  shiftReminderEnabled: true,
  shiftTargetMode: 'all',
  shiftTargetStaffIds: [],
  shiftNotificationChannel: 'website_only',
  notificationChannel: 'website_only'
};

function toSafeAlertLogId(rawKey: string): string {
  const cleaned = (rawKey || 'alert').replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefixed = cleaned.startsWith('sal_') ? cleaned : `sal_${cleaned}`;
  return prefixed.slice(0, 128);
}

const INITIAL_STAFF_MEMBERS: StaffMember[] = [
  {
    id: 'user_shlkamy',
    name: 'د. محمد شلقامي',
    username: 'Shlkamy',
    password: '13579',
    email: 'muhammed.shlkamy@gmail.com',
    recoveryPin: '2026',
    role: 'admin',
    jobTitle: 'المدير الطبي العام',
    phone: '01000000001',
    branchName: 'عيادة ١ و ٢',
    doctorId: 'doc_1',
    isDisabled: false,
    permissions: { ...DEFAULT_ROLE_PERMISSIONS.admin }
  },
  {
    id: 'user_mariam',
    name: 'مريم (الاستقبال)',
    username: 'mariam',
    password: '123',
    email: 'mariam@clinicflow.com',
    role: 'receptionist',
    jobTitle: 'مسؤولة الاستقبال والحجز',
    phone: '01000000002',
    branchName: 'عيادة ١ و ٢',
    isDisabled: false,
    permissions: { ...DEFAULT_ROLE_PERMISSIONS.receptionist }
  },
  {
    id: 'user_fatma',
    name: 'فاطمة (تمريض)',
    username: 'fatma',
    password: '123',
    email: 'fatma@clinicflow.com',
    role: 'nurse',
    jobTitle: 'تمريض ومساعدة طبيب',
    phone: '01000000003',
    branchName: 'عيادة ١',
    isDisabled: false,
    permissions: { ...DEFAULT_ROLE_PERMISSIONS.nurse }
  }
];

export const ClinicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    applyPendingDocOps('expenses', loadFromStorage('expenses', INITIAL_EXPENSES)).sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    )
  );
  const [tasks, setTasks] = useState<Task[]>(() =>
    applyPendingDocOps('tasks', loadFromStorage('tasks', INITIAL_TASKS)).sort((a, b) =>
      (b.dueDate || '').localeCompare(a.dueDate || '')
    )
  );
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() =>
    applyPendingDocOps('attendance', loadFromStorage('attendance', INITIAL_ATTENDANCE)).sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    )
  );
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>(() =>
    applyPendingDocOps('whatsapp_templates', loadFromStorage('templates', INITIAL_TEMPLATES))
  );
  const [whatsappAlerts, setWhatsappAlerts] = useState<WhatsAppAlert[]>(() =>
    applyPendingDocOps('whatsapp_alerts', loadFromStorage('alerts', INITIAL_ALERTS)).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )
  );
  const [doctors, setDoctors] = useState<Doctor[]>(() =>
    applyPendingDocOps('doctors', loadFromStorage('doctors', INITIAL_DOCTORS))
  );
  const [units, setUnits] = useState<ClinicUnit[]>(() =>
    applyPendingDocOps('units', loadFromStorage('units', INITIAL_UNITS))
  );
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(() => {
    const rawLoaded = loadFromStorage<StaffMember[]>('staff_members', INITIAL_STAFF_MEMBERS);
    const baseLoaded = Array.isArray(rawLoaded) && rawLoaded.length > 0 ? rawLoaded : INITIAL_STAFF_MEMBERS;
    const loaded = applyPendingDocOps('staff_members', baseLoaded);
    let migratedDefault = false;
    try {
      migratedDefault = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'default_creds_v2') === 'true';
    } catch {}

    const result = loaded.map(member => {
      const normalizedPermissions = normalizeStaffPermissions(member.permissions, member.role);
      if (member.id === 'user_shlkamy') {
        const shouldApplyNewDefault = !migratedDefault && (!member.password || member.password === '123456');
        return {
          ...member,
          username: member.username || 'Shlkamy',
          password: shouldApplyNewDefault ? '13579' : member.password,
          email: member.email || 'muhammed.shlkamy@gmail.com',
          recoveryPin: member.recoveryPin || '2026',
          permissions: normalizedPermissions
        };
      }
      return {
        ...member,
        permissions: normalizedPermissions
      };
    });

    if (!migratedDefault) {
      try {
        localStorage.setItem(LOCAL_STORAGE_PREFIX + 'default_creds_v2', 'true');
      } catch {}
    }
    return result;
  });
  const [procedures, setProcedures] = useState<ProcedureItem[]>(() =>
    applyPendingDocOps('procedures', loadFromStorage('procedures', INITIAL_PROCEDURES))
  );
  const [operations, setOperations] = useState<Operation[]>([]);
  const pendingConfigSnapshot = useMemo(() => applyPendingClinicConfig(undefined), []);
  const [weekdaySettings, setWeekdaySettings] = useState<WeekdaySetting[]>(() => {
    const pending = applyPendingClinicConfig(undefined);
    return Array.isArray(pending?.weekdaySettings)
      ? (pending.weekdaySettings as WeekdaySetting[])
      : loadFromStorage('weekdays', INITIAL_WEEKDAYS);
  });
  const [referralSources, setReferralSources] = useState<string[]>(() => {
    const pending = applyPendingClinicConfig(undefined);
    return Array.isArray(pending?.referralSources)
      ? (pending.referralSources as string[])
      : loadFromStorage('referral_sources', INITIAL_REFERRAL_SOURCES);
  });
  const [patientTags, setPatientTags] = useState<string[]>(() => {
    const pending = applyPendingClinicConfig(undefined);
    return mergeSystemPatientTags(
      Array.isArray(pending?.patientTags)
        ? pending.patientTags
        : loadFromStorage('patient_tags', INITIAL_PATIENT_TAGS)
    );
  });
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryItem[]>(() => {
    const pending = applyPendingClinicConfig(undefined);
    return normalizeExpenseCategories(
      Array.isArray(pending?.expenseCategories)
        ? pending.expenseCategories
        : loadFromStorage('expense_categories', INITIAL_EXPENSE_CATEGORIES)
    );
  });
  const [patientFollowUpStatuses, setPatientFollowUpStatuses] = useState<string[]>(() => {
    const pending = applyPendingClinicConfig(undefined);
    const loaded = Array.isArray(pending?.patientFollowUpStatuses)
      ? (pending.patientFollowUpStatuses as string[])
      : loadFromStorage<string[]>('patient_follow_up_statuses', INITIAL_FOLLOW_UP_STATUSES);
    return mergeSystemFollowUpStatuses(loaded);
  });
  const [listItemColors, setListItemColors] = useState<ClinicListItemColors>(() => {
    const pending = applyPendingClinicConfig(undefined);
    return pending?.listItemColors && typeof pending.listItemColors === 'object'
      ? (pending.listItemColors as ClinicListItemColors)
      : loadFromStorage<ClinicListItemColors>('list_item_colors', {});
  });
  const [patientFollowUpLogs, setPatientFollowUpLogs] = useState<PatientFollowUpLogEntry[]>(() =>
    applyPendingDocOps<PatientFollowUpLogEntry>(
      'patient_follow_up_logs',
      loadFromStorage<PatientFollowUpLogEntry[]>('patient_follow_up_logs', [])
    ).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
  );
  const [patientRequiredFields, setPatientRequiredFields] = useState<PatientFieldRequirements>(() => {
    const pending = applyPendingClinicConfig(undefined);
    return pending?.patientRequiredFields && typeof pending.patientRequiredFields === 'object'
      ? (pending.patientRequiredFields as PatientFieldRequirements)
      : loadFromStorage('patient_required_fields', DEFAULT_PATIENT_REQUIRED_FIELDS);
  });
  const [staffAlertSettings, setStaffAlertSettings] = useState<StaffAlertSettings>(() => {
    const pending = applyPendingClinicConfig(undefined);
    const stored =
      pending?.staffAlertSettings && typeof pending.staffAlertSettings === 'object'
        ? (pending.staffAlertSettings as Partial<StaffAlertSettings>)
        : loadFromStorage<Partial<StaffAlertSettings>>('staff_alert_settings', {});
    const legacyChannel = stored.notificationChannel || 'website_only';
    return {
      ...DEFAULT_STAFF_ALERT_SETTINGS,
      ...stored,
      appointmentNotificationChannel: stored.appointmentNotificationChannel || legacyChannel,
      shiftNotificationChannel: stored.shiftNotificationChannel || legacyChannel
    };
  });
  const [staffAlertLogs, setStaffAlertLogs] = useState<StaffAlertLogEntry[]>(() =>
    applyPendingDocOps<StaffAlertLogEntry>(
      'staff_alert_logs',
      loadFromStorage<StaffAlertLogEntry[]>('staff_alert_logs', [])
    )
  );
  const [staffAlertSnoozeUntil, setStaffAlertSnoozeUntil] = useState<number | null>(null);
  const [testNotificationTriggerAt, setTestNotificationTriggerAt] = useState<number | null>(null);
  const [isTestNotificationDue, setIsTestNotificationDue] = useState<boolean>(false);
  const [webPushReady, setWebPushReady] = useState<boolean>(false);
  const webPushReadyRef = useRef(webPushReady);
  webPushReadyRef.current = webPushReady;

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() =>
    applyPendingDocOps<AuditLogEntry>(
      'audit_logs',
      loadFromStorage<AuditLogEntry[]>('audit_logs', [])
    )
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, 500)
  );
  const auditLogsRef = useRef(auditLogs);
  auditLogsRef.current = auditLogs;

  const [staffComments, setStaffComments] = useState<StaffComment[]>(() =>
    applyPendingDocOps<StaffComment>(
      'staff_comments',
      loadFromStorage<StaffComment[]>('staff_comments', [])
    )
  );
  const staffCommentsRef = useRef(staffComments);
  staffCommentsRef.current = staffComments;
  useDebouncedStorage('staff_comments', staffComments, 200);

  const addStaffComment = (
    staffId: string,
    content: string,
    options?: { durationDays?: number | null; durationLabel?: string }
  ) => {
    const targetStaff = staffMembers.find(s => s.id === staffId);
    const staffName = staffId === 'all' ? 'جميع الموظفين' : (targetStaff?.name || 'موظف');
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const durationDays =
      options?.durationDays !== undefined && options.durationDays !== null && options.durationDays > 0
        ? options.durationDays
        : null;
    const expiresAt = durationDays ? new Date(nowMs + durationDays * 86400000).toISOString() : null;
    const durationLabel =
      options?.durationLabel ||
      (durationDays === 1
        ? 'يوم واحد'
        : durationDays === 7
        ? 'أسبوع واحد'
        : durationDays
        ? `${durationDays} يوم`
        : 'دائم');

    const newComment: StaffComment = {
      id: 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      staffId,
      staffName,
      content,
      repeatCount: 1,
      history: [now],
      createdAt: now,
      createdBy: currentUser.name,
      isHidden: false,
      durationDays,
      durationLabel,
      expiresAt
    };
    const nextComments = [newComment, ...staffCommentsRef.current];
    staffCommentsRef.current = nextComments;
    setStaffComments(nextComments);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_comments',
        docId: newComment.id,
        data: newComment as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'add',
      'staff',
      newComment.id,
      staffName,
      `إضافة كومنت موظف (${staffName}): ${content.slice(0, 80)}`,
      undefined,
      newComment,
      'staff_comments'
    );
  };

  const repeatStaffComment = (id: string) => {
    const now = new Date().toISOString();
    const target = staffCommentsRef.current.find(c => c.id === id);
    if (!target) return;
    const baseHistory = Array.isArray(target.history) && target.history.length > 0 ? target.history : [target.createdAt || now];
    const nextHistory = [...baseHistory, now];
    const updated: StaffComment = {
      ...target,
      repeatCount: Math.max((target.repeatCount || 1) + 1, nextHistory.length),
      history: nextHistory
    };
    const nextComments = staffCommentsRef.current.map(c => (c.id === id ? updated : c));
    staffCommentsRef.current = nextComments;
    setStaffComments(nextComments);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_comments',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'update',
      'staff',
      id,
      target.staffName,
      `تكرار كومنت موظف (${target.staffName}) — العدد: ${updated.repeatCount}`,
      target,
      updated,
      'staff_comments'
    );
  };

  const unrepeatStaffComment = (id: string) => {
    const target = staffCommentsRef.current.find(c => c.id === id);
    if (!target) return;
    const currentCount = target.repeatCount || 1;
    if (currentCount <= 1) return;
    const nextHistory = Array.isArray(target.history) && target.history.length > 1
      ? target.history.slice(0, -1)
      : target.history && target.history.length > 0
      ? target.history
      : [target.createdAt];
    const updated: StaffComment = {
      ...target,
      repeatCount: Math.max(1, currentCount - 1),
      history: nextHistory
    };
    const nextComments = staffCommentsRef.current.map(c => (c.id === id ? updated : c));
    staffCommentsRef.current = nextComments;
    setStaffComments(nextComments);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_comments',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'update',
      'staff',
      id,
      target.staffName,
      `تقليل تكرار كومنت موظف (${target.staffName}) — العدد: ${updated.repeatCount}`,
      target,
      updated,
      'staff_comments'
    );
  };

  const hideStaffComment = (id: string) => {
    const target = staffCommentsRef.current.find(c => c.id === id);
    if (!target) return;
    const now = new Date().toISOString();
    const updated: StaffComment = { ...target, isHidden: true, hiddenAt: now };
    const nextComments = staffCommentsRef.current.map(c => (c.id === id ? updated : c));
    staffCommentsRef.current = nextComments;
    setStaffComments(nextComments);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_comments',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'status_change',
      'staff',
      id,
      target.staffName,
      `إخفاء كومنت موظف (${target.staffName}): ${target.content.slice(0, 80)}`,
      target,
      updated,
      'staff_comments'
    );
  };

  const restoreStaffComment = (
    id: string,
    options?: { durationDays?: number | null; durationLabel?: string }
  ) => {
    const target = staffCommentsRef.current.find(c => c.id === id);
    if (!target) return;
    const nextDays =
      options?.durationDays !== undefined
        ? options.durationDays
        : target.durationDays ?? null;
    const expiresAt =
      nextDays && nextDays > 0
        ? new Date(Date.now() + nextDays * 86400000).toISOString()
        : null;
    const durationLabel =
      options?.durationLabel ||
      (nextDays === 1
        ? 'يوم واحد'
        : nextDays === 7
        ? 'أسبوع واحد'
        : nextDays
        ? `${nextDays} يوم`
        : 'دائم');
    const updated: StaffComment = {
      ...target,
      isHidden: false,
      hiddenAt: undefined,
      durationDays: nextDays,
      durationLabel,
      expiresAt
    };
    const nextComments = staffCommentsRef.current.map(c => (c.id === id ? updated : c));
    staffCommentsRef.current = nextComments;
    setStaffComments(nextComments);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_comments',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'status_change',
      'staff',
      id,
      target.staffName,
      `استعادة كومنت موظف (${target.staffName}): ${target.content.slice(0, 80)}`,
      target,
      updated,
      'staff_comments'
    );
  };

  const deleteStaffComment = (id: string) => {
    const existing = staffCommentsRef.current.find(c => c.id === id);
    const nextComments = staffCommentsRef.current.filter(c => c.id !== id);
    staffCommentsRef.current = nextComments;
    setStaffComments(nextComments);
    dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'staff_comments', docId: id }]);
    if (existing) {
      logAuditAction(
        'delete',
        'staff',
        id,
        existing.staffName,
        `تم حذف كومنت موظف (${existing.staffName}): ${existing.content.slice(0, 80)}`,
        existing,
        undefined,
        'staff_comments'
      );
    }
  };


  const sanitizeAuditPayload = (data: unknown): Record<string, unknown> | undefined => {
    if (data === undefined || data === null) return undefined;
    if (typeof data !== 'object' || Array.isArray(data)) {
      return { value: data } as Record<string, unknown>;
    }
    try {
      const cloned = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      if (typeof cloned.audioDataUrl === 'string' && cloned.audioDataUrl.length > 200) {
        cloned.audioDataUrl = '[audio]';
      }
      if (Array.isArray(cloned.notes)) {
        cloned.notes = (cloned.notes as Array<Record<string, unknown>>).slice(0, 15).map(n => {
          const copy = { ...n };
          if (typeof copy.audioDataUrl === 'string' && copy.audioDataUrl.length > 200) {
            copy.audioDataUrl = '[audio]';
          }
          return copy;
        });
      }
      return cloned;
    } catch {
      return undefined;
    }
  };

  const normalizeAuditEntryForCloud = (entry: AuditLogEntry): AuditLogEntry => {
    const validActions: AuditLogEntry['action'][] = ['add', 'update', 'delete', 'status_change'];
    const validEntities: AuditLogEntry['entityType'][] = [
      'patient',
      'appointment',
      'invoice',
      'payment',
      'expense',
      'task',
      'procedure',
      'staff',
      'setting',
      'attendance'
    ];
    return {
      id: sanitizeDocId(entry.id || 'log_' + Date.now()),
      timestamp: String(entry.timestamp || new Date().toISOString()).slice(0, 64),
      userId: String(entry.userId || 'unknown').slice(0, 128),
      userName: String(entry.userName || 'مستخدم').slice(0, 120),
      action: validActions.includes(entry.action) ? entry.action : 'update',
      entityType: validEntities.includes(entry.entityType) ? entry.entityType : 'setting',
      entityId: String(entry.entityId || 'unknown').slice(0, 128),
      entityName: String(entry.entityName || 'سجل').slice(0, 200),
      description: String(entry.description || '').slice(0, 1000),
      ...(entry.previousData !== undefined ? { previousData: sanitizeAuditPayload(entry.previousData) } : {}),
      ...(entry.newData !== undefined ? { newData: sanitizeAuditPayload(entry.newData) } : {}),
      ...(entry.targetView ? { targetView: String(entry.targetView).slice(0, 64) } : {}),
      ...(entry.targetId ? { targetId: String(entry.targetId).slice(0, 128) } : {}),
      reverted: Boolean(entry.reverted)
    };
  };

  const resolveActiveStaffFromRefs = (): StaffMember =>
    staffMembersRef.current.find(s => s.id === currentUserIdRef.current && !s.isDisabled) ||
    staffMembersRef.current.find(s => !s.isDisabled) ||
    staffMembersRef.current[0] ||
    INITIAL_STAFF_MEMBERS[0];

  const logAuditAction = (
    action: AuditLogEntry['action'],
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    entityName: string,
    description: string,
    previousData?: any,
    newData?: any,
    targetView?: string,
    targetId?: string
  ) => {
    const activeStaff = resolveActiveStaffFromRefs();
    const cleanPrev = sanitizeAuditPayload(previousData);
    const cleanNew = sanitizeAuditPayload(newData);
    const newEntry: AuditLogEntry = normalizeAuditEntryForCloud({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      userId: activeStaff.id,
      userName: activeStaff.name,
      action,
      entityType,
      entityId,
      entityName,
      description,
      previousData: cleanPrev,
      newData: cleanNew,
      targetView,
      targetId,
      reverted: false
    });
    const nextAuditLogs = [newEntry, ...auditLogsRef.current].slice(0, 500);
    auditLogsRef.current = nextAuditLogs;
    saveToStorage('audit_logs', nextAuditLogs);
    setAuditLogs(nextAuditLogs);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'audit_logs',
        docId: newEntry.id,
        data: newEntry as unknown as Record<string, unknown>
      }
    ]);
  };

  const deleteAuditLogEntry = (id: string) => {
    const updated = auditLogsRef.current.filter(l => l.id !== id);
    auditLogsRef.current = updated;
    saveToStorage('audit_logs', updated);
    setAuditLogs(updated);
    dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'audit_logs', docId: id }]);
  };

  const clearAuditLogs = () => {
    const existingIds = auditLogsRef.current.map(l => l.id);
    auditLogsRef.current = [];
    saveToStorage('audit_logs', []);
    setAuditLogs([]);
    if (existingIds.length > 0) {
      dispatchCloudOps(
        existingIds.map(id => ({ kind: 'doc_delete' as const, collectionName: 'audit_logs', docId: id }))
      );
    }
  };

  const [clinicStartHour, setClinicStartHour] = useState<number>(() =>
    typeof pendingConfigSnapshot?.clinicStartHour === 'number'
      ? pendingConfigSnapshot.clinicStartHour
      : loadFromStorage('clinic_start_hour', 14)
  );
  const [clinicEndHour, setClinicEndHour] = useState<number>(() =>
    typeof pendingConfigSnapshot?.clinicEndHour === 'number'
      ? pendingConfigSnapshot.clinicEndHour
      : loadFromStorage('clinic_end_hour', 22)
  );
  const [allowedCloudEmails, setAllowedCloudEmails] = useState<string[]>(() =>
    normalizeAllowedEmails(loadFromStorage<string[]>('allowed_cloud_emails', [ADMIN_OWNER_EMAIL]))
  );

  const [archiveReady, setArchiveReady] = useState<boolean>(false);
  const [cairoTodayStr, setCairoTodayStr] = useState<string>(() => getTodayDateString());
  useEffect(() => {
    const syncCairoToday = () => {
      const current = getTodayDateString();
      setCairoTodayStr(prev => (prev === current ? prev : current));
    };
    const handleVisibility = () => {
      if (!document.hidden) syncCairoToday();
    };
    const intervalId = window.setInterval(syncCairoToday, 30_000);
    window.addEventListener('focus', syncCairoToday);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncCairoToday);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
  const [cloudUser, setCloudUser] = useState<{ uid: string; email: string; displayName: string; isAnonymous?: boolean } | null>(null);
  const [cloudAuthReady, setCloudAuthReady] = useState<boolean>(false);
  const [cloudSynced, setCloudSynced] = useState<boolean>(false);
  const [cloudTasksReady, setCloudTasksReady] = useState<boolean>(false);
  const [cloudStaffReady, setCloudStaffReady] = useState<boolean>(false);
  const [cloudAttendanceReady, setCloudAttendanceReady] = useState<boolean>(false);
  const [completedShiftDates, setCompletedShiftDates] = useState<Record<string, string>>(() =>
    loadFromStorage<Record<string, string>>('completed_shift_dates', {})
  );
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudNeedsConsoleSetup, setCloudNeedsConsoleSetup] = useState<boolean>(false);
  const [pendingCloudCount, setPendingCloudCount] = useState<number>(() => getPendingCloudCount());

  useEffect(() => {
    return subscribePendingQueueChange(count => {
      setPendingCloudCount(count);
    });
  }, []);

  // Refs for synchronous mutation reads & cloud writes
  const patientsRef = useRef(patients);
  patientsRef.current = patients;
  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;
  const invoicesRef = useRef(invoices);
  invoicesRef.current = invoices;
  const paymentsRef = useRef(payments);
  paymentsRef.current = payments;
  const operationsRef = useRef(operations);
  operationsRef.current = operations;
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const attendanceRef = useRef(attendance);
  attendanceRef.current = attendance;
  const whatsappTemplatesRef = useRef(whatsappTemplates);
  whatsappTemplatesRef.current = whatsappTemplates;
  const whatsappAlertsRef = useRef(whatsappAlerts);
  whatsappAlertsRef.current = whatsappAlerts;
  const doctorsRef = useRef(doctors);
  doctorsRef.current = doctors;
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const staffMembersRef = useRef(staffMembers);
  staffMembersRef.current = staffMembers;
  const proceduresRef = useRef(procedures);
  proceduresRef.current = procedures;
  const weekdaySettingsRef = useRef(weekdaySettings);
  weekdaySettingsRef.current = weekdaySettings;
  const referralSourcesRef = useRef(referralSources);
  referralSourcesRef.current = referralSources;
  const patientTagsRef = useRef(patientTags);
  patientTagsRef.current = patientTags;
  const expenseCategoriesRef = useRef(expenseCategories);
  expenseCategoriesRef.current = expenseCategories;
  const patientFollowUpStatusesRef = useRef(patientFollowUpStatuses);
  patientFollowUpStatusesRef.current = patientFollowUpStatuses;
  const listItemColorsRef = useRef(listItemColors);
  listItemColorsRef.current = listItemColors;
  const patientFollowUpLogsRef = useRef(patientFollowUpLogs);
  patientFollowUpLogsRef.current = patientFollowUpLogs;
  const patientRequiredFieldsRef = useRef(patientRequiredFields);
  patientRequiredFieldsRef.current = patientRequiredFields;
  const staffAlertSettingsRef = useRef(staffAlertSettings);
  staffAlertSettingsRef.current = staffAlertSettings;
  const staffAlertLogsRef = useRef(staffAlertLogs);
  staffAlertLogsRef.current = staffAlertLogs;
  const clinicStartHourRef = useRef(clinicStartHour);
  clinicStartHourRef.current = clinicStartHour;
  const clinicEndHourRef = useRef(clinicEndHour);
  clinicEndHourRef.current = clinicEndHour;
  const allowedCloudEmailsRef = useRef(allowedCloudEmails);
  allowedCloudEmailsRef.current = allowedCloudEmails;
  const cloudUserRef = useRef(cloudUser);
  cloudUserRef.current = cloudUser;

  const pendingConfigSyncRef = useRef(false);
  const flushingQueueRef = useRef<Promise<void> | null>(null);
  const retryBackoffMsRef = useRef(0);
  const lastRetryAtRef = useRef(0);

  const runCloudTask = (promise: Promise<unknown>): Promise<void> => {
    return promise
      .then(() => undefined)
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        setCloudError(msg);
        console.error('Cloud sync error:', err);
      });
  };

  const yieldToMainThread = (): Promise<void> =>
    new Promise(resolve => {
      setTimeout(resolve, 16);
    });

  const executeSingleCloudOpOnly = async (op: PendingCloudOp, emails: string[]): Promise<void> => {
    if (op.kind === 'overlay') {
      await upsertSyncOverlay(
        op.collectionName,
        op.record as { id: string },
        op.isDeleted,
        emails
      );
    } else if (op.kind === 'doc_upsert') {
      await upsertCloudDoc(op.collectionName, op.docId, op.data, emails);
    } else {
      await deleteCloudDoc(op.collectionName, op.docId);
    }
  };

  const dispatchCloudOps = (
    inputs: PendingCloudOpInput[],
    overrideEmails?: string[]
  ): Promise<void> => {
    if (!inputs || inputs.length === 0) return Promise.resolve();
    const queuedOps = enqueuePendingCloudOps(inputs);
    retryBackoffMsRef.current = 0;
    if (!cloudUserRef.current && !auth.currentUser) {
      if (!cloudNeedsConsoleSetupRef.current) {
        void retryCloudConnectRef.current?.();
      }
      return Promise.resolve();
    }
    if (queuedOps.length > 6) {
      return flushPendingCloudOps();
    }
    const emails = normalizeAllowedEmails(overrideEmails ?? allowedCloudEmailsRef.current);
    const completedEntries: Array<{ key: string; token: number }> = [];
    return Promise.allSettled(
      queuedOps.map(async op => {
        await executeSingleCloudOpOnly(op, emails);
        completedEntries.push({ key: op.key, token: op.token });
      })
    ).then(results => {
      if (completedEntries.length > 0) {
        dequeuePendingCloudOpsBatch(completedEntries);
      }
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejected) {
        const msg = rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason);
        setCloudError(msg);
        console.error('Queued cloud sync error (kept in local retry queue):', rejected.reason);
      } else {
        setCloudError(null);
        retryBackoffMsRef.current = 0;
      }
    });
  };

  const flushPendingCloudOps = (): Promise<void> => {
    if (!cloudUserRef.current && !auth.currentUser) return Promise.resolve();
    if (flushingQueueRef.current) return flushingQueueRef.current;

    const task = (async () => {
      const pending = getPendingCloudOps();
      if (pending.length === 0) {
        retryBackoffMsRef.current = 0;
        return;
      }
      const emails = normalizeAllowedEmails(allowedCloudEmailsRef.current);
      let hadError = false;

      const overlayGroups = new Map<OverlayCollectionName, PendingOverlayOp[]>();
      const remainingOps: PendingCloudOp[] = [];
      for (const op of pending) {
        if (op.kind === 'overlay') {
          let list = overlayGroups.get(op.collectionName);
          if (!list) {
            list = [];
            overlayGroups.set(op.collectionName, list);
          }
          list.push(op);
        } else {
          remainingOps.push(op);
        }
      }

      // 1. Batch overlay operations per collection in smooth chunks of 25 with UI yields
      for (const [colName, ops] of overlayGroups.entries()) {
        if (ops.length < 2) {
          remainingOps.push(...ops);
          continue;
        }
        const CHUNK_SIZE = 25;
        for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
          if (!cloudUserRef.current && !auth.currentUser) break;
          const chunk = ops.slice(i, i + CHUNK_SIZE);
          try {
            await batchUpsertSyncOverlay(
              colName,
              chunk.map(op => ({
                record: op.record as { id: string },
                isDeleted: op.isDeleted
              })),
              emails
            );
            dequeuePendingCloudOpsBatch(chunk.map(op => ({ key: op.key, token: op.token })));
          } catch (err) {
            hadError = true;
            const msg = err instanceof Error ? err.message : String(err);
            setCloudError(msg);
            console.error('Batch overlay flush error for', colName, err);
          }
          await yieldToMainThread();
        }
      }

      // 2. Process remaining doc/single-overlay ops in concurrent micro-batches of 6
      const CONCURRENCY = 6;
      for (let i = 0; i < remainingOps.length; i += CONCURRENCY) {
        if (!cloudUserRef.current && !auth.currentUser) break;
        const slice = remainingOps.slice(i, i + CONCURRENCY);
        const completedEntries: Array<{ key: string; token: number }> = [];
        const results = await Promise.allSettled(
          slice.map(async op => {
            await executeSingleCloudOpOnly(op, emails);
            completedEntries.push({ key: op.key, token: op.token });
          })
        );
        if (completedEntries.length > 0) {
          dequeuePendingCloudOpsBatch(completedEntries);
        }
        for (const r of results) {
          if (r.status === 'rejected') {
            hadError = true;
            const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            setCloudError(msg);
            console.error('Pending queue flush error:', r.reason);
          }
        }
        if (i + CONCURRENCY < remainingOps.length) {
          await yieldToMainThread();
        }
      }

      if (!hadError && getPendingCloudCount() === 0) {
        retryBackoffMsRef.current = 0;
        setCloudError(null);
      } else if (hadError) {
        lastRetryAtRef.current = Date.now();
        retryBackoffMsRef.current = retryBackoffMsRef.current
          ? Math.min(120_000, retryBackoffMsRef.current * 2)
          : 15_000;
      }
    })().finally(() => {
      flushingQueueRef.current = null;
    });

    flushingQueueRef.current = task;
    return task;
  };

  const syncClinicConfigToCloud = (overrides?: {
    clinicStartHour?: number;
    clinicEndHour?: number;
    weekdaySettings?: WeekdaySetting[];
    referralSources?: string[];
    patientTags?: string[];
    expenseCategories?: ExpenseCategoryItem[];
    patientFollowUpStatuses?: string[];
    listItemColors?: ClinicListItemColors;
    patientRequiredFields?: PatientFieldRequirements;
    staffAlertSettings?: StaffAlertSettings;
    allowedEmails?: string[];
  }): Promise<void> => {
    if (overrides?.weekdaySettings) saveToStorage('weekdays', overrides.weekdaySettings);
    if (overrides?.referralSources) saveToStorage('referral_sources', overrides.referralSources);
    if (overrides?.patientTags) saveToStorage('patient_tags', overrides.patientTags);
    if (overrides?.expenseCategories) saveToStorage('expense_categories', overrides.expenseCategories);
    if (overrides?.patientFollowUpStatuses) saveToStorage('patient_follow_up_statuses', overrides.patientFollowUpStatuses);
    if (overrides?.listItemColors) saveToStorage('list_item_colors', overrides.listItemColors);
    if (overrides?.patientRequiredFields) saveToStorage('patient_required_fields', overrides.patientRequiredFields);
    if (overrides?.staffAlertSettings) saveToStorage('staff_alert_settings', overrides.staffAlertSettings);

    const payload = {
      clinicStartHour: overrides?.clinicStartHour ?? clinicStartHourRef.current,
      clinicEndHour: overrides?.clinicEndHour ?? clinicEndHourRef.current,
      weekdaySettings: overrides?.weekdaySettings ?? weekdaySettingsRef.current,
      referralSources: overrides?.referralSources ?? referralSourcesRef.current,
      patientTags: overrides?.patientTags ?? patientTagsRef.current,
      expenseCategories: overrides?.expenseCategories ?? expenseCategoriesRef.current,
      patientFollowUpStatuses: overrides?.patientFollowUpStatuses ?? patientFollowUpStatusesRef.current,
      listItemColors: overrides?.listItemColors ?? listItemColorsRef.current,
      patientRequiredFields: overrides?.patientRequiredFields ?? patientRequiredFieldsRef.current,
      staffAlertSettings: overrides?.staffAlertSettings ?? staffAlertSettingsRef.current
    };

    if (!cloudUserRef.current) {
      pendingConfigSyncRef.current = true;
    } else {
      pendingConfigSyncRef.current = false;
    }

    return dispatchCloudOps(
      [
        {
          kind: 'doc_upsert',
          collectionName: 'clinic_config',
          docId: 'default',
          data: payload
        }
      ],
      overrides?.allowedEmails
    );
  };

  const updateClinicWorkingHours = (start: number, end: number) => {
    const prevStart = clinicStartHourRef.current;
    const prevEnd = clinicEndHourRef.current;
    setClinicStartHour(start);
    setClinicEndHour(end);
    saveToStorage('clinic_start_hour', start);
    saveToStorage('clinic_end_hour', end);
    syncClinicConfigToCloud({ clinicStartHour: start, clinicEndHour: end });
    logAuditAction(
      'update',
      'setting',
      'working_hours',
      'ساعات عمل العيادة',
      `تغيير ساعات العمل من ${prevStart}:00-${prevEnd}:00 إلى ${start}:00-${end}:00`,
      { clinicStartHour: prevStart, clinicEndHour: prevEnd },
      { clinicStartHour: start, clinicEndHour: end },
      'settings'
    );
  };

  // Track IndexedDB hydration & deferred archive chunk loading
  const isHydratedRef = useRef(false);
  const skipPersistRef = useRef({
    patients: true,
    appointments: true,
    invoices: true,
    payments: true,
    operations: true
  });
  const fullFinancialRecalcRef = useRef(true);
  const dirtyFinancialPatientIdsRef = useRef<Set<string>>(new Set());

  const baseArchiveRef = useRef<NativeArchiveData | null>(null);
  const archivePromiseRef = useRef<Promise<NativeArchiveData> | null>(null);
  const ensureArchiveLoaded = (): Promise<NativeArchiveData> => {
    if (baseArchiveRef.current) return Promise.resolve(baseArchiveRef.current);
    if (!archivePromiseRef.current) {
      archivePromiseRef.current = loadNativeArchive().then(data => {
        baseArchiveRef.current = data;
        return data;
      });
    }
    return archivePromiseRef.current;
  };

  const overlaysRef = useRef<{
    patients: OverlayDoc<Patient>[] | null;
    appointments: OverlayDoc<Appointment>[] | null;
    invoices: OverlayDoc<Invoice>[] | null;
    payments: OverlayDoc<Payment>[] | null;
    operations: OverlayDoc<Operation>[] | null;
  }>({
    patients: null,
    appointments: null,
    invoices: null,
    payments: null,
    operations: null
  });

  const prevAppliedOverlaysRef = useRef<{
    patients: OverlayDoc<Patient>[] | null;
    appointments: OverlayDoc<Appointment>[] | null;
    invoices: OverlayDoc<Invoice>[] | null;
    payments: OverlayDoc<Payment>[] | null;
    operations: OverlayDoc<Operation>[] | null;
  }>({
    patients: null,
    appointments: null,
    invoices: null,
    payments: null,
    operations: null
  });

  const archiveByIdRef = useRef<{
    patients: Map<string, Patient>;
    appointments: Map<string, Appointment>;
    invoices: Map<string, Invoice>;
    payments: Map<string, Payment>;
    operations: Map<string, Operation>;
  }>({
    patients: new Map(),
    appointments: new Map(),
    invoices: new Map(),
    payments: new Map(),
    operations: new Map()
  });

  const lastPersistedByIdRef = useRef<{
    patients: Map<string, Patient>;
    appointments: Map<string, Appointment>;
    invoices: Map<string, Invoice>;
    payments: Map<string, Payment>;
    operations: Map<string, Operation>;
  }>({
    patients: new Map(),
    appointments: new Map(),
    invoices: new Map(),
    payments: new Map(),
    operations: new Map()
  });

  const deltaMapRef = useRef<{
    patients: Map<string, StoredDeltaEntry<Patient>>;
    appointments: Map<string, StoredDeltaEntry<Appointment>>;
    invoices: Map<string, StoredDeltaEntry<Invoice>>;
    payments: Map<string, StoredDeltaEntry<Payment>>;
    operations: Map<string, StoredDeltaEntry<Operation>>;
  }>({
    patients: new Map(),
    appointments: new Map(),
    invoices: new Map(),
    payments: new Map(),
    operations: new Map()
  });

  const syncIdbDeltaForDataset = <T extends { id: string }>(
    key: LargeDatasetKey,
    currentList: T[]
  ): void => {
    const prevById = lastPersistedByIdRef.current[key] as unknown as Map<string, T>;
    const deltaMap = deltaMapRef.current[key] as unknown as Map<string, StoredDeltaEntry<T>>;
    const archiveById = archiveByIdRef.current[key] as unknown as Map<string, T>;

    const nextById = new Map<string, T>();
    let changed = false;

    for (let i = 0; i < currentList.length; i++) {
      const item = currentList[i];
      nextById.set(item.id, item);
      if (prevById.get(item.id) !== item) {
        changed = true;
        const archiveItem = archiveById.get(item.id);
        if (archiveItem === item) {
          deltaMap.delete(item.id);
        } else {
          deltaMap.set(item.id, { id: item.id, isDeleted: false, record: item });
        }
      }
    }

    if (prevById.size > 0) {
      prevById.forEach((_val, prevId) => {
        if (!nextById.has(prevId)) {
          changed = true;
          if (archiveById.has(prevId)) {
            deltaMap.set(prevId, { id: prevId, isDeleted: true });
          } else {
            deltaMap.delete(prevId);
          }
        }
      });
    }

    if (!changed && prevById.size === nextById.size) {
      return;
    }

    (lastPersistedByIdRef.current[key] as unknown as Map<string, T>) = nextById;
    void idbSetDelta(key, Array.from(deltaMap.values()));
  };

  const seedDeltaState = <T extends { id: string }>(
    key: LargeDatasetKey,
    list: T[],
    knownDeltas: StoredDeltaEntry<T>[] | null
  ): void => {
    const nextById = new Map<string, T>();
    for (let i = 0; i < list.length; i++) {
      nextById.set(list[i].id, list[i]);
    }
    (lastPersistedByIdRef.current[key] as unknown as Map<string, T>) = nextById;

    const dMap = new Map<string, StoredDeltaEntry<T>>();
    if (knownDeltas) {
      for (let i = 0; i < knownDeltas.length; i++) {
        const entry = knownDeltas[i];
        dMap.set(entry.id, entry);
      }
    }
    (deltaMapRef.current[key] as unknown as Map<string, StoredDeltaEntry<T>>) = dMap;
  };

  const deltasToOverlays = <T extends { id: string }>(deltas: StoredDeltaEntry<T>[]): OverlayDoc<T>[] =>
    deltas.map(d => ({
      id: sanitizeDocId(d.id),
      isDeleted: d.isDeleted,
      ...(d.isDeleted || !d.record ? {} : { payload: d.record })
    }));

  const overlaysToDeltas = <T extends { id: string }>(overlays: OverlayDoc<T>[]): StoredDeltaEntry<T>[] =>
    overlays.map(ov => ({
      id: ov.payload?.id || ov.id,
      isDeleted: ov.isDeleted,
      ...(ov.isDeleted || !ov.payload ? {} : { record: ov.payload })
    }));

  const diffOverlayDocs = <T extends { id: string }>(
    prevOverlays: OverlayDoc<T>[],
    nextOverlays: OverlayDoc<T>[]
  ): {
    upserts: T[];
    deleteIds: Set<string>;
    revertIds: Set<string>;
  } => {
    const prevByDocId = new Map<string, OverlayDoc<T>>();
    for (let i = 0; i < prevOverlays.length; i++) {
      prevByDocId.set(prevOverlays[i].id, prevOverlays[i]);
    }

    const upserts: T[] = [];
    const deleteIds = new Set<string>();
    const revertIds = new Set<string>();

    for (let i = 0; i < nextOverlays.length; i++) {
      const nextOv = nextOverlays[i];
      const prevOv = prevByDocId.get(nextOv.id);
      if (prevOv) {
        prevByDocId.delete(nextOv.id);
        if (
          prevOv.isDeleted === nextOv.isDeleted &&
          (nextOv.isDeleted || JSON.stringify(prevOv.payload) === JSON.stringify(nextOv.payload))
        ) {
          continue;
        }
      }
      if (nextOv.isDeleted) {
        deleteIds.add(nextOv.payload?.id || nextOv.id);
        deleteIds.add(nextOv.id);
      } else if (nextOv.payload) {
        upserts.push(nextOv.payload);
      }
    }

    prevByDocId.forEach(oldOv => {
      const targetId = oldOv.payload?.id || oldOv.id;
      revertIds.add(targetId);
    });

    return { upserts, deleteIds, revertIds };
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const [archive, , deltaPat, deltaAppt, deltaInv, deltaPay, deltaOp] = await Promise.all([
          ensureArchiveLoaded(),
          migrateLegacyLocalStorage(),
          idbGetDelta<Patient>('patients'),
          idbGetDelta<Appointment>('appointments'),
          idbGetDelta<Invoice>('invoices'),
          idbGetDelta<Payment>('payments'),
          idbGetDelta<Operation>('operations')
        ]);
        if (cancelled) return;

        archiveByIdRef.current = {
          patients: new Map(archive.patients.map(p => [p.id, p])),
          appointments: new Map(archive.appointments.map(a => [a.id, a])),
          invoices: new Map(archive.invoices.map(i => [i.id, i])),
          payments: new Map(archive.payments.map(p => [p.id, p])),
          operations: new Map(archive.operations.map(o => [o.id, o]))
        };

        // Fallback to legacy full-array store ONLY for keys that don't yet have dataset_deltas
        const [storedPat, storedAppt, storedInv, storedPay, storedOp] = await Promise.all([
          deltaPat === null ? idbGet<Patient[]>('patients') : Promise.resolve(null),
          deltaAppt === null ? idbGet<Appointment[]>('appointments') : Promise.resolve(null),
          deltaInv === null ? idbGet<Invoice[]>('invoices') : Promise.resolve(null),
          deltaPay === null ? idbGet<Payment[]>('payments') : Promise.resolve(null),
          deltaOp === null ? idbGet<Operation[]>('operations') : Promise.resolve(null)
        ]);
        if (cancelled) return;

        const archivePatIds = new Set(archive.patients.map(p => p.id));
        let needsArchiveV2 = false;
        let needsFinDedupV3 = false;
        try {
          needsArchiveV2 = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'archive_dedup_v2') !== 'true';
          needsFinDedupV3 = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'fin_dedup_v3') !== 'true';
        } catch {}

        const mergeCleanArchiveList = <T extends { id: string }>(
          stored: T[] | null,
          freshArchive: T[],
          isArchiveId: (id: string) => boolean
        ): T[] => {
          if (!stored || stored.length === 0) return freshArchive;
          const customItems = stored.filter(item => !isArchiveId(item.id));
          return customItems.length > 0 ? [...customItems, ...freshArchive] : freshArchive;
        };

        const pendingOpsSnapshot = getPendingCloudOps();
        const hasPendingPat = pendingOpsSnapshot.some(op => op.kind === 'overlay' && op.collectionName === 'patients_sync');
        const hasPendingAppt = pendingOpsSnapshot.some(op => op.kind === 'overlay' && op.collectionName === 'appointments_sync');
        const hasPendingInv = pendingOpsSnapshot.some(op => op.kind === 'overlay' && op.collectionName === 'invoices_sync');
        const hasPendingPay = pendingOpsSnapshot.some(op => op.kind === 'overlay' && op.collectionName === 'payments_sync');
        const hasPendingOp = pendingOpsSnapshot.some(op => op.kind === 'overlay' && op.collectionName === 'operations_sync');

        let initialInvOverlays: OverlayDoc<Invoice>[] | null = null;
        if (overlaysRef.current.invoices !== null) {
          initialInvOverlays = applyPendingOverlayOps('invoices_sync', overlaysRef.current.invoices);
          prevAppliedOverlaysRef.current.invoices = initialInvOverlays;
        }
        const rawInitialInvs =
          initialInvOverlays !== null
            ? mergeSyncOverlay(archive.invoices, initialInvOverlays)
            : deltaInv !== null
            ? applyPendingOverlayRecords('invoices_sync', mergeSyncOverlay(archive.invoices, deltasToOverlays(deltaInv)))
            : applyPendingOverlayRecords(
                'invoices_sync',
                needsArchiveV2 && storedInv && storedInv.length > 0
                  ? mergeCleanArchiveList(storedInv, archive.invoices, id => id.startsWith('inv_pat_'))
                  : storedInv && storedInv.length >= 50
                  ? storedInv
                  : archive.invoices
              );

        let initialPayOverlays: OverlayDoc<Payment>[] | null = null;
        if (overlaysRef.current.payments !== null) {
          initialPayOverlays = applyPendingOverlayOps('payments_sync', overlaysRef.current.payments);
          prevAppliedOverlaysRef.current.payments = initialPayOverlays;
        }
        const rawInitialPays =
          initialPayOverlays !== null
            ? mergeSyncOverlay(archive.payments, initialPayOverlays)
            : deltaPay !== null
            ? applyPendingOverlayRecords('payments_sync', mergeSyncOverlay(archive.payments, deltasToOverlays(deltaPay)))
            : applyPendingOverlayRecords(
                'payments_sync',
                needsArchiveV2 && storedPay && storedPay.length > 0
                  ? mergeCleanArchiveList(storedPay, archive.payments, id => id.startsWith('pay_pat_'))
                  : storedPay && storedPay.length >= 50
                  ? storedPay
                  : archive.payments
              );

        const dedupedInit = deduplicateInvoicesAndPayments(rawInitialInvs, rawInitialPays);
        const migratedInvFromLegacy = deltaInv === null && storedInv !== null;
        const migratedPayFromLegacy = deltaPay === null && storedPay !== null;
        skipPersistRef.current.invoices = !(hasPendingInv || overlaysRef.current.invoices !== null || migratedInvFromLegacy || dedupedInit.hasChanges);
        skipPersistRef.current.payments = !(hasPendingPay || overlaysRef.current.payments !== null || migratedPayFromLegacy || dedupedInit.hasChanges);
        fullFinancialRecalcRef.current = true;
        invoicesRef.current = dedupedInit.invoices;
        paymentsRef.current = dedupedInit.payments;
        seedDeltaState(
          'invoices',
          dedupedInit.invoices,
          initialInvOverlays ? overlaysToDeltas(initialInvOverlays) : deltaInv ?? (migratedInvFromLegacy ? computeLocalDeltas(dedupedInit.invoices, archive.invoices).map(d => ({ id: d.record.id, isDeleted: d.isDeleted, ...(d.isDeleted ? {} : { record: d.record }) })) : [])
        );
        seedDeltaState(
          'payments',
          dedupedInit.payments,
          initialPayOverlays ? overlaysToDeltas(initialPayOverlays) : deltaPay ?? (migratedPayFromLegacy ? computeLocalDeltas(dedupedInit.payments, archive.payments).map(d => ({ id: d.record.id, isDeleted: d.isDeleted, ...(d.isDeleted ? {} : { record: d.record }) })) : [])
        );
        if (migratedInvFromLegacy) {
          void idbSetDelta('invoices', Array.from(deltaMapRef.current.invoices.values()));
          void idbDelete('invoices');
        }
        if (migratedPayFromLegacy) {
          void idbSetDelta('payments', Array.from(deltaMapRef.current.payments.values()));
          void idbDelete('payments');
        }
        setInvoices(dedupedInit.invoices);
        setPayments(dedupedInit.payments);

        const allowedTagsSet = new Set(mergeSystemPatientTags(patientTagsRef.current));
        const stripOrphanTags = (pats: Patient[]): Patient[] =>
          migrateLegacyTagsAndNormalizePatients(pats, allowedTagsSet).cleaned;

        const migratedPatFromLegacy = deltaPat === null && storedPat !== null;
        if (overlaysRef.current.patients !== null) {
          const appliedPatOverlays = applyPendingOverlayOps('patients_sync', overlaysRef.current.patients);
          prevAppliedOverlaysRef.current.patients = appliedPatOverlays;
          skipPersistRef.current.patients = false;
          const hydratedPats = applyFinancialTotalsToPatients(
            stripOrphanTags(mergeSyncOverlay(archive.patients, appliedPatOverlays)),
            dedupedInit.invoices,
            dedupedInit.payments
          );
          patientsRef.current = hydratedPats;
          seedDeltaState('patients', hydratedPats, overlaysToDeltas(appliedPatOverlays));
          setPatients(hydratedPats);
        } else if (deltaPat !== null) {
          skipPersistRef.current.patients = !hasPendingPat;
          const baseFromDelta = applyPendingOverlayRecords(
            'patients_sync',
            mergeSyncOverlay(archive.patients, deltasToOverlays(deltaPat))
          );
          const nextPats = applyFinancialTotalsToPatients(
            stripOrphanTags(baseFromDelta),
            dedupedInit.invoices,
            dedupedInit.payments
          );
          patientsRef.current = nextPats;
          seedDeltaState('patients', nextPats, deltaPat);
          setPatients(nextPats);
        } else if (needsArchiveV2 && storedPat && storedPat.length > 0) {
          const oldNotesByPat = new Map<string, Patient['notes']>();
          const oldTeethByPat = new Map<string, number[]>();
          storedPat.forEach(sp => {
            const customNotes = (sp.notes || []).filter(n => !n.id.startsWith('note_pat_') && !n.id.startsWith('note_doc_'));
            if (customNotes.length > 0) oldNotesByPat.set(sp.id, customNotes);
            if (sp.palmerTeeth && sp.palmerTeeth.length > 0) oldTeethByPat.set(sp.id, sp.palmerTeeth);
          });
          const refreshedArchivePats = archive.patients.map(ap => {
            const cNotes = oldNotesByPat.get(ap.id);
            const oTeeth = oldTeethByPat.get(ap.id);
            if (!cNotes && !oTeeth) return ap;
            return {
              ...ap,
              notes: cNotes ? [...cNotes, ...(ap.notes || [])] : ap.notes,
              palmerTeeth: oTeeth ? Array.from(new Set([...(ap.palmerTeeth || []), ...oTeeth])) : ap.palmerTeeth
            };
          });
          const mergedArchivePats = applyPendingOverlayRecords(
            'patients_sync',
            mergeCleanArchiveList(storedPat, refreshedArchivePats, id => archivePatIds.has(id))
          );
          const nextPats = applyFinancialTotalsToPatients(
            stripOrphanTags(mergedArchivePats),
            dedupedInit.invoices,
            dedupedInit.payments
          );
          skipPersistRef.current.patients = false;
          patientsRef.current = nextPats;
          const initPatDeltas: StoredDeltaEntry<Patient>[] = computeLocalDeltas(nextPats, archive.patients, normalizePatientForDiff).map(d => ({
            id: d.record.id,
            isDeleted: d.isDeleted,
            ...(d.isDeleted ? {} : { record: d.record })
          }));
          seedDeltaState('patients', nextPats, initPatDeltas);
          void idbSetDelta('patients', initPatDeltas);
          void idbDelete('patients');
          setPatients(nextPats);
        } else {
          skipPersistRef.current.patients = !(hasPendingPat || migratedPatFromLegacy);
          const basePats = storedPat && storedPat.length >= archive.patients.length ? storedPat : archive.patients;
          const nextPats = applyFinancialTotalsToPatients(
            stripOrphanTags(applyPendingOverlayRecords('patients_sync', basePats)),
            dedupedInit.invoices,
            dedupedInit.payments
          );
          patientsRef.current = nextPats;
          const initPatDeltas: StoredDeltaEntry<Patient>[] = migratedPatFromLegacy
            ? computeLocalDeltas(nextPats, archive.patients, normalizePatientForDiff).map(d => ({
                id: d.record.id,
                isDeleted: d.isDeleted,
                ...(d.isDeleted ? {} : { record: d.record })
              }))
            : [];
          seedDeltaState('patients', nextPats, initPatDeltas);
          if (migratedPatFromLegacy) {
            void idbSetDelta('patients', initPatDeltas);
            void idbDelete('patients');
          }
          setPatients(nextPats);
        }

        const migratedApptFromLegacy = deltaAppt === null && storedAppt !== null;
        if (overlaysRef.current.appointments !== null) {
          const appliedApptOverlays = applyPendingOverlayOps('appointments_sync', overlaysRef.current.appointments);
          prevAppliedOverlaysRef.current.appointments = appliedApptOverlays;
          skipPersistRef.current.appointments = false;
          const nextAppts = mergeSyncOverlay(archive.appointments, appliedApptOverlays);
          appointmentsRef.current = nextAppts;
          seedDeltaState('appointments', nextAppts, overlaysToDeltas(appliedApptOverlays));
          setAppointments(nextAppts);
        } else if (deltaAppt !== null) {
          skipPersistRef.current.appointments = !hasPendingAppt;
          const nextAppts = applyPendingOverlayRecords(
            'appointments_sync',
            mergeSyncOverlay(archive.appointments, deltasToOverlays(deltaAppt))
          );
          appointmentsRef.current = nextAppts;
          seedDeltaState('appointments', nextAppts, deltaAppt);
          setAppointments(nextAppts);
        } else if (needsArchiveV2 && storedAppt && storedAppt.length > 0) {
          const nextAppts = applyPendingOverlayRecords(
            'appointments_sync',
            mergeCleanArchiveList(
              storedAppt,
              archive.appointments,
              id => id.startsWith('apt_real_') || id.startsWith('apt_hist_') || id.startsWith('apt_prev_') || id.startsWith('apt_active_')
            )
          );
          skipPersistRef.current.appointments = false;
          appointmentsRef.current = nextAppts;
          const initApptDeltas: StoredDeltaEntry<Appointment>[] = computeLocalDeltas(nextAppts, archive.appointments).map(d => ({
            id: d.record.id,
            isDeleted: d.isDeleted,
            ...(d.isDeleted ? {} : { record: d.record })
          }));
          seedDeltaState('appointments', nextAppts, initApptDeltas);
          void idbSetDelta('appointments', initApptDeltas);
          void idbDelete('appointments');
          setAppointments(nextAppts);
        } else {
          skipPersistRef.current.appointments = !(hasPendingAppt || migratedApptFromLegacy);
          const baseAppts = storedAppt && storedAppt.length >= archive.appointments.length ? storedAppt : archive.appointments;
          const nextAppts = applyPendingOverlayRecords('appointments_sync', baseAppts);
          appointmentsRef.current = nextAppts;
          const initApptDeltas: StoredDeltaEntry<Appointment>[] = migratedApptFromLegacy
            ? computeLocalDeltas(nextAppts, archive.appointments).map(d => ({
                id: d.record.id,
                isDeleted: d.isDeleted,
                ...(d.isDeleted ? {} : { record: d.record })
              }))
            : [];
          seedDeltaState('appointments', nextAppts, initApptDeltas);
          if (migratedApptFromLegacy) {
            void idbSetDelta('appointments', initApptDeltas);
            void idbDelete('appointments');
          }
          setAppointments(nextAppts);
        }

        const migratedOpFromLegacy = deltaOp === null && storedOp !== null;
        if (overlaysRef.current.operations !== null) {
          const appliedOpOverlays = applyPendingOverlayOps('operations_sync', overlaysRef.current.operations);
          prevAppliedOverlaysRef.current.operations = appliedOpOverlays;
          skipPersistRef.current.operations = false;
          const nextOps = mergeSyncOverlay(archive.operations, appliedOpOverlays);
          operationsRef.current = nextOps;
          seedDeltaState('operations', nextOps, overlaysToDeltas(appliedOpOverlays));
          setOperations(nextOps);
        } else if (deltaOp !== null) {
          skipPersistRef.current.operations = !hasPendingOp;
          const nextOps = applyPendingOverlayRecords(
            'operations_sync',
            mergeSyncOverlay(archive.operations, deltasToOverlays(deltaOp))
          );
          operationsRef.current = nextOps;
          seedDeltaState('operations', nextOps, deltaOp);
          setOperations(nextOps);
        } else if (needsArchiveV2 && storedOp && storedOp.length > 0) {
          const nextOps = applyPendingOverlayRecords(
            'operations_sync',
            mergeCleanArchiveList(
              storedOp,
              archive.operations,
              id => /^op_\d{1,5}$/.test(id)
            )
          );
          skipPersistRef.current.operations = false;
          operationsRef.current = nextOps;
          const initOpDeltas: StoredDeltaEntry<Operation>[] = computeLocalDeltas(nextOps, archive.operations).map(d => ({
            id: d.record.id,
            isDeleted: d.isDeleted,
            ...(d.isDeleted ? {} : { record: d.record })
          }));
          seedDeltaState('operations', nextOps, initOpDeltas);
          void idbSetDelta('operations', initOpDeltas);
          void idbDelete('operations');
          setOperations(nextOps);
        } else {
          skipPersistRef.current.operations = !(hasPendingOp || migratedOpFromLegacy);
          const baseOps = storedOp && storedOp.length >= archive.operations.length ? storedOp : archive.operations;
          const nextOps = applyPendingOverlayRecords('operations_sync', baseOps);
          operationsRef.current = nextOps;
          const initOpDeltas: StoredDeltaEntry<Operation>[] = migratedOpFromLegacy
            ? computeLocalDeltas(nextOps, archive.operations).map(d => ({
                id: d.record.id,
                isDeleted: d.isDeleted,
                ...(d.isDeleted ? {} : { record: d.record })
              }))
            : [];
          seedDeltaState('operations', nextOps, initOpDeltas);
          if (migratedOpFromLegacy) {
            void idbSetDelta('operations', initOpDeltas);
            void idbDelete('operations');
          }
          setOperations(nextOps);
        }

        if (needsArchiveV2 || needsFinDedupV3) {
          try {
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'archive_dedup_v2', 'true');
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'fin_dedup_v3', 'true');
          } catch {}
        }

        isHydratedRef.current = true;
        setArchiveReady(true);
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const tombstonedDupIdsRef = useRef<Set<string>>(new Set());

  const applyIncrementalListPatch = <T extends { id: string }>(
    currentList: T[],
    archiveById: Map<string, T>,
    diff: { upserts: T[]; deleteIds: Set<string>; revertIds: Set<string> },
    isEqualRecord?: (localItem: T, incomingItem: T) => boolean
  ): { nextList: T[]; changed: boolean; changedItems: T[] } => {
    const upsertById = new Map<string, T>();
    for (let i = 0; i < diff.upserts.length; i++) {
      upsertById.set(diff.upserts[i].id, diff.upserts[i]);
    }
    const { deleteIds, revertIds } = diff;
    if (upsertById.size === 0 && deleteIds.size === 0 && revertIds.size === 0) {
      return { nextList: currentList, changed: false, changedItems: [] };
    }

    const equals = isEqualRecord || ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b));
    const seenInCurrent = new Set<string>();
    const changedItems: T[] = [];
    let mutated = false;
    const out: T[] = [];

    for (let i = 0; i < currentList.length; i++) {
      const cur = currentList[i];
      const safeId = sanitizeDocId(cur.id);
      if (deleteIds.has(cur.id) || deleteIds.has(safeId)) {
        mutated = true;
        changedItems.push(cur);
        seenInCurrent.add(cur.id);
        continue;
      }
      const incoming = upsertById.get(cur.id);
      if (incoming) {
        seenInCurrent.add(cur.id);
        upsertById.delete(cur.id);
        if (equals(cur, incoming)) {
          out.push(cur);
        } else {
          mutated = true;
          changedItems.push(cur);
          changedItems.push(incoming);
          out.push(incoming);
        }
        continue;
      }
      if (revertIds.has(cur.id) || revertIds.has(safeId)) {
        seenInCurrent.add(cur.id);
        const archiveFallback = archiveById.get(cur.id);
        if (archiveFallback) {
          if (equals(cur, archiveFallback)) {
            out.push(cur);
          } else {
            mutated = true;
            changedItems.push(cur);
            changedItems.push(archiveFallback);
            out.push(archiveFallback);
          }
        } else {
          mutated = true;
          changedItems.push(cur);
        }
        continue;
      }
      out.push(cur);
    }

    // Any brand-new upserts or archive items previously hidden that just reverted
    const prepends: T[] = [];
    upsertById.forEach(item => {
      mutated = true;
      changedItems.push(item);
      prepends.push(item);
    });
    revertIds.forEach(rid => {
      if (!seenInCurrent.has(rid)) {
        const archiveFallback = archiveById.get(rid);
        if (archiveFallback) {
          mutated = true;
          changedItems.push(archiveFallback);
          prepends.push(archiveFallback);
        }
      }
    });

    if (!mutated) {
      return { nextList: currentList, changed: false, changedItems: [] };
    }
    return {
      nextList: prepends.length > 0 ? [...prepends, ...out] : out,
      changed: true,
      changedItems
    };
  };

  const applyDeduplicatedFinancialOverlays = (changedCol?: 'invoices' | 'payments') => {
    if (!baseArchiveRef.current || !isHydratedRef.current) return;

    // Fast path: if initial snapshots for BOTH invoices & payments have already been applied,
    // diff only the updated overlay collection and bail immediately on local echo writes!
    if (
      changedCol &&
      prevAppliedOverlaysRef.current.invoices !== null &&
      prevAppliedOverlaysRef.current.payments !== null
    ) {
      if (changedCol === 'invoices' && overlaysRef.current.invoices !== null) {
        const nextProtected = applyPendingOverlayOps('invoices_sync', overlaysRef.current.invoices);
        const diff = diffOverlayDocs(prevAppliedOverlaysRef.current.invoices, nextProtected);
        prevAppliedOverlaysRef.current.invoices = nextProtected;
        const patched = applyIncrementalListPatch(invoicesRef.current, archiveByIdRef.current.invoices, diff);
        if (!patched.changed) return;

        const dedup = deduplicateInvoicesAndPayments(patched.nextList, paymentsRef.current);
        patched.changedItems.forEach(inv => {
          if (inv.patientId) dirtyFinancialPatientIdsRef.current.add(inv.patientId);
        });
        dedup.droppedInvoices.forEach(inv => {
          if (inv.patientId) dirtyFinancialPatientIdsRef.current.add(inv.patientId);
        });
        skipPersistRef.current.invoices = false;
        invoicesRef.current = dedup.invoices;
        setInvoices(dedup.invoices);
        if (dedup.hasChanges && cloudUserRef.current) {
          const emails = allowedCloudEmailsRef.current;
          const toDropInvs = dedup.droppedInvoices.filter(d => !tombstonedDupIdsRef.current.has('inv:' + d.id));
          toDropInvs.forEach(d => tombstonedDupIdsRef.current.add('inv:' + d.id));
          if (toDropInvs.length > 0) {
            runCloudTask(
              batchUpsertSyncOverlay('invoices_sync', toDropInvs.map(d => ({ record: d, isDeleted: true })), emails)
            );
          }
        }
        return;
      }

      if (changedCol === 'payments' && overlaysRef.current.payments !== null) {
        const nextProtected = applyPendingOverlayOps('payments_sync', overlaysRef.current.payments);
        const diff = diffOverlayDocs(prevAppliedOverlaysRef.current.payments, nextProtected);
        prevAppliedOverlaysRef.current.payments = nextProtected;
        const patched = applyIncrementalListPatch(paymentsRef.current, archiveByIdRef.current.payments, diff);
        if (!patched.changed) return;

        const dedup = deduplicateInvoicesAndPayments(invoicesRef.current, patched.nextList);
        patched.changedItems.forEach(pay => {
          if (pay.patientId) dirtyFinancialPatientIdsRef.current.add(pay.patientId);
        });
        dedup.droppedPayments.forEach(pay => {
          if (pay.patientId) dirtyFinancialPatientIdsRef.current.add(pay.patientId);
        });
        skipPersistRef.current.payments = false;
        paymentsRef.current = dedup.payments;
        setPayments(dedup.payments);
        if (dedup.hasChanges && cloudUserRef.current) {
          const emails = allowedCloudEmailsRef.current;
          const toDropPays = dedup.droppedPayments.filter(d => !tombstonedDupIdsRef.current.has('pay:' + d.id));
          toDropPays.forEach(d => tombstonedDupIdsRef.current.add('pay:' + d.id));
          if (toDropPays.length > 0) {
            runCloudTask(
              batchUpsertSyncOverlay('payments_sync', toDropPays.map(d => ({ record: d, isDeleted: true })), emails)
            );
          }
        }
        return;
      }
    }

    const nextInvProtected =
      overlaysRef.current.invoices !== null
        ? applyPendingOverlayOps('invoices_sync', overlaysRef.current.invoices)
        : null;
    const nextPayProtected =
      overlaysRef.current.payments !== null
        ? applyPendingOverlayOps('payments_sync', overlaysRef.current.payments)
        : null;
    if (nextInvProtected !== null) prevAppliedOverlaysRef.current.invoices = nextInvProtected;
    if (nextPayProtected !== null) prevAppliedOverlaysRef.current.payments = nextPayProtected;

    const rawInvs = nextInvProtected !== null
      ? mergeSyncOverlay(baseArchiveRef.current.invoices, nextInvProtected)
      : applyPendingOverlayRecords('invoices_sync', invoicesRef.current);
    const rawPays = nextPayProtected !== null
      ? mergeSyncOverlay(baseArchiveRef.current.payments, nextPayProtected)
      : applyPendingOverlayRecords('payments_sync', paymentsRef.current);

    const dedup = deduplicateInvoicesAndPayments(rawInvs, rawPays);
    const invsUnchanged =
      dedup.invoices.length === invoicesRef.current.length &&
      dedup.invoices.every((inv, idx) => inv === invoicesRef.current[idx]);
    const paysUnchanged =
      dedup.payments.length === paymentsRef.current.length &&
      dedup.payments.every((pay, idx) => pay === paymentsRef.current[idx]);

    if (!invsUnchanged || !paysUnchanged) {
      fullFinancialRecalcRef.current = true;
      if (!invsUnchanged) {
        skipPersistRef.current.invoices = false;
        invoicesRef.current = dedup.invoices;
        setInvoices(dedup.invoices);
      }
      if (!paysUnchanged) {
        skipPersistRef.current.payments = false;
        paymentsRef.current = dedup.payments;
        setPayments(dedup.payments);
      }
    }

    if (dedup.hasChanges && cloudUserRef.current) {
      const emails = allowedCloudEmailsRef.current;
      const toDropInvs = dedup.droppedInvoices.filter(d => !tombstonedDupIdsRef.current.has('inv:' + d.id));
      const toDropPays = dedup.droppedPayments.filter(d => !tombstonedDupIdsRef.current.has('pay:' + d.id));
      toDropInvs.forEach(d => tombstonedDupIdsRef.current.add('inv:' + d.id));
      toDropPays.forEach(d => tombstonedDupIdsRef.current.add('pay:' + d.id));

      if (toDropInvs.length > 0) {
        runCloudTask(
          batchUpsertSyncOverlay(
            'invoices_sync',
            toDropInvs.map(d => ({ record: d, isDeleted: true })),
            emails
          )
        );
      }
      if (toDropPays.length > 0) {
        runCloudTask(
          batchUpsertSyncOverlay(
            'payments_sync',
            toDropPays.map(d => ({ record: d, isDeleted: true })),
            emails
          )
        );
      }
    }
  };

  const computeLocalDeltas = <T extends { id: string }>(
    currentList: T[],
    baseList: T[],
    normalizeForDiff?: (item: T) => unknown
  ): Array<{ record: T; isDeleted: boolean }> => {
    const baseById = new Map<string, T>();
    baseList.forEach(item => baseById.set(item.id, item));
    const currentIds = new Set<string>();
    const deltas: Array<{ record: T; isDeleted: boolean }> = [];

    for (const item of currentList) {
      currentIds.add(item.id);
      const base = baseById.get(item.id);
      if (!base) {
        deltas.push({ record: item, isDeleted: false });
      } else {
        const curNorm = normalizeForDiff ? normalizeForDiff(item) : item;
        const baseNorm = normalizeForDiff ? normalizeForDiff(base) : base;
        if (JSON.stringify(curNorm) !== JSON.stringify(baseNorm)) {
          deltas.push({ record: item, isDeleted: false });
        }
      }
    }
    for (const baseItem of baseList) {
      if (!currentIds.has(baseItem.id)) {
        deltas.push({ record: baseItem, isDeleted: true });
      }
    }
    return deltas;
  };

  const normalizePatientForDiff = (p: Patient) => ({
    ...p,
    totalBilled: 0,
    totalPaid: 0,
    outstandingBalance: 0
  });

  const pushLocalChangesToCloud = async () => {
    if (!cloudUserRef.current) return;
    await flushPendingCloudOps();
    const archive = await ensureArchiveLoaded();
    const emails = allowedCloudEmailsRef.current;
    await Promise.all([
      upsertCloudDoc(
        'clinic_config',
        'default',
        {
          clinicStartHour: clinicStartHourRef.current,
          clinicEndHour: clinicEndHourRef.current,
          weekdaySettings: weekdaySettingsRef.current,
          referralSources: referralSourcesRef.current,
          patientTags: patientTagsRef.current,
          expenseCategories: expenseCategoriesRef.current,
          patientFollowUpStatuses: patientFollowUpStatusesRef.current,
          listItemColors: listItemColorsRef.current,
          patientRequiredFields: patientRequiredFieldsRef.current,
          staffAlertSettings: staffAlertSettingsRef.current
        },
        emails
      ),
      seedCollectionBatch('staff_members', staffMembersRef.current, emails),
      seedCollectionBatch('doctors', doctorsRef.current, emails),
      seedCollectionBatch('units', unitsRef.current, emails),
      seedCollectionBatch('procedures', proceduresRef.current, emails),
      seedCollectionBatch('expenses', expensesRef.current, emails),
      seedCollectionBatch('tasks', tasksRef.current, emails),
      seedCollectionBatch('attendance', attendanceRef.current, emails),
      seedCollectionBatch('audit_logs', auditLogsRef.current.map(normalizeAuditEntryForCloud), emails),
      seedCollectionBatch('patient_follow_up_logs', patientFollowUpLogsRef.current, emails),
      seedCollectionBatch('staff_alert_logs', staffAlertLogsRef.current, emails),
      seedCollectionBatch('staff_comments', staffCommentsRef.current, emails),
      seedCollectionBatch('whatsapp_templates', whatsappTemplatesRef.current, emails),
      seedCollectionBatch('whatsapp_alerts', whatsappAlertsRef.current, emails),
      batchUpsertSyncOverlay('patients_sync', computeLocalDeltas(patientsRef.current, archive.patients, normalizePatientForDiff), emails),
      batchUpsertSyncOverlay('appointments_sync', computeLocalDeltas(appointmentsRef.current, archive.appointments), emails),
      batchUpsertSyncOverlay('invoices_sync', computeLocalDeltas(invoicesRef.current, archive.invoices), emails),
      batchUpsertSyncOverlay('payments_sync', computeLocalDeltas(paymentsRef.current, archive.payments), emails),
      batchUpsertSyncOverlay('operations_sync', computeLocalDeltas(operationsRef.current, archive.operations), emails)
    ]);
  };

  const anonAttemptedRef = useRef(false);
  const listenersActiveRef = useRef(false);
  const attachCloudSubscriptionsRef = useRef<((fbUser: FirebaseUser) => Promise<void>) | null>(null);
  const retryCloudConnectRef = useRef<(() => Promise<{ success: boolean; error?: string }>) | null>(null);
  const cloudSyncedRef = useRef(cloudSynced);
  cloudSyncedRef.current = cloudSynced;
  const cloudErrorRef = useRef(cloudError);
  cloudErrorRef.current = cloudError;
  const cloudNeedsConsoleSetupRef = useRef(cloudNeedsConsoleSetup);
  cloudNeedsConsoleSetupRef.current = cloudNeedsConsoleSetup;
  const lastAttendanceServerRefreshRef = useRef(0);

  const refreshAttendanceFromServer = async (force: boolean = false): Promise<void> => {
    if (!auth.currentUser) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    if (!force && now - lastAttendanceServerRefreshRef.current < 12_000) return;
    lastAttendanceServerRefreshRef.current = now;
    try {
      const freshItems = await fetchCollectionFromServer<AttendanceRecord>('attendance');
      setCloudAttendanceReady(true);
      const merged = applyPendingDocOps('attendance', freshItems).sort((a, b) =>
        (b.date || '').localeCompare(a.date || '')
      );
      attendanceRef.current = merged;
      saveToStorage('attendance', merged);
      setAttendance(merged);
    } catch {
      // Ignore transient refresh failure; live listener or next reconnect will retry
    }
  };

  // Seamless Automatic Firebase Anonymous Auth & Real-Time Firestore Subscriptions
  useEffect(() => {
    let unsubscribers: Array<() => void> = [];
    let cancelled = false;
    let attachInFlight: Promise<void> | null = null;

    const cleanupListeners = () => {
      unsubscribers.forEach(unsub => unsub());
      unsubscribers = [];
      listenersActiveRef.current = false;
    };

    const attachCloudSubscriptions = (fbUser: FirebaseUser): Promise<void> => {
      if (attachInFlight) return attachInFlight;
      const run = (async () => {
        cleanupListeners();
        if (cancelled) return;

        setCloudNeedsConsoleSetup(false);
        const authEmail = (fbUser.email || '').trim().toLowerCase() || ADMIN_OWNER_EMAIL;
        setCloudUser({
          uid: fbUser.uid,
          email: authEmail,
          displayName: fbUser.displayName || 'جلسة العيادة الموحدة',
          isAnonymous: fbUser.isAnonymous
        });
        setCloudAuthReady(true);
        setCloudError(null);

        try {
          const initStatus = await checkCloudInitialized();
          if (cancelled) return;

          if (!initStatus.initialized) {
            await pushLocalChangesToCloud();
            saveToStorage('unsynced_staff_ids', []);
            pendingConfigSyncRef.current = false;
          } else {
            const normalized = normalizeAllowedEmails(initStatus.allowedEmails);
            setAllowedCloudEmails(normalized);
            saveToStorage('allowed_cloud_emails', normalized);

            if (pendingConfigSyncRef.current) {
              pendingConfigSyncRef.current = false;
              try {
                await upsertCloudDoc(
                  'clinic_config',
                  'default',
                  {
                    clinicStartHour: clinicStartHourRef.current,
                    clinicEndHour: clinicEndHourRef.current,
                    weekdaySettings: weekdaySettingsRef.current,
                    referralSources: referralSourcesRef.current,
                    patientTags: patientTagsRef.current,
                    expenseCategories: expenseCategoriesRef.current,
                    patientFollowUpStatuses: patientFollowUpStatusesRef.current,
                    listItemColors: listItemColorsRef.current,
                    patientRequiredFields: patientRequiredFieldsRef.current,
                    staffAlertSettings: staffAlertSettingsRef.current
                  },
                  normalized
                );
              } catch (cfgErr) {
                pendingConfigSyncRef.current = true;
                console.error('Deferred clinic_config sync error:', cfgErr);
              }
            }

            const pendingIds = loadFromStorage<string[]>('unsynced_staff_ids', []);
            if (Array.isArray(pendingIds) && pendingIds.length > 0) {
              const toSync = staffMembersRef.current.filter(s => pendingIds.includes(s.id));
              const remainingIds: string[] = [];
              for (const member of toSync) {
                try {
                  await upsertCloudDoc(
                    'staff_members',
                    member.id,
                    member as unknown as Record<string, unknown>,
                    normalized
                  );
                } catch {
                  remainingIds.push(member.id);
                }
              }
              saveToStorage('unsynced_staff_ids', remainingIds);
            }
          }
        } catch (initErr) {
          if (cancelled) return;
          const msg = initErr instanceof Error ? initErr.message : String(initErr);
          setCloudError(msg);
          // Still proceed to attach real-time listeners so live updates can flow as soon as connectivity settles
        }

        if (cancelled) return;

        const handleSnapErr = (err: Error) => {
          listenersActiveRef.current = false;
          setCloudSynced(false);
          setCloudError(err.message);
        };

        try {
          unsubscribers = [
          subscribeCollection<Record<string, unknown>>(
            'clinic_config',
            ADMIN_OWNER_EMAIL,
            docs => {
              const cfg = applyPendingClinicConfig(docs[0]);
              if (!cfg) return;
              if (typeof cfg.clinicStartHour === 'number') {
                setClinicStartHour(cfg.clinicStartHour);
                saveToStorage('clinic_start_hour', cfg.clinicStartHour);
              }
              if (typeof cfg.clinicEndHour === 'number') {
                setClinicEndHour(cfg.clinicEndHour);
                saveToStorage('clinic_end_hour', cfg.clinicEndHour);
              }
              if (Array.isArray(cfg.weekdaySettings)) {
                setWeekdaySettings(cfg.weekdaySettings as WeekdaySetting[]);
                saveToStorage('weekdays', cfg.weekdaySettings);
              }
              if (Array.isArray(cfg.referralSources)) {
                setReferralSources(cfg.referralSources as string[]);
                saveToStorage('referral_sources', cfg.referralSources);
              }
              if (Array.isArray(cfg.patientTags)) {
                const cloudTags = mergeSystemPatientTags(cfg.patientTags);
                setPatientTags(cloudTags);
                saveToStorage('patient_tags', cloudTags);
                const cloudTagsSet = new Set(cloudTags);
                setPatients(prev => {
                  const { cleaned } = migrateLegacyTagsAndNormalizePatients(prev, cloudTagsSet);
                  return cleaned;
                });
              }
              if (Array.isArray(cfg.expenseCategories)) {
                const normalizedCats = normalizeExpenseCategories(cfg.expenseCategories);
                setExpenseCategories(normalizedCats);
                saveToStorage('expense_categories', normalizedCats);
              }
              if (Array.isArray(cfg.patientFollowUpStatuses)) {
                const statuses = mergeSystemFollowUpStatuses(cfg.patientFollowUpStatuses);
                setPatientFollowUpStatuses(statuses);
                saveToStorage('patient_follow_up_statuses', statuses);
              }
              if (cfg.patientRequiredFields && typeof cfg.patientRequiredFields === 'object') {
                setPatientRequiredFields(cfg.patientRequiredFields as PatientFieldRequirements);
                saveToStorage('patient_required_fields', cfg.patientRequiredFields);
              }
              if (cfg.listItemColors && typeof cfg.listItemColors === 'object') {
                const colorsObj = cfg.listItemColors as ClinicListItemColors;
                setListItemColors(colorsObj);
                saveToStorage('list_item_colors', colorsObj);
              }
              if (cfg.staffAlertSettings && typeof cfg.staffAlertSettings === 'object') {
                const rawCfg = cfg.staffAlertSettings as Partial<StaffAlertSettings>;
                const legacyChannel = rawCfg.notificationChannel || 'website_only';
                const merged: StaffAlertSettings = {
                  ...DEFAULT_STAFF_ALERT_SETTINGS,
                  ...rawCfg,
                  appointmentNotificationChannel: rawCfg.appointmentNotificationChannel || legacyChannel,
                  shiftNotificationChannel: rawCfg.shiftNotificationChannel || legacyChannel
                };
                merged.notificationChannel = getEffectiveMobilePushChannel(merged);
                setStaffAlertSettings(merged);
                saveToStorage('staff_alert_settings', merged);
              }
            },
            handleSnapErr
          ),
          subscribeCollection<StaffMember>(
            'staff_members',
            ADMIN_OWNER_EMAIL,
            items => {
              setCloudStaffReady(true);
              const merged = applyPendingDocOps('staff_members', items);
              if (merged.length === 0) return;
              const normalized = merged.map(member => ({
                ...member,
                permissions: normalizeStaffPermissions(member.permissions, member.role)
              }));
              staffMembersRef.current = normalized;
              setStaffMembers(normalized);
            },
            handleSnapErr
          ),
          subscribeCollection<Doctor>('doctors', ADMIN_OWNER_EMAIL, items => {
            const merged = applyPendingDocOps('doctors', items);
            if (merged.length > 0) {
              doctorsRef.current = merged;
              setDoctors(merged);
            }
          }, handleSnapErr),
          subscribeCollection<ClinicUnit>('units', ADMIN_OWNER_EMAIL, items => {
            const merged = applyPendingDocOps('units', items);
            if (merged.length > 0) {
              unitsRef.current = merged;
              setUnits(merged);
            }
          }, handleSnapErr),
          subscribeCollection<ProcedureItem>('procedures', ADMIN_OWNER_EMAIL, items => {
            const merged = applyPendingDocOps('procedures', items);
            if (merged.length > 0) {
              proceduresRef.current = merged;
              setProcedures(merged);
            }
          }, handleSnapErr),
          subscribeCollection<Expense>('expenses', ADMIN_OWNER_EMAIL, items => {
            const merged = applyPendingDocOps('expenses', items).sort((a, b) =>
              (b.date || '').localeCompare(a.date || '')
            );
            expensesRef.current = merged;
            setExpenses(merged);
          }, handleSnapErr),
          subscribeCollection<Task>('tasks', ADMIN_OWNER_EMAIL, items => {
            setCloudTasksReady(true);
            const merged = applyPendingDocOps('tasks', items).sort((a, b) =>
              (b.dueDate || '').localeCompare(a.dueDate || '')
            );
            tasksRef.current = merged;
            setTasks(merged);
          }, handleSnapErr),
          subscribeCollection<AttendanceRecord>('attendance', ADMIN_OWNER_EMAIL, items => {
            setCloudAttendanceReady(true);
            const merged = applyPendingDocOps('attendance', items).sort((a, b) =>
              (b.date || '').localeCompare(a.date || '')
            );
            attendanceRef.current = merged;
            saveToStorage('attendance', merged);
            setAttendance(merged);
          }, handleSnapErr),
          subscribeCollection<AuditLogEntry>('audit_logs', ADMIN_OWNER_EMAIL, items => {
            const sorted = applyPendingDocOps('audit_logs', items)
              .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
              .slice(0, 500);
            auditLogsRef.current = sorted;
            setAuditLogs(sorted);
            saveToStorage('audit_logs', sorted);
          }, handleSnapErr),
          subscribeCollection<PatientFollowUpLogEntry>('patient_follow_up_logs', ADMIN_OWNER_EMAIL, items => {
            const sorted = applyPendingDocOps('patient_follow_up_logs', items)
              .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
              .slice(0, 500);
            patientFollowUpLogsRef.current = sorted;
            setPatientFollowUpLogs(sorted);
            saveToStorage('patient_follow_up_logs', sorted);
          }, handleSnapErr),
          subscribeCollection<StaffAlertLogEntry>('staff_alert_logs', ADMIN_OWNER_EMAIL, items => {
            const sorted = applyPendingDocOps('staff_alert_logs', items)
              .sort((a, b) => (b.lastUpdatedAt || b.triggeredAt || '').localeCompare(a.lastUpdatedAt || a.triggeredAt || ''))
              .slice(0, 300);
            staffAlertLogsRef.current = sorted;
            setStaffAlertLogs(sorted);
            saveToStorage('staff_alert_logs', sorted);
          }, handleSnapErr),
          subscribeCollection<StaffComment>('staff_comments', ADMIN_OWNER_EMAIL, items => {
            const hydrated = applyPendingDocOps('staff_comments', items).map(c => ({
              ...c,
              createdAt: c.createdAt || (Array.isArray(c.history) && c.history[0]) || new Date().toISOString()
            }));
            const sorted = hydrated.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            staffCommentsRef.current = sorted;
            setStaffComments(sorted);
            saveToStorage('staff_comments', sorted);
          }, handleSnapErr),
          subscribeCollection<WhatsAppTemplate>('whatsapp_templates', ADMIN_OWNER_EMAIL, items => {
            const merged = applyPendingDocOps('whatsapp_templates', items);
            if (merged.length > 0) {
              whatsappTemplatesRef.current = merged;
              setWhatsappTemplates(merged);
            }
          }, handleSnapErr),
          subscribeCollection<WhatsAppAlert>('whatsapp_alerts', ADMIN_OWNER_EMAIL, items => {
            const merged = applyPendingDocOps('whatsapp_alerts', items).sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            whatsappAlertsRef.current = merged;
            setWhatsappAlerts(merged);
          }, handleSnapErr),
          subscribeOverlayCollection<Patient>(
            'patients_sync',
            ADMIN_OWNER_EMAIL,
            overlays => {
              const protectedOverlays = applyPendingOverlayOps('patients_sync', overlays);
              overlaysRef.current.patients = protectedOverlays;
              if (!baseArchiveRef.current || !isHydratedRef.current) return;

              const allowedTagsSet = new Set(mergeSystemPatientTags(patientTagsRef.current));
              const prevOverlays = prevAppliedOverlaysRef.current.patients;
              if (prevOverlays !== null) {
                const diff = diffOverlayDocs(prevOverlays, protectedOverlays);
                prevAppliedOverlaysRef.current.patients = protectedOverlays;
                if (diff.upserts.length === 0 && diff.deleteIds.size === 0 && diff.revertIds.size === 0) {
                  return;
                }
                const { cleaned: normalizedUpserts, migratedRecords } = migrateLegacyTagsAndNormalizePatients(
                  diff.upserts,
                  allowedTagsSet
                );
                const patched = applyIncrementalListPatch(
                  patientsRef.current,
                  archiveByIdRef.current.patients,
                  { upserts: normalizedUpserts, deleteIds: diff.deleteIds, revertIds: diff.revertIds },
                  (localPat, incomingPat) =>
                    JSON.stringify(normalizePatientForDiff(localPat)) ===
                    JSON.stringify(normalizePatientForDiff(incomingPat))
                );
                if (patched.changed) {
                  const affectedIds = new Set<string>(patched.changedItems.map(p => p.id));
                  let billedByPat: Map<string, number> | null = null;
                  let paidByPat: Map<string, number> | null = null;
                  const finalPatients = patched.nextList.map(pat => {
                    if (!affectedIds.has(pat.id)) return pat;
                    if (!billedByPat) {
                      billedByPat = new Map();
                      paidByPat = new Map();
                      for (let i = 0; i < invoicesRef.current.length; i++) {
                        const inv = invoicesRef.current[i];
                        if (affectedIds.has(inv.patientId) && inv.status !== 'voided') {
                          billedByPat.set(inv.patientId, (billedByPat.get(inv.patientId) || 0) + inv.netTotal);
                        }
                      }
                      for (let i = 0; i < paymentsRef.current.length; i++) {
                        const pay = paymentsRef.current[i];
                        if (affectedIds.has(pay.patientId) && pay.status !== 'voided') {
                          paidByPat.set(pay.patientId, (paidByPat.get(pay.patientId) || 0) + pay.amount);
                        }
                      }
                    }
                    const billed = billedByPat.get(pat.id) ?? pat.totalBilled;
                    const paid = paidByPat!.get(pat.id) ?? pat.totalPaid;
                    return {
                      ...pat,
                      totalBilled: billed,
                      totalPaid: paid,
                      outstandingBalance: Math.max(0, billed - paid)
                    };
                  });
                  skipPersistRef.current.patients = false;
                  patientsRef.current = finalPatients;
                  setPatients(finalPatients);
                }
                if (migratedRecords.length > 0 && cloudUserRef.current) {
                  const unsyncedMigrations = migratedRecords.filter(
                    m => !tombstonedDupIdsRef.current.has('tag_mig:' + m.id)
                  );
                  if (unsyncedMigrations.length > 0) {
                    unsyncedMigrations.forEach(m => tombstonedDupIdsRef.current.add('tag_mig:' + m.id));
                    runCloudTask(
                      batchUpsertSyncOverlay(
                        'patients_sync',
                        unsyncedMigrations.map(record => ({ record, isDeleted: false })),
                        allowedCloudEmailsRef.current
                      )
                    );
                  }
                }
                return;
              }

              prevAppliedOverlaysRef.current.patients = protectedOverlays;
              skipPersistRef.current.patients = false;
              const merged = mergeSyncOverlay(baseArchiveRef.current.patients, protectedOverlays);
              const { cleaned, migratedRecords } = migrateLegacyTagsAndNormalizePatients(merged, allowedTagsSet);
              const withTotals = applyFinancialTotalsToPatients(
                cleaned,
                invoicesRef.current,
                paymentsRef.current
              );
              patientsRef.current = withTotals;
              setPatients(withTotals);
              if (migratedRecords.length > 0 && cloudUserRef.current) {
                const unsyncedMigrations = migratedRecords.filter(
                  m => !tombstonedDupIdsRef.current.has('tag_mig:' + m.id)
                );
                if (unsyncedMigrations.length > 0) {
                  unsyncedMigrations.forEach(m => tombstonedDupIdsRef.current.add('tag_mig:' + m.id));
                  runCloudTask(
                    batchUpsertSyncOverlay(
                      'patients_sync',
                      unsyncedMigrations.map(record => ({ record, isDeleted: false })),
                      allowedCloudEmailsRef.current
                    )
                  );
                }
              }
            },
            handleSnapErr
          ),
          subscribeOverlayCollection<Appointment>(
            'appointments_sync',
            ADMIN_OWNER_EMAIL,
            overlays => {
              const protectedOverlays = applyPendingOverlayOps('appointments_sync', overlays);
              overlaysRef.current.appointments = protectedOverlays;
              if (!baseArchiveRef.current || !isHydratedRef.current) return;

              const prevOverlays = prevAppliedOverlaysRef.current.appointments;
              if (prevOverlays !== null) {
                const diff = diffOverlayDocs(prevOverlays, protectedOverlays);
                prevAppliedOverlaysRef.current.appointments = protectedOverlays;
                const patched = applyIncrementalListPatch(appointmentsRef.current, archiveByIdRef.current.appointments, diff);
                if (!patched.changed) return;
                skipPersistRef.current.appointments = false;
                appointmentsRef.current = patched.nextList;
                setAppointments(patched.nextList);
                return;
              }

              prevAppliedOverlaysRef.current.appointments = protectedOverlays;
              skipPersistRef.current.appointments = false;
              const nextAppts = mergeSyncOverlay(baseArchiveRef.current.appointments, protectedOverlays);
              appointmentsRef.current = nextAppts;
              setAppointments(nextAppts);
            },
            handleSnapErr
          ),
          subscribeOverlayCollection<Invoice>(
            'invoices_sync',
            ADMIN_OWNER_EMAIL,
            overlays => {
              overlaysRef.current.invoices = applyPendingOverlayOps('invoices_sync', overlays);
              applyDeduplicatedFinancialOverlays('invoices');
            },
            handleSnapErr
          ),
          subscribeOverlayCollection<Payment>(
            'payments_sync',
            ADMIN_OWNER_EMAIL,
            overlays => {
              overlaysRef.current.payments = applyPendingOverlayOps('payments_sync', overlays);
              applyDeduplicatedFinancialOverlays('payments');
            },
            handleSnapErr
          ),
          subscribeOverlayCollection<Operation>(
            'operations_sync',
            ADMIN_OWNER_EMAIL,
            overlays => {
              const protectedOverlays = applyPendingOverlayOps('operations_sync', overlays);
              overlaysRef.current.operations = protectedOverlays;
              if (!baseArchiveRef.current || !isHydratedRef.current) return;

              const prevOverlays = prevAppliedOverlaysRef.current.operations;
              if (prevOverlays !== null) {
                const diff = diffOverlayDocs(prevOverlays, protectedOverlays);
                prevAppliedOverlaysRef.current.operations = protectedOverlays;
                const patched = applyIncrementalListPatch(operationsRef.current, archiveByIdRef.current.operations, diff);
                if (!patched.changed) return;
                skipPersistRef.current.operations = false;
                operationsRef.current = patched.nextList;
                setOperations(patched.nextList);
                return;
              }

              prevAppliedOverlaysRef.current.operations = protectedOverlays;
              skipPersistRef.current.operations = false;
              const nextOps = mergeSyncOverlay(baseArchiveRef.current.operations, protectedOverlays);
              operationsRef.current = nextOps;
              setOperations(nextOps);
            },
            handleSnapErr
          )
        ];

          listenersActiveRef.current = true;
          setCloudSynced(true);
        } catch (err) {
          listenersActiveRef.current = false;
          const msg = err instanceof Error ? err.message : String(err);
          setCloudError(msg);
          setCloudSynced(false);
        }
      })().finally(() => {
        attachInFlight = null;
      });
      attachInFlight = run;
      return run;
    };

    attachCloudSubscriptionsRef.current = attachCloudSubscriptions;

    const unsubAuth = onAuthStateChanged(auth, async fbUser => {
      cleanupListeners();
      if (cancelled) return;

      if (!fbUser) {
        if (!anonAttemptedRef.current) {
          anonAttemptedRef.current = true;
          try {
            await signInAnonymously(auth);
            return;
          } catch (err) {
            if (cancelled) return;
            const code = (err as { code?: string })?.code || '';
            const msg = err instanceof Error ? err.message : String(err);
            if (
              code === 'auth/operation-not-allowed' ||
              code === 'auth/admin-restricted-operation' ||
              msg.includes('operation-not-allowed') ||
              msg.includes('admin-restricted-operation')
            ) {
              setCloudNeedsConsoleSetup(true);
              setCloudError('يرجى تفعيل خيار Anonymous في إعدادات Authentication في Firebase Console مرة واحدة لتفعيل الربط التلقائي.');
            } else {
              setCloudError(msg);
            }
          }
        }
        setCloudUser(null);
        setCloudSynced(false);
        setCloudTasksReady(false);
        setCloudStaffReady(false);
        setCloudAttendanceReady(false);
        setCloudAuthReady(true);
        return;
      }

      await attachCloudSubscriptions(fbUser);
    });

    return () => {
      cancelled = true;
      attachCloudSubscriptionsRef.current = null;
      cleanupListeners();
      unsubAuth();
    };
  }, []);

  // Auto-seed the daily "خلص شغل (مكالمة تليفونية)" task assigned to شهد once after initial load
  useEffect(() => {
    if (!archiveReady || !cloudAuthReady) return;
    if (cloudUser && (!cloudTasksReady || !cloudStaffReady)) return;

    const seededKey = LOCAL_STORAGE_PREFIX + 'finished_work_task_seeded_v1';
    let alreadySeeded = false;
    try {
      alreadySeeded = localStorage.getItem(seededKey) === 'true';
    } catch {}

    const alreadyExists = tasksRef.current.some(
      t => t.id === FINISHED_WORK_TASK_ID || isFinishedWorkTaskTitle(t.title)
    );
    if (alreadyExists) {
      if (!alreadySeeded) {
        try {
          localStorage.setItem(seededKey, 'true');
        } catch {}
      }
      return;
    }
    if (alreadySeeded) return;

    const shahdMember = staffMembersRef.current.find(s => s.name.includes('شهد'));
    const fwTask: Task = {
      id: FINISHED_WORK_TASK_ID,
      title: FINISHED_WORK_TASK_TITLE,
      description: 'متابعة المرضى الذين أتموا زياراتهم دون حجز ميعاد قادم (٥ مرضى يومياً أو جميع مرضى يوم العمل السابق إذا زادوا عن ٥)',
      dueDate: cairoTodayStr,
      assignedTo: shahdMember?.name || 'شهد',
      priority: 'high',
      recurrence: 'daily',
      isCompleted: false
    };

    const nextTasks = [...tasksRef.current, fwTask];
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    saveToStorage('tasks', nextTasks);
    try {
      localStorage.setItem(seededKey, 'true');
    } catch {}

    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'tasks',
        docId: fwTask.id,
        data: fwTask as unknown as Record<string, unknown>
      }
    ]);
  }, [archiveReady, cloudAuthReady, cloudUser, cloudTasksReady, cloudStaffReady, cairoTodayStr]);

  const [currentDate, setCurrentDate] = useState<string>(getTodayDateString());

  const initialNav = loadFromStorage<{
    activeView?: ActiveView;
    selectedPatientId?: string | null;
    invoicesTodayOnly?: boolean;
    paymentsTodayOnly?: boolean;
    expensesTodayOnly?: boolean;
  }>('nav_state', {});

  const [activeView, setActiveView] = useState<ActiveView>(() => {
    const v = initialNav.activeView;
    if (!v || (v as string) === 'prescriptions') return 'dashboard';
    if (v === 'patient_detail' && !initialNav.selectedPatientId) return 'patients';
    return v;
  });
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(() =>
    initialNav.selectedPatientId || null
  );
  const [invoicesTodayOnly, setInvoicesTodayOnly] = useState<boolean>(() => Boolean(initialNav.invoicesTodayOnly));
  const [paymentsTodayOnly, setPaymentsTodayOnly] = useState<boolean>(() => Boolean(initialNav.paymentsTodayOnly));
  const [expensesTodayOnly, setExpensesTodayOnly] = useState<boolean>(() => Boolean(initialNav.expensesTodayOnly));

  const [patientsViewState, setPatientsViewState] = useState<PatientsViewState>(() => {
    const loaded = loadFromStorage<PatientsViewState>('patients_view_state', {
      searchQuery: '',
      filterStatus: 'all',
      filterTag: 'all',
      filterDebtOnly: false,
      sortBy: 'registered_desc',
      pageSize: 50,
      currentPage: 1
    });
    // Always start each app session with a clean search box so old phone numbers/queries never linger across sessions
    const sanitizedLoaded: PatientsViewState = {
      ...loaded,
      searchQuery: '',
      currentPage: 1
    };
    try {
      if (localStorage.getItem(LOCAL_STORAGE_PREFIX + 'patients_sort_default_v2') !== 'true') {
        localStorage.setItem(LOCAL_STORAGE_PREFIX + 'patients_sort_default_v2', 'true');
        if (sanitizedLoaded.sortBy === 'name') {
          return { ...sanitizedLoaded, sortBy: 'registered_desc', currentPage: 1 };
        }
      }
    } catch {}
    return sanitizedLoaded;
  });

  const persistedPatientsViewPrefs = useMemo<PatientsViewState>(
    () => ({
      ...patientsViewState,
      searchQuery: '',
      currentPage: 1
    }),
    [
      patientsViewState.filterStatus,
      patientsViewState.filterTag,
      patientsViewState.filterDebtOnly,
      patientsViewState.sortBy,
      patientsViewState.pageSize
    ]
  );

  useDebouncedStorage('patients_view_state', persistedPatientsViewPrefs, 250);

  const navStorageState = useMemo(
    () => ({
      activeView,
      selectedPatientId,
      invoicesTodayOnly,
      paymentsTodayOnly,
      expensesTodayOnly
    }),
    [activeView, selectedPatientId, invoicesTodayOnly, paymentsTodayOnly, expensesTodayOnly]
  );
  useDebouncedStorage('nav_state', navStorageState, 150);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem(LOCAL_STORAGE_PREFIX + 'is_logged_in') === 'true' ||
        sessionStorage.getItem(LOCAL_STORAGE_PREFIX + 'is_logged_in') === 'true'
      );
    } catch {
      return false;
    }
  });

  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    try {
      const sessionId = sessionStorage.getItem(LOCAL_STORAGE_PREFIX + 'current_user_id');
      if (sessionId) return sessionId;
    } catch {}
    return loadFromStorage('current_user_id', 'user_shlkamy');
  });
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const persistAuthSession = (userId: string, rememberDevice: boolean, rememberedInput?: string) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + 'remember_me', rememberDevice ? 'true' : 'false');
      if (rememberDevice) {
        localStorage.setItem(LOCAL_STORAGE_PREFIX + 'is_logged_in', 'true');
        localStorage.setItem(LOCAL_STORAGE_PREFIX + 'current_user_id', userId);
        if (rememberedInput !== undefined) {
          localStorage.setItem(LOCAL_STORAGE_PREFIX + 'remembered_username', rememberedInput);
        }
        sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'is_logged_in');
        sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'current_user_id');
      } else {
        sessionStorage.setItem(LOCAL_STORAGE_PREFIX + 'is_logged_in', 'true');
        sessionStorage.setItem(LOCAL_STORAGE_PREFIX + 'current_user_id', userId);
        localStorage.removeItem(LOCAL_STORAGE_PREFIX + 'is_logged_in');
        localStorage.removeItem(LOCAL_STORAGE_PREFIX + 'remembered_username');
      }
    } catch {}
  };

  const login = (
    usernameOrEmail: string,
    pass: string,
    rememberDevice: boolean = true
  ): { success: boolean; error?: string } => {
    const query = usernameOrEmail.trim().toLowerCase();
    const cleanPass = pass;
    if (!query || !cleanPass) {
      return { success: false, error: 'يرجى إدخال اسم المستخدم (أو البريد الإلكتروني) وكلمة المرور' };
    }

    const matchedUser = staffMembers.find(s => {
      const u = (s.username || '').trim().toLowerCase();
      const em = (s.email || '').trim().toLowerCase();
      return (u !== '' && u === query) || (em !== '' && em === query);
    });

    if (!matchedUser) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    if (matchedUser.isDisabled) {
      return { success: false, error: 'هذا الحساب معطّل حالياً، يرجى مراجعة مدير العيادة' };
    }

    const storedPass = matchedUser.password ?? '';
    const passMatches =
      storedPass !== '' &&
      (storedPass === cleanPass || (cleanPass.trim() !== '' && storedPass.trim() === cleanPass.trim()));
    if (!passMatches) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    currentUserIdRef.current = matchedUser.id;
    setCurrentUserId(matchedUser.id);
    setIsLoggedIn(true);
    setActiveView('dashboard');
    setSelectedPatientId(null);
    persistAuthSession(matchedUser.id, rememberDevice, usernameOrEmail.trim());
    try {
      sessionStorage.setItem(LOCAL_STORAGE_PREFIX + 'session_login_logged_' + matchedUser.id, '1');
    } catch {}
    logAuditAction(
      'status_change',
      'staff',
      matchedUser.id,
      matchedUser.name,
      `تسجيل دخول الموظف للموقع: ${matchedUser.name}`,
      undefined,
      { userId: matchedUser.id, role: matchedUser.role, eventType: 'login' },
      'audit_logs'
    );
    return { success: true };
  };

  const logout = () => {
    const activeBeforeLogout = resolveActiveStaffFromRefs();
    try {
      sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'session_login_logged_' + activeBeforeLogout.id);
    } catch {}
    logAuditAction(
      'status_change',
      'staff',
      activeBeforeLogout.id,
      activeBeforeLogout.name,
      `تسجيل خروج الموظف من الموقع: ${activeBeforeLogout.name}`,
      { userId: activeBeforeLogout.id, role: activeBeforeLogout.role, eventType: 'logout' },
      undefined,
      'audit_logs'
    );
    setIsLoggedIn(false);
    setIsDrawerOpen(false);
    setActiveView('dashboard');
    setSelectedPatientId(null);
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + 'is_logged_in', 'false');
      sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'is_logged_in');
      sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'current_user_id');
    } catch {}
  };

  const resetPasswordByEmail = (
    email: string,
    verification: string,
    newPassword: string
  ): { success: boolean; error?: string } => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanVerification = verification.trim();
    const cleanNewPass = newPassword;

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'يرجى إدخال البريد الإلكتروني المسجل' };
    }
    if (!cleanVerification) {
      return { success: false, error: 'يرجى إدخال رمز الاستعادة أو رقم الموبايل المسجل للتحقق' };
    }
    if (!cleanNewPass || cleanNewPass.length < 4) {
      return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون ٤ أحرف أو أرقام على الأقل' };
    }

    const found = staffMembers.find(
      s => !s.isDisabled && (s.email || '').trim().toLowerCase() === cleanEmail
    );
    if (!found) {
      return { success: false, error: 'لا يوجد حساب نشط مرتبط بهذا البريد الإلكتروني' };
    }

    const expectedPin = (found.recoveryPin || '').trim();
    const expectedPhone = (found.phone || '').trim();
    const isVerified =
      (expectedPin !== '' && cleanVerification === expectedPin) ||
      (expectedPhone !== '' && cleanVerification === expectedPhone);

    if (!isVerified) {
      return {
        success: false,
        error: 'رمز الاستعادة (أو رقم الموبايل المسجل) غير مطابق لهذا البريد الإلكتروني'
      };
    }

    const updatedMember: StaffMember = { ...found, password: cleanNewPass };
    const nextStaff = staffMembersRef.current.map(s => (s.id === found.id ? updatedMember : s));
    staffMembersRef.current = nextStaff;
    saveToStorage('staff_members', nextStaff);
    setStaffMembers(nextStaff);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_members',
        docId: updatedMember.id,
        data: updatedMember as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'update',
      'staff',
      found.id,
      found.name,
      `إعادة تعيين كلمة المرور للموظف: ${found.name}`,
      undefined,
      { userId: found.id },
      'settings'
    );
    return { success: true };
  };

  const retryCloudConnect = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      setCloudError(null);
      setCloudNeedsConsoleSetup(false);
      if (!auth.currentUser) {
        anonAttemptedRef.current = false;
        await signInAnonymously(auth);
      }
      if (auth.currentUser) {
        if (!listenersActiveRef.current && attachCloudSubscriptionsRef.current) {
          await attachCloudSubscriptionsRef.current(auth.currentUser);
        }
        await flushPendingCloudOps();
        if (pendingConfigSyncRef.current) {
          pendingConfigSyncRef.current = false;
          await syncClinicConfigToCloud();
        }
        await refreshAttendanceFromServer(true);
      }
      return { success: true };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : String(err);
      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/admin-restricted-operation' ||
        msg.includes('operation-not-allowed') ||
        msg.includes('admin-restricted-operation')
      ) {
        setCloudNeedsConsoleSetup(true);
        const friendly = 'يرجى تفعيل خيار Anonymous في إعدادات Authentication في Firebase Console مرة واحدة لتفعيل الربط التلقائي.';
        setCloudError(friendly);
        return { success: false, error: friendly };
      }
      setCloudError(msg);
      return { success: false, error: msg };
    }
  };
  retryCloudConnectRef.current = retryCloudConnect;

  const retryPendingCloudSync = async (): Promise<{ success: boolean; error?: string }> => {
    retryBackoffMsRef.current = 0;
    lastRetryAtRef.current = 0;
    return retryCloudConnect();
  };

  const currentUser = useMemo<StaffMember>(
    () =>
      staffMembers.find(s => s.id === currentUserId && !s.isDisabled) ||
      staffMembers.find(s => !s.isDisabled) ||
      staffMembers[0] ||
      INITIAL_STAFF_MEMBERS[0],
    [staffMembers, currentUserId]
  );

  const effectivePatients = useMemo(() => {
    if (currentUser.role === 'doctor' && currentUser.permissions?.patientsOwnOnly) {
      const docId = currentUser.doctorId;
      const docName = currentUser.name;
      const allowedPatientIds = new Set<string>();
      appointments.forEach(a => {
        if ((docId && a.doctorId === docId) || (docName && a.doctorName === docName)) {
          if (a.patientId) allowedPatientIds.add(a.patientId);
        }
      });
      patients.forEach(p => {
        if (docName && p.doctorName === docName) {
          allowedPatientIds.add(p.id);
        }
      });
      return patients.filter(p => allowedPatientIds.has(p.id));
    }
    return patients;
  }, [patients, appointments, currentUser]);

  const setCurrentUser = (user: Pick<StaffMember, 'id'> | StaffMember) => {
    currentUserIdRef.current = user.id;
    setCurrentUserId(user.id);
    try {
      const remember = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'remember_me') !== 'false';
      if (remember) {
        localStorage.setItem(LOCAL_STORAGE_PREFIX + 'current_user_id', user.id);
        sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'current_user_id');
      } else {
        sessionStorage.setItem(LOCAL_STORAGE_PREFIX + 'current_user_id', user.id);
      }
    } catch {}
  };

  // Flush any queued cloud writes automatically once Firebase Auth & initial sync are ready
  useEffect(() => {
    if (!cloudSynced || !cloudUser) return;
    if (getPendingCloudCount() > 0) {
      void flushPendingCloudOps();
    }
    if (pendingConfigSyncRef.current) {
      pendingConfigSyncRef.current = false;
      void syncClinicConfigToCloud();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSynced, cloudUser]);

  // Periodically & on reconnect/focus retry any pending cloud mutations, recover dropped listeners, and refresh live attendance
  useEffect(() => {
    const attemptReconnectOrFlush = (ignoreBackoff: boolean = false, refreshLiveAttendance: boolean = false) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const needsListenerRecovery =
        !cloudNeedsConsoleSetup && (!auth.currentUser || !listenersActiveRef.current || !cloudSyncedRef.current);
      const hasPending = getPendingCloudCount() > 0 || pendingConfigSyncRef.current;

      if (refreshLiveAttendance && auth.currentUser && listenersActiveRef.current) {
        void refreshAttendanceFromServer(false);
      }

      if (!needsListenerRecovery && !hasPending) return;
      if (
        !ignoreBackoff &&
        retryBackoffMsRef.current > 0 &&
        Date.now() - lastRetryAtRef.current < retryBackoffMsRef.current
      ) {
        return;
      }
      if (needsListenerRecovery) {
        void retryCloudConnect();
      } else if (cloudUserRef.current || auth.currentUser) {
        void flushPendingCloudOps();
      } else if (!cloudNeedsConsoleSetup) {
        void retryCloudConnect();
      }
    };

    const handleOnline = () => {
      retryBackoffMsRef.current = 0;
      lastRetryAtRef.current = 0;
      attemptReconnectOrFlush(true, true);
    };

    const handleVisibility = () => {
      if (!document.hidden) attemptReconnectOrFlush(false, true);
    };

    const handleFocus = () => attemptReconnectOrFlush(false, true);
    const handleInterval = () => attemptReconnectOrFlush(false, false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    const intervalId = window.setInterval(handleInterval, 15_000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudNeedsConsoleSetup]);

  // Record an account-open entry once per browser/PWA session when an employee opens a remembered session
  useEffect(() => {
    if (!isLoggedIn || !archiveReady) return;
    const sessionKey = LOCAL_STORAGE_PREFIX + 'session_login_logged_' + currentUser.id;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
      sessionStorage.setItem(sessionKey, '1');
    } catch {
      return;
    }
    logAuditAction(
      'status_change',
      'staff',
      currentUser.id,
      currentUser.name,
      `فتح حساب الموظف (جلسة محفوظة): ${currentUser.name}`,
      undefined,
      { userId: currentUser.id, role: currentUser.role, eventType: 'session_open' },
      'audit_logs'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, archiveReady, currentUser.id]);

  const hasPermission = useCallback(
    (permission: keyof StaffPermissions): boolean => Boolean(currentUser.permissions?.[permission]),
    [currentUser]
  );

  const restrictedUnit = useMemo(() => {
    if (currentUser.role === 'admin' || !currentUser.restrictedBranchId) return undefined;
    return units.find(u => u.id === currentUser.restrictedBranchId);
  }, [currentUser.role, currentUser.restrictedBranchId, units]);

  const isUnitAllowed = useCallback(
    (unitId?: string, branchName?: string): boolean => {
      if (!restrictedUnit) return true;
      if (unitId) return unitId === restrictedUnit.id;
      if (branchName) {
        const a = normalizeBranchString(branchName);
        const b = normalizeBranchString(restrictedUnit.name);
        if (!a || !b) return false;
        if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
        const aCore = a.split(' ').slice(0, 2).join(' ');
        const bCore = b.split(' ').slice(0, 2).join(' ');
        return Boolean(aCore && bCore && aCore === bCore);
      }
      return false;
    },
    [restrictedUnit]
  );

  const restrictedPatientIdSet = useMemo(() => {
    if (!restrictedUnit) return null;
    const set = new Set<string>();
    appointments.forEach(a => {
      if (a.unitId === restrictedUnit.id && a.patientId) {
        set.add(a.patientId);
      }
    });
    const rNorm = normalizeBranchString(restrictedUnit.name);
    const rCore = rNorm.split(' ').slice(0, 2).join(' ');
    patients.forEach(p => {
      if (!p.branchName) return;
      const pNorm = normalizeBranchString(p.branchName);
      const pCore = pNorm.split(' ').slice(0, 2).join(' ');
      if (
        pNorm === rNorm ||
        pNorm.startsWith(rNorm) ||
        rNorm.startsWith(pNorm) ||
        (rCore && pCore && pCore === rCore)
      ) {
        set.add(p.id);
      }
    });
    return set;
  }, [restrictedUnit, appointments, patients]);

  const isPatientAllowed = useCallback(
    (patientId: string): boolean => {
      if (!restrictedPatientIdSet) return true;
      return restrictedPatientIdSet.has(patientId);
    },
    [restrictedPatientIdSet]
  );

  const [patientDetailFocusNotes, setPatientDetailFocusNotes] = useState(false);
  const clearPatientDetailFocusNotes = () => setPatientDetailFocusNotes(false);

  const [reportsInitialPeriod, setReportsInitialPeriod] = useState<'today' | 'week' | 'month' | 'year' | 'all' | 'custom' | null>(null);
  const clearReportsInitialPeriod = () => setReportsInitialPeriod(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [quickActionInitialTab, setQuickActionInitialTab] = useState<'appointment' | 'patient' | 'invoice' | 'payment' | 'expense' | 'task' | undefined>(undefined);
  const [quickActionPrefill, setQuickActionPrefill] = useState<{ date?: string; time?: string; unitId?: string; doctorId?: string; patientId?: string; appointmentId?: string; invoiceId?: string; amount?: number; toothNumber?: number; toothNumbers?: number[] } | undefined>(undefined);
  const [followUpViewPrefill, setFollowUpViewPrefill] = useState<FollowUpViewPrefill | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isPWAInstallModalOpen, setIsPWAInstallModalOpen] = useState(false);

  const [deviceLayout, setDeviceLayout] = useState<DeviceLayout>(() => detectDeviceLayout());

  useEffect(() => {
    try {
      localStorage.removeItem('cf_view_mode');
    } catch {}

    const handleResize = () => {
      const next = detectDeviceLayout();
      setDeviceLayout(prev => (prev === next ? prev : next));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cf_dark_mode');
      if (saved !== null) {
        return saved === 'true';
      }
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cf_dark_mode', String(darkMode));
    } catch (e) {
      console.error(e);
    }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const dirtyIdbKeysRef = useRef<Set<'patients' | 'appointments' | 'invoices' | 'payments' | 'operations'>>(new Set());

  // Sync only changed/added/deleted dataset deltas to IndexedDB using O(N) pointer diffing
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (skipPersistRef.current.patients) {
      skipPersistRef.current.patients = false;
      return;
    }
    dirtyIdbKeysRef.current.add('patients');
    const timeout = setTimeout(() => {
      dirtyIdbKeysRef.current.delete('patients');
      syncIdbDeltaForDataset('patients', patients);
    }, 150);
    return () => clearTimeout(timeout);
  }, [patients]);
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (skipPersistRef.current.appointments) {
      skipPersistRef.current.appointments = false;
      return;
    }
    dirtyIdbKeysRef.current.add('appointments');
    const timeout = setTimeout(() => {
      dirtyIdbKeysRef.current.delete('appointments');
      syncIdbDeltaForDataset('appointments', appointments);
    }, 150);
    return () => clearTimeout(timeout);
  }, [appointments]);
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (skipPersistRef.current.invoices) {
      skipPersistRef.current.invoices = false;
      return;
    }
    dirtyIdbKeysRef.current.add('invoices');
    const timeout = setTimeout(() => {
      dirtyIdbKeysRef.current.delete('invoices');
      syncIdbDeltaForDataset('invoices', invoices);
    }, 150);
    return () => clearTimeout(timeout);
  }, [invoices]);
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (skipPersistRef.current.payments) {
      skipPersistRef.current.payments = false;
      return;
    }
    dirtyIdbKeysRef.current.add('payments');
    const timeout = setTimeout(() => {
      dirtyIdbKeysRef.current.delete('payments');
      syncIdbDeltaForDataset('payments', payments);
    }, 150);
    return () => clearTimeout(timeout);
  }, [payments]);
  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (skipPersistRef.current.operations) {
      skipPersistRef.current.operations = false;
      return;
    }
    dirtyIdbKeysRef.current.add('operations');
    const timeout = setTimeout(() => {
      dirtyIdbKeysRef.current.delete('operations');
      syncIdbDeltaForDataset('operations', operations);
    }, 150);
    return () => clearTimeout(timeout);
  }, [operations]);

  // Flush only genuinely dirty in-memory stores to IndexedDB deltas / localStorage if the user refreshes or leaves
  useEffect(() => {
    const flushLocalImmediately = () => {
      flushPendingQueuePersistenceNow();
      if (isHydratedRef.current && dirtyIdbKeysRef.current.size > 0) {
        const dirtyIdb = Array.from(dirtyIdbKeysRef.current);
        dirtyIdbKeysRef.current.clear();
        for (const key of dirtyIdb) {
          if (key === 'patients') syncIdbDeltaForDataset('patients', patientsRef.current);
          else if (key === 'appointments') syncIdbDeltaForDataset('appointments', appointmentsRef.current);
          else if (key === 'invoices') syncIdbDeltaForDataset('invoices', invoicesRef.current);
          else if (key === 'payments') syncIdbDeltaForDataset('payments', paymentsRef.current);
          else if (key === 'operations') syncIdbDeltaForDataset('operations', operationsRef.current);
        }
      }
      if (dirtyLocalKeys.size > 0) {
        const refMap: Record<string, unknown> = {
          expenses: expensesRef.current,
          tasks: tasksRef.current,
          attendance: attendanceRef.current,
          alerts: whatsappAlertsRef.current,
          templates: whatsappTemplatesRef.current,
          procedures: proceduresRef.current,
          units: unitsRef.current,
          doctors: doctorsRef.current,
          staff_members: staffMembersRef.current,
          patient_follow_up_logs: patientFollowUpLogsRef.current,
          staff_alert_logs: staffAlertLogsRef.current,
          staff_comments: staffCommentsRef.current,
          weekdays: weekdaySettingsRef.current,
          referral_sources: referralSourcesRef.current,
          patient_tags: patientTagsRef.current,
          expense_categories: expenseCategoriesRef.current,
          patient_follow_up_statuses: patientFollowUpStatusesRef.current,
          list_item_colors: listItemColorsRef.current,
          patient_required_fields: patientRequiredFieldsRef.current
        };
        const keys = Array.from(dirtyLocalKeys);
        for (const k of keys) {
          if (k in refMap) {
            saveToStorage(k, refMap[k]);
          }
        }
      }
    };

    const handleVisibility = () => {
      if (document.hidden) flushLocalImmediately();
    };

    window.addEventListener('pagehide', flushLocalImmediately);
    window.addEventListener('beforeunload', flushLocalImmediately);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushLocalImmediately);
      window.removeEventListener('beforeunload', flushLocalImmediately);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useDebouncedStorage('expenses', expenses, 200);
  useDebouncedStorage('tasks', tasks, 200);
  useDebouncedStorage('attendance', attendance, 200);
  useDebouncedStorage('templates', whatsappTemplates, 200);
  useDebouncedStorage('alerts', whatsappAlerts, 200);
  useDebouncedStorage('procedures', procedures, 200);
  useDebouncedStorage('weekdays', weekdaySettings, 200);
  useDebouncedStorage('units', units, 200);
  useDebouncedStorage('doctors', doctors, 200);
  useDebouncedStorage('staff_members', staffMembers, 200);
  useDebouncedStorage('current_user_id', currentUserId, 100);
  useDebouncedStorage('referral_sources', referralSources, 200);
  useDebouncedStorage('patient_tags', patientTags, 200);
  useDebouncedStorage('expense_categories', expenseCategories, 200);
  useDebouncedStorage('patient_follow_up_statuses', patientFollowUpStatuses, 200);
  useDebouncedStorage('list_item_colors', listItemColors, 200);
  useDebouncedStorage('patient_follow_up_logs', patientFollowUpLogs, 300);
  useDebouncedStorage('staff_alert_logs', staffAlertLogs, 300);
  useDebouncedStorage('patient_required_fields', patientRequiredFields, 200);

  useEffect(() => {
    if (!testNotificationTriggerAt) return;
    const delayMs = Math.max(0, testNotificationTriggerAt - Date.now());
    const targetTrigger = testNotificationTriggerAt;
    const timer = window.setTimeout(() => {
      setIsTestNotificationDue(true);
      setTestNotificationTriggerAt(null);
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const title = 'إشعار تجريبي — تنبيهات الموظف';
        const body = 'تم وصول الإشعار التجريبي بنجاح بعد مرور دقيقة واحدة.';
        const options: NotificationOptions & {
          renotify?: boolean;
          vibrate?: number[];
          actions?: Array<{ action: string; title: string }>;
          data?: Record<string, unknown>;
        } = {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'clinicflow_test_' + targetTrigger,
          requireInteraction: true,
          renotify: true,
          silent: false,
          vibrate: [300, 120, 300, 120, 450],
          actions: [
            { action: 'completed', title: '🟢 تمت الزيارة' },
            { action: 'no_show', title: '🔴 لم تتم الزيارة' }
          ],
          data: {
            url: '/?view=staff_alerts',
            view: 'staff_alerts',
            alertType: 'test'
          }
        };
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready
            .then(reg => reg.showNotification(title, options))
            .catch(() => new Notification(title, options));
        } else {
          new Notification(title, options);
        }
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [testNotificationTriggerAt]);

  const refreshWebPushSubscription = async (): Promise<boolean> => {
    const effectiveChannel = getEffectiveMobilePushChannel(staffAlertSettingsRef.current);
    const res = await ensurePushSubscription(
      currentUser.id,
      currentUser.name,
      effectiveChannel
    );
    setWebPushReady(res.ok);
    if (res.ok) {
      await syncPushScheduleToServer({
        appointments: appointmentsRef.current,
        attendance: attendanceRef.current,
        staffAlertSettings: staffAlertSettingsRef.current,
        currentUser,
        units: unitsRef.current,
        weekdaySettings: weekdaySettingsRef.current,
        subscription: res.subscription || null
      });
    }
    return res.ok;
  };

  const enableMobilePushNotifications = async (): Promise<{
    ok: boolean;
    permission: NotificationPermission | 'unsupported';
    reason?: string;
  }> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { ok: false, permission: 'unsupported', reason: 'unsupported' };
    }
    let perm: NotificationPermission = Notification.permission;
    if (perm === 'default') {
      try {
        perm = await Notification.requestPermission();
      } catch {
        return { ok: false, permission: Notification.permission, reason: 'request_failed' };
      }
    }
    if (perm !== 'granted') {
      setWebPushReady(false);
      return { ok: false, permission: perm, reason: 'denied' };
    }
    const effectiveChannel = getEffectiveMobilePushChannel(staffAlertSettingsRef.current);
    const res = await ensurePushSubscription(currentUser.id, currentUser.name, effectiveChannel);
    setWebPushReady(res.ok);
    if (res.ok) {
      await syncPushScheduleToServer({
        appointments: appointmentsRef.current,
        attendance: attendanceRef.current,
        staffAlertSettings: staffAlertSettingsRef.current,
        currentUser,
        units: unitsRef.current,
        weekdaySettings: weekdaySettingsRef.current,
        subscription: res.subscription || null
      });
      logAuditAction(
        'status_change',
        'staff',
        currentUser.id,
        currentUser.name,
        `تفعيل إشعارات الموبايل للموظف: ${currentUser.name}`,
        undefined,
        { webPushReady: true },
        'staff_alerts'
      );
    }
    return { ok: res.ok, permission: perm, reason: res.reason };
  };

  // Automatically maintain Web Push subscription when mobile notifications are enabled & permitted
  const lastEnsurePushAtRef = useRef<number>(0);
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;

    const tryEnsure = async (force: boolean = false) => {
      if (typeof window === 'undefined' || typeof Notification === 'undefined') {
        if (!cancelled) setWebPushReady(prev => (prev === false ? prev : false));
        return;
      }
      if (Notification.permission !== 'granted') {
        if (!cancelled) setWebPushReady(prev => (prev === false ? prev : false));
        return;
      }
      const now = Date.now();
      if (!force && now - lastEnsurePushAtRef.current < 60_000) {
        return;
      }
      lastEnsurePushAtRef.current = now;
      const res = await ensurePushSubscription(
        currentUser.id,
        currentUser.name,
        getEffectiveMobilePushChannel(staffAlertSettings)
      );
      if (!cancelled) setWebPushReady(prev => (prev === res.ok ? prev : res.ok));
    };

    void tryEnsure(true);
    const keepAliveTimer = window.setInterval(() => {
      void tryEnsure(false);
    }, 300_000);

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        void tryEnsure(false);
      }
    };
    window.addEventListener('focus', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);
    return () => {
      cancelled = true;
      window.clearInterval(keepAliveTimer);
      window.removeEventListener('focus', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
    };
  }, [
    isLoggedIn,
    currentUser.id,
    currentUser.name,
    staffAlertSettings.notificationChannel,
    staffAlertSettings.appointmentNotificationChannel,
    staffAlertSettings.shiftNotificationChannel,
    staffAlertSettings.appointmentFollowUpEnabled,
    staffAlertSettings.shiftReminderEnabled
  ]);

  // Sync upcoming appointment & shift alerts to server so Web Push delivers even when site is closed
  const lastPushSyncFingerprintRef = useRef<string>('');
  const lastPushAttSigRef = useRef<string>('');
  useEffect(() => {
    if (!isLoggedIn) return;
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
      return;
    }
    const todayApptSig = appointments
      .filter(a => a.date >= cairoTodayStr)
      .map(a => `${a.id}:${a.date}:${a.time}:${a.status}:${a.unitId}`)
      .join('|');
    const attSig = attendance
      .filter(a => a.status === 'active' || a.date >= cairoTodayStr)
      .map(a => `${a.id}:${a.date}:${a.clockIn}:${a.clockOut || ''}:${a.status}`)
      .join('|');
    const fingerprint = `${currentUser.id}|${staffAlertSettings.appointmentFollowUpEnabled}|${staffAlertSettings.appointmentDelayMinutes}|${staffAlertSettings.appointmentTargetMode || ''}|${(staffAlertSettings.appointmentTargetStaffIds || []).join(',')}|${staffAlertSettings.shiftReminderEnabled}|${staffAlertSettings.shiftTargetMode || ''}|${(staffAlertSettings.shiftTargetStaffIds || []).join(',')}|${staffAlertSettings.notificationChannel}|${staffAlertSettings.appointmentNotificationChannel || ''}|${staffAlertSettings.shiftNotificationChannel || ''}|${units.length}|${weekdaySettings.length}|${attSig}|${todayApptSig}`;
    if (fingerprint === lastPushSyncFingerprintRef.current) return;

    const attendanceChanged = attSig !== lastPushAttSigRef.current;
    const delayMs = attendanceChanged ? 150 : 3000;

    const timer = window.setTimeout(() => {
      lastPushSyncFingerprintRef.current = fingerprint;
      lastPushAttSigRef.current = attSig;
      void syncPushScheduleToServer({
        appointments,
        attendance,
        staffAlertSettings,
        currentUser,
        units,
        weekdaySettings
      }).then(async res => {
        if (res.ok && res.subscribed) {
          if (!webPushReadyRef.current) setWebPushReady(true);
        } else if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          const ensured = await ensurePushSubscription(
            currentUser.id,
            currentUser.name,
            getEffectiveMobilePushChannel(staffAlertSettings)
          );
          if (ensured.ok && ensured.subscription) {
            setWebPushReady(prev => (prev === true ? prev : true));
            await syncPushScheduleToServer({
              appointments,
              attendance,
              staffAlertSettings,
              currentUser,
              units,
              weekdaySettings,
              subscription: ensured.subscription
            });
          } else if (webPushReadyRef.current) {
            setWebPushReady(false);
          }
        }
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [isLoggedIn, appointments, attendance, staffAlertSettings, currentUser, units, weekdaySettings, cairoTodayStr]);

  // Foreground / active-session OS notification backup for mobile & desktop PWA
  const shownNativeNotifsRef = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (!isLoggedIn) return;
    const checkAndDispatchNative = () => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      if (getEffectiveMobilePushChannel(staffAlertSettings) !== 'mobile_and_website') return;

      if (shownNativeNotifsRef.current === null) {
        let initialMap: Record<string, number> = {};
        try {
          const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'shown_native_notifs');
          if (raw) initialMap = JSON.parse(raw) as Record<string, number>;
        } catch {}
        shownNativeNotifsRef.current = initialMap;
      }
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const pruned: Record<string, number> = {};
      Object.entries(shownNativeNotifsRef.current).forEach(([k, ts]) => {
        if (typeof ts === 'number' && ts > cutoff) pruned[k] = ts;
      });
      shownNativeNotifsRef.current = pruned;

      const showNative = (
        tag: string,
        title: string,
        body: string,
        data: Record<string, unknown>,
        actions: Array<{ action: string; title: string }>
      ) => {
        if (pruned[tag]) return;
        pruned[tag] = Date.now();
        try {
          localStorage.setItem(LOCAL_STORAGE_PREFIX + 'shown_native_notifs', JSON.stringify(pruned));
        } catch {}
        const opts: NotificationOptions & {
          renotify?: boolean;
          vibrate?: number[];
          actions?: Array<{ action: string; title: string }>;
          data?: Record<string, unknown>;
        } = {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag,
          requireInteraction: true,
          renotify: true,
          vibrate: [300, 120, 300, 120, 450],
          actions,
          data
        };
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready
            .then(reg => reg.showNotification(title, opts))
            .catch(() => new Notification(title, opts));
        } else {
          new Notification(title, opts);
        }
      };

      const todayCairo = getCairoNowParts().dateStr;
      const todayPendingAppts = appointments.filter(
        a =>
          a.date === todayCairo &&
          a.status !== 'cancelled' &&
          a.status !== 'no_show' &&
          a.status !== 'arrived' &&
          a.status !== 'completed'
      );
      const dueAppts = getDueStaffAppointmentAlerts(todayPendingAppts, staffAlertSettings, currentUser).filter(a =>
        currentUser.role !== 'admin' && currentUser.restrictedBranchId
          ? a.unitId === currentUser.restrictedBranchId
          : true
      );
      dueAppts.forEach(appt => {
        showNative(
          `staff_alert_${appt.id}`,
          `معاد ${appt.patientName}`,
          `مر على الموعد المحدد (${formatCairoTime(appt.time)})`,
          { url: '/?view=staff_alerts', view: 'staff_alerts', appointmentId: appt.id, alertType: 'appointment' },
          [
            { action: 'completed', title: '🟢 تمت الزيارة' },
            { action: 'no_show', title: '🔴 لم تتم الزيارة' }
          ]
        );
      });

      const dueShifts = getDueStaffShiftAlerts(
        currentUser,
        attendance,
        staffAlertSettings,
        new Date(),
        units,
        weekdaySettings
      );
      dueShifts.forEach(sh => {
        showNative(
          `staff_shift_${sh.id}_step_${sh.reminderStep}`,
          sh.title,
          sh.message,
          { url: '/?view=dashboard', view: 'dashboard', alertType: sh.type },
          [{ action: sh.type, title: sh.type === 'shift_start' ? '🟢 بدأ الشفت' : '🔴 إنهاء الشفت' }]
        );
      });

      if (currentUser.role === 'admin') {
        const activeStaffIds = new Set(
          staffMembersRef.current.filter(s => !s.isDisabled).map(s => s.id)
        );
        staffAlertLogsRef.current.forEach(log => {
          if (log.status === 'active' && log.targetKey?.startsWith('shift_auto_end_')) {
            const recId = log.targetKey.replace('shift_auto_end_', '');
            const rec = attendanceRef.current.find(a => a.id === recId);
            if (!rec || !isMidnightAutoEndedAttendance(rec) || !activeStaffIds.has(rec.userId)) {
              return;
            }
            showNative(
              `staff_auto_end_${log.id}`,
              log.title,
              log.message,
              {
                url: `/?view=attendance&editAttendanceId=${encodeURIComponent(recId)}`,
                view: 'attendance',
                alertType: 'shift_end'
              },
              []
            );
          }
        });
      }
    };

    checkAndDispatchNative();
    const t = window.setInterval(checkAndDispatchNative, 30_000);
    return () => window.clearInterval(t);
  }, [isLoggedIn, appointments, attendance, staffMembers, staffAlertLogs, staffAlertSettings, currentUser, units, weekdaySettings]);

  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
  const openAttendanceShiftEdit = (recordId: string) => {
    setEditingAttendanceId(recordId);
    handleSetActiveView('attendance');
  };
  const clearEditingAttendanceId = () => {
    setEditingAttendanceId(null);
  };

  const [shiftAlertFeedback, setShiftAlertFeedback] = useState<{
    type: 'loading' | 'success' | 'error';
    action: 'shift_start' | 'shift_end';
    text: string;
  } | null>(null);
  const shiftFeedbackTimerRef = useRef<number | null>(null);
  const clearShiftAlertFeedback = () => {
    if (shiftFeedbackTimerRef.current) {
      window.clearTimeout(shiftFeedbackTimerRef.current);
      shiftFeedbackTimerRef.current = null;
    }
    setShiftAlertFeedback(null);
  };

  const pendingNotificationActionRef = useRef<{
    appointmentId: string;
    status: 'completed' | 'no_show';
  } | null>(null);
  const pendingShiftActionRef = useRef<'shift_start' | 'shift_end' | null>(null);
  const [notifActionTick, setNotifActionTick] = useState(0);
  const [shiftActionTick, setShiftActionTick] = useState(0);

  // Handle Service Worker notification click deep links, action buttons, and subscription rotation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const apptAction = params.get('apptAction');
      const appointmentId = params.get('appointmentId');
      const testAction = params.get('testAction');
      const shiftAction = params.get('shiftAction');
      const editAttId = params.get('editAttendanceId');

      let shouldReplaceUrl = false;
      if (viewParam === 'staff_alerts' || viewParam === 'attendance' || viewParam === 'dashboard') {
        setActiveView(viewParam);
        params.delete('view');
        shouldReplaceUrl = true;
      }
      if (editAttId) {
        setEditingAttendanceId(editAttId);
        params.delete('editAttendanceId');
        shouldReplaceUrl = true;
      }
      if ((apptAction === 'completed' || apptAction === 'no_show') && appointmentId) {
        pendingNotificationActionRef.current = {
          appointmentId,
          status: apptAction
        };
        setNotifActionTick(t => t + 1);
        params.delete('apptAction');
        params.delete('appointmentId');
        shouldReplaceUrl = true;
      }
      if (shiftAction === 'shift_start' || shiftAction === 'shift_end') {
        pendingShiftActionRef.current = shiftAction;
        setShiftActionTick(t => t + 1);
        params.delete('shiftAction');
        shouldReplaceUrl = true;
      }
      if (testAction) {
        setIsTestNotificationDue(false);
        setTestNotificationTriggerAt(null);
        params.delete('testAction');
        shouldReplaceUrl = true;
      }
      if (shouldReplaceUrl) {
        const nextSearch = params.toString();
        const nextUrl = window.location.pathname + (nextSearch ? `?${nextSearch}` : '') + window.location.hash;
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    } catch {}

    if (!('serviceWorker' in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        view?: string;
        appointmentId?: string;
        status?: string;
        action?: string;
      } | null;
      if (!data) return;
      if (
        data.type === 'NAVIGATE_VIEW' &&
        (data.view === 'staff_alerts' || data.view === 'attendance' || data.view === 'dashboard')
      ) {
        setActiveView(data.view);
      } else if (
        data.type === 'SHIFT_ACTION' &&
        (data.action === 'shift_start' || data.action === 'shift_end')
      ) {
        pendingShiftActionRef.current = data.action;
        setShiftActionTick(t => t + 1);
      } else if (
        data.type === 'APPOINTMENT_ACTION' &&
        data.appointmentId &&
        (data.status === 'completed' || data.status === 'no_show')
      ) {
        pendingNotificationActionRef.current = {
          appointmentId: data.appointmentId,
          status: data.status
        };
        setActiveView('staff_alerts');
        setNotifActionTick(t => t + 1);
      } else if (data.type === 'TEST_NOTIFICATION_ACTION') {
        setIsTestNotificationDue(false);
        setTestNotificationTriggerAt(null);
        setActiveView('staff_alerts');
      } else if (data.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        void refreshWebPushSubscription();
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, []);

  // Apply queued appointment status action from notification button once archive/appointments are hydrated
  useEffect(() => {
    const pending = pendingNotificationActionRef.current;
    if (!pending || !archiveReady) return;
    const target = appointments.find(a => a.id === pending.appointmentId);
    if (!target) return;
    pendingNotificationActionRef.current = null;
    updateAppointmentStatus(pending.appointmentId, pending.status);
  }, [archiveReady, appointments, notifActionTick]);

  // Apply queued shift start/end action from background push notification once user session is active
  useEffect(() => {
    const pendingShift = pendingShiftActionRef.current;
    if (!pendingShift || !isLoggedIn || !archiveReady) return;
    pendingShiftActionRef.current = null;
    void triggerShiftActionFromAlert(pendingShift, 'إشعار الموبايل/الخلفية');
  }, [isLoggedIn, archiveReady, shiftActionTick]);

  // Incremental O(affected) or full O(N+M) recalculation of patient totals whenever invoices/payments change
  useEffect(() => {
    if (!archiveReady) return;

    if (!fullFinancialRecalcRef.current) {
      const dirtyIds = dirtyFinancialPatientIdsRef.current;
      if (dirtyIds.size === 0) return;
      const targetIds = new Set(dirtyIds);
      dirtyIds.clear();

      const billedMap = new Map<string, number>();
      const invSeen = new Set<string>();
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        if (!targetIds.has(inv.patientId)) continue;
        invSeen.add(inv.patientId);
        if (inv.status !== 'voided') {
          billedMap.set(inv.patientId, (billedMap.get(inv.patientId) || 0) + inv.netTotal);
        }
      }

      const paidMap = new Map<string, number>();
      const paySeen = new Set<string>();
      for (let i = 0; i < payments.length; i++) {
        const pay = payments[i];
        if (!targetIds.has(pay.patientId)) continue;
        paySeen.add(pay.patientId);
        if (pay.status !== 'voided') {
          paidMap.set(pay.patientId, (paidMap.get(pay.patientId) || 0) + pay.amount);
        }
      }

      setPatients(prevPatients => {
        let hasChanges = false;
        const updated = prevPatients.map(pat => {
          if (!targetIds.has(pat.id)) return pat;
          const newBilled = invSeen.has(pat.id) ? (billedMap.get(pat.id) || 0) : 0;
          const newPaid = paySeen.has(pat.id) ? (paidMap.get(pat.id) || 0) : 0;
          const newOutstanding = Math.max(0, newBilled - newPaid);

          if (
            pat.totalBilled === newBilled &&
            pat.totalPaid === newPaid &&
            pat.outstandingBalance === newOutstanding
          ) {
            return pat;
          }

          hasChanges = true;
          return {
            ...pat,
            totalBilled: newBilled,
            totalPaid: newPaid,
            outstandingBalance: newOutstanding
          };
        });
        return hasChanges ? updated : prevPatients;
      });
      return;
    }

    fullFinancialRecalcRef.current = false;
    dirtyFinancialPatientIdsRef.current.clear();

    const billedMap = new Map<string, number>();
    const allInvoicePatIds = new Set<string>();
    invoices.forEach(inv => {
      allInvoicePatIds.add(inv.patientId);
      if (inv.status !== 'voided') {
        billedMap.set(inv.patientId, (billedMap.get(inv.patientId) || 0) + inv.netTotal);
      }
    });

    const paidMap = new Map<string, number>();
    const allPaymentPatIds = new Set<string>();
    payments.forEach(pay => {
      allPaymentPatIds.add(pay.patientId);
      if (pay.status !== 'voided') {
        paidMap.set(pay.patientId, (paidMap.get(pay.patientId) || 0) + pay.amount);
      }
    });

    setPatients(prevPatients => {
      let hasChanges = false;
      const updated = prevPatients.map(pat => {
        const hasAnyInv = allInvoicePatIds.has(pat.id);
        const hasAnyPay = allPaymentPatIds.has(pat.id);
        if (!hasAnyInv && !hasAnyPay) return pat;

        const newBilled = hasAnyInv ? (billedMap.get(pat.id) || 0) : pat.totalBilled;
        const newPaid = hasAnyPay ? (paidMap.get(pat.id) || 0) : pat.totalPaid;
        const newOutstanding = Math.max(0, newBilled - newPaid);

        if (
          pat.totalBilled === newBilled &&
          pat.totalPaid === newPaid &&
          pat.outstandingBalance === newOutstanding
        ) {
          return pat;
        }

        hasChanges = true;
        return {
          ...pat,
          totalBilled: newBilled,
          totalPaid: newPaid,
          outstandingBalance: newOutstanding
        };
      });

      return hasChanges ? updated : prevPatients;
    });
  }, [invoices, payments, archiveReady]);

  const reloadNativeDatabase = async () => {
    const archive = await ensureArchiveLoaded();
    clearPendingCloudOps();
    dirtyIdbKeysRef.current.clear();
    prevAppliedOverlaysRef.current = {
      patients: null,
      appointments: null,
      invoices: null,
      payments: null,
      operations: null
    };
    skipPersistRef.current = {
      patients: true,
      appointments: true,
      invoices: true,
      payments: true,
      operations: true
    };
    fullFinancialRecalcRef.current = true;
    const nextPats = applyFinancialTotalsToPatients(archive.patients, archive.invoices, archive.payments);
    patientsRef.current = nextPats;
    appointmentsRef.current = archive.appointments;
    operationsRef.current = archive.operations;
    invoicesRef.current = archive.invoices;
    paymentsRef.current = archive.payments;
    seedDeltaState('patients', nextPats, []);
    seedDeltaState('appointments', archive.appointments, []);
    seedDeltaState('operations', archive.operations, []);
    seedDeltaState('invoices', archive.invoices, []);
    seedDeltaState('payments', archive.payments, []);
    setPatients(nextPats);
    setAppointments(archive.appointments);
    setOperations(archive.operations);
    setInvoices(archive.invoices);
    setPayments(archive.payments);
    await clearAllLargeDatasets();
    if (cloudUserRef.current) {
      const em = cloudUserRef.current.email;
      runCloudTask(
        Promise.all([
          clearCloudOverlayCollection('patients_sync', em),
          clearCloudOverlayCollection('appointments_sync', em),
          clearCloudOverlayCollection('invoices_sync', em),
          clearCloudOverlayCollection('payments_sync', em),
          clearCloudOverlayCollection('operations_sync', em)
        ])
      );
    }
    logAuditAction(
      'status_change',
      'setting',
      'database_reload',
      'إعادة تحميل قاعدة البيانات',
      'تمت إعادة تحميل قاعدة البيانات الأصلية ومسح التعديلات المؤقتة',
      undefined,
      { patientCount: archive.patients.length },
      'settings'
    );
  };

  // Scroll Container, Per-Tab Memory & Mobile Back History Stack
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const registerScrollContainer = (el: HTMLElement | null) => {
    scrollContainerRef.current = el;
  };
  const getCurrentScrollTop = () => {
    if (scrollContainerRef.current) return scrollContainerRef.current.scrollTop;
    return typeof window !== 'undefined' ? window.scrollY || 0 : 0;
  };
  const setScrollTop = (y: number) => {
    const apply = () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = y;
      } else if (typeof window !== 'undefined') {
        window.scrollTo({ top: y, behavior: 'auto' });
      }
    };
    requestAnimationFrame(() => {
      apply();
      setTimeout(apply, 40);
    });
  };
  const scrollToTop = () => setScrollTop(0);

  const getTabForView = (view: ActiveView): string => {
    if (view === 'dashboard') return 'dashboard';
    if (view === 'appointments') return 'appointments';
    if (view === 'patients' || view === 'patient_detail') return 'patients';
    if (view === 'invoices' || view === 'payments' || view === 'expenses') return 'accounts';
    return view;
  };

  interface NavSnapshot {
    view: ActiveView;
    selectedPatientId: string | null;
    scrollY: number;
  }

  const tabMemoryRef = useRef<Record<string, NavSnapshot>>({});
  const patientsListScrollYRef = useRef<number>(0);
  const navStackRef = useRef<NavSnapshot[]>([
    { view: activeView, selectedPatientId, scrollY: 0 }
  ]);
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const selectedPatientIdRef = useRef(selectedPatientId);
  selectedPatientIdRef.current = selectedPatientId;

  const commitNavigation = (
    nextView: ActiveView,
    nextPatId: string | null,
    restoreScrollY: number,
    pushHistory: boolean = true
  ) => {
    const currentScroll = getCurrentScrollTop();
    const curView = activeViewRef.current;
    const curPat = selectedPatientIdRef.current;

    if (curView === 'patients') {
      patientsListScrollYRef.current = currentScroll;
    }

    // Save scroll position for current top of stack and current tab memory
    if (navStackRef.current.length > 0) {
      navStackRef.current[navStackRef.current.length - 1].scrollY = currentScroll;
    }
    tabMemoryRef.current[getTabForView(curView)] = {
      view: curView,
      selectedPatientId: curPat,
      scrollY: currentScroll
    };

    const nextSnap: NavSnapshot = {
      view: nextView,
      selectedPatientId: nextPatId,
      scrollY: restoreScrollY
    };
    tabMemoryRef.current[getTabForView(nextView)] = nextSnap;

    if (pushHistory) {
      navStackRef.current.push(nextSnap);
      if (navStackRef.current.length > 40) navStackRef.current.shift();
      try {
        window.history.pushState({ cfNav: true, idx: navStackRef.current.length }, '');
      } catch {}
    }

    setSelectedPatientId(nextPatId);
    setActiveView(nextView);
    setScrollTop(restoreScrollY);
  };

  // Initialize browser history trap for mobile back button
  useEffect(() => {
    if (typeof window === 'undefined' || !isLoggedIn) return;
    try {
      window.history.replaceState({ cfNav: true, root: true }, '');
      window.history.pushState({ cfNav: true, idx: 1 }, '');
    } catch {}

    const handlePopState = () => {
      if (navStackRef.current.length > 1) {
        navStackRef.current.pop();
        const prevSnap = navStackRef.current[navStackRef.current.length - 1];
        tabMemoryRef.current[getTabForView(prevSnap.view)] = prevSnap;
        const targetScroll = prevSnap.view === 'patients' ? (prevSnap.scrollY || patientsListScrollYRef.current) : prevSnap.scrollY;
        setSelectedPatientId(prevSnap.selectedPatientId);
        setActiveView(prevSnap.view);
        setScrollTop(targetScroll);
      } else if (activeViewRef.current !== 'dashboard') {
        navStackRef.current = [{ view: 'dashboard', selectedPatientId: null, scrollY: 0 }];
        setSelectedPatientId(null);
        setActiveView('dashboard');
        setScrollTop(0);
      }
      // Re-push sentinel guard if stack reaches root so back stays inside PWA cleanly
      if (navStackRef.current.length <= 1) {
        try {
          window.history.pushState({ cfNav: true, idx: 1 }, '');
        } catch {}
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLoggedIn]);

  // Navigation handlers
  const handleSetActiveView = (view: ActiveView) => {
    if (view === activeViewRef.current && view !== 'patient_detail') {
      scrollToTop();
      return;
    }
    const returningToPatientsList = view === 'patients' && activeViewRef.current === 'patient_detail';
    commitNavigation(
      view,
      view === 'patient_detail' ? selectedPatientIdRef.current : null,
      returningToPatientsList ? patientsListScrollYRef.current : 0,
      true
    );
  };

  const goToPatient = (patientId: string, options?: { focusNotes?: boolean }) => {
    setIsDrawerOpen(false);
    setPatientDetailFocusNotes(Boolean(options?.focusNotes));
    commitNavigation('patient_detail', patientId, 0, true);
  };

  const openReportsForToday = () => {
    setIsDrawerOpen(false);
    setReportsInitialPeriod('today');
    if (activeViewRef.current === 'reports') {
      scrollToTop();
    } else {
      commitNavigation('reports', null, 0, true);
    }
  };

  const navigateToPatientFollowUp = (prefill: FollowUpViewPrefill) => {
    setIsDrawerOpen(false);
    setFollowUpViewPrefill(prefill);
    if (activeViewRef.current === 'patient_follow_up') {
      scrollToTop();
    } else {
      commitNavigation('patient_follow_up', null, 0, true);
    }
  };

  const clearFollowUpViewPrefill = () => {
    setFollowUpViewPrefill(null);
  };

  const goBack = () => {
    if (navStackRef.current.length > 1) {
      navStackRef.current.pop();
      const prevSnap = navStackRef.current[navStackRef.current.length - 1];
      tabMemoryRef.current[getTabForView(prevSnap.view)] = prevSnap;
      const targetScroll = prevSnap.view === 'patients' ? (prevSnap.scrollY || patientsListScrollYRef.current) : prevSnap.scrollY;
      setSelectedPatientId(prevSnap.selectedPatientId);
      setActiveView(prevSnap.view);
      setScrollTop(targetScroll);
    } else {
      commitNavigation('patients', null, patientsListScrollYRef.current, true);
    }
  };

  const switchBottomTab = (
    tabId: 'dashboard' | 'appointments' | 'patients' | 'accounts',
    defaultView: ActiveView,
    forceTodayFilter?: 'invoices' | 'payments' | 'expenses'
  ) => {
    if (forceTodayFilter) {
      if (forceTodayFilter === 'invoices') setInvoicesTodayOnly(true);
      if (forceTodayFilter === 'payments') setPaymentsTodayOnly(true);
      if (forceTodayFilter === 'expenses') setExpensesTodayOnly(true);
      const isSame = activeViewRef.current === forceTodayFilter;
      commitNavigation(forceTodayFilter, null, isSame ? getCurrentScrollTop() : 0, !isSame);
      return;
    }

    if (tabId === 'patients' && activeViewRef.current === 'patient_detail') {
      commitNavigation('patients', null, patientsListScrollYRef.current, true);
      return;
    }

    const currentTab = getTabForView(activeViewRef.current);
    if (currentTab === tabId) {
      if (tabId === 'patients' && activeViewRef.current === 'patients') {
        scrollToTop();
        return;
      }
      return;
    }

    const remembered = tabMemoryRef.current[tabId];
    if (remembered) {
      const targetScroll = remembered.view === 'patients' ? (remembered.scrollY || patientsListScrollYRef.current) : remembered.scrollY;
      commitNavigation(remembered.view, remembered.selectedPatientId, targetScroll, true);
    } else {
      commitNavigation(defaultView, null, defaultView === 'patients' ? patientsListScrollYRef.current : 0, true);
    }
  };


  const resetToToday = () => {
    setCurrentDate(getTodayDateString());
  };

  const stepDate = (days: number) => {
    const [cy, cm, cd] = currentDate.split('-').map(Number);
    const cur = new Date(cy, cm - 1, cd + days);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    setCurrentDate(`${y}-${m}-${d}`);
  };

  const openQuickAction = (
    open: boolean,
    tab?: 'appointment' | 'patient' | 'invoice' | 'payment' | 'expense' | 'task',
    prefill?: { date?: string; time?: string; unitId?: string; doctorId?: string; patientId?: string; appointmentId?: string; invoiceId?: string; amount?: number; toothNumber?: number; toothNumbers?: number[] }
  ) => {
    setQuickActionInitialTab(tab);
    setQuickActionPrefill(open ? prefill : undefined);
    setIsQuickActionOpen(open);
  };

  // Patient actions
  const addPatient = (
    patientData: Omit<Patient, 'id' | 'registeredDate' | 'totalBilled' | 'totalPaid' | 'outstandingBalance' | 'notes'> & {
      registeredDate?: string;
    }
  ): Patient => {
    const { registeredDate: requestedDate, followUpStatus: requestedStatus, ...restData } = patientData;
    const newId = 'pat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const derivedStatus = requestedStatus?.trim() || 'عميل محتمل';
    const cleanTags = (restData.tags || []).filter(t => !REMOVED_LEGACY_STATUS_TAGS.has(t));
    const newPatient: Patient = {
      ...restData,
      tags: cleanTags,
      followUpStatus: derivedStatus === 'تم التواصل' ? 'قيد المتابعة' : derivedStatus,
      id: newId,
      registeredDate: requestedDate || getTodayDateString(),
      createdAt: new Date().toISOString(),
      totalBilled: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      notes: []
    };
    const nextPatients = [newPatient, ...patientsRef.current];
    patientsRef.current = nextPatients;
    setPatients(nextPatients);

    const activePatientTpls = whatsappTemplatesRef.current.filter(
      t => t.isActive && t.triggerEvent === 'patient_created'
    );
    const preferredWaPhone = getPreferredPatientWhatsAppPhone(newPatient);
    const patientAlerts: WhatsAppAlert[] = activePatientTpls.map((tpl, idx) => ({
      id: 'alert_' + Date.now() + '_pat_' + idx + '_' + Math.random().toString(36).slice(2, 5),
      patientId: newPatient.id,
      patientName: newPatient.name,
      patientPhone: preferredWaPhone || newPatient.phone || '',
      templateTitle: tpl.title,
      renderedMessage: renderWhatsAppTemplate(
        tpl.messageTemplate,
        {
          patientName: newPatient.name,
          unitName: newPatient.branchName,
          date: newPatient.registeredDate,
          doctorName: newPatient.doctorName
        },
        unitsRef.current
      ),
      status: 'pending',
      scheduledFor: computeScheduledForFromOffset(newPatient.registeredDate, undefined, tpl.timingOffsetMinutes),
      createdAt: new Date().toISOString()
    }));
    if (patientAlerts.length > 0) {
      const nextAlerts = [...patientAlerts, ...whatsappAlertsRef.current];
      whatsappAlertsRef.current = nextAlerts;
      saveToStorage('alerts', nextAlerts);
      setWhatsappAlerts(nextAlerts);
    }

    const cloudOps: PendingCloudOpInput[] = [
      { kind: 'overlay', collectionName: 'patients_sync', record: newPatient, isDeleted: false },
      ...patientAlerts.map(al => ({
        kind: 'doc_upsert' as const,
        collectionName: 'whatsapp_alerts',
        docId: al.id,
        data: al as unknown as Record<string, unknown>
      }))
    ];
    dispatchCloudOps(cloudOps);

    logAuditAction('add', 'patient', newPatient.id, newPatient.name, `إضافة مريض جديد: ${newPatient.name}`, undefined, newPatient, 'patient_detail', newPatient.id);
    return newPatient;
  };

  const updatePatient = (id: string, updates: Partial<Patient>) => {
    const existingPat = patientsRef.current.find(p => p.id === id);
    const cleanUpdates: Partial<Patient> = updates.tags
      ? { ...updates, tags: updates.tags.filter(t => !REMOVED_LEGACY_STATUS_TAGS.has(t)) }
      : updates;
    const updatedPat = existingPat ? { ...existingPat, ...cleanUpdates } : undefined;
    if (updatedPat) {
      const nextPatients = patientsRef.current.map(p => (p.id === id ? updatedPat : p));
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
      ]);
    } else {
      setPatients(prev => prev.map(p => (p.id === id ? { ...p, ...cleanUpdates } : p)));
    }
    if (existingPat && updatedPat) {
      logAuditAction('update', 'patient', id, updatedPat.name, `تعديل بيانات المريض: ${updatedPat.name}`, existingPat, updatedPat, 'patient_detail', id);
    }
  };

  const setPatientDefaultWhatsAppPhone = (patientId: string, which: 'primary' | 'secondary') => {
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    if (!existingPat) return;
    if (which === 'secondary' && !existingPat.secondaryPhone?.trim()) return;
    const updatedPat: Patient = { ...existingPat, defaultWhatsAppPhone: which };
    const nextPatients = patientsRef.current.map(p => (p.id === patientId ? updatedPat : p));
    patientsRef.current = nextPatients;
    setPatients(nextPatients);
    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
    ]);
    const selectedPhone = which === 'secondary' ? existingPat.secondaryPhone : existingPat.phone;
    logAuditAction(
      'update',
      'patient',
      patientId,
      existingPat.name,
      `تعيين رقم الواتساب الافتراضي (${selectedPhone || which}) للمريض ${existingPat.name}`,
      existingPat,
      updatedPat,
      'patient_detail',
      patientId
    );
  };

  const setPatientPhoneNoWhatsApp = (patientId: string, phone: string, isNoWhatsApp: boolean) => {
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    if (!existingPat) return;
    const targetKey = normalizePhoneKey(phone);
    if (!targetKey) return;

    const currentList = existingPat.noWhatsAppPhones || [];
    const alreadyMarked = currentList.some(p => normalizePhoneKey(p) === targetKey);
    if (isNoWhatsApp && alreadyMarked) return;
    if (!isNoWhatsApp && !alreadyMarked) return;

    const nextList = isNoWhatsApp
      ? [...currentList, phone.trim()]
      : currentList.filter(p => normalizePhoneKey(p) !== targetKey);

    let nextDefault = existingPat.defaultWhatsAppPhone;
    if (isNoWhatsApp) {
      const primaryKey = normalizePhoneKey(existingPat.phone);
      const secKey = normalizePhoneKey(existingPat.secondaryPhone);
      if (nextDefault === 'primary' && targetKey === primaryKey) {
        nextDefault = undefined;
      } else if (nextDefault === 'secondary' && targetKey === secKey) {
        nextDefault = undefined;
      }
    }

    const updatedPat: Patient = {
      ...existingPat,
      noWhatsAppPhones: nextList.length > 0 ? nextList : undefined,
      defaultWhatsAppPhone: nextDefault
    };
    const nextPatients = patientsRef.current.map(p => (p.id === patientId ? updatedPat : p));
    patientsRef.current = nextPatients;
    setPatients(nextPatients);
    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
    ]);
    logAuditAction(
      'update',
      'patient',
      patientId,
      existingPat.name,
      `${isNoWhatsApp ? 'تمييز لا يوجد واتساب على الرقم' : 'إلغاء وسم لا يوجد واتساب عن الرقم'} (${phone}) للمريض ${existingPat.name}`,
      existingPat,
      updatedPat,
      'patient_detail',
      patientId
    );
  };

  const registerPatientWhatsAppPhone = (
    patientId: string,
    newPhone: string,
    slot: 'primary' | 'secondary' = 'secondary'
  ) => {
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    const trimmed = newPhone.trim();
    if (!existingPat || !trimmed) return;
    const newKey = normalizePhoneKey(trimmed);
    const cleanedNoWa = (existingPat.noWhatsAppPhones || []).filter(
      p => normalizePhoneKey(p) !== newKey
    );
    const usePrimary = slot === 'primary' || !existingPat.phone?.trim();
    const updatedPat: Patient = {
      ...existingPat,
      ...(usePrimary ? { phone: trimmed } : { secondaryPhone: trimmed }),
      defaultWhatsAppPhone: usePrimary ? 'primary' : 'secondary',
      noWhatsAppPhones: cleanedNoWa.length > 0 ? cleanedNoWa : undefined
    };
    const nextPatients = patientsRef.current.map(p => (p.id === patientId ? updatedPat : p));
    patientsRef.current = nextPatients;
    setPatients(nextPatients);
    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
    ]);
    logAuditAction(
      'update',
      'patient',
      patientId,
      existingPat.name,
      `تسجيل وتفعيل رقم واتساب (${trimmed}) للمريض ${existingPat.name}`,
      existingPat,
      updatedPat,
      'patient_detail',
      patientId
    );
  };

  const deletePatient = (id: string) => {
    const existingPat = patientsRef.current.find(p => p.id === id);
    const nextPatients = patientsRef.current.filter(p => p.id !== id);
    patientsRef.current = nextPatients;
    setPatients(nextPatients);
    if (selectedPatientId === id) {
      setSelectedPatientId(null);
      setActiveView('patients');
    }
    dispatchCloudOps([
      {
        kind: 'overlay',
        collectionName: 'patients_sync',
        record: existingPat || ({ id } as Patient),
        isDeleted: true
      }
    ]);
    if (existingPat) {
      logAuditAction('delete', 'patient', id, existingPat.name, `حذف ملف المريض: ${existingPat.name}`, existingPat, undefined, 'patients');
    }
  };

  const normalizeToothSelection = (sel?: number | number[]): number[] | undefined => {
    if (sel === undefined || sel === null) return undefined;
    const arr = Array.isArray(sel) ? sel : [sel];
    const clean = Array.from(new Set(arr.filter(n => typeof n === 'number' && Number.isFinite(n))));
    return clean.length > 0 ? clean : undefined;
  };

  const addPatientNote = (
    patientId: string,
    content: string,
    toothSelection?: number | number[],
    audioDataUrl?: string,
    audioDurationSeconds?: number
  ) => {
    const normalizedTeeth = normalizeToothSelection(toothSelection);
    const primaryTooth = normalizedTeeth?.[0];
    const activeStaff = resolveActiveStaffFromRefs();
    const newNote = {
      id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      patientId,
      authorName: activeStaff.name,
      authorRole: activeStaff.role === 'admin' ? 'مدير النظام' : activeStaff.role === 'doctor' ? 'طبيب' : 'فريق العيادة',
      isAdminAuthored: activeStaff.role === 'admin',
      content,
      toothNumber: primaryTooth,
      toothNumbers: normalizedTeeth,
      audioDataUrl,
      audioDurationSeconds,
      createdAt: new Date().toISOString()
    };
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    const updatedPat = existingPat ? { ...existingPat, notes: [newNote, ...(existingPat.notes || [])] } : undefined;
    if (updatedPat) {
      const nextPatients = patientsRef.current.map(p => (p.id === patientId ? updatedPat : p));
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
      ]);
    }
    if (existingPat && updatedPat) {
      const teethDesc = normalizedTeeth?.length
        ? ` (${normalizedTeeth.length > 1 ? `أسنان ${normalizedTeeth.join('، ')}` : `سن ${normalizedTeeth[0]}`})`
        : '';
      logAuditAction(
        'add',
        'patient',
        patientId,
        existingPat.name,
        `إضافة ملاحظة سريرية للمريض ${existingPat.name}${teethDesc}`,
        existingPat,
        updatedPat,
        'patient_detail',
        patientId
      );
    }
  };

  const updatePatientNote = (patientId: string, noteId: string, content: string, toothSelection?: number | number[]) => {
    const normalizedTeeth = normalizeToothSelection(toothSelection);
    const primaryTooth = normalizedTeeth?.[0];
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    const updatedPat = existingPat
      ? {
          ...existingPat,
          notes: (existingPat.notes || []).map(n =>
            n.id === noteId ? { ...n, content, toothNumber: primaryTooth, toothNumbers: normalizedTeeth } : n
          )
        }
      : undefined;
    if (updatedPat) {
      const nextPatients = patientsRef.current.map(p => (p.id === patientId ? updatedPat : p));
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
      ]);
    }
    if (existingPat && updatedPat) {
      logAuditAction('update', 'patient', patientId, existingPat.name, `تعديل ملاحظة سريرية للمريض ${existingPat.name}`, existingPat, updatedPat, 'patient_detail', patientId);
    }
  };

  const deletePatientNote = (patientId: string, noteId: string) => {
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    const deletedNote = existingPat?.notes?.find(n => n.id === noteId);
    const updatedPat = existingPat
      ? {
          ...existingPat,
          notes: (existingPat.notes || []).filter(n => n.id !== noteId)
        }
      : undefined;
    if (updatedPat) {
      const nextPatients = patientsRef.current.map(p => (p.id === patientId ? updatedPat : p));
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
      ]);
    }
    if (existingPat && updatedPat) {
      const preview = deletedNote?.content ? `: "${deletedNote.content.slice(0, 60)}"` : '';
      logAuditAction('delete', 'patient', patientId, existingPat.name, `تم حذف ملاحظة سريرية للمريض ${existingPat.name}${preview}`, existingPat, updatedPat, 'patient_detail', patientId);
    }
  };

  const togglePalmerTooth = (patientId: string, toothNumber: number) => {
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    let updatedPat: Patient | undefined;
    if (existingPat) {
      const teeth = existingPat.palmerTeeth || [];
      const exists = teeth.includes(toothNumber);
      updatedPat = {
        ...existingPat,
        palmerTeeth: exists ? teeth.filter(t => t !== toothNumber) : [...teeth, toothNumber]
      };
      const nextPatients = patientsRef.current.map(p => (p.id === patientId ? updatedPat! : p));
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'patients_sync', record: updatedPat, isDeleted: false }
      ]);
    }
    if (existingPat && updatedPat) {
      logAuditAction('update', 'patient', patientId, existingPat.name, `تحديث مخطط السن ${toothNumber} للمريض ${existingPat.name}`, existingPat, updatedPat, 'patient_detail', patientId);
    }
  };

  // Appointment conflict checker
  const checkAppointmentConflict = (
    date: string,
    time: string,
    durationMinutes: number,
    unitId: string,
    excludeId?: string
  ): Appointment | undefined => {
    const [h, m] = time.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + durationMinutes;

    return appointments.find(appt => {
      if (excludeId && appt.id === excludeId) return false;
      if (appt.date !== date || appt.unitId !== unitId) return false;
      if (appt.status === 'cancelled' || appt.status === 'no_show') return false;

      const [ah, am] = appt.time.split(':').map(Number);
      const aStartMin = ah * 60 + am;
      const aEndMin = aStartMin + (appt.durationMinutes || 30);

      // Overlap condition: start < existing.end AND end > existing.start
      return startMin < aEndMin && endMin > aStartMin;
    });
  };

  const addAppointment = (apptData: Omit<Appointment, 'id' | 'createdAt'>) => {
    const conflict = checkAppointmentConflict(apptData.date, apptData.time, apptData.durationMinutes, apptData.unitId);
    const newId = 'apt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const newAppt: Appointment = {
      ...apptData,
      id: newId,
      createdAt: new Date().toISOString()
    };

    const nextAppts = [newAppt, ...appointmentsRef.current];
    appointmentsRef.current = nextAppts;
    setAppointments(nextAppts);

    // Create automated WhatsApp notification alert(s) using active templates
    const patForAppt = patientsRef.current.find(p => p.id === apptData.patientId);
    const preferredApptWaPhone = getPreferredPatientWhatsAppPhone(patForAppt) || apptData.patientPhone;
    const matchingApptTpls = whatsappTemplatesRef.current.filter(
      t => t.isActive && (t.triggerEvent === 'appointment_created' || t.triggerEvent === 'appointment_reminder')
    );
    const apptAlerts: WhatsAppAlert[] = matchingApptTpls.map((tpl, idx) => ({
      id: 'alert_' + Date.now() + '_apt_' + idx + '_' + Math.random().toString(36).slice(2, 5),
      patientId: apptData.patientId,
      patientName: apptData.patientName,
      patientPhone: preferredApptWaPhone,
      templateTitle: tpl.title,
      renderedMessage: renderWhatsAppTemplate(
        tpl.messageTemplate,
        {
          patientName: apptData.patientName,
          unitId: apptData.unitId,
          unitName: apptData.unitName,
          date: apptData.date,
          dayName: getArabicWeekdayName(apptData.date),
          time: formatTimeToArabicPeriod(apptData.time),
          doctorName: apptData.doctorName,
          procedure: apptData.procedureType
        },
        unitsRef.current
      ),
      status: 'pending',
      scheduledFor: computeScheduledForFromOffset(apptData.date, apptData.time, tpl.timingOffsetMinutes),
      createdAt: new Date().toISOString()
    }));
    if (apptAlerts.length > 0) {
      const nextAlerts = [...apptAlerts, ...whatsappAlertsRef.current];
      whatsappAlertsRef.current = nextAlerts;
      saveToStorage('alerts', nextAlerts);
      setWhatsappAlerts(nextAlerts);
    }

    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'appointments_sync', record: newAppt, isDeleted: false },
      ...apptAlerts.map(al => ({
        kind: 'doc_upsert' as const,
        collectionName: 'whatsapp_alerts',
        docId: al.id,
        data: al as unknown as Record<string, unknown>
      }))
    ]);

    logAuditAction('add', 'appointment', newAppt.id, newAppt.patientName, `حجز موعد جديد للمريض ${newAppt.patientName} يوم ${newAppt.date} الساعة ${formatCairoTime(newAppt.time)}`, undefined, newAppt, 'appointments', newAppt.patientId);

    // Auto-update follow-up status on appointment creation
    if (newAppt.status === 'completed') {
      changePatientFollowUpStatus(apptData.patientId, 'حضر للعيادة', 'تحديث تلقائي عند تسجيل موعد مكتمل');
    } else if (newAppt.status !== 'cancelled' && newAppt.status !== 'no_show') {
      changePatientFollowUpStatus(apptData.patientId, 'تم تحديد ميعاد', 'تحديث تلقائي عند حجز موعد');
    }

    return { success: true, conflict };
  };

  const updateAppointmentStatus = (id: string, status: AppointmentStatus) => {
    const existingAppt = appointmentsRef.current.find(a => a.id === id);
    const updatedAppt = existingAppt ? { ...existingAppt, status } : undefined;
    if (updatedAppt) {
      const nextAppts = appointmentsRef.current.map(a => (a.id === id ? updatedAppt : a));
      appointmentsRef.current = nextAppts;
      setAppointments(nextAppts);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'appointments_sync', record: updatedAppt, isDeleted: false }
      ]);
    } else {
      setAppointments(prev => prev.map(a => (a.id === id ? { ...a, status } : a)));
    }
    if (existingAppt && updatedAppt) {
      const todayStr = getTodayDateString();
      const apptYmd = (existingAppt.date || '').trim().slice(0, 10);

      logAuditAction('status_change', 'appointment', id, existingAppt.patientName, `تغيير حالة موعد ${existingAppt.patientName} من (${existingAppt.status}) إلى (${status})`, existingAppt, updatedAppt, 'appointments', existingAppt.patientId);

      // Auto-update follow-up status to "حضر للعيادة" when visit is completed
      if (status === 'completed') {
        changePatientFollowUpStatus(existingAppt.patientId, 'حضر للعيادة', 'تحديث تلقائي عند إتمام الزيارة');
      } else if (
        (existingAppt.status === 'cancelled' || existingAppt.status === 'no_show') &&
        (status === 'booked' || status === 'confirmed' || status === 'arrived') &&
        apptYmd >= todayStr
      ) {
        changePatientFollowUpStatus(existingAppt.patientId, 'تم تحديد ميعاد', 'تحديث تلقائي عند إعادة تفعيل الموعد');
      }

      // Record interaction in Staff Alert History if this appointment has a logged alert or was overdue
      const statusLabels: Record<AppointmentStatus, string> = {
        booked: 'محجوز',
        confirmed: 'مؤكد',
        arrived: 'وصل العيادة',
        completed: 'تمت الزيارة (مكتمل)',
        cancelled: 'تم إلغاء الموعد',
        no_show: 'لم تتم الزيارة (لم يحضر)'
      };
      const isFinalResolution =
        status === 'completed' || status === 'arrived' || status === 'cancelled' || status === 'no_show';
      if (isFinalResolution) {
        const targetKey = `appt_${existingAppt.id}`;
        const existingLog = staffAlertLogsRef.current.find(
          l => l.targetKey === targetKey || l.id === toSafeAlertLogId(targetKey)
        );
        const cairo = getCairoNowParts();
        const nowMinutes = cairo.hour * 60 + cairo.minute;
        const apptStartMin = parseAppointmentMinutes24(existingAppt.time);
        const delayMinutes = Math.max(0, Number(staffAlertSettingsRef.current.appointmentDelayMinutes) || 0);
        const wasDueToday =
          existingAppt.date === cairo.dateStr &&
          apptStartMin !== null &&
          nowMinutes >= apptStartMin + delayMinutes;

        if (existingLog || wasDueToday) {
          recordStaffAlertInteraction({
            targetKey,
            action: status,
            actionLabel: statusLabels[status] || status,
            newStatus: 'resolved',
            source: 'تغيير حالة الموعد',
            fallbackMeta: {
              alertType: 'appointment',
              title: `معاد ${existingAppt.patientName}`,
              message: `مر على الموعد المحدد (${formatCairoTime(existingAppt.time)}) — ${existingAppt.doctorName} · ${existingAppt.unitName}`,
              patientId: existingAppt.patientId,
              patientName: existingAppt.patientName,
              appointmentId: existingAppt.id,
              appointmentDate: existingAppt.date,
              appointmentTime: existingAppt.time
            }
          });
        }
      }
    }
  };

  const updateAppointment = (id: string, updates: Partial<Appointment>) => {
    const existingAppt = appointmentsRef.current.find(a => a.id === id);
    const updatedAppt = existingAppt ? { ...existingAppt, ...updates } : undefined;
    if (updatedAppt) {
      const nextAppts = appointmentsRef.current.map(a => (a.id === id ? updatedAppt : a));
      appointmentsRef.current = nextAppts;
      setAppointments(nextAppts);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'appointments_sync', record: updatedAppt, isDeleted: false }
      ]);
    } else {
      setAppointments(prev => prev.map(a => (a.id === id ? { ...a, ...updates } : a)));
    }
    if (existingAppt && updatedAppt) {
      const todayStr = getTodayDateString();
      const apptYmd = (updatedAppt.date || '').trim().slice(0, 10);

      logAuditAction('update', 'appointment', id, updatedAppt.patientName, `تعديل بيانات موعد ${updatedAppt.patientName}`, existingAppt, updatedAppt, 'appointments', updatedAppt.patientId);
      if (updates.status === 'completed' && existingAppt.status !== 'completed') {
        changePatientFollowUpStatus(updatedAppt.patientId, 'حضر للعيادة', 'تحديث تلقائي عند إتمام الزيارة');
      } else {
        const prevApptYmd = (existingAppt.date || '').trim().slice(0, 10);
        const wasInactiveOrPast =
          existingAppt.status === 'cancelled' ||
          existingAppt.status === 'no_show' ||
          (prevApptYmd && prevApptYmd < todayStr && existingAppt.status !== 'completed');
        const isNowUpcoming =
          updatedAppt.status === 'booked' ||
          updatedAppt.status === 'confirmed' ||
          updatedAppt.status === 'arrived';
        if (wasInactiveOrPast && isNowUpcoming && apptYmd >= todayStr) {
          changePatientFollowUpStatus(
            updatedAppt.patientId,
            'تم تحديد ميعاد',
            existingAppt.status === 'cancelled' || existingAppt.status === 'no_show'
              ? 'تحديث تلقائي عند إعادة تفعيل الموعد'
              : 'تحديث تلقائي عند تعديل الموعد لموعد قادم'
          );
        }
      }
    }
  };

  const deleteAppointment = (id: string) => {
    const existingAppt = appointmentsRef.current.find(a => a.id === id);
    const nextAppts = appointmentsRef.current.filter(a => a.id !== id);
    appointmentsRef.current = nextAppts;
    setAppointments(nextAppts);
    dispatchCloudOps([
      {
        kind: 'overlay',
        collectionName: 'appointments_sync',
        record: existingAppt || ({ id } as Appointment),
        isDeleted: true
      }
    ]);
    if (existingAppt) {
      logAuditAction('delete', 'appointment', id, existingAppt.patientName, `حذف موعد ${existingAppt.patientName} (${existingAppt.date})`, existingAppt, undefined, 'appointments', existingAppt.patientId);
    }
  };

  // Invoices & Payments
  const addInvoice = (invoiceData: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt'>): Invoice => {
    // Prevent accidental exact duplicate invoice (same patient, date & netTotal)
    const duplicate = invoicesRef.current.find(
      inv =>
        inv.status !== 'voided' &&
        inv.patientId === invoiceData.patientId &&
        inv.date === invoiceData.date &&
        Math.round((inv.netTotal || 0) * 100) === Math.round((invoiceData.netTotal || 0) * 100)
    );
    if (duplicate) {
      return duplicate;
    }

    const count = invoicesRef.current.length + 1;
    const invNum = `INV-2026-${String(count).padStart(3, '0')}`;
    const newId = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const newInv: Invoice = {
      ...invoiceData,
      id: newId,
      invoiceNumber: invNum,
      createdAt: new Date().toISOString()
    };
    dirtyFinancialPatientIdsRef.current.add(newInv.patientId);
    const nextInvoices = [newInv, ...invoicesRef.current];
    invoicesRef.current = nextInvoices;
    setInvoices(nextInvoices);

    // Trigger WhatsApp invoice & procedure-specific notifications using active templates
    const matchingInvTpls = whatsappTemplatesRef.current.filter(t => {
      if (!t.isActive) return false;
      if (t.triggerEvent === 'invoice_issued' || t.triggerEvent === 'post_op_care') return true;
      if (t.triggerEvent === 'invoice_procedure') {
        return invoiceData.items.some(
          it =>
            (t.procedureId && it.procedureId === t.procedureId) ||
            (t.procedureName && it.procedureName === t.procedureName)
        );
      }
      return false;
    });
    const patForInv = patientsRef.current.find(p => p.id === invoiceData.patientId);
    const invAlerts: WhatsAppAlert[] = matchingInvTpls.map((tpl, idx) => ({
      id: 'alert_' + Date.now() + '_inv_' + idx + '_' + Math.random().toString(36).slice(2, 5),
      patientId: invoiceData.patientId,
      patientName: invoiceData.patientName,
      patientPhone: getPreferredPatientWhatsAppPhone(patForInv) || patForInv?.phone || '',
      templateTitle: tpl.title,
      renderedMessage: renderWhatsAppTemplate(
        tpl.messageTemplate,
        {
          patientName: invoiceData.patientName,
          unitName: patForInv?.branchName,
          date: invoiceData.date,
          procedure:
            tpl.triggerEvent === 'invoice_procedure' && tpl.procedureName
              ? tpl.procedureName
              : invoiceData.items.map(it => it.procedureName).filter(Boolean).join('، '),
          amount: invoiceData.netTotal,
          balance: invoiceData.outstandingBalance,
          invoiceNumber: invNum
        },
        unitsRef.current
      ),
      status: 'pending',
      scheduledFor: computeScheduledForFromOffset(invoiceData.date, undefined, tpl.timingOffsetMinutes),
      createdAt: new Date().toISOString()
    }));
    if (invAlerts.length > 0) {
      const nextAlerts = [...invAlerts, ...whatsappAlertsRef.current];
      whatsappAlertsRef.current = nextAlerts;
      saveToStorage('alerts', nextAlerts);
      setWhatsappAlerts(nextAlerts);
    }

    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'invoices_sync', record: newInv, isDeleted: false },
      ...invAlerts.map(al => ({
        kind: 'doc_upsert' as const,
        collectionName: 'whatsapp_alerts',
        docId: al.id,
        data: al as unknown as Record<string, unknown>
      }))
    ]);

    logAuditAction('add', 'invoice', newInv.id, `${invNum} - ${newInv.patientName}`, `إصدار فاتورة جديدة للمريض ${newInv.patientName} بقيمة ${newInv.netTotal} ج.م`, undefined, newInv, 'invoices', newInv.patientId);

    return newInv;
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    const existingInv = invoicesRef.current.find(i => i.id === id);
    let updatedInv: Invoice | undefined;
    if (existingInv) {
      const merged = { ...existingInv, ...updates };
      const paid = merged.paidAmount || 0;
      const outstanding = Math.max(0, merged.netTotal - paid);
      const nextStatus: Invoice['status'] =
        merged.status === 'voided'
          ? 'voided'
          : outstanding <= 0 && merged.netTotal > 0
          ? 'paid'
          : paid > 0 && outstanding > 0
          ? 'partial'
          : merged.netTotal === 0
          ? 'paid'
          : 'unpaid';
      updatedInv = {
        ...merged,
        outstandingBalance: outstanding,
        status: updates.status ?? nextStatus
      };
      dirtyFinancialPatientIdsRef.current.add(existingInv.patientId);
      dirtyFinancialPatientIdsRef.current.add(updatedInv.patientId);
      const nextInvoices = invoicesRef.current.map(inv => (inv.id === id ? updatedInv! : inv));
      invoicesRef.current = nextInvoices;
      setInvoices(nextInvoices);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'invoices_sync', record: updatedInv, isDeleted: false }
      ]);
    }
    if (existingInv && updatedInv) {
      logAuditAction('update', 'invoice', id, `${updatedInv.invoiceNumber} - ${updatedInv.patientName}`, `تعديل فاتورة ${updatedInv.invoiceNumber}`, existingInv, updatedInv, 'invoices', updatedInv.patientId);
    }
  };

  const voidInvoice = (id: string) => {
    const existingInv = invoicesRef.current.find(i => i.id === id);
    const updatedInv = existingInv ? { ...existingInv, status: 'voided' as const, outstandingBalance: 0 } : undefined;
    if (existingInv) {
      dirtyFinancialPatientIdsRef.current.add(existingInv.patientId);
    }
    const nextInvoices = invoicesRef.current.map(inv =>
      inv.id === id ? { ...inv, status: 'voided' as const, outstandingBalance: 0 } : inv
    );
    invoicesRef.current = nextInvoices;
    setInvoices(nextInvoices);

    const linkedValidPays = paymentsRef.current.filter(p => p.invoiceId === id && p.status !== 'voided');
    const voidedPays = linkedValidPays.map(p => ({ ...p, status: 'voided' as const }));
    if (voidedPays.length > 0) {
      voidedPays.forEach(p => dirtyFinancialPatientIdsRef.current.add(p.patientId));
      const linkedPayIds = new Set(voidedPays.map(p => p.id));
      const nextPayments = paymentsRef.current.map(p => (linkedPayIds.has(p.id) ? { ...p, status: 'voided' as const } : p));
      paymentsRef.current = nextPayments;
      setPayments(nextPayments);
    }

    if (updatedInv) {
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'invoices_sync', record: updatedInv, isDeleted: false },
        ...voidedPays.map(p => ({
          kind: 'overlay' as const,
          collectionName: 'payments_sync' as const,
          record: p,
          isDeleted: false
        }))
      ]);
    }
    if (existingInv && updatedInv) {
      logAuditAction('delete', 'invoice', id, `${existingInv.invoiceNumber} - ${existingInv.patientName}`, `تم حذف / إلغاء فاتورة ${existingInv.invoiceNumber} (${existingInv.netTotal} ج.م)`, existingInv, updatedInv, 'invoices', existingInv.patientId);
    }
  };

  const addPayment = (paymentData: Omit<Payment, 'id' | 'receiptNumber' | 'createdAt'>): Payment => {
    // Prevent accidental exact duplicate active payment (same patient, invoice/unlinked, date & amount)
    const duplicatePay = paymentsRef.current.find(
      p =>
        p.status !== 'voided' &&
        p.patientId === paymentData.patientId &&
        p.date === paymentData.date &&
        (p.invoiceId || '') === (paymentData.invoiceId || '') &&
        Math.round((p.amount || 0) * 100) === Math.round((paymentData.amount || 0) * 100)
    );
    if (duplicatePay) {
      return duplicatePay;
    }

    const count = paymentsRef.current.length + 1;
    const recNum = `REC-2026-${String(count).padStart(3, '0')}`;
    const newId = 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const newPayment: Payment = {
      ...paymentData,
      id: newId,
      receiptNumber: recNum,
      createdAt: new Date().toISOString()
    };

    dirtyFinancialPatientIdsRef.current.add(newPayment.patientId);
    const nextPayments = [newPayment, ...paymentsRef.current];
    paymentsRef.current = nextPayments;
    setPayments(nextPayments);

    let updatedInvoiceForCloud: Invoice | undefined;
    // Update the invoice paid amount & status
    if (paymentData.invoiceId) {
      const targetInv = invoicesRef.current.find(i => i.id === paymentData.invoiceId);
      if (targetInv) {
        const newPaid = targetInv.paidAmount + paymentData.amount;
        const newBalance = Math.max(0, targetInv.netTotal - newPaid);
        const status = newBalance <= 0 ? 'paid' : 'partial';
        updatedInvoiceForCloud = {
          ...targetInv,
          paidAmount: newPaid,
          outstandingBalance: newBalance,
          status
        };
        const nextInvoices = invoicesRef.current.map(inv =>
          inv.id === paymentData.invoiceId ? updatedInvoiceForCloud! : inv
        );
        invoicesRef.current = nextInvoices;
        setInvoices(nextInvoices);
      }
    }

    const payAlerts: WhatsAppAlert[] = [];
    // Trigger payment receipt WhatsApp message(s) using active templates
    const patient = patientsRef.current.find(p => p.id === paymentData.patientId);
    if (patient) {
      const remaining = Math.max(0, patient.outstandingBalance - paymentData.amount);
      const matchingPayTpls = whatsappTemplatesRef.current.filter(
        t => t.isActive && t.triggerEvent === 'payment_received'
      );
      matchingPayTpls.forEach((tpl, idx) => {
        payAlerts.push({
          id: 'alert_' + Date.now() + '_pay_' + idx + '_' + Math.random().toString(36).slice(2, 5),
          patientId: patient.id,
          patientName: patient.name,
          patientPhone: getPreferredPatientWhatsAppPhone(patient) || patient.phone,
          templateTitle: tpl.title,
          renderedMessage: renderWhatsAppTemplate(
            tpl.messageTemplate,
            {
              patientName: patient.name,
              unitName: patient.branchName,
              date: paymentData.date,
              amount: paymentData.amount,
              balance: remaining,
              invoiceNumber: paymentData.invoiceNumber || recNum
            },
            unitsRef.current
          ),
          status: 'pending',
          scheduledFor: computeScheduledForFromOffset(paymentData.date, undefined, tpl.timingOffsetMinutes),
          createdAt: new Date().toISOString()
        });
      });
      if (payAlerts.length > 0) {
        const nextAlerts = [...payAlerts, ...whatsappAlertsRef.current];
        whatsappAlertsRef.current = nextAlerts;
        saveToStorage('alerts', nextAlerts);
        setWhatsappAlerts(nextAlerts);
      }
    }

    const cloudOps: PendingCloudOpInput[] = [
      { kind: 'overlay', collectionName: 'payments_sync', record: newPayment, isDeleted: false },
      ...(updatedInvoiceForCloud
        ? [{ kind: 'overlay' as const, collectionName: 'invoices_sync' as const, record: updatedInvoiceForCloud, isDeleted: false }]
        : []),
      ...payAlerts.map(al => ({
        kind: 'doc_upsert' as const,
        collectionName: 'whatsapp_alerts',
        docId: al.id,
        data: al as unknown as Record<string, unknown>
      }))
    ];
    dispatchCloudOps(cloudOps);

    logAuditAction('add', 'payment', newPayment.id, `${recNum} - ${newPayment.patientName}`, `تسجيل دفعة مالية بقيمة ${newPayment.amount} ج.م من ${newPayment.patientName}`, undefined, newPayment, 'payments', newPayment.patientId);

    return newPayment;
  };

  const updatePayment = (id: string, updates: Partial<Payment>) => {
    const existingPay = paymentsRef.current.find(p => p.id === id);
    if (!existingPay) return;

    const updatedPay: Payment = { ...existingPay, ...updates };
    dirtyFinancialPatientIdsRef.current.add(existingPay.patientId);
    dirtyFinancialPatientIdsRef.current.add(updatedPay.patientId);
    const nextPayments = paymentsRef.current.map(p => (p.id === id ? updatedPay : p));
    paymentsRef.current = nextPayments;
    setPayments(nextPayments);

    const touchedInvoiceIds = new Set<string>();
    if (existingPay.invoiceId) touchedInvoiceIds.add(existingPay.invoiceId);
    if (updatedPay.invoiceId) touchedInvoiceIds.add(updatedPay.invoiceId);

    const updatedInvoicesForCloud: Invoice[] = [];
    if (touchedInvoiceIds.size > 0) {
      const nextInvoices = invoicesRef.current.map(inv => {
        if (!touchedInvoiceIds.has(inv.id) || inv.status === 'voided') return inv;
        const paidSum = nextPayments
          .filter(p => p.invoiceId === inv.id && p.status !== 'voided')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const newBalance = Math.max(0, inv.netTotal - paidSum);
        const nextStatus: Invoice['status'] =
          newBalance <= 0 && inv.netTotal > 0
            ? 'paid'
            : paidSum > 0 && newBalance > 0
            ? 'partial'
            : inv.netTotal === 0
            ? 'paid'
            : 'unpaid';
        const nextInv: Invoice = {
          ...inv,
          paidAmount: paidSum,
          outstandingBalance: newBalance,
          status: nextStatus
        };
        updatedInvoicesForCloud.push(nextInv);
        return nextInv;
      });
      invoicesRef.current = nextInvoices;
      setInvoices(nextInvoices);
    }

    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'payments_sync', record: updatedPay, isDeleted: false },
      ...updatedInvoicesForCloud.map(inv => ({
        kind: 'overlay' as const,
        collectionName: 'invoices_sync' as const,
        record: inv,
        isDeleted: false
      }))
    ]);

    logAuditAction('update', 'payment', id, `${updatedPay.receiptNumber} - ${updatedPay.patientName}`, `تعديل سند قبض ${updatedPay.receiptNumber} (${updatedPay.amount} ج.م)`, existingPay, updatedPay, 'payments', updatedPay.patientId);
  };

  const voidPayment = (id: string) => {
    const pay = paymentsRef.current.find(p => p.id === id);
    if (!pay) return;

    dirtyFinancialPatientIdsRef.current.add(pay.patientId);
    const updatedPay: Payment = { ...pay, status: 'voided' };
    const nextPayments = paymentsRef.current.map(p => (p.id === id ? updatedPay : p));
    paymentsRef.current = nextPayments;
    setPayments(nextPayments);

    let updatedInvoiceForCloud: Invoice | undefined;
    // Revert invoice
    if (pay.invoiceId) {
      const targetInv = invoicesRef.current.find(i => i.id === pay.invoiceId);
      if (targetInv) {
        const newPaid = Math.max(0, targetInv.paidAmount - pay.amount);
        const newBalance = targetInv.netTotal - newPaid;
        const status = newPaid === 0 ? 'unpaid' : newBalance <= 0 ? 'paid' : 'partial';
        updatedInvoiceForCloud = {
          ...targetInv,
          paidAmount: newPaid,
          outstandingBalance: newBalance,
          status
        };
        const nextInvoices = invoicesRef.current.map(inv =>
          inv.id === pay.invoiceId ? updatedInvoiceForCloud! : inv
        );
        invoicesRef.current = nextInvoices;
        setInvoices(nextInvoices);
      }
    }

    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'payments_sync', record: updatedPay, isDeleted: false },
      ...(updatedInvoiceForCloud
        ? [{ kind: 'overlay' as const, collectionName: 'invoices_sync' as const, record: updatedInvoiceForCloud, isDeleted: false }]
        : [])
    ]);

    logAuditAction('delete', 'payment', id, `${pay.receiptNumber} - ${pay.patientName}`, `تم حذف / إلغاء سند قبض رقم ${pay.receiptNumber} بمبلغ ${pay.amount} ج.م`, pay, updatedPay, 'payments', pay.patientId);
  };

  const payAllInvoices = (patientId: string, amount: number, method: Payment['paymentMethod'], notes?: string) => {
    const patient = patientsRef.current.find(p => p.id === patientId);
    if (!patient) return;
    const activeStaff = resolveActiveStaffFromRefs();

    // Distribute payment across unpaid invoices
    const unpaidInvs = invoicesRef.current
      .filter(i => i.patientId === patientId && i.outstandingBalance > 0 && i.status !== 'voided')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let remainingToPay = amount;

    for (const inv of unpaidInvs) {
      if (remainingToPay <= 0) break;
      const allocated = Math.min(inv.outstandingBalance, remainingToPay);
      addPayment({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        patientId,
        patientName: patient.name,
        amount: allocated,
        paymentMethod: method,
        date: getTodayDateString(),
        receivedBy: activeStaff.name || currentUser.name,
        notes: notes ? `${notes} (سداد مجمع)` : 'سداد مجمع لجميع الفواتير',
        status: 'valid'
      });
      remainingToPay -= allocated;
    }
  };

  // Expenses
  const addExpense = (expenseData: Omit<Expense, 'id'>) => {
    const newExpense: Expense = {
      ...expenseData,
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
    };
    const nextExpenses = [newExpense, ...expensesRef.current];
    expensesRef.current = nextExpenses;
    saveToStorage('expenses', nextExpenses);
    setExpenses(nextExpenses);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'expenses',
        docId: newExpense.id,
        data: newExpense as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('add', 'expense', newExpense.id, newExpense.title, `تسجيل مصروف: ${newExpense.title} (${newExpense.amount} ج.م)`, undefined, newExpense, 'expenses');
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    const existing = expensesRef.current.find(e => e.id === id);
    const updated = existing ? { ...existing, ...updates } : undefined;
    const nextExpenses = expensesRef.current.map(e => (e.id === id ? { ...e, ...updates } : e));
    expensesRef.current = nextExpenses;
    saveToStorage('expenses', nextExpenses);
    setExpenses(nextExpenses);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'expenses',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'expense', id, updated.title, `تعديل مصروف: ${updated.title} (${updated.amount} ج.م)`, existing, updated, 'expenses');
    }
  };

  const deleteExpense = (id: string) => {
    const existing = expensesRef.current.find(e => e.id === id);
    const nextExpenses = expensesRef.current.filter(e => e.id !== id);
    expensesRef.current = nextExpenses;
    saveToStorage('expenses', nextExpenses);
    setExpenses(nextExpenses);
    dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'expenses', docId: id }]);
    if (existing) {
      logAuditAction('delete', 'expense', id, existing.title, `حذف مصروف: ${existing.title} (${existing.amount} ج.م)`, existing, undefined, 'expenses');
    }
  };

  // Tasks
  const addTask = (taskData: Omit<Task, 'id' | 'isCompleted'>) => {
    const newTask: Task = {
      ...taskData,
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      isCompleted: false
    };
    const nextTasks = [newTask, ...tasksRef.current];
    tasksRef.current = nextTasks;
    saveToStorage('tasks', nextTasks);
    setTasks(nextTasks);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'tasks',
        docId: newTask.id,
        data: newTask as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('add', 'task', newTask.id, newTask.title, `إضافة مهمة جديدة: ${newTask.title}`, undefined, newTask, 'tasks');
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    const existing = tasksRef.current.find(t => t.id === id);
    const updated = existing ? { ...existing, ...updates } : undefined;
    const nextTasks = tasksRef.current.map(t => (t.id === id ? { ...t, ...updates } : t));
    tasksRef.current = nextTasks;
    saveToStorage('tasks', nextTasks);
    setTasks(nextTasks);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'tasks',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'task', id, updated.title, `تعديل مهمة: ${updated.title}`, existing, updated, 'tasks');
    }
  };

  const toggleTask = (id: string, targetDate?: string, completionSource?: string) => {
    const existing = tasksRef.current.find(t => t.id === id);
    if (!existing) return;
    const todayStr = getTodayDateString();
    const dateKey = targetDate || todayStr;
    const recurrence = existing.recurrence || 'once';
    const cairoTimeStr = new Date().toLocaleTimeString('ar-EG', {
      timeZone: CAIRO_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit'
    });

    let updated: Task;
    let nowCompletedForDate = false;

    const activeStaff = resolveActiveStaffFromRefs();

    if (recurrence === 'once') {
      nowCompletedForDate = !existing.isCompleted;
      updated = {
        ...existing,
        isCompleted: nowCompletedForDate,
        adminCompleted: false,
        completedAt: nowCompletedForDate ? cairoTimeStr : undefined,
        completedBy: nowCompletedForDate ? activeStaff.name : undefined,
        completionSource: nowCompletedForDate ? (completionSource || 'من كارت المهمة مباشرة') : undefined
      };
    } else {
      const baseCompletedDates: Record<string, { completedAt?: string; completedBy?: string; adminCompleted?: boolean; completionSource?: string }> = existing.completedDates
        ? { ...existing.completedDates }
        : existing.isCompleted && existing.dueDate
        ? {
            [existing.dueDate]: {
              ...(existing.completedAt ? { completedAt: existing.completedAt } : {}),
              ...(existing.completedBy ? { completedBy: existing.completedBy } : {}),
              ...(existing.adminCompleted ? { adminCompleted: existing.adminCompleted } : {}),
              ...(existing.completionSource ? { completionSource: existing.completionSource } : {})
            }
          }
        : {};
      nowCompletedForDate = !baseCompletedDates[dateKey];
      if (nowCompletedForDate) {
        baseCompletedDates[dateKey] = {
          completedAt: cairoTimeStr,
          completedBy: activeStaff.name,
          adminCompleted: false,
          completionSource: completionSource || 'من كارت المهمة مباشرة'
        };
      } else {
        delete baseCompletedDates[dateKey];
      }
      const todayEntry = baseCompletedDates[todayStr];
      updated = {
        ...existing,
        completedDates: baseCompletedDates,
        isCompleted: Boolean(todayEntry),
        adminCompleted: Boolean(todayEntry?.adminCompleted),
        completedAt: todayEntry?.completedAt,
        completedBy: todayEntry?.completedBy,
        completionSource: todayEntry?.completionSource
      };
    }

    const nextTasks = tasksRef.current.map(t => (t.id === id ? updated : t));
    tasksRef.current = nextTasks;
    saveToStorage('tasks', nextTasks);
    setTasks(nextTasks);

    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'tasks',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'status_change',
      'task',
      id,
      existing.title,
      `${nowCompletedForDate ? 'إكمال مهمة' : 'إعادة فتح مهمة'}: ${existing.title}${recurrence !== 'once' ? ` (${dateKey})` : ''}`,
      existing,
      updated,
      'tasks'
    );
  };

  const adminCompleteTask = (id: string, targetDate?: string, completionSource?: string) => {
    const activeStaff = resolveActiveStaffFromRefs();
    if (activeStaff.role !== 'admin') return;
    const existing = tasksRef.current.find(t => t.id === id);
    if (!existing) return;

    const todayStr = getTodayDateString();
    const dateKey = targetDate || todayStr;
    const recurrence = existing.recurrence || 'once';
    const cairoTimeStr = new Date().toLocaleTimeString('ar-EG', {
      timeZone: CAIRO_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit'
    });

    let updated: Task;
    if (recurrence === 'once') {
      updated = {
        ...existing,
        isCompleted: true,
        adminCompleted: true,
        completedAt: cairoTimeStr,
        completedBy: activeStaff.name,
        completionSource: completionSource || 'إتمام إداري'
      };
    } else {
      const baseCompletedDates: Record<string, { completedAt?: string; completedBy?: string; adminCompleted?: boolean; completionSource?: string }> = existing.completedDates
        ? { ...existing.completedDates }
        : {};
      baseCompletedDates[dateKey] = {
        completedAt: cairoTimeStr,
        completedBy: activeStaff.name,
        adminCompleted: true,
        completionSource: completionSource || 'إتمام إداري'
      };
      const todayEntry = baseCompletedDates[todayStr];
      updated = {
        ...existing,
        completedDates: baseCompletedDates,
        isCompleted: Boolean(todayEntry),
        adminCompleted: Boolean(todayEntry?.adminCompleted),
        completedAt: todayEntry?.completedAt,
        completedBy: todayEntry?.completedBy,
        completionSource: todayEntry?.completionSource
      };
    }

    const nextTasks = tasksRef.current.map(t => (t.id === id ? updated : t));
    tasksRef.current = nextTasks;
    saveToStorage('tasks', nextTasks);
    setTasks(nextTasks);

    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'tasks',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction(
      'status_change',
      'task',
      id,
      existing.title,
      `إتمام إداري للمهمة بدون استكمال الخطوات: ${existing.title}${recurrence !== 'once' ? ` (${dateKey})` : ''}`,
      existing,
      updated,
      'tasks'
    );
  };

  const deleteTask = (id: string) => {
    const existing = tasksRef.current.find(t => t.id === id);
    const nextTasks = tasksRef.current.filter(t => t.id !== id);
    tasksRef.current = nextTasks;
    saveToStorage('tasks', nextTasks);
    setTasks(nextTasks);
    dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'tasks', docId: id }]);
    if (existing) {
      logAuditAction('delete', 'task', id, existing.title, `حذف مهمة: ${existing.title}`, existing, undefined, 'tasks');
    }
  };

  // Attendance / Shift Management
  const clockIn = (
    unitId: string,
    isManual?: boolean,
    manualReason?: string,
    manualOverrides?: { userId?: string; userName?: string; date?: string; clockIn?: string },
    alertSource?: string
  ): { success: boolean; error?: string } => {
    const unit = unitsRef.current.find(u => u.id === unitId);
    const cairo = getCairoNowParts();
    const targetStaff = manualOverrides?.userId
      ? staffMembersRef.current.find(s => s.id === manualOverrides.userId)
      : undefined;
    const targetUserId = (targetStaff?.id || manualOverrides?.userId || currentUserIdRef.current || currentUser.id).slice(0, 128);
    const resolvedStaff =
      staffMembersRef.current.find(s => s.id === targetUserId) || currentUser;
    const targetUserName = (targetStaff?.name || manualOverrides?.userName || resolvedStaff.name || 'موظف').slice(0, 120);

    const alreadyActive = attendanceRef.current.find(
      a => a.userId === targetUserId && a.status === 'active'
    );
    if (alreadyActive) {
      return {
        success: false,
        error: `الموظف (${targetUserName}) لديه شفت مفتوح بالفعل منذ ${alreadyActive.date} (${formatCairoTime(alreadyActive.clockIn)}). يجب إنهاء الشفت الحالي أولاً.`
      };
    }

    const resolvedDate = (manualOverrides?.date?.trim() || cairo.dateStr).slice(0, 20);
    const resolvedTime = (manualOverrides?.clockIn?.trim() || cairo.timeStr).slice(0, 16);
    const cleanReason = manualReason?.trim() ? manualReason.trim().slice(0, 300) : undefined;

    const newRec: AttendanceRecord = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      userId: targetUserId,
      userName: targetUserName,
      unitId: (unitId || 'unit_1').slice(0, 128),
      unitName: (unit ? unit.name : 'عيادة ١').slice(0, 120),
      date: resolvedDate,
      clockIn: resolvedTime,
      ...(isManual !== undefined ? { isManual: Boolean(isManual) } : {}),
      ...(cleanReason ? { manualReason: cleanReason } : {}),
      status: 'active'
    };
    const nextAttendance = [newRec, ...attendanceRef.current];
    attendanceRef.current = nextAttendance;
    saveToStorage('attendance', nextAttendance);
    setAttendance(nextAttendance);
    void dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'attendance',
        docId: newRec.id,
        data: newRec as unknown as Record<string, unknown>
      }
    ]).then(() => {
      void flushPendingCloudOps();
    });
    logAuditAction('add', 'attendance', newRec.id, newRec.userName, `بدء شفت للموظف ${newRec.userName} في ${newRec.unitName} (${newRec.date} ${formatCairoTime(newRec.clockIn)})`, undefined, newRec, 'attendance');
    const shiftStartKey = `shift_start_${targetUserId}_${resolvedDate}`;
    if (
      staffAlertLogsRef.current.some(l => l.targetKey === shiftStartKey || l.id === toSafeAlertLogId(shiftStartKey)) ||
      alertSource
    ) {
      recordStaffAlertInteraction({
        targetKey: shiftStartKey,
        action: 'clocked_in',
        actionLabel: `تم تسجيل الحضور الساعة ${formatCairoTime(newRec.clockIn)} (${newRec.unitName})`,
        newStatus: 'resolved',
        source: alertSource || 'صفحة الحضور والشفت',
        fallbackMeta: {
          alertType: 'shift_start',
          title: `تذكير بدء الشفت — ${newRec.userName}`,
          message: `تم تسجيل بدء الشفت الساعة ${formatCairoTime(newRec.clockIn)} (${newRec.unitName})`,
          appointmentDate: resolvedDate,
          appointmentTime: resolvedTime
        }
      });
    }
    return { success: true };
  };

  const clockOut = (recordId: string, alertSource?: string, specificTime24?: string) => {
    const timeStr = specificTime24 || getCairoNowParts().timeStr;
    const existing = attendanceRef.current.find(r => r.id === recordId);
    const updated = existing ? { ...existing, clockOut: timeStr, status: 'completed' as const } : undefined;
    const nextAttendance = attendanceRef.current.map(r =>
      r.id === recordId ? { ...r, clockOut: timeStr, status: 'completed' as const } : r
    );
    attendanceRef.current = nextAttendance;
    saveToStorage('attendance', nextAttendance);
    setAttendance(nextAttendance);
    if (existing) {
      setCompletedShiftDates(prev => {
        const next = { ...prev, [existing.userId]: existing.date };
        saveToStorage('completed_shift_dates', next);
        return next;
      });
      if (existing.userId === currentUserIdRef.current) {
        setShiftEndSnoozeUntil(null);
        try { sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'shift_end_snooze'); } catch {}
      }
    }
    if (updated) {
      void dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'attendance',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]).then(() => {
        void flushPendingCloudOps();
      });
    }
    if (existing && updated) {
      logAuditAction('status_change', 'attendance', recordId, existing.userName, `إنهاء شفت للموظف ${existing.userName} الساعة ${timeStr}`, existing, updated, 'attendance');
      const shiftEndKey = `shift_end_${existing.userId}_${existing.date}`;
      if (
        staffAlertLogsRef.current.some(l => l.targetKey === shiftEndKey || l.id === toSafeAlertLogId(shiftEndKey)) ||
        alertSource
      ) {
        recordStaffAlertInteraction({
          targetKey: shiftEndKey,
          action: 'clocked_out',
          actionLabel: `تم تسجيل الانصراف الساعة ${formatCairoTime(timeStr)} (${existing.unitName})`,
          newStatus: 'resolved',
          source: alertSource || 'صفحة الحضور والشفت',
          fallbackMeta: {
            alertType: 'shift_end',
            title: `تذكير إنهاء الشفت — ${existing.userName}`,
            message: `تم تسجيل إنهاء الشفت الساعة ${formatCairoTime(timeStr)} (${existing.unitName})`,
            appointmentDate: existing.date,
            appointmentTime: timeStr
          }
        });
      }
    }
  };

  const [shiftStartSnoozeUntil, setShiftStartSnoozeUntil] = useState<number | null>(() => {
    try {
      const v = Number(sessionStorage.getItem(LOCAL_STORAGE_PREFIX + 'shift_start_snooze'));
      return Number.isFinite(v) && v > Date.now() ? v : null;
    } catch {
      return null;
    }
  });
  const [shiftEndSnoozeUntil, setShiftEndSnoozeUntil] = useState<number | null>(() => {
    try {
      const v = Number(sessionStorage.getItem(LOCAL_STORAGE_PREFIX + 'shift_end_snooze'));
      return Number.isFinite(v) && v > Date.now() ? v : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!shiftStartSnoozeUntil) return;
    const remaining = shiftStartSnoozeUntil - Date.now();
    if (remaining <= 0) {
      try { sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'shift_start_snooze'); } catch {}
      setShiftStartSnoozeUntil(null);
      return;
    }
    const t = window.setTimeout(() => {
      try { sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'shift_start_snooze'); } catch {}
      setShiftStartSnoozeUntil(null);
    }, remaining + 50);
    return () => window.clearTimeout(t);
  }, [shiftStartSnoozeUntil]);

  useEffect(() => {
    if (!shiftEndSnoozeUntil) return;
    const remaining = shiftEndSnoozeUntil - Date.now();
    if (remaining <= 0) {
      try { sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'shift_end_snooze'); } catch {}
      setShiftEndSnoozeUntil(null);
      return;
    }
    const t = window.setTimeout(() => {
      try { sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'shift_end_snooze'); } catch {}
      setShiftEndSnoozeUntil(null);
    }, remaining + 50);
    return () => window.clearTimeout(t);
  }, [shiftEndSnoozeUntil]);

  const snoozeShiftStart = (minutes: number = 15) => {
    const until = Date.now() + minutes * 60 * 1000;
    setShiftStartSnoozeUntil(until);
    try { sessionStorage.setItem(LOCAL_STORAGE_PREFIX + 'shift_start_snooze', String(until)); } catch {}
  };

  const snoozeShiftEnd = (minutes: number = 10) => {
    const until = Date.now() + minutes * 60 * 1000;
    setShiftEndSnoozeUntil(until);
    try { sessionStorage.setItem(LOCAL_STORAGE_PREFIX + 'shift_end_snooze', String(until)); } catch {}
    const activeStaff = staffMembersRef.current.find(s => s.id === currentUserIdRef.current) || currentUser;
    logAuditAction(
      'status_change',
      'attendance',
      `snooze_end_${activeStaff.id}_${Date.now()}`,
      activeStaff.name,
      `تأجيل شاشة نهاية الشفت ${minutes} دقيقة للموظف ${activeStaff.name}`,
      undefined,
      { until },
      'attendance'
    );
  };

  const triggerShiftActionFromAlert = async (
    action: 'shift_start' | 'shift_end',
    source: string = 'إشعار الشفت',
    overrideUnitId?: string
  ): Promise<{ success: boolean; error?: string; unitName?: string }> => {
    if (shiftFeedbackTimerRef.current) {
      window.clearTimeout(shiftFeedbackTimerRef.current);
      shiftFeedbackTimerRef.current = null;
    }

    const activeUser =
      staffMembersRef.current.find(s => s.id === currentUserIdRef.current && !s.isDisabled) ||
      currentUser;

    if (action === 'shift_start') {
      const alreadyActive = attendanceRef.current.find(
        a => a.userId === activeUser.id && a.status === 'active'
      );
      if (alreadyActive) {
        const msg = `لديك شفت مفتوح بالفعل منذ ${alreadyActive.date} (${formatCairoTime(alreadyActive.clockIn)}). يجب إنهاء الشفت الحالي أولاً.`;
        setShiftAlertFeedback({ type: 'error', action: 'shift_start', text: msg });
        return { success: false, error: msg };
      }

      const defaultUnit =
        (overrideUnitId ? unitsRef.current.find(u => u.id === overrideUnitId) : undefined) ||
        resolveEmployeeDefaultUnitForToday(
          activeUser,
          unitsRef.current,
          weekdaySettingsRef.current
        );
      if (!defaultUnit) {
        const msg = 'لم يتم تحديد فرع افتراضي لهذا اليوم في الإعدادات.';
        setShiftAlertFeedback({ type: 'error', action: 'shift_start', text: msg });
        return { success: false, error: msg };
      }

      setShiftAlertFeedback({
        type: 'loading',
        action: 'shift_start',
        text: `جاري التحقق من موقع الفرع الافتراضي (${defaultUnit.name})...`
      });

      const geo = await verifyUnitGeofence(defaultUnit);
      if (!geo.ok) {
        const msg = geo.error || 'تعذر التحقق من موقع العيادة (GPS)';
        setShiftAlertFeedback({ type: 'error', action: 'shift_start', text: msg });
        const maxMeters = geo.maxRadiusMeters ?? CLINIC_ATTENDANCE_RADIUS_METERS;
        const distanceNote =
          typeof geo.distanceMeters === 'number'
            ? ` (المسافة الفعلية: ${geo.distanceMeters} متر — الحد المسموح: ${maxMeters} متر)`
            : '';
        logAuditAction(
          'status_change',
          'attendance',
          `failed_clockin_${activeUser.id}_${Date.now()}`,
          activeUser.name,
          `محاولة فاشلة لتسجيل الحضور (${activeUser.name}) من ${source}: ${msg}${distanceNote}`,
          undefined,
          {
            unitId: defaultUnit.id,
            unitName: defaultUnit.name,
            reason: msg,
            ...(typeof geo.distanceMeters === 'number'
              ? { distanceMeters: geo.distanceMeters, allowedRadiusMeters: maxMeters }
              : {})
          },
          'attendance'
        );
        return { success: false, error: msg };
      }

      const res = clockIn(defaultUnit.id, false, undefined, undefined, source);
      if (!res.success) {
        const msg = res.error || 'تعذر بدء الشفت';
        setShiftAlertFeedback({ type: 'error', action: 'shift_start', text: msg });
        return { success: false, error: msg };
      }

      setStaffAlertSnoozeUntil(null);
      setShiftStartSnoozeUntil(null);
      try { sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'shift_start_snooze'); } catch {}
      setShiftAlertFeedback({
        type: 'success',
        action: 'shift_start',
        text: `تم بدء الشفت بنجاح في ${defaultUnit.name}`
      });
      shiftFeedbackTimerRef.current = window.setTimeout(() => {
        setShiftAlertFeedback(prev => (prev?.type === 'success' ? null : prev));
      }, 6000);
      return { success: true, unitName: defaultUnit.name };
    }

    // shift_end
    const activeShift = attendanceRef.current.find(
      a => a.userId === activeUser.id && a.status === 'active'
    );
    if (!activeShift) {
      const msg = 'لا يوجد شفت مفتوح حالياً لإنهائه.';
      setShiftAlertFeedback({ type: 'error', action: 'shift_end', text: msg });
      return { success: false, error: msg };
    }

    const targetUnit =
      unitsRef.current.find(u => u.id === activeShift.unitId) ||
      resolveEmployeeDefaultUnitForToday(activeUser, unitsRef.current, weekdaySettingsRef.current);

    setShiftAlertFeedback({
      type: 'loading',
      action: 'shift_end',
      text: `جاري التحقق من موقع الفرع (${targetUnit?.name || activeShift.unitName})...`
    });

    const geo = await verifyUnitGeofence(targetUnit);
    if (!geo.ok) {
      const msg = geo.error || 'تعذر التحقق من موقع العيادة (GPS)';
      setShiftAlertFeedback({ type: 'error', action: 'shift_end', text: msg });
      const maxMeters = geo.maxRadiusMeters ?? CLINIC_ATTENDANCE_RADIUS_METERS;
      const distanceNote =
        typeof geo.distanceMeters === 'number'
          ? ` (المسافة الفعلية: ${geo.distanceMeters} متر — الحد المسموح: ${maxMeters} متر)`
          : '';
      logAuditAction(
        'status_change',
        'attendance',
        `failed_clockout_${activeUser.id}_${Date.now()}`,
        activeUser.name,
        `محاولة فاشلة لتسجيل الانصراف (${activeUser.name}) من ${source}: ${msg}${distanceNote}`,
        undefined,
        {
          unitId: targetUnit?.id,
          unitName: activeShift.unitName,
          reason: msg,
          ...(typeof geo.distanceMeters === 'number'
            ? { distanceMeters: geo.distanceMeters, allowedRadiusMeters: maxMeters }
            : {})
        },
        'attendance'
      );
      return { success: false, error: msg };
    }

    clockOut(activeShift.id, source);
    setStaffAlertSnoozeUntil(null);
    setShiftEndSnoozeUntil(null);
    try { sessionStorage.removeItem(LOCAL_STORAGE_PREFIX + 'shift_end_snooze'); } catch {}
    setShiftAlertFeedback({
      type: 'success',
      action: 'shift_end',
      text: `تم إنهاء الشفت بنجاح (${activeShift.unitName})`
    });
    shiftFeedbackTimerRef.current = window.setTimeout(() => {
      setShiftAlertFeedback(prev => (prev?.type === 'success' ? null : prev));
    }, 6000);
    return { success: true, unitName: activeShift.unitName };
  };

  const toggleStaffAttendanceExempt = (staffId: string) => {
    const member = staffMembersRef.current.find(s => s.id === staffId);
    if (!member) return;
    const nextVal = !member.exemptFromAttendance;
    updateStaffMember(staffId, { exemptFromAttendance: nextVal });
    logAuditAction(
      'status_change',
      'staff',
      staffId,
      member.name,
      `${nextVal ? 'تفعيل إعفاء البصمة الدائم (يعمل من المنزل)' : 'إلغاء إعفاء البصمة الدائم'} للموظف ${member.name}`,
      member,
      { ...member, exemptFromAttendance: nextVal },
      'settings'
    );
  };

  const grantStaffAttendanceLeave = (staffId: string, dateStr: string) => {
    const member = staffMembersRef.current.find(s => s.id === staffId);
    if (!member || !dateStr) return;
    const existingDates = Array.isArray(member.attendanceExemptDates) ? member.attendanceExemptDates : [];
    if (existingDates.includes(dateStr)) return;
    const nextDates = [...existingDates, dateStr].sort().slice(-120);
    updateStaffMember(staffId, { attendanceExemptDates: nextDates });
    logAuditAction(
      'status_change',
      'attendance',
      `leave_${staffId}_${dateStr}`,
      member.name,
      `منح إجازة/إعفاء بصمة يوم (${dateStr}) للموظف ${member.name}`,
      member,
      { ...member, attendanceExemptDates: nextDates },
      'settings'
    );
  };

  const removeStaffAttendanceLeave = (staffId: string, dateStr: string) => {
    const member = staffMembersRef.current.find(s => s.id === staffId);
    if (!member || !dateStr) return;
    const existingDates = Array.isArray(member.attendanceExemptDates) ? member.attendanceExemptDates : [];
    const nextDates = existingDates.filter(d => d !== dateStr);
    updateStaffMember(staffId, { attendanceExemptDates: nextDates });
    logAuditAction(
      'status_change',
      'attendance',
      `unleave_${staffId}_${dateStr}`,
      member.name,
      `إلغاء إعفاء بصمة يوم (${dateStr}) للموظف ${member.name}`,
      member,
      { ...member, attendanceExemptDates: nextDates },
      'settings'
    );
  };

  const editAttendanceRecord = (id: string, updates: Partial<AttendanceRecord>) => {
    const existing = attendanceRef.current.find(r => r.id === id);
    if (!existing) return;
    const resolvedUnit = updates.unitId ? unitsRef.current.find(u => u.id === updates.unitId) : undefined;
    const wasMidnightAutoEnded = isMidnightAutoEndedAttendance(existing);
    const resolvedClockOut = (updates.clockOut ?? existing.clockOut)?.slice(0, 16);
    const defaultReason =
      wasMidnightAutoEnded && resolvedClockOut
        ? `تم تحديد وقت الانصراف الفعلي من الإدارة (${formatCairoTime(resolvedClockOut)})`
        : existing.manualReason || 'تعديل إداري لبيانات الشفت';
    const nextReason =
      updates.manualReason && !updates.manualReason.startsWith(MIDNIGHT_AUTO_END_REASON_PREFIX)
        ? updates.manualReason
        : wasMidnightAutoEnded && updates.clockOut
        ? defaultReason
        : updates.manualReason || defaultReason;

    const updated: AttendanceRecord = {
      ...existing,
      ...updates,
      unitId: (updates.unitId || existing.unitId).slice(0, 128),
      unitName: (resolvedUnit ? resolvedUnit.name : updates.unitName || existing.unitName).slice(0, 120),
      ...(resolvedClockOut ? { clockOut: resolvedClockOut } : {}),
      isManual: true,
      manualReason: nextReason.slice(0, 300)
    };
    const nextAttendance = attendanceRef.current.map(r => (r.id === id ? updated : r));
    attendanceRef.current = nextAttendance;
    saveToStorage('attendance', nextAttendance);
    setAttendance(nextAttendance);
    void dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'attendance',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]).then(() => {
      void flushPendingCloudOps();
    });

    const autoEndKey = `shift_auto_end_${id}`;
    const hasAutoEndAlert = staffAlertLogsRef.current.some(
      l => (l.targetKey === autoEndKey || l.id === toSafeAlertLogId(autoEndKey)) && l.status === 'active'
    );
    if (hasAutoEndAlert || wasMidnightAutoEnded) {
      recordStaffAlertInteraction({
        targetKey: autoEndKey,
        action: 'resolved',
        actionLabel: resolvedClockOut
          ? `تم تحديد وقت الانصراف الفعلي: ${formatCairoTime(resolvedClockOut)}`
          : 'تمت مراجعة وتعديل وقت الشفت من الإدارة',
        newStatus: 'resolved',
        source: 'تعديل الشفت الإداري',
        fallbackMeta: {
          alertType: 'shift_end',
          title: `تحديد وقت إنهاء الشفت — ${updated.userName}`,
          message: `تم تحديد وقت الانصراف ليوم ${updated.date}: ${resolvedClockOut ? formatCairoTime(resolvedClockOut) : 'تم التحديث'}`,
          appointmentDate: updated.date,
          appointmentTime: resolvedClockOut || updated.clockIn
        }
      });
    }

    logAuditAction('update', 'attendance', id, updated.userName, `تعديل سجل شفت للموظف ${updated.userName}`, existing, updated, 'attendance');
  };

  // Auto-end open prior-day shifts at 12:00 AM Cairo midnight & notify Admin ONLY for active non-deleted staff;
  // also silently clean up orphaned/deleted-staff auto-end records & stale alert logs.
  const midnightAutoEndedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isLoggedIn) return;
    if (!archiveReady) return;
    if (cloudUserRef.current && (!cloudAttendanceReady || !cloudStaffReady)) return;

    const runMidnightAutoEndCheck = () => {
      const cairo = getCairoNowParts();
      const existingStaffIds = new Set(staffMembersRef.current.map(s => s.id));
      const activeStaffIds = new Set(
        staffMembersRef.current.filter(s => !s.isDisabled).map(s => s.id)
      );

      // 1. Purge any queued/pending staff_alert_logs writes for deleted or missing staff auto-end records
      const attendanceById = new Map<string, AttendanceRecord>();
      attendanceRef.current.forEach(a => attendanceById.set(a.id, a));

      removePendingCloudOpsByPredicate(op => {
        if (op.collectionName !== 'staff_alert_logs' || op.kind !== 'doc_upsert') return false;
        if (!op.docId.startsWith('sal_shift_auto_end_')) return false;
        const recId = op.docId.slice('sal_shift_auto_end_'.length);
        const rec = attendanceById.get(recId);
        return !rec || !activeStaffIds.has(rec.userId);
      });

      // 2. Clean up existing stale active shift_auto_end_* alert logs that belong to deleted/disabled/missing staff
      const staleAlertLogIds: string[] = [];
      staffAlertLogsRef.current.forEach(log => {
        if (log.status !== 'active') return;
        if (!log.targetKey || !log.targetKey.startsWith('shift_auto_end_')) return;
        const recId = log.targetKey.slice('shift_auto_end_'.length);
        const rec = attendanceById.get(recId);
        if (!rec || !isMidnightAutoEndedAttendance(rec) || !activeStaffIds.has(rec.userId)) {
          staleAlertLogIds.push(log.id);
        }
      });

      const cleanupOps: PendingCloudOpInput[] = [];
      if (staleAlertLogIds.length > 0) {
        const staleSet = new Set(staleAlertLogIds);
        const nextLogs = staffAlertLogsRef.current.filter(l => !staleSet.has(l.id));
        staffAlertLogsRef.current = nextLogs;
        saveToStorage('staff_alert_logs', nextLogs);
        setStaffAlertLogs(nextLogs);
        staleAlertLogIds.forEach(logId => {
          cleanupOps.push({
            kind: 'doc_delete',
            collectionName: 'staff_alert_logs',
            docId: logId
          });
        });
      }

      // 3. Silently normalize any already midnight-auto-ended records belonging to deleted staff so banners clear
      const deletedAutoEndedMap = new Map<string, AttendanceRecord>();
      attendanceRef.current.forEach(rec => {
        if (!existingStaffIds.has(rec.userId) && isMidnightAutoEndedAttendance(rec)) {
          const cleaned: AttendanceRecord = {
            ...rec,
            status: 'completed',
            clockOut: rec.clockOut || '00:00',
            isManual: true,
            manualReason: 'إغلاق تلقائي لسجل شفت قديم لموظف محذوف'
          };
          deletedAutoEndedMap.set(rec.id, cleaned);
          cleanupOps.push({
            kind: 'doc_upsert',
            collectionName: 'attendance',
            docId: cleaned.id,
            data: cleaned as unknown as Record<string, unknown>
          });
        }
      });

      if (deletedAutoEndedMap.size > 0) {
        const cleanedAttendance = attendanceRef.current.map(r => deletedAutoEndedMap.get(r.id) || r);
        attendanceRef.current = cleanedAttendance;
        saveToStorage('attendance', cleanedAttendance);
        setAttendance(cleanedAttendance);
      }

      if (cleanupOps.length > 0) {
        void dispatchCloudOps(cleanupOps);
      }

      // 4. Find prior-day open active shifts
      const candidates = findMidnightAutoEndCandidates(attendanceRef.current, cairo.dateStr);
      if (candidates.length === 0) return;

      const adminMembers = staffMembersRef.current.filter(s => s.role === 'admin' && !s.isDisabled);
      const adminIds = adminMembers.map(a => a.id);
      const adminNames = adminMembers.map(a => a.name);
      const effectiveChannel = getEffectiveMobilePushChannel(staffAlertSettingsRef.current);

      const updatedMap = new Map<string, AttendanceRecord>();
      const notifyUpdatedList: AttendanceRecord[] = [];
      const ops: PendingCloudOpInput[] = [];

      candidates.forEach(rec => {
        if (midnightAutoEndedIdsRef.current.has(rec.id)) return;
        midnightAutoEndedIdsRef.current.add(rec.id);

        const isActiveExistingStaff = activeStaffIds.has(rec.userId);
        const updated: AttendanceRecord = {
          ...rec,
          clockOut: '00:00',
          status: 'completed',
          isManual: true,
          manualReason: isActiveExistingStaff
            ? `${MIDNIGHT_AUTO_END_REASON_PREFIX} (12:00 ص) — بانتظار تحديد وقت الانصراف الفعلي من الإدارة`.slice(0, 300)
            : 'إغلاق تلقائي لسجل شفت قديم لموظف محذوف'
        };
        updatedMap.set(rec.id, updated);
        if (isActiveExistingStaff) {
          notifyUpdatedList.push(updated);
        }
        ops.push({
          kind: 'doc_upsert',
          collectionName: 'attendance',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        });
      });

      if (updatedMap.size === 0) return;

      const nextAttendance = attendanceRef.current.map(r => updatedMap.get(r.id) || r);
      attendanceRef.current = nextAttendance;
      saveToStorage('attendance', nextAttendance);
      setAttendance(nextAttendance);

      setCompletedShiftDates(prev => {
        const next = { ...prev };
        let changed = false;
        notifyUpdatedList.forEach(u => {
          if (next[u.userId] !== u.date) {
            next[u.userId] = u.date;
            changed = true;
          }
        });
        if (changed) saveToStorage('completed_shift_dates', next);
        return changed ? next : prev;
      });

      void dispatchCloudOps(ops).then(() => {
        void flushPendingCloudOps();
      });

      notifyUpdatedList.forEach(updated => {
        const prev = candidates.find(c => c.id === updated.id);
        logAuditAction(
          'status_change',
          'attendance',
          updated.id,
          updated.userName,
          `إنهاء تلقائي لشفت ${updated.userName} (${updated.date}) عند منتصف الليل (12:00 ص) بانتظار تحديد وقت الانصراف من الإدارة`,
          prev,
          updated,
          'attendance'
        );

        const autoEndKey = `shift_auto_end_${updated.id}`;
        const title = `تحديد وقت إنهاء الشفت — ${updated.userName}`;
        const body = `انتهى شفت ${updated.userName} (${updated.unitName}) بتاريخ ${updated.date} تلقائياً عند الساعة ١٢ منتصف الليل — يرجى تحديد وقت الانصراف الفعلي.`;

        recordStaffAlertTrigger({
          targetKey: autoEndKey,
          alertType: 'shift_end',
          title,
          message: body,
          appointmentDate: updated.date,
          appointmentTime: updated.clockIn,
          targetStaffIds: adminIds,
          targetStaffNames: adminNames,
          channel: effectiveChannel
        });

        if (adminIds.length > 0 && effectiveChannel === 'mobile_and_website') {
          void sendStaffPushAlert({
            targetStaffIds: adminIds,
            alertId: autoEndKey,
            title,
            body,
            url: `/?view=attendance&editAttendanceId=${encodeURIComponent(updated.id)}`,
            view: 'attendance'
          });
        }
      });
    };

    runMidnightAutoEndCheck();
    const timer = window.setInterval(runMidnightAutoEndCheck, 30_000);
    return () => window.clearInterval(timer);
  }, [isLoggedIn, archiveReady, cloudAttendanceReady, cloudStaffReady, cairoTodayStr, attendance, staffMembers]);

  const deleteAttendanceRecord = (id: string) => {
    const existing = attendanceRef.current.find(r => r.id === id);
    const nextAttendance = attendanceRef.current.filter(r => r.id !== id);
    attendanceRef.current = nextAttendance;
    saveToStorage('attendance', nextAttendance);
    setAttendance(nextAttendance);
    if (existing) {
      setCompletedShiftDates(prev => {
        if (prev[existing.userId] !== existing.date) return prev;
        const next = { ...prev };
        delete next[existing.userId];
        saveToStorage('completed_shift_dates', next);
        return next;
      });
    }
    const ops: PendingCloudOpInput[] = [
      { kind: 'doc_delete', collectionName: 'attendance', docId: id }
    ];
    const autoEndKey = `shift_auto_end_${id}`;
    const autoEndLogId = toSafeAlertLogId(autoEndKey);
    const matchingLogs = staffAlertLogsRef.current.filter(
      l => l.targetKey === autoEndKey || l.id === autoEndLogId
    );
    if (matchingLogs.length > 0) {
      const logIds = new Set(matchingLogs.map(l => l.id));
      const nextLogs = staffAlertLogsRef.current.filter(l => !logIds.has(l.id));
      staffAlertLogsRef.current = nextLogs;
      saveToStorage('staff_alert_logs', nextLogs);
      setStaffAlertLogs(nextLogs);
      matchingLogs.forEach(l => {
        ops.push({ kind: 'doc_delete', collectionName: 'staff_alert_logs', docId: l.id });
      });
    }
    dispatchCloudOps(ops);
    if (existing) {
      logAuditAction('delete', 'attendance', id, existing.userName, `حذف سجل شفت للموظف ${existing.userName} بتاريخ ${existing.date}`, existing, undefined, 'attendance');
    }
  };

  // WhatsApp
  const sendWhatsAppAlert = (id: string) => {
    const alert = whatsappAlertsRef.current.find(a => a.id === id);
    if (!alert) return;

    const targetPat = patientsRef.current.find(p => p.id === alert.patientId);
    const targetPhone = getPreferredPatientWhatsAppPhone(targetPat) || alert.patientPhone;
    const waUrl = buildWhatsAppUrl(targetPhone, alert.renderedMessage);
    if (waUrl !== '#') {
      window.open(waUrl, '_blank');
    }

    const updated: WhatsAppAlert = { ...alert, status: 'sent', sentAt: new Date().toISOString() };
    const nextAlerts = whatsappAlertsRef.current.map(a => (a.id === id ? updated : a));
    whatsappAlertsRef.current = nextAlerts;
    saveToStorage('alerts', nextAlerts);
    setWhatsappAlerts(nextAlerts);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'whatsapp_alerts',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('status_change', 'patient', alert.patientId, alert.patientName, `إرسال رسالة واتساب (${alert.templateTitle}) للمريض ${alert.patientName}`, alert, updated, 'whatsapp');
  };

  const confirmWhatsAppAlertSent = (id: string) => {
    const alert = whatsappAlertsRef.current.find(a => a.id === id);
    if (!alert) return;

    const updated: WhatsAppAlert = { ...alert, status: 'sent', sentAt: new Date().toISOString() };
    const nextAlerts = whatsappAlertsRef.current.map(a => (a.id === id ? updated : a));
    whatsappAlertsRef.current = nextAlerts;
    saveToStorage('alerts', nextAlerts);
    setWhatsappAlerts(nextAlerts);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'whatsapp_alerts',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('status_change', 'patient', alert.patientId, alert.patientName, `تأكيد إرسال رسالة واتساب (${alert.templateTitle}) للمريض ${alert.patientName}`, alert, updated, 'whatsapp');
  };

  const markWhatsAppAlertOpened = (id: string) => {
    const existing = whatsappAlertsRef.current.find(a => a.id === id);
    const updated = existing ? { ...existing, status: 'opened' as const } : undefined;
    const nextAlerts = whatsappAlertsRef.current.map(a => (a.id === id ? { ...a, status: 'opened' as const } : a));
    whatsappAlertsRef.current = nextAlerts;
    saveToStorage('alerts', nextAlerts);
    setWhatsappAlerts(nextAlerts);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'whatsapp_alerts',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('status_change', 'patient', existing.patientId, existing.patientName, `فتح محادثة واتساب (${existing.templateTitle}) للمريض ${existing.patientName}`, existing, updated, 'whatsapp');
    }
  };

  const dismissWhatsAppAlert = (id: string, noWhatsApp = false) => {
    const existing = whatsappAlertsRef.current.find(a => a.id === id);
    const updated: WhatsAppAlert | undefined = existing
      ? {
          ...existing,
          status: 'dismissed',
          ...(noWhatsApp ? { sentAt: 'no_whatsapp' } : {})
        }
      : undefined;
    const nextAlerts = whatsappAlertsRef.current.map(a =>
      a.id === id
        ? {
            ...a,
            status: 'dismissed' as const,
            ...(noWhatsApp ? { sentAt: 'no_whatsapp' } : {})
          }
        : a
    );
    whatsappAlertsRef.current = nextAlerts;
    saveToStorage('alerts', nextAlerts);
    setWhatsappAlerts(nextAlerts);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'whatsapp_alerts',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (noWhatsApp && existing?.patientId) {
      const targetPat = patientsRef.current.find(p => p.id === existing.patientId);
      const markedPhone = getPreferredPatientWhatsAppPhone(targetPat) || existing.patientPhone;
      if (markedPhone) {
        setPatientPhoneNoWhatsApp(existing.patientId, markedPhone, true);
      }
    }
    if (existing && updated) {
      logAuditAction('status_change', 'patient', existing.patientId, existing.patientName, `${noWhatsApp ? 'تمييز لا يوجد واتساب' : 'تجاهل وإلغاء رسالة واتساب'} (${existing.templateTitle}) للمريض ${existing.patientName}`, existing, updated, 'whatsapp');
    }
  };

  const toggleWhatsAppTemplate = (id: string) => {
    const existing = whatsappTemplatesRef.current.find(t => t.id === id);
    const updated = existing ? { ...existing, isActive: !existing.isActive } : undefined;
    const nextTemplates = whatsappTemplatesRef.current.map(t => (t.id === id ? { ...t, isActive: !t.isActive } : t));
    whatsappTemplatesRef.current = nextTemplates;
    saveToStorage('templates', nextTemplates);
    setWhatsappTemplates(nextTemplates);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'whatsapp_templates',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('status_change', 'setting', id, existing.title, `${updated.isActive ? 'تفعيل' : 'تعطيل'} قالب واتساب: ${existing.title}`, existing, updated, 'whatsapp');
    }
  };

  const addWhatsAppTemplate = (templateData: Omit<WhatsAppTemplate, 'id'>) => {
    const newTmpl: WhatsAppTemplate = {
      ...templateData,
      id: 'tmpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
    };
    const nextTemplates = [...whatsappTemplatesRef.current, newTmpl];
    whatsappTemplatesRef.current = nextTemplates;
    saveToStorage('templates', nextTemplates);
    setWhatsappTemplates(nextTemplates);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'whatsapp_templates',
        docId: newTmpl.id,
        data: newTmpl as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('add', 'setting', newTmpl.id, newTmpl.title, `إضافة قالب واتساب جديد: ${newTmpl.title}`, undefined, newTmpl, 'whatsapp');
  };

  const updateWhatsAppTemplate = (id: string, updates: Partial<WhatsAppTemplate>) => {
    const existing = whatsappTemplatesRef.current.find(t => t.id === id);
    const updated = existing ? { ...existing, ...updates } : undefined;
    const nextTemplates = whatsappTemplatesRef.current.map(t => (t.id === id ? { ...t, ...updates } : t));
    whatsappTemplatesRef.current = nextTemplates;
    saveToStorage('templates', nextTemplates);
    setWhatsappTemplates(nextTemplates);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'whatsapp_templates',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'setting', id, updated.title, `تعديل قالب واتساب: ${updated.title}`, existing, updated, 'whatsapp');
    }
  };

  // Procedures
  const addProcedure = (proc: Omit<ProcedureItem, 'id'>) => {
    const newProc: ProcedureItem = {
      ...proc,
      id: 'proc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
    };
    const nextProcs = [...proceduresRef.current, newProc];
    proceduresRef.current = nextProcs;
    saveToStorage('procedures', nextProcs);
    setProcedures(nextProcs);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'procedures',
        docId: newProc.id,
        data: newProc as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('add', 'procedure', newProc.id, newProc.name, `إضافة خدمة جديدة: ${newProc.name} (${newProc.defaultPrice} ج.م)`, undefined, newProc, 'procedures');
  };

  const updateProcedure = (id: string, updates: Partial<ProcedureItem>) => {
    const existing = proceduresRef.current.find(p => p.id === id);
    const updated = existing ? { ...existing, ...updates } : undefined;
    const nextProcs = proceduresRef.current.map(p => (p.id === id ? { ...p, ...updates } : p));
    proceduresRef.current = nextProcs;
    saveToStorage('procedures', nextProcs);
    setProcedures(nextProcs);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'procedures',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'procedure', id, updated.name, `تعديل سعر/بيانات خدمة: ${updated.name}`, existing, updated, 'procedures');
    }
  };

  const deleteProcedure = (id: string) => {
    const existing = proceduresRef.current.find(p => p.id === id);
    const nextProcs = proceduresRef.current.filter(p => p.id !== id);
    proceduresRef.current = nextProcs;
    saveToStorage('procedures', nextProcs);
    setProcedures(nextProcs);
    dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'procedures', docId: id }]);
    if (existing) {
      logAuditAction('delete', 'procedure', id, existing.name, `حذف خدمة من القائمة: ${existing.name}`, existing, undefined, 'procedures');
    }
  };

  // Operations
  const addOperation = (op: Omit<Operation, 'id' | 'createdAt'>): Operation => {
    const newOp: Operation = {
      ...op,
      id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      createdAt: new Date().toISOString()
    };
    const nextOps = [newOp, ...operationsRef.current];
    operationsRef.current = nextOps;
    setOperations(nextOps);
    dispatchCloudOps([
      { kind: 'overlay', collectionName: 'operations_sync', record: newOp, isDeleted: false }
    ]);
    logAuditAction('add', 'patient', newOp.patientId, newOp.patientName, `إضافة إجراء سريري: ${newOp.name}`, undefined, newOp, 'patient_detail', newOp.patientId);
    return newOp;
  };

  const updateOperation = (id: string, updates: Partial<Operation>) => {
    const existing = operationsRef.current.find(o => o.id === id);
    const updated = existing ? { ...existing, ...updates } : undefined;
    if (updated) {
      const nextOps = operationsRef.current.map(o => (o.id === id ? updated : o));
      operationsRef.current = nextOps;
      setOperations(nextOps);
      dispatchCloudOps([
        { kind: 'overlay', collectionName: 'operations_sync', record: updated, isDeleted: false }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'patient', updated.patientId, updated.patientName, `تعديل إجراء سريري: ${updated.name}`, existing, updated, 'patient_detail', updated.patientId);
    }
  };

  const deleteOperation = (id: string) => {
    const existing = operationsRef.current.find(o => o.id === id);
    const nextOps = operationsRef.current.filter(o => o.id !== id);
    operationsRef.current = nextOps;
    setOperations(nextOps);
    dispatchCloudOps([
      {
        kind: 'overlay',
        collectionName: 'operations_sync',
        record: existing || ({ id } as Operation),
        isDeleted: true
      }
    ]);
    if (existing) {
      logAuditAction('delete', 'patient', existing.patientId, existing.patientName, `حذف إجراء سريري: ${existing.name}`, existing, undefined, 'patient_detail', existing.patientId);
    }
  };

  // Excel Data Import & Export
  const importPatientsFromExcel = (rows: any[]): number => {
    let importedCount = 0;
    const newPatients: Patient[] = [];

    rows.forEach((row, idx) => {
      const name = row['اسم المريض'] || row['الاسم'] || row['name'] || row['Patient Name'] || row['Full Name'] || row['NAME'];
      const phone = row['رقم الموبايل'] || row['الموبايل'] || row['الهاتف'] || row['phone'] || row['Phone'] || row['Mobile'] || row['PHONE'];

      if (name && String(name).trim()) {
        const rawPhone = String(phone || '').replace(/\D/g, '');
        let cleanPhone = rawPhone;
        if (cleanPhone.startsWith('0020')) cleanPhone = cleanPhone.slice(4);
        else if (cleanPhone.startsWith('20') && cleanPhone.length >= 12) cleanPhone = cleanPhone.slice(2);
        if (!cleanPhone.startsWith('0') && cleanPhone.length === 10) cleanPhone = '0' + cleanPhone;

        const billed = Number(row['إجمالي العلاج'] || row['إجمالي الحساب'] || row['Total Billed'] || 0) || 0;
        const paid = Number(row['المسدد'] || row['المدفوع'] || row['Total Paid'] || 0) || 0;
        const remaining = Number(row['المتبقي'] || row['المديونية'] || row['Outstanding'] || (billed - paid)) || 0;

        const newP: Patient = {
          id: 'pat_imp_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 5),
          name: String(name).trim(),
          phone: cleanPhone || '01000000000',
          secondaryPhone: String(row['رقم إضافي'] || row['هاتف آخر'] || row['Secondary Phone'] || ''),
          age: Number(row['السن'] || row['العمر'] || row['Age'] || row['age']) || undefined,
          gender: (row['النوع'] || row['الجنس'] || row['Gender']) === 'ذكر' ? 'ذكر' : 'أنثى',
          referralSource: String(row['المصدر'] || row['مصدر المعرفة'] || row['Source'] || ''),
          tags: [],
          followUpStatus: String(row['حالة المتابعة'] || '').trim(),
          registeredDate: String(row['تاريخ التسجيل'] || row['Date'] || getTodayDateString()),
          totalBilled: billed,
          totalPaid: paid,
          outstandingBalance: Math.max(0, remaining),
          palmerTeeth: [],
          notes: [],
          address: String(row['العنوان'] || row['Address'] || '')
        };

        newPatients.push(newP);
        importedCount++;
      }
    });

    if (newPatients.length > 0) {
      const nextPatients = [...newPatients, ...patientsRef.current];
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
      dispatchCloudOps(
        newPatients.map(record => ({
          kind: 'overlay' as const,
          collectionName: 'patients_sync' as const,
          record,
          isDeleted: false
        }))
      );
      logAuditAction(
        'add',
        'patient',
        'excel_import_' + Date.now(),
        'استيراد مرضى Excel',
        `تم استيراد ${importedCount} مريض من ملف Excel`,
        undefined,
        { importedCount },
        'patients'
      );
    }
    return importedCount;
  };

  const exportDataToExcel = async (type: 'patients' | 'invoices' | 'payments' | 'operations' | 'all') => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    if (type === 'patients' || type === 'all') {
      const patientRows = patients.map(p => ({
        'كود المريض': p.id,
        'اسم المريض': p.name,
        'رقم الموبايل': p.phone,
        'رقم إضافي': p.secondaryPhone || '',
        'السن': p.age || '',
        'النوع': p.gender || '',
        'المصدر': p.referralSource || '',
        'حالة المتابعة': p.followUpStatus,
        'إجمالي العلاج': p.totalBilled,
        'المسدد': p.totalPaid,
        'المتبقي': p.outstandingBalance,
        'تاريخ التسجيل': p.registeredDate,
        'العنوان': p.address || ''
      }));
      const ws = XLSX.utils.json_to_sheet(patientRows);
      XLSX.utils.book_append_sheet(wb, ws, 'سجلات المرضى');
    }

    if (type === 'invoices' || type === 'all') {
      const invoiceRows = invoices.map(i => ({
        'رقم الفاتورة': i.invoiceNumber,
        'اسم المريض': i.patientName,
        'التاريخ': i.date,
        'إجمالي الخدمات': i.subtotal,
        'قيمة الخصم': i.discountAmount,
        'الصافي المستحق': i.netTotal,
        'المسدد': i.paidAmount,
        'المتبقي': i.outstandingBalance,
        'الحالة': i.status === 'paid' ? 'خالص' : i.status === 'partial' ? 'سداد جزئي' : 'مستحق بالكامل'
      }));
      const ws = XLSX.utils.json_to_sheet(invoiceRows);
      XLSX.utils.book_append_sheet(wb, ws, 'فواتير العلاج');
    }

    if (type === 'payments' || type === 'all') {
      const paymentRows = payments.map(p => ({
        'رقم السند': p.receiptNumber,
        'رقم الفاتورة': p.invoiceNumber || '',
        'اسم المريض': p.patientName,
        'المبلغ المسدد': p.amount,
        'طريقة الدفع': p.paymentMethod === 'cash' ? 'كاش نقدي' : p.paymentMethod === 'card' ? 'فيزا' : p.paymentMethod === 'wallet' ? 'فودافون كاش' : 'تحويل بنكي',
        'التاريخ': p.date,
        'المستلم': p.receivedBy,
        'ملاحظات': p.notes || ''
      }));
      const ws = XLSX.utils.json_to_sheet(paymentRows);
      XLSX.utils.book_append_sheet(wb, ws, 'سندات القبض');
    }

    if (type === 'operations' || type === 'all') {
      const operationRows = operations.map(o => ({
        'كود العملية': o.id,
        'اسم العملية': o.name,
        'اسم المريض': o.patientName,
        'التاريخ': o.date,
        'الحالة': o.status
      }));
      const ws = XLSX.utils.json_to_sheet(operationRows);
      XLSX.utils.book_append_sheet(wb, ws, 'العمليات');
    }

    XLSX.writeFile(wb, `ClinicFlow_DrShlkamy_${type}_${getTodayDateString()}.xlsx`);
    logAuditAction(
      'add',
      'setting',
      'excel_export_' + Date.now(),
      'تصدير بيانات Excel',
      `تصدير بيانات (${type}) إلى ملف Excel`,
      undefined,
      { type },
      'excel_import'
    );
  };

  // Weekdays
  const updateWeekdaySetting = (dayOfWeek: number, updates: Partial<WeekdaySetting>) => {
    const existing = weekdaySettingsRef.current.find(w => w.dayOfWeek === dayOfWeek);
    const next = weekdaySettingsRef.current.map(w => (w.dayOfWeek === dayOfWeek ? { ...w, ...updates } : w));
    const updated = next.find(w => w.dayOfWeek === dayOfWeek);
    weekdaySettingsRef.current = next;
    setWeekdaySettings(next);
    syncClinicConfigToCloud({ weekdaySettings: next });
    if (existing && updated) {
      logAuditAction('update', 'setting', `weekday_${dayOfWeek}`, existing.dayName, `تعديل إعدادات دوام يوم ${existing.dayName}`, existing, updated, 'settings');
    }
  };

  // Clinic Units & Medical Chairs
  const addUnit = (unitData: Omit<ClinicUnit, 'id'>): ClinicUnit => {
    const newUnit: ClinicUnit = {
      ...unitData,
      id: 'unit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
    };
    const nextUnits = [...unitsRef.current, newUnit];
    unitsRef.current = nextUnits;
    saveToStorage('units', nextUnits);
    setUnits(nextUnits);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'units',
        docId: newUnit.id,
        data: newUnit as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('add', 'setting', newUnit.id, newUnit.name, `إضافة فرع/عيادة جديدة: ${newUnit.name}`, undefined, newUnit, 'settings');
    return newUnit;
  };

  const updateUnit = (id: string, updates: Partial<ClinicUnit>) => {
    const existing = unitsRef.current.find(u => u.id === id);
    const updated = existing ? { ...existing, ...updates } : undefined;
    const nextUnits = unitsRef.current.map(u => (u.id === id ? { ...u, ...updates } : u));
    unitsRef.current = nextUnits;
    saveToStorage('units', nextUnits);
    setUnits(nextUnits);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'units',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'setting', id, updated.name, `تعديل إعدادات الفرع/الوحدة: ${updated.name}`, existing, updated, 'settings');
    }
  };

  const toggleUnitDisabled = (id: string) => {
    const existing = unitsRef.current.find(u => u.id === id);
    const updated = existing ? { ...existing, isDisabled: !existing.isDisabled } : undefined;
    const nextUnits = unitsRef.current.map(u => (u.id === id ? { ...u, isDisabled: !u.isDisabled } : u));
    unitsRef.current = nextUnits;
    saveToStorage('units', nextUnits);
    setUnits(nextUnits);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'units',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('status_change', 'setting', id, existing.name, `${updated.isDisabled ? 'تعطيل' : 'تفعيل'} الفرع: ${existing.name}`, existing, updated, 'settings');
    }
  };

  const deleteUnit = (id: string) => {
    const existing = unitsRef.current.find(u => u.id === id);
    const nextUnits = unitsRef.current.filter(u => u.id !== id);
    unitsRef.current = nextUnits;
    saveToStorage('units', nextUnits);
    setUnits(nextUnits);
    dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'units', docId: id }]);
    if (existing) {
      logAuditAction('delete', 'setting', id, existing.name, `حذف الفرع/الوحدة: ${existing.name}`, existing, undefined, 'settings');
    }
  };

  // Doctors Roster
  const addDoctor = (doctorData: Omit<Doctor, 'id'>): Doctor => {
    const newDoc: Doctor = {
      ...doctorData,
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
    };
    const nextDocs = [...doctorsRef.current, newDoc];
    doctorsRef.current = nextDocs;
    saveToStorage('doctors', nextDocs);
    setDoctors(nextDocs);
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'doctors',
        docId: newDoc.id,
        data: newDoc as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('add', 'staff', newDoc.id, newDoc.name, `إضافة طبيب جديد: ${newDoc.name}`, undefined, newDoc, 'settings');
    return newDoc;
  };

  const updateDoctor = (id: string, updates: Partial<Doctor>) => {
    const existing = doctorsRef.current.find(d => d.id === id);
    const updated = existing ? { ...existing, ...updates } : undefined;
    const nextDocs = doctorsRef.current.map(d => (d.id === id ? { ...d, ...updates } : d));
    doctorsRef.current = nextDocs;
    saveToStorage('doctors', nextDocs);
    setDoctors(nextDocs);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'doctors',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'staff', id, updated.name, `تعديل بيانات الطبيب: ${updated.name}`, existing, updated, 'settings');
    }
  };

  const toggleDoctorDisabled = (id: string) => {
    const existing = doctorsRef.current.find(d => d.id === id);
    const updated = existing ? { ...existing, isDisabled: !existing.isDisabled } : undefined;
    const nextDocs = doctorsRef.current.map(d => (d.id === id ? { ...d, isDisabled: !d.isDisabled } : d));
    doctorsRef.current = nextDocs;
    saveToStorage('doctors', nextDocs);
    setDoctors(nextDocs);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'doctors',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('status_change', 'staff', id, existing.name, `${updated.isDisabled ? 'تعطيل' : 'تفعيل'} الطبيب: ${existing.name}`, existing, updated, 'settings');
    }
  };

  const deleteDoctor = (id: string) => {
    const existing = doctorsRef.current.find(d => d.id === id);
    const nextDocs = doctorsRef.current.filter(d => d.id !== id);
    doctorsRef.current = nextDocs;
    saveToStorage('doctors', nextDocs);
    setDoctors(nextDocs);
    dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'doctors', docId: id }]);
    if (existing) {
      logAuditAction('delete', 'staff', id, existing.name, `حذف الطبيب: ${existing.name}`, existing, undefined, 'settings');
    }
  };

  const markUnsyncedStaffId = (id: string) => {
    const existing = loadFromStorage<string[]>('unsynced_staff_ids', []);
    const list = Array.isArray(existing) ? existing : [];
    if (!list.includes(id)) {
      saveToStorage('unsynced_staff_ids', [...list, id]);
    }
  };

  // Staff Members & Granular RBAC Permissions
  const addStaffMember = (memberData: Omit<StaffMember, 'id'>): StaffMember => {
    const newMember: StaffMember = {
      ...memberData,
      username: memberData.username?.trim(),
      password: memberData.password?.trim(),
      email: memberData.email?.trim() || undefined,
      recoveryPin: memberData.recoveryPin?.trim() || undefined,
      id: 'staff_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
    };
    const nextStaff = [...staffMembersRef.current, newMember];
    staffMembersRef.current = nextStaff;
    saveToStorage('staff_members', nextStaff);
    setStaffMembers(nextStaff);
    if (!cloudUserRef.current) {
      markUnsyncedStaffId(newMember.id);
    }
    dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_members',
        docId: newMember.id,
        data: newMember as unknown as Record<string, unknown>
      }
    ]);
    logAuditAction('add', 'staff', newMember.id, newMember.name, `إضافة موظف جديد: ${newMember.name}`, undefined, newMember, 'settings');
    return newMember;
  };

  const updateStaffMember = (id: string, updates: Partial<StaffMember>) => {
    const cleanUpdates: Partial<StaffMember> = { ...updates };
    if (typeof cleanUpdates.username === 'string') cleanUpdates.username = cleanUpdates.username.trim();
    if (typeof cleanUpdates.password === 'string') cleanUpdates.password = cleanUpdates.password.trim();
    if (typeof cleanUpdates.email === 'string') cleanUpdates.email = cleanUpdates.email.trim() || undefined;
    if (typeof cleanUpdates.recoveryPin === 'string') cleanUpdates.recoveryPin = cleanUpdates.recoveryPin.trim() || undefined;

    const existing = staffMembersRef.current.find(s => s.id === id);
    const updated = existing ? { ...existing, ...cleanUpdates } : undefined;
    const nextStaff = staffMembersRef.current.map(s => (s.id === id ? { ...s, ...cleanUpdates } : s));
    staffMembersRef.current = nextStaff;
    saveToStorage('staff_members', nextStaff);
    setStaffMembers(nextStaff);
    if (updated) {
      if (!cloudUserRef.current) {
        markUnsyncedStaffId(updated.id);
      }
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'staff_members',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'staff', id, updated.name, `تعديل بيانات الموظف: ${updated.name}`, existing, updated, 'settings');
    }
  };

  const toggleStaffDisabled = (id: string) => {
    if (id === currentUser.id) return;
    const existing = staffMembersRef.current.find(s => s.id === id);
    const updated = existing ? { ...existing, isDisabled: !existing.isDisabled } : undefined;
    const nextStaff = staffMembersRef.current.map(s => (s.id === id ? { ...s, isDisabled: !s.isDisabled } : s));
    staffMembersRef.current = nextStaff;
    saveToStorage('staff_members', nextStaff);
    setStaffMembers(nextStaff);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'staff_members',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('status_change', 'staff', id, existing.name, `${updated.isDisabled ? 'تعطيل' : 'تفعيل'} حساب الموظف: ${existing.name}`, existing, updated, 'settings');
    }
  };

  const deleteStaffMember = (id: string) => {
    if (id === currentUser.id) return;
    const existing = staffMembersRef.current.find(s => s.id === id);
    const nextStaff = staffMembersRef.current.filter(s => s.id !== id);
    staffMembersRef.current = nextStaff;
    saveToStorage('staff_members', nextStaff);
    setStaffMembers(nextStaff);

    const ops: PendingCloudOpInput[] = [
      { kind: 'doc_delete', collectionName: 'staff_members', docId: id }
    ];

    // Silently close any open or awaiting-midnight-review attendance records for this deleted employee
    const affectedAttendanceIds = new Set<string>();
    const updatedAttendanceMap = new Map<string, AttendanceRecord>();
    attendanceRef.current.forEach(rec => {
      if (rec.userId === id) {
        affectedAttendanceIds.add(rec.id);
        if (rec.status === 'active' || isMidnightAutoEndedAttendance(rec)) {
          const closed: AttendanceRecord = {
            ...rec,
            status: 'completed',
            clockOut: rec.clockOut || '00:00',
            isManual: true,
            manualReason: 'إغلاق تلقائي بعد حذف حساب الموظف'
          };
          updatedAttendanceMap.set(rec.id, closed);
          ops.push({
            kind: 'doc_upsert',
            collectionName: 'attendance',
            docId: closed.id,
            data: closed as unknown as Record<string, unknown>
          });
        }
      }
    });

    if (updatedAttendanceMap.size > 0) {
      const nextAtt = attendanceRef.current.map(r => updatedAttendanceMap.get(r.id) || r);
      attendanceRef.current = nextAtt;
      saveToStorage('attendance', nextAtt);
      setAttendance(nextAtt);
    }

    // Remove any active shift_auto_end_* alert logs tied to this deleted employee
    if (affectedAttendanceIds.size > 0) {
      const staleAlertIds: string[] = [];
      staffAlertLogsRef.current.forEach(l => {
        if (l.targetKey?.startsWith('shift_auto_end_')) {
          const recId = l.targetKey.slice('shift_auto_end_'.length);
          if (affectedAttendanceIds.has(recId)) {
            staleAlertIds.push(l.id);
          }
        }
      });
      if (staleAlertIds.length > 0) {
        const staleSet = new Set(staleAlertIds);
        const nextLogs = staffAlertLogsRef.current.filter(l => !staleSet.has(l.id));
        staffAlertLogsRef.current = nextLogs;
        saveToStorage('staff_alert_logs', nextLogs);
        setStaffAlertLogs(nextLogs);
        staleAlertIds.forEach(logId => {
          ops.push({ kind: 'doc_delete', collectionName: 'staff_alert_logs', docId: logId });
        });
      }
    }

    dispatchCloudOps(ops);
    if (existing) {
      logAuditAction('delete', 'staff', id, existing.name, `حذف حساب الموظف: ${existing.name}`, existing, undefined, 'settings');
    }
  };

  const updateStaffPermission = (id: string, key: keyof StaffPermissions, value: boolean) => {
    // Prevent removing manageSettings from the currently logged-in admin if no other active member has it
    if (id === currentUser.id && key === 'manageSettings' && !value) {
      const anotherAdminExists = staffMembersRef.current.some(
        s => s.id !== id && !s.isDisabled && s.permissions.manageSettings
      );
      if (!anotherAdminExists) return;
    }
    const existing = staffMembersRef.current.find(s => s.id === id);
    const updated = existing ? { ...existing, permissions: { ...existing.permissions, [key]: value } } : undefined;
    const nextStaff = staffMembersRef.current.map(s =>
      s.id === id ? { ...s, permissions: { ...s.permissions, [key]: value } } : s
    );
    staffMembersRef.current = nextStaff;
    saveToStorage('staff_members', nextStaff);
    setStaffMembers(nextStaff);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'staff_members',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'staff', id, existing.name, `تحديث صلاحية (${key}) للموظف ${existing.name}`, existing, updated, 'settings');
    }
  };

  const applyRolePresetPermissions = (id: string, role: StaffRole) => {
    const preset = { ...DEFAULT_ROLE_PERMISSIONS[role] };
    if (id === currentUser.id && !preset.manageSettings) {
      const anotherAdminExists = staffMembersRef.current.some(
        s => s.id !== id && !s.isDisabled && s.permissions.manageSettings
      );
      if (!anotherAdminExists) {
        preset.manageSettings = true;
      }
    }
    const existing = staffMembersRef.current.find(s => s.id === id);
    const updated = existing ? { ...existing, role, permissions: preset } : undefined;
    const nextStaff = staffMembersRef.current.map(s => (s.id === id ? { ...s, role, permissions: preset } : s));
    staffMembersRef.current = nextStaff;
    saveToStorage('staff_members', nextStaff);
    setStaffMembers(nextStaff);
    if (updated) {
      dispatchCloudOps([
        {
          kind: 'doc_upsert',
          collectionName: 'staff_members',
          docId: updated.id,
          data: updated as unknown as Record<string, unknown>
        }
      ]);
    }
    if (existing && updated) {
      logAuditAction('update', 'staff', id, existing.name, `تطبيق صلاحيات دور (${STAFF_ROLE_LABELS[role]}) للموظف ${existing.name}`, existing, updated, 'settings');
    }
  };

  const setListItemColor = (listKey: ClinicColorListKey, itemName: string, color?: string) => {
    const trimmedName = itemName.trim();
    if (!trimmedName) return;
    const prevColor = listItemColorsRef.current[listKey]?.[trimmedName];
    const prevMap = { ...(listItemColorsRef.current[listKey] || {}) };
    if (color && color.trim()) {
      prevMap[trimmedName] = color.trim().toLowerCase();
    } else {
      delete prevMap[trimmedName];
    }
    const next: ClinicListItemColors = {
      ...listItemColorsRef.current,
      [listKey]: prevMap
    };
    listItemColorsRef.current = next;
    setListItemColors(next);
    syncClinicConfigToCloud({ listItemColors: next });
    logAuditAction('update', 'setting', `color_${listKey}_${trimmedName}`, trimmedName, `تعديل لون عنصر (${trimmedName}) في قائمة (${listKey})`, { color: prevColor }, { color }, 'settings');
  };

  const migrateListColorRename = (
    listKey: ClinicColorListKey,
    oldName: string,
    newName: string
  ): ClinicListItemColors | undefined => {
    const currentMap = listItemColorsRef.current[listKey];
    if (!currentMap || !currentMap[oldName]) return undefined;
    const updatedMap = { ...currentMap };
    const existingColor = updatedMap[oldName];
    delete updatedMap[oldName];
    if (newName && !updatedMap[newName]) {
      updatedMap[newName] = existingColor;
    }
    const next: ClinicListItemColors = {
      ...listItemColorsRef.current,
      [listKey]: updatedMap
    };
    listItemColorsRef.current = next;
    setListItemColors(next);
    return next;
  };

  const removeListColorKey = (listKey: ClinicColorListKey, name: string): ClinicListItemColors | undefined => {
    const currentMap = listItemColorsRef.current[listKey];
    if (!currentMap || !currentMap[name]) return undefined;
    const updatedMap = { ...currentMap };
    delete updatedMap[name];
    const next: ClinicListItemColors = {
      ...listItemColorsRef.current,
      [listKey]: updatedMap
    };
    listItemColorsRef.current = next;
    setListItemColors(next);
    return next;
  };

  // Referral Sources & Patient Required Fields Settings
  const addReferralSource = (source: string) => {
    const trimmed = source.trim();
    if (!trimmed) return;
    if (referralSourcesRef.current.some(s => s.trim().toLowerCase() === trimmed.toLowerCase())) return;
    const next = [...referralSourcesRef.current, trimmed];
    referralSourcesRef.current = next;
    setReferralSources(next);
    syncClinicConfigToCloud({ referralSources: next });
    logAuditAction('add', 'setting', `referral_${trimmed}`, trimmed, `إضافة مصدر معرفة: ${trimmed}`, undefined, { name: trimmed }, 'settings');
  };

  const updateReferralSource = (oldSource: string, newSource: string) => {
    const trimmed = newSource.trim();
    if (!trimmed) return;
    const next = referralSourcesRef.current.map(s => (s === oldSource ? trimmed : s));
    referralSourcesRef.current = next;
    setReferralSources(next);
    const nextColors = migrateListColorRename('referralSources', oldSource, trimmed);
    syncClinicConfigToCloud({ referralSources: next, ...(nextColors ? { listItemColors: nextColors } : {}) });
    logAuditAction('update', 'setting', `referral_${trimmed}`, trimmed, `تعديل مصدر معرفة من "${oldSource}" إلى "${trimmed}"`, { name: oldSource }, { name: trimmed }, 'settings');
  };

  const deleteReferralSource = (source: string) => {
    const existed = referralSourcesRef.current.includes(source);
    const next = referralSourcesRef.current.filter(s => s !== source);
    referralSourcesRef.current = next;
    setReferralSources(next);
    const nextColors = removeListColorKey('referralSources', source);
    syncClinicConfigToCloud({ referralSources: next, ...(nextColors ? { listItemColors: nextColors } : {}) });
    if (existed) {
      logAuditAction('delete', 'setting', `referral_${source}`, source, `تم حذف مصدر معرفة العيادة: ${source}`, { name: source }, undefined, 'settings');
    }
  };

  const reorderReferralSources = (ordered: string[]) => {
    if (!Array.isArray(ordered)) return;
    referralSourcesRef.current = ordered;
    setReferralSources(ordered);
    syncClinicConfigToCloud({ referralSources: ordered });
    logAuditAction('update', 'setting', 'referral_reorder', 'مصادر المعرفة', 'إعادة ترتيب مصادر المعرفة', undefined, { ordered }, 'settings');
  };

  // Patient Tags Settings (with cascading rename/delete across patient records)
  const addPatientTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (patientTagsRef.current.some(t => t.trim().toLowerCase() === trimmed.toLowerCase())) return;
    const next = [...patientTagsRef.current, trimmed];
    patientTagsRef.current = next;
    setPatientTags(next);
    syncClinicConfigToCloud({ patientTags: next });
    logAuditAction('add', 'setting', `tag_${trimmed}`, `#${trimmed}`, `إضافة وسم / تاج مريض: #${trimmed}`, undefined, { name: trimmed }, 'settings');
  };

  const updatePatientTag = async (oldTag: string, newTag: string): Promise<void> => {
    const trimmed = newTag.trim();
    if (!trimmed || trimmed === oldTag) return;
    const exists = patientTagsRef.current.some(t => t !== oldTag && t.trim().toLowerCase() === trimmed.toLowerCase());
    const nextTags = exists
      ? patientTagsRef.current.filter(t => t !== oldTag)
      : patientTagsRef.current.map(t => (t === oldTag ? trimmed : t));
    patientTagsRef.current = nextTags;
    setPatientTags(nextTags);

    const nextColors = migrateListColorRename('patientTags', oldTag, trimmed);
    const configWrite = syncClinicConfigToCloud({
      patientTags: nextTags,
      ...(nextColors ? { listItemColors: nextColors } : {})
    });
    logAuditAction('update', 'setting', `tag_${trimmed}`, `#${trimmed}`, `تعديل وسم / تاج المريض من #${oldTag} إلى #${trimmed}`, { name: oldTag }, { name: trimmed }, 'settings');

    const archive = await ensureArchiveLoaded();
    const basePatients = patientsRef.current.length > 0 ? patientsRef.current : archive.patients;
    const affectedPatients: Patient[] = [];
    const nextPatients = basePatients.map(p => {
      if (!p.tags?.includes(oldTag)) return p;
      const replaced = p.tags.map(t => (t === oldTag ? trimmed : t));
      const updated = { ...p, tags: Array.from(new Set(replaced)) };
      affectedPatients.push(updated);
      return updated;
    });
    if (affectedPatients.length > 0) {
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
    }

    const overlayWrite =
      affectedPatients.length > 0
        ? dispatchCloudOps(
            affectedPatients.map(record => ({
              kind: 'overlay' as const,
              collectionName: 'patients_sync' as const,
              record,
              isDeleted: false
            }))
          )
        : Promise.resolve();

    await Promise.all([configWrite, overlayWrite]);
  };

  const deletePatientTag = async (tag: string): Promise<void> => {
    const nextTags = patientTagsRef.current.filter(t => t !== tag);
    patientTagsRef.current = nextTags;
    setPatientTags(nextTags);
    const nextColors = removeListColorKey('patientTags', tag);
    const configWrite = syncClinicConfigToCloud({
      patientTags: nextTags,
      ...(nextColors ? { listItemColors: nextColors } : {})
    });

    logAuditAction('delete', 'setting', `tag_${tag}`, `#${tag}`, `تم حذف وسم / تاج المريض: #${tag}`, { name: tag }, undefined, 'settings');

    const nextTagsSet = new Set(nextTags);
    const archive = await ensureArchiveLoaded();
    const basePatients = patientsRef.current.length > 0 ? patientsRef.current : archive.patients;
    const affectedPatients: Patient[] = [];
    const nextPatients = basePatients.map(p => {
      if (!p.tags || p.tags.length === 0) return p;
      const filtered = p.tags.filter(t => t !== tag && nextTagsSet.has(t));
      if (filtered.length === p.tags.length) return p;
      const updated = { ...p, tags: filtered };
      affectedPatients.push(updated);
      return updated;
    });
    if (affectedPatients.length > 0) {
      patientsRef.current = nextPatients;
      setPatients(nextPatients);
    }

    const overlayWrite =
      affectedPatients.length > 0
        ? dispatchCloudOps(
            affectedPatients.map(record => ({
              kind: 'overlay' as const,
              collectionName: 'patients_sync' as const,
              record,
              isDeleted: false
            }))
          )
        : Promise.resolve();

    await Promise.all([configWrite, overlayWrite]);
  };

  const reorderPatientTags = (ordered: string[]) => {
    if (!Array.isArray(ordered)) return;
    patientTagsRef.current = ordered;
    setPatientTags(ordered);
    syncClinicConfigToCloud({ patientTags: ordered });
    logAuditAction('update', 'setting', 'tags_reorder', 'أوسمة المرضى', 'إعادة ترتيب أوسمة المرضى', undefined, { ordered }, 'settings');
  };

  const updatePatientRequiredFields = (updates: Partial<PatientFieldRequirements>) => {
    const prev = patientRequiredFieldsRef.current;
    const next = { ...prev, ...updates };
    patientRequiredFieldsRef.current = next;
    setPatientRequiredFields(next);
    syncClinicConfigToCloud({ patientRequiredFields: next });
    logAuditAction('update', 'setting', 'required_fields', 'الحقول الإلزامية', 'تعديل الحقول الإلزامية في ملف المريض', prev, next, 'settings');
  };

  // Expense Categories Settings (with optional default price)
  const addExpenseCategory = (name: string, defaultAmount?: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (expenseCategoriesRef.current.some(c => c.name.trim().toLowerCase() === trimmed.toLowerCase())) return;
    const amt = Number(defaultAmount);
    const nextItem: ExpenseCategoryItem =
      defaultAmount !== undefined && !isNaN(amt) && amt > 0 ? { name: trimmed, defaultAmount: amt } : { name: trimmed };
    const next = [...expenseCategoriesRef.current, nextItem];
    expenseCategoriesRef.current = next;
    setExpenseCategories(next);
    syncClinicConfigToCloud({ expenseCategories: next });
    logAuditAction('add', 'setting', `expcat_${trimmed}`, trimmed, `إضافة تصنيف مصروفات: ${trimmed}`, undefined, nextItem, 'settings');
  };

  const updateExpenseCategory = (oldName: string, newName: string, defaultAmount?: number) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const amt = Number(defaultAmount);
    const nextAmt = defaultAmount !== undefined && !isNaN(amt) && amt > 0 ? amt : undefined;
    const duplicate = expenseCategoriesRef.current.some(
      c => c.name !== oldName && c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    const next = duplicate
      ? expenseCategoriesRef.current.filter(c => c.name !== oldName)
      : expenseCategoriesRef.current.map(c =>
          c.name === oldName ? (nextAmt !== undefined ? { name: trimmed, defaultAmount: nextAmt } : { name: trimmed }) : c
        );
    expenseCategoriesRef.current = next;
    setExpenseCategories(next);
    const nextColors = migrateListColorRename('expenseCategories', oldName, trimmed);
    syncClinicConfigToCloud({ expenseCategories: next, ...(nextColors ? { listItemColors: nextColors } : {}) });
    logAuditAction('update', 'setting', `expcat_${trimmed}`, trimmed, `تعديل تصنيف مصروفات من "${oldName}" إلى "${trimmed}"`, { name: oldName }, { name: trimmed, defaultAmount: nextAmt }, 'settings');

    if (trimmed !== oldName) {
      const affectedExpenses: Expense[] = [];
      const nextExpenses = expensesRef.current.map(exp => {
        if (exp.category !== oldName) return exp;
        const updated: Expense = {
          ...exp,
          category: trimmed,
          title: exp.title === oldName ? trimmed : exp.title
        };
        affectedExpenses.push(updated);
        return updated;
      });
      if (affectedExpenses.length > 0) {
        expensesRef.current = nextExpenses;
        saveToStorage('expenses', nextExpenses);
        setExpenses(nextExpenses);
        void dispatchCloudOps(
          affectedExpenses.map(exp => ({
            kind: 'doc_upsert' as const,
            collectionName: 'expenses',
            docId: exp.id,
            data: exp as unknown as Record<string, unknown>
          }))
        );
      }
    }
  };

  const deleteExpenseCategory = (name: string) => {
    const existed = expenseCategoriesRef.current.some(c => c.name === name);
    const next = expenseCategoriesRef.current.filter(c => c.name !== name);
    const safeNext = next.length > 0 ? next : [{ name: 'أخرى' }];
    expenseCategoriesRef.current = safeNext;
    setExpenseCategories(safeNext);
    const nextColors = removeListColorKey('expenseCategories', name);
    syncClinicConfigToCloud({ expenseCategories: safeNext, ...(nextColors ? { listItemColors: nextColors } : {}) });
    if (existed) {
      logAuditAction('delete', 'setting', `expcat_${name}`, name, `تم حذف تصنيف مصروفات العيادة: ${name}`, { name }, undefined, 'settings');
    }
  };

  const reorderExpenseCategories = (ordered: ExpenseCategoryItem[]) => {
    if (!Array.isArray(ordered) || ordered.length === 0) return;
    expenseCategoriesRef.current = ordered;
    setExpenseCategories(ordered);
    saveToStorage('expense_categories', ordered);
    syncClinicConfigToCloud({ expenseCategories: ordered });
    logAuditAction('update', 'setting', 'expcat_reorder', 'تصنيفات المصروفات', 'إعادة ترتيب تصنيفات المصروفات', undefined, { count: ordered.length }, 'settings');
  };

  // Patient Follow-Up Statuses CRUD
  const addPatientFollowUpStatus = (status: string) => {
    const trimmed = status.trim();
    if (!trimmed) return;
    if (patientFollowUpStatusesRef.current.some(s => s.trim().toLowerCase() === trimmed.toLowerCase())) return;
    const next = [...patientFollowUpStatusesRef.current, trimmed];
    patientFollowUpStatusesRef.current = next;
    setPatientFollowUpStatuses(next);
    syncClinicConfigToCloud({ patientFollowUpStatuses: next });
    logAuditAction('add', 'setting', `fustatus_${trimmed}`, trimmed, `إضافة حالة متابعة مريض: ${trimmed}`, undefined, { name: trimmed }, 'settings');
  };

  const updatePatientFollowUpStatus = (oldStatus: string, newStatus: string) => {
    const trimmed = newStatus.trim();
    if (!trimmed || trimmed === oldStatus) return;
    const duplicate = patientFollowUpStatusesRef.current.some(
      s => s !== oldStatus && s.trim().toLowerCase() === trimmed.toLowerCase()
    );
    const next = duplicate
      ? patientFollowUpStatusesRef.current.filter(s => s !== oldStatus)
      : patientFollowUpStatusesRef.current.map(s => (s === oldStatus ? trimmed : s));
    patientFollowUpStatusesRef.current = next;
    setPatientFollowUpStatuses(next);
    const nextColors = migrateListColorRename('followUpStatuses', oldStatus, trimmed);
    syncClinicConfigToCloud({ patientFollowUpStatuses: next, ...(nextColors ? { listItemColors: nextColors } : {}) });
    logAuditAction('update', 'setting', `fustatus_${trimmed}`, trimmed, `تعديل حالة متابعة مريض من "${oldStatus}" إلى "${trimmed}"`, { name: oldStatus }, { name: trimmed }, 'settings');
  };

  const deletePatientFollowUpStatus = (status: string) => {
    const next = patientFollowUpStatusesRef.current.filter(s => s !== status);
    patientFollowUpStatusesRef.current = next;
    setPatientFollowUpStatuses(next);
    const nextColors = removeListColorKey('followUpStatuses', status);
    syncClinicConfigToCloud({ patientFollowUpStatuses: next, ...(nextColors ? { listItemColors: nextColors } : {}) });
    logAuditAction('delete', 'setting', `fustatus_${status}`, status, `تم حذف حالة متابعة مريض: ${status}`, { name: status }, undefined, 'settings');
  };

  const reorderPatientFollowUpStatuses = (ordered: string[]) => {
    if (!Array.isArray(ordered) || ordered.length === 0) return;
    patientFollowUpStatusesRef.current = ordered;
    setPatientFollowUpStatuses(ordered);
    saveToStorage('patient_follow_up_statuses', ordered);
    syncClinicConfigToCloud({ patientFollowUpStatuses: ordered });
    logAuditAction('update', 'setting', 'fustatus_reorder', 'حالات المتابعة', 'إعادة ترتيب حالات متابعة المرضى', undefined, { ordered }, 'settings');
  };

  // Patient Follow-Up Status Change + Log Management
  const changePatientFollowUpStatus = (
    patientId: string,
    newStatus: string,
    notesOrOptions?:
      | string
      | {
          notes?: string;
          audioDataUrl?: string;
          audioDurationSeconds?: number;
          feedbackOutcome?: 'done' | 'not_done';
          feedbackDate?: string;
          taskType?: 'feedback' | 'finished_work';
          finishedWorkAction?: FinishedWorkActionType;
          finishedWorkAttempt?: number;
          snoozeUntilDate?: string;
          actionDate?: string;
          addTags?: string[];
          removeTags?: string[];
          keepCurrentStatus?: boolean;
        }
  ): string | undefined => {
    const existingPat = patientsRef.current.find(p => p.id === patientId);
    if (!existingPat) return undefined;

    const opts =
      typeof notesOrOptions === 'string'
        ? { notes: notesOrOptions }
        : notesOrOptions || {};

    const prevStatus = existingPat.followUpStatus || 'غير محدد';
    const effectiveNewStatus = opts.keepCurrentStatus ? prevStatus : newStatus;

    if (
      prevStatus === effectiveNewStatus &&
      !opts.feedbackOutcome &&
      !opts.taskType &&
      (!opts.addTags || opts.addTags.length === 0) &&
      (!opts.removeTags || opts.removeTags.length === 0)
    ) {
      return undefined;
    }

    const activeStaff = resolveActiveStaffFromRefs();

    const effectiveAddTags = (opts.addTags || []).filter(t => !REMOVED_LEGACY_STATUS_TAGS.has(t));
    const effectiveRemoveTags = [...(opts.removeTags || [])];

    if (effectiveAddTags.length > 0) {
      const missingTags = effectiveAddTags.filter(t => t && !patientTagsRef.current.includes(t));
      if (missingTags.length > 0) {
        const mergedTagsList = [...patientTagsRef.current, ...missingTags];
        patientTagsRef.current = mergedTagsList;
        setPatientTags(mergedTagsList);
        saveToStorage('patient_tags', mergedTagsList);
        syncClinicConfigToCloud({ patientTags: mergedTagsList });
      }
    }

    const currentTags = existingPat.tags || [];
    let nextTags = currentTags.filter(t => !REMOVED_LEGACY_STATUS_TAGS.has(t));
    if (effectiveRemoveTags.length > 0) {
      const removeSet = new Set(effectiveRemoveTags);
      nextTags = nextTags.filter(t => !removeSet.has(t));
    }
    if (effectiveAddTags.length > 0) {
      effectiveAddTags.forEach(t => {
        if (t && !nextTags.includes(t)) {
          nextTags.push(t);
        }
      });
    }

    const statusActuallyChanged = effectiveNewStatus !== prevStatus;
    const tagsChanged =
      nextTags.length !== currentTags.length || nextTags.some((t, i) => t !== currentTags[i]);

    const updatedPat: Patient =
      statusActuallyChanged || tagsChanged
        ? {
            ...existingPat,
            ...(statusActuallyChanged ? { followUpStatus: effectiveNewStatus } : {}),
            ...(tagsChanged ? { tags: nextTags } : {})
          }
        : existingPat;

    if (statusActuallyChanged || tagsChanged) {
      patientsRef.current = patientsRef.current.map(p => (p.id === patientId ? updatedPat : p));
      setPatients(prev => prev.map(p => (p.id === patientId ? updatedPat : p)));
    }

    const resolvedTaskType =
      opts.taskType || (opts.feedbackOutcome ? 'feedback' : undefined);

    const trimmedNotes = opts.notes?.trim().slice(0, 1000);
    const logEntry: PatientFollowUpLogEntry = {
      id: 'fulog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      patientId: existingPat.id.slice(0, 128),
      patientName: (existingPat.name || 'مريض').slice(0, 160),
      patientPhone: (existingPat.phone || '').slice(0, 40),
      previousStatus: prevStatus.slice(0, 80),
      newStatus: effectiveNewStatus.slice(0, 80),
      changedBy: activeStaff.name.slice(0, 120),
      changedById: activeStaff.id.slice(0, 128),
      timestamp: new Date().toISOString().slice(0, 64),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      ...(opts.audioDataUrl ? { audioDataUrl: opts.audioDataUrl } : {}),
      ...(typeof opts.audioDurationSeconds === 'number' && opts.audioDurationSeconds >= 0
        ? { audioDurationSeconds: Math.min(120, opts.audioDurationSeconds) }
        : {}),
      ...(resolvedTaskType ? { taskType: resolvedTaskType } : {}),
      ...(opts.feedbackOutcome ? { feedbackOutcome: opts.feedbackOutcome } : {}),
      ...(opts.feedbackDate ? { feedbackDate: opts.feedbackDate.slice(0, 24) } : {}),
      ...(opts.finishedWorkAction ? { finishedWorkAction: opts.finishedWorkAction } : {}),
      ...(typeof opts.finishedWorkAttempt === 'number' && opts.finishedWorkAttempt >= 1
        ? { finishedWorkAttempt: Math.min(1000, opts.finishedWorkAttempt) }
        : {}),
      ...(opts.snoozeUntilDate ? { snoozeUntilDate: opts.snoozeUntilDate.slice(0, 24) } : {}),
      ...(opts.actionDate ? { actionDate: opts.actionDate.slice(0, 24) } : {}),
      reverted: false
    };

    const nextLogs = [logEntry, ...patientFollowUpLogsRef.current].slice(0, 500);
    patientFollowUpLogsRef.current = nextLogs;
    saveToStorage('patient_follow_up_logs', nextLogs);
    setPatientFollowUpLogs(nextLogs);

    const cloudOps: PendingCloudOpInput[] = [];
    if (statusActuallyChanged || tagsChanged) {
      cloudOps.push({
        kind: 'overlay',
        collectionName: 'patients_sync',
        record: updatedPat,
        isDeleted: false
      });
    }
    cloudOps.push({
      kind: 'doc_upsert',
      collectionName: 'patient_follow_up_logs',
      docId: logEntry.id,
      data: logEntry as unknown as Record<string, unknown>
    });

    // Check if all previous working day feedback patients are resolved -> auto-complete Feedback task
    if (opts.feedbackOutcome && opts.feedbackDate) {
      const todayStr = getTodayDateString();
      const progress = computeFeedbackTaskProgress(
        todayStr,
        weekdaySettingsRef.current,
        appointmentsRef.current,
        nextLogs
      );
      if (
        opts.feedbackDate === progress.prevWorkDay &&
        progress.totalPatients > 0 &&
        progress.remainingCount === 0
      ) {
        const incompleteFeedbackTasks = tasksRef.current.filter(t => {
          if (!isFeedbackTaskTitle(t.title)) return false;
          if (!doesTaskOccurOnDate(t, todayStr)) return false;
          const rec = t.recurrence || 'once';
          return rec === 'once' ? !t.isCompleted : !t.completedDates?.[todayStr];
        });
        if (incompleteFeedbackTasks.length > 0) {
          const cairoTimeStr = new Date().toLocaleTimeString('ar-EG', {
            timeZone: CAIRO_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit'
          });
          const feedbackTaskIds = new Set(incompleteFeedbackTasks.map(t => t.id));
          const updatedTasksList = tasksRef.current.map(t => {
            if (!feedbackTaskIds.has(t.id)) return t;
            const rec = t.recurrence || 'once';
            if (rec === 'once') {
              return {
                ...t,
                isCompleted: true,
                completedAt: cairoTimeStr,
                completedBy: activeStaff.name
              };
            }
            const nextDates = {
              ...(t.completedDates || {}),
              [todayStr]: {
                completedAt: cairoTimeStr,
                completedBy: activeStaff.name
              }
            };
            return {
              ...t,
              completedDates: nextDates,
              isCompleted: true,
              completedAt: cairoTimeStr,
              completedBy: activeStaff.name
            };
          });
          tasksRef.current = updatedTasksList;
          saveToStorage('tasks', updatedTasksList);
          setTasks(updatedTasksList);
          updatedTasksList.forEach(t => {
            if (feedbackTaskIds.has(t.id)) {
              cloudOps.push({
                kind: 'doc_upsert',
                collectionName: 'tasks',
                docId: t.id,
                data: t as unknown as Record<string, unknown>
              });
            }
          });
          incompleteFeedbackTasks.forEach(t => {
            const updatedTask = updatedTasksList.find(u => u.id === t.id) || t;
            logAuditAction(
              'status_change',
              'task',
              t.id,
              t.title,
              `إتمام مهمة الفيدباك تلقائياً بعد الانتهاء من جميع المرضى (${progress.totalPatients}/${progress.totalPatients})`,
              t,
              updatedTask,
              'tasks'
            );
          });
        }
      }
    }

    // Check if all finished-work task quota for today (or targeted overdue once-task date) is resolved -> auto-complete Finished-Work task
    if (
      resolvedTaskType === 'finished_work' ||
      effectiveNewStatus === FINISHED_WORK_STATUS_DONE ||
      effectiveNewStatus === FINISHED_WORK_STATUS_NOT_INTERESTED ||
      effectiveNewStatus === 'تم تحديد ميعاد'
    ) {
      const todayStr = getTodayDateString();
      const fwActionDate = (opts.actionDate || todayStr).slice(0, 10);
      const incompleteFwTasks = tasksRef.current.filter(t => {
        if (!isFinishedWorkTaskTitle(t.title)) return false;
        const rec = t.recurrence || 'once';
        if (rec === 'once') {
          if (t.isCompleted) return false;
          return t.dueDate === fwActionDate || (fwActionDate === todayStr && doesTaskOccurOnDate(t, todayStr));
        }
        return fwActionDate === todayStr && doesTaskOccurOnDate(t, todayStr) && !t.completedDates?.[todayStr];
      });
      if (incompleteFwTasks.length > 0) {
        const fwProgress = computeFinishedWorkTaskProgress(
          fwActionDate,
          weekdaySettingsRef.current,
          patientsRef.current,
          appointmentsRef.current,
          operationsRef.current,
          invoicesRef.current,
          nextLogs
        );
        if (fwProgress.totalPatients > 0 && fwProgress.remainingCount === 0) {
            const cairoTimeStr = new Date().toLocaleTimeString('ar-EG', {
              timeZone: CAIRO_TIMEZONE,
              hour: '2-digit',
              minute: '2-digit'
            });
            const fwTaskIds = new Set(incompleteFwTasks.map(t => t.id));
            const updatedTasksList = tasksRef.current.map(t => {
              if (!fwTaskIds.has(t.id)) return t;
              const rec = t.recurrence || 'once';
              if (rec === 'once') {
                return {
                  ...t,
                  isCompleted: true,
                  completedAt: cairoTimeStr,
                  completedBy: activeStaff.name
                };
              }
              const nextDates = {
                ...(t.completedDates || {}),
                [todayStr]: {
                  completedAt: cairoTimeStr,
                  completedBy: activeStaff.name
                }
              };
              return {
                ...t,
                completedDates: nextDates,
                isCompleted: true,
                completedAt: cairoTimeStr,
                completedBy: activeStaff.name
              };
            });
            tasksRef.current = updatedTasksList;
            saveToStorage('tasks', updatedTasksList);
            setTasks(updatedTasksList);
            updatedTasksList.forEach(t => {
              if (fwTaskIds.has(t.id)) {
                cloudOps.push({
                  kind: 'doc_upsert',
                  collectionName: 'tasks',
                  docId: t.id,
                  data: t as unknown as Record<string, unknown>
                });
              }
            });
          incompleteFwTasks.forEach(t => {
            const updatedTask = updatedTasksList.find(u => u.id === t.id) || t;
            logAuditAction(
              'status_change',
              'task',
              t.id,
              t.title,
              `إتمام مهمة خلص شغل تلقائياً بعد استيفاء مستهدف اليوم (${fwProgress.doneCount}/${fwProgress.totalPatients})`,
              t,
              updatedTask,
              'tasks'
            );
          });
        }
      }
    }

    if (cloudOps.length > 0) {
      void dispatchCloudOps(cloudOps);
    }

    const actionDescription =
      opts.finishedWorkAction === 'finished'
        ? `تسجيل خلص شغل للمريض ${existingPat.name}`
        : opts.finishedWorkAction === 'closed_file'
        ? `إغلاق ملف المريض ${existingPat.name} (غير مهتم)`
        : opts.finishedWorkAction === 'unreachable'
        ? `تأجيل متابعة خلص شغل للمريض ${existingPat.name} لمدة ٣ أيام (لا يمكن التواصل)`
        : opts.finishedWorkAction === 'not_interested'
        ? `تأجيل متابعة خلص شغل للمريض ${existingPat.name} لمدة أسبوع (غير مهتم)`
        : opts.finishedWorkAction === 'postpone_week'
        ? (() => {
            const baseDate = (opts.actionDate || getTodayDateString()).slice(0, 10);
            const daysDiff =
              opts.snoozeUntilDate && baseDate ? getYmdDiffDays(baseDate, opts.snoozeUntilDate) : 0;
            const durationLabel = daysDiff >= 1 ? formatPostponeDaysArabic(daysDiff) : 'أسبوع';
            return `تأجيل متابعة خلص شغل للمريض ${existingPat.name} لمدة ${durationLabel}`;
          })()
        : opts.feedbackOutcome === 'done'
        ? `تسجيل تم الفيدباك للمريض ${existingPat.name}`
        : opts.feedbackOutcome === 'not_done'
        ? `تسجيل تعذر إتمام الفيدباك للمريض ${existingPat.name}`
        : `تغيير حالة متابعة المريض ${existingPat.name} من (${prevStatus}) إلى (${effectiveNewStatus})`;

    logAuditAction(
      'status_change',
      'patient',
      existingPat.id,
      existingPat.name,
      actionDescription,
      existingPat,
      updatedPat,
      'patient_detail',
      existingPat.id
    );

    return logEntry.id;
  };

  const updatePatientFollowUpLog = (
    id: string,
    updates: Partial<
      Pick<
        PatientFollowUpLogEntry,
        'previousStatus' | 'newStatus' | 'notes' | 'audioDataUrl' | 'audioDurationSeconds'
      >
    >
  ) => {
    const existing = patientFollowUpLogsRef.current.find(l => l.id === id);
    if (!existing) return;
    const updated: PatientFollowUpLogEntry = {
      ...existing,
      ...(updates.previousStatus !== undefined ? { previousStatus: (updates.previousStatus.trim() || existing.previousStatus).slice(0, 80) } : {}),
      ...(updates.newStatus !== undefined ? { newStatus: (updates.newStatus.trim() || existing.newStatus).slice(0, 80) } : {}),
      ...(updates.notes !== undefined ? (updates.notes.trim() ? { notes: updates.notes.trim().slice(0, 1000) } : { notes: undefined }) : {}),
      ...(updates.audioDataUrl !== undefined ? (updates.audioDataUrl ? { audioDataUrl: updates.audioDataUrl } : { audioDataUrl: undefined }) : {}),
      ...(updates.audioDurationSeconds !== undefined
        ? typeof updates.audioDurationSeconds === 'number' && updates.audioDurationSeconds >= 0
          ? { audioDurationSeconds: Math.min(120, updates.audioDurationSeconds) }
          : { audioDurationSeconds: undefined }
        : {})
    };
    const nextLogs = patientFollowUpLogsRef.current.map(l => (l.id === id ? updated : l));
    patientFollowUpLogsRef.current = nextLogs;
    saveToStorage('patient_follow_up_logs', nextLogs);
    setPatientFollowUpLogs(nextLogs);

    const latestActiveForPat = nextLogs.find(
      l => l.patientId === existing.patientId && !l.reverted
    );
    let updatedPatForCloud: Patient | undefined;
    if (latestActiveForPat?.id === id && updates.newStatus && updates.newStatus !== existing.newStatus) {
      const targetPat = patientsRef.current.find(p => p.id === existing.patientId);
      if (targetPat) {
        updatedPatForCloud = { ...targetPat, followUpStatus: updated.newStatus };
        const nextPats = patientsRef.current.map(p => (p.id === targetPat.id ? updatedPatForCloud! : p));
        patientsRef.current = nextPats;
        setPatients(nextPats);
      }
    }

    const ops: PendingCloudOpInput[] = [
      {
        kind: 'doc_upsert',
        collectionName: 'patient_follow_up_logs',
        docId: updated.id,
        data: updated as unknown as Record<string, unknown>
      }
    ];
    if (updatedPatForCloud) {
      ops.push({
        kind: 'overlay',
        collectionName: 'patients_sync',
        record: updatedPatForCloud,
        isDeleted: false
      });
    }
    void dispatchCloudOps(ops);
    logAuditAction('update', 'patient', existing.patientId, existing.patientName, `تعديل سجل متابعة المريض ${existing.patientName}`, existing, updated, 'follow_up_logs', existing.patientId);
  };

  const deletePatientFollowUpLog = (id: string): { reverted: boolean; previousStatus?: string } => {
    const prevLogs = patientFollowUpLogsRef.current;
    const entryIdx = prevLogs.findIndex(l => l.id === id);
    const entry = entryIdx >= 0 ? prevLogs[entryIdx] : undefined;
    const remainingLogs = prevLogs.filter(l => l.id !== id);
    patientFollowUpLogsRef.current = remainingLogs;
    saveToStorage('patient_follow_up_logs', remainingLogs);
    setPatientFollowUpLogs(remainingLogs);

    let updatedPatForCloud: Patient | undefined;
    let reverted = false;
    let restoredStatus: string | undefined;

    if (entry && !entry.reverted) {
      const targetPat = patientsRef.current.find(p => p.id === entry.patientId);
      if (targetPat) {
        let patCopy = { ...targetPat };
        let patMutated = false;

        if (entry.newStatus !== entry.previousStatus) {
          const entryTimeMs = new Date(entry.timestamp).getTime();
          const newerStatusChangingLog = prevLogs.some((l, idx) => {
            if (l.id === id || l.reverted || l.patientId !== entry.patientId) return false;
            if (l.newStatus === l.previousStatus) return false;
            const lTimeMs = new Date(l.timestamp).getTime();
            if (!isNaN(lTimeMs) && !isNaN(entryTimeMs) && lTimeMs !== entryTimeMs) {
              return lTimeMs > entryTimeMs;
            }
            return idx < entryIdx;
          });
          if (!newerStatusChangingLog) {
            restoredStatus = entry.previousStatus === 'غير محدد' ? '' : entry.previousStatus;
            patCopy = { ...patCopy, followUpStatus: restoredStatus };
            patMutated = true;
            reverted = true;
          }
        }

        if (patMutated) {
          updatedPatForCloud = patCopy;
          const nextPats = patientsRef.current.map(p => (p.id === targetPat.id ? updatedPatForCloud! : p));
          patientsRef.current = nextPats;
          setPatients(nextPats);
        }
      }
    }

    const ops: PendingCloudOpInput[] = [
      { kind: 'doc_delete', collectionName: 'patient_follow_up_logs', docId: id }
    ];
    if (updatedPatForCloud) {
      ops.push({
        kind: 'overlay',
        collectionName: 'patients_sync',
        record: updatedPatForCloud,
        isDeleted: false
      });
    }
    void dispatchCloudOps(ops);

    if (entry) {
      logAuditAction('delete', 'patient', entry.patientId, entry.patientName, `حذف سجل متابعة للمريض ${entry.patientName} (${entry.newStatus})`, entry, undefined, 'follow_up_logs', entry.patientId);
    }

    return {
      reverted,
      previousStatus: restoredStatus !== undefined ? restoredStatus || 'غير محدد' : entry?.previousStatus
    };
  };

  const revertPatientFollowUpLog = (id: string): { success: boolean; message: string } => {
    const entry = patientFollowUpLogsRef.current.find(l => l.id === id);
    if (!entry) return { success: false, message: 'لم يتم العثور على سجل المتابعة' };
    if (entry.reverted) return { success: false, message: 'تم الرجوع للحالة السابقة لهذا السجل مسبقاً' };

    const targetPat = patientsRef.current.find(p => p.id === entry.patientId);
    const activeStaff = resolveActiveStaffFromRefs();

    let updatedPat: Patient | undefined;
    if (targetPat) {
      const restoredStatus = entry.previousStatus === 'غير محدد' ? '' : entry.previousStatus;
      updatedPat = {
        ...targetPat,
        followUpStatus: restoredStatus
      };
      const nextPats = patientsRef.current.map(p => (p.id === targetPat.id ? updatedPat! : p));
      patientsRef.current = nextPats;
      setPatients(nextPats);
    }

    const updatedEntry: PatientFollowUpLogEntry = {
      ...entry,
      reverted: true,
      revertedAt: new Date().toISOString().slice(0, 64),
      revertedBy: String(activeStaff.name || 'مستخدم').slice(0, 120)
    };
    const nextLogs = patientFollowUpLogsRef.current.map(l => (l.id === id ? updatedEntry : l));
    patientFollowUpLogsRef.current = nextLogs;
    saveToStorage('patient_follow_up_logs', nextLogs);
    setPatientFollowUpLogs(nextLogs);

    const ops: PendingCloudOpInput[] = [
      {
        kind: 'doc_upsert',
        collectionName: 'patient_follow_up_logs',
        docId: updatedEntry.id,
        data: updatedEntry as unknown as Record<string, unknown>
      }
    ];
    if (updatedPat) {
      ops.push({
        kind: 'overlay',
        collectionName: 'patients_sync',
        record: updatedPat,
        isDeleted: false
      });
    }
    void dispatchCloudOps(ops);

    logAuditAction('status_change', 'patient', entry.patientId, entry.patientName, `استرجاع حالة متابعة المريض ${entry.patientName} إلى "${entry.previousStatus}"`, entry, updatedEntry, 'follow_up_logs', entry.patientId);

    return {
      success: true,
      message: `تم إرجاع حالة ${entry.patientName} إلى "${entry.previousStatus}" بنجاح`
    };
  };

  const recordStaffAlertTrigger = (params: {
    targetKey: string;
    alertType: StaffAlertLogType;
    title: string;
    message: string;
    patientId?: string;
    patientName?: string;
    appointmentId?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    targetStaffIds?: string[];
    targetStaffNames?: string[];
    channel?: NotificationChannelMode;
  }) => {
    const id = toSafeAlertLogId(params.targetKey);
    const existing = staffAlertLogsRef.current.find(l => l.id === id || l.targetKey === params.targetKey);
    if (existing) return;

    const nowIso = new Date().toISOString();
    const initialInteraction: StaffAlertInteraction = {
      id: 'sai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      staffId: 'system',
      staffName: 'النظام',
      action: 'triggered',
      actionLabel: 'تم إطلاق التنبيه للموظفين',
      timestamp: nowIso,
      source: 'تلقائي'
    };

    const entry: StaffAlertLogEntry = {
      id,
      alertType: params.alertType,
      targetKey: params.targetKey,
      title: params.title,
      message: params.message,
      ...(params.patientId ? { patientId: params.patientId } : {}),
      ...(params.patientName ? { patientName: params.patientName } : {}),
      ...(params.appointmentId ? { appointmentId: params.appointmentId } : {}),
      ...(params.appointmentDate ? { appointmentDate: params.appointmentDate } : {}),
      ...(params.appointmentTime ? { appointmentTime: params.appointmentTime } : {}),
      ...(params.targetStaffIds ? { targetStaffIds: params.targetStaffIds } : {}),
      ...(params.targetStaffNames ? { targetStaffNames: params.targetStaffNames } : {}),
      ...(params.channel ? { channel: params.channel } : {}),
      status: 'active',
      triggeredAt: nowIso,
      lastUpdatedAt: nowIso,
      lastInteractionBy: 'النظام',
      lastInteractionById: 'system',
      lastInteractionLabel: 'تم إطلاق التنبيه',
      interactions: [initialInteraction]
    };

    const nextLogs = [entry, ...staffAlertLogsRef.current].slice(0, 300);
    staffAlertLogsRef.current = nextLogs;
    saveToStorage('staff_alert_logs', nextLogs);
    setStaffAlertLogs(nextLogs);
    void dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_alert_logs',
        docId: entry.id,
        data: entry as unknown as Record<string, unknown>
      }
    ]);
  };

  const recordStaffAlertInteraction = (params: {
    targetKey: string;
    action: string;
    actionLabel: string;
    newStatus?: StaffAlertLogStatus;
    source?: string;
    fallbackMeta?: {
      alertType: StaffAlertLogType;
      title: string;
      message: string;
      patientId?: string;
      patientName?: string;
      appointmentId?: string;
      appointmentDate?: string;
      appointmentTime?: string;
      channel?: NotificationChannelMode;
    };
  }) => {
    const id = toSafeAlertLogId(params.targetKey);
    const existing = staffAlertLogsRef.current.find(l => l.id === id || l.targetKey === params.targetKey);
    if (!existing && !params.fallbackMeta) return;

    const activeStaff = resolveActiveStaffFromRefs();
    const nowIso = new Date().toISOString();

    const interaction: StaffAlertInteraction = {
      id: 'sai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      staffId: activeStaff.id,
      staffName: activeStaff.name,
      action: params.action,
      actionLabel: params.actionLabel,
      timestamp: nowIso,
      ...(params.source ? { source: params.source } : {})
    };

    const nextEntry: StaffAlertLogEntry = existing
      ? {
          ...existing,
          status: params.newStatus ?? existing.status,
          lastUpdatedAt: nowIso,
          lastInteractionBy: activeStaff.name,
          lastInteractionById: activeStaff.id,
          lastInteractionLabel: params.actionLabel,
          interactions: [...(existing.interactions || []), interaction].slice(-30)
        }
      : {
          id,
          alertType: params.fallbackMeta!.alertType,
          targetKey: params.targetKey,
          title: params.fallbackMeta!.title,
          message: params.fallbackMeta!.message,
          ...(params.fallbackMeta!.patientId ? { patientId: params.fallbackMeta!.patientId } : {}),
          ...(params.fallbackMeta!.patientName ? { patientName: params.fallbackMeta!.patientName } : {}),
          ...(params.fallbackMeta!.appointmentId ? { appointmentId: params.fallbackMeta!.appointmentId } : {}),
          ...(params.fallbackMeta!.appointmentDate ? { appointmentDate: params.fallbackMeta!.appointmentDate } : {}),
          ...(params.fallbackMeta!.appointmentTime ? { appointmentTime: params.fallbackMeta!.appointmentTime } : {}),
          ...(params.fallbackMeta!.channel ? { channel: params.fallbackMeta!.channel } : {}),
          status: params.newStatus || 'resolved',
          triggeredAt: nowIso,
          lastUpdatedAt: nowIso,
          lastInteractionBy: activeStaff.name,
          lastInteractionById: activeStaff.id,
          lastInteractionLabel: params.actionLabel,
          interactions: [interaction]
        };

    const rest = staffAlertLogsRef.current.filter(l => l.id !== nextEntry.id && l.targetKey !== params.targetKey);
    const nextLogs = [nextEntry, ...rest].slice(0, 300);
    staffAlertLogsRef.current = nextLogs;
    saveToStorage('staff_alert_logs', nextLogs);
    setStaffAlertLogs(nextLogs);
    void dispatchCloudOps([
      {
        kind: 'doc_upsert',
        collectionName: 'staff_alert_logs',
        docId: nextEntry.id,
        data: nextEntry as unknown as Record<string, unknown>
      }
    ]);
  };

  const deleteStaffAlertLog = (id: string) => {
    const nextLogs = staffAlertLogsRef.current.filter(l => l.id !== id);
    staffAlertLogsRef.current = nextLogs;
    saveToStorage('staff_alert_logs', nextLogs);
    setStaffAlertLogs(nextLogs);
    void dispatchCloudOps([{ kind: 'doc_delete', collectionName: 'staff_alert_logs', docId: id }]);
  };

  const clearStaffAlertLogs = () => {
    const ids = staffAlertLogsRef.current.map(l => l.id);
    staffAlertLogsRef.current = [];
    saveToStorage('staff_alert_logs', []);
    setStaffAlertLogs([]);
    if (ids.length > 0) {
      void dispatchCloudOps(
        ids.map(id => ({ kind: 'doc_delete' as const, collectionName: 'staff_alert_logs', docId: id }))
      );
    }
  };

  const scheduleTestNotificationInOneMinute = () => {
    const triggerAt = Date.now() + 60 * 1000;
    setIsTestNotificationDue(false);
    setTestNotificationTriggerAt(triggerAt);

    const effectiveChannel = getEffectiveMobilePushChannel(staffAlertSettingsRef.current);
    recordStaffAlertTrigger({
      targetKey: `test_${triggerAt}`,
      alertType: 'test',
      title: 'إشعار تجريبي بعد دقيقة',
      message: `تم جدولة إشعار تجريبي بواسطة ${currentUser.name}`,
      targetStaffIds: [currentUser.id],
      targetStaffNames: [currentUser.name],
      channel: effectiveChannel
    });

    const scheduleOnServer = () => {
      void scheduleServerTestPush({
        staffId: currentUser.id,
        staffName: currentUser.name,
        notificationChannel: effectiveChannel,
        delayMs: 60_000,
        triggerAtMs: triggerAt
      }).then(res => {
        if (res.ok) setWebPushReady(true);
      });
    };

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        scheduleOnServer();
      } else if (Notification.permission === 'default') {
        void Notification.requestPermission().then(perm => {
          if (perm === 'granted') scheduleOnServer();
        });
      }
    }
  };

  const dismissTestNotification = () => {
    setIsTestNotificationDue(false);
    const activeTestLog = staffAlertLogsRef.current.find(
      l => l.alertType === 'test' && (l.status === 'active' || l.status === 'snoozed')
    );
    if (activeTestLog) {
      recordStaffAlertInteraction({
        targetKey: activeTestLog.targetKey,
        action: 'dismissed',
        actionLabel: 'تم تأكيد استلام الإشعار التجريبي',
        newStatus: 'dismissed',
        source: 'بابل الجرس'
      });
    }
  };

  const updateStaffAlertSettings = (updates: Partial<StaffAlertSettings>) => {
    const prev = staffAlertSettingsRef.current;
    const rawDelay = updates.appointmentDelayMinutes ?? prev.appointmentDelayMinutes;
    const clampedDelay = Math.max(1, Math.min(480, Number(rawDelay) || 1));
    const merged: StaffAlertSettings = {
      ...prev,
      ...updates,
      appointmentDelayMinutes: clampedDelay
    };
    merged.notificationChannel = getEffectiveMobilePushChannel(merged);
    staffAlertSettingsRef.current = merged;
    setStaffAlertSettings(merged);
    saveToStorage('staff_alert_settings', merged);
    syncClinicConfigToCloud({ staffAlertSettings: merged });
    logAuditAction('update', 'setting', 'staff_alert_settings', 'إعدادات تنبيهات الموظف', 'تحديث إعدادات تنبيهات الموظف والإشعارات', prev, merged, 'settings');
  };

  const revertAuditLogEntry = (logId: string): { success: boolean; message: string } => {
    const entry = auditLogsRef.current.find(l => l.id === logId);
    if (!entry) return { success: false, message: 'لم يتم العثور على سجل التعديل' };
    if (entry.reverted) return { success: false, message: 'تم إرجاع هذا التعديل مسبقاً' };

    const prevObj = entry.previousData;
    const ops: PendingCloudOpInput[] = [];

    try {
      if (entry.action === 'add') {
        if (entry.entityType === 'patient') {
          if (entry.entityId && entry.newData && Array.isArray((entry.newData as Patient).notes) && prevObj && Array.isArray((prevObj as Patient).notes)) {
            const restored = prevObj as Patient;
            const nextPats = patientsRef.current.map(p => (p.id === restored.id ? restored : p));
            patientsRef.current = nextPats;
            setPatients(nextPats);
            ops.push({ kind: 'overlay', collectionName: 'patients_sync', record: restored, isDeleted: false });
          } else {
            const targetPat = patientsRef.current.find(p => p.id === entry.entityId);
            const nextPats = patientsRef.current.filter(p => p.id !== entry.entityId);
            patientsRef.current = nextPats;
            setPatients(nextPats);
            ops.push({
              kind: 'overlay',
              collectionName: 'patients_sync',
              record: targetPat || ({ id: entry.entityId } as Patient),
              isDeleted: true
            });
          }
        } else if (entry.entityType === 'appointment') {
          const target = appointmentsRef.current.find(a => a.id === entry.entityId);
          const nextAppts = appointmentsRef.current.filter(a => a.id !== entry.entityId);
          appointmentsRef.current = nextAppts;
          setAppointments(nextAppts);
          ops.push({
            kind: 'overlay',
            collectionName: 'appointments_sync',
            record: target || ({ id: entry.entityId } as Appointment),
            isDeleted: true
          });
        } else if (entry.entityType === 'invoice') {
          const target = invoicesRef.current.find(i => i.id === entry.entityId);
          if (target) {
            dirtyFinancialPatientIdsRef.current.add(target.patientId);
            const voided = { ...target, status: 'voided' as const, outstandingBalance: 0 };
            const nextInvs = invoicesRef.current.map(i => (i.id === entry.entityId ? voided : i));
            invoicesRef.current = nextInvs;
            setInvoices(nextInvs);
            ops.push({ kind: 'overlay', collectionName: 'invoices_sync', record: voided, isDeleted: false });
          }
        } else if (entry.entityType === 'payment') {
          const pay = paymentsRef.current.find(p => p.id === entry.entityId);
          if (pay && pay.status !== 'voided') {
            voidPayment(pay.id);
          }
        } else if (entry.entityType === 'expense') {
          const nextExps = expensesRef.current.filter(e => e.id !== entry.entityId);
          expensesRef.current = nextExps;
          saveToStorage('expenses', nextExps);
          setExpenses(nextExps);
          ops.push({ kind: 'doc_delete', collectionName: 'expenses', docId: entry.entityId });
        } else if (entry.entityType === 'task') {
          const nextTasks = tasksRef.current.filter(t => t.id !== entry.entityId);
          tasksRef.current = nextTasks;
          saveToStorage('tasks', nextTasks);
          setTasks(nextTasks);
          ops.push({ kind: 'doc_delete', collectionName: 'tasks', docId: entry.entityId });
        } else if (entry.entityType === 'procedure') {
          const nextProcs = proceduresRef.current.filter(p => p.id !== entry.entityId);
          proceduresRef.current = nextProcs;
          saveToStorage('procedures', nextProcs);
          setProcedures(nextProcs);
          ops.push({ kind: 'doc_delete', collectionName: 'procedures', docId: entry.entityId });
        } else if (entry.entityType === 'attendance') {
          const nextAtt = attendanceRef.current.filter(a => a.id !== entry.entityId);
          attendanceRef.current = nextAtt;
          saveToStorage('attendance', nextAtt);
          setAttendance(nextAtt);
          ops.push({ kind: 'doc_delete', collectionName: 'attendance', docId: entry.entityId });
        } else if (entry.entityType === 'staff') {
          if (entry.entityId.startsWith('doc_')) {
            const nextDocs = doctorsRef.current.filter(d => d.id !== entry.entityId);
            doctorsRef.current = nextDocs;
            saveToStorage('doctors', nextDocs);
            setDoctors(nextDocs);
            ops.push({ kind: 'doc_delete', collectionName: 'doctors', docId: entry.entityId });
          } else {
            const nextStaff = staffMembersRef.current.filter(s => s.id !== entry.entityId);
            staffMembersRef.current = nextStaff;
            saveToStorage('staff_members', nextStaff);
            setStaffMembers(nextStaff);
            ops.push({ kind: 'doc_delete', collectionName: 'staff_members', docId: entry.entityId });
          }
        } else if (entry.entityType === 'setting') {
          const nextUnits = unitsRef.current.filter(u => u.id !== entry.entityId);
          unitsRef.current = nextUnits;
          saveToStorage('units', nextUnits);
          setUnits(nextUnits);
          ops.push({ kind: 'doc_delete', collectionName: 'units', docId: entry.entityId });
        }
      } else {
        if (!prevObj || typeof prevObj !== 'object') {
          return { success: false, message: 'لا توجد نسخة سابقة مسجلة لاستعادتها' };
        }
        if (entry.entityType === 'patient') {
          const restored = prevObj as Patient;
          const nextPats = patientsRef.current.some(p => p.id === restored.id)
            ? patientsRef.current.map(p => (p.id === restored.id ? restored : p))
            : [restored, ...patientsRef.current];
          patientsRef.current = nextPats;
          setPatients(nextPats);
          ops.push({ kind: 'overlay', collectionName: 'patients_sync', record: restored, isDeleted: false });
        } else if (entry.entityType === 'appointment') {
          const restored = prevObj as Appointment;
          const nextAppts = appointmentsRef.current.some(a => a.id === restored.id)
            ? appointmentsRef.current.map(a => (a.id === restored.id ? restored : a))
            : [restored, ...appointmentsRef.current];
          appointmentsRef.current = nextAppts;
          setAppointments(nextAppts);
          ops.push({ kind: 'overlay', collectionName: 'appointments_sync', record: restored, isDeleted: false });
        } else if (entry.entityType === 'invoice') {
          const restored = prevObj as Invoice;
          dirtyFinancialPatientIdsRef.current.add(restored.patientId);
          const nextInvs = invoicesRef.current.some(i => i.id === restored.id)
            ? invoicesRef.current.map(i => (i.id === restored.id ? restored : i))
            : [restored, ...invoicesRef.current];
          invoicesRef.current = nextInvs;
          setInvoices(nextInvs);
          ops.push({ kind: 'overlay', collectionName: 'invoices_sync', record: restored, isDeleted: false });
        } else if (entry.entityType === 'payment') {
          const restored = prevObj as Payment;
          dirtyFinancialPatientIdsRef.current.add(restored.patientId);
          const nextPays = paymentsRef.current.some(p => p.id === restored.id)
            ? paymentsRef.current.map(p => (p.id === restored.id ? restored : p))
            : [restored, ...paymentsRef.current];
          paymentsRef.current = nextPays;
          setPayments(nextPays);
          ops.push({ kind: 'overlay', collectionName: 'payments_sync', record: restored, isDeleted: false });
        } else if (entry.entityType === 'expense') {
          const restored = prevObj as Expense;
          const nextExps = expensesRef.current.some(e => e.id === restored.id)
            ? expensesRef.current.map(e => (e.id === restored.id ? restored : e))
            : [restored, ...expensesRef.current];
          expensesRef.current = nextExps;
          saveToStorage('expenses', nextExps);
          setExpenses(nextExps);
          ops.push({ kind: 'doc_upsert', collectionName: 'expenses', docId: restored.id, data: restored as unknown as Record<string, unknown> });
        } else if (entry.entityType === 'task') {
          const restored = prevObj as Task;
          const nextTasks = tasksRef.current.some(t => t.id === restored.id)
            ? tasksRef.current.map(t => (t.id === restored.id ? restored : t))
            : [restored, ...tasksRef.current];
          tasksRef.current = nextTasks;
          saveToStorage('tasks', nextTasks);
          setTasks(nextTasks);
          ops.push({ kind: 'doc_upsert', collectionName: 'tasks', docId: restored.id, data: restored as unknown as Record<string, unknown> });
        } else if (entry.entityType === 'procedure') {
          const restored = prevObj as ProcedureItem;
          const nextProcs = proceduresRef.current.some(p => p.id === restored.id)
            ? proceduresRef.current.map(p => (p.id === restored.id ? restored : p))
            : [...proceduresRef.current, restored];
          proceduresRef.current = nextProcs;
          saveToStorage('procedures', nextProcs);
          setProcedures(nextProcs);
          ops.push({ kind: 'doc_upsert', collectionName: 'procedures', docId: restored.id, data: restored as unknown as Record<string, unknown> });
        } else if (entry.entityType === 'attendance') {
          const restored = prevObj as AttendanceRecord;
          const nextAtt = attendanceRef.current.some(a => a.id === restored.id)
            ? attendanceRef.current.map(a => (a.id === restored.id ? restored : a))
            : [restored, ...attendanceRef.current];
          attendanceRef.current = nextAtt;
          saveToStorage('attendance', nextAtt);
          setAttendance(nextAtt);
          ops.push({ kind: 'doc_upsert', collectionName: 'attendance', docId: restored.id, data: restored as unknown as Record<string, unknown> });
        } else if (entry.entityType === 'staff') {
          if (entry.entityId.startsWith('sc_') || entry.targetView === 'staff_comments') {
            const restored = prevObj as StaffComment;
            const nextComments = staffCommentsRef.current.some(c => c.id === restored.id)
              ? staffCommentsRef.current.map(c => (c.id === restored.id ? restored : c))
              : [restored, ...staffCommentsRef.current];
            staffCommentsRef.current = nextComments;
            saveToStorage('staff_comments', nextComments);
            setStaffComments(nextComments);
            ops.push({ kind: 'doc_upsert', collectionName: 'staff_comments', docId: restored.id, data: restored as unknown as Record<string, unknown> });
          } else if (entry.entityId.startsWith('doc_')) {
            const restored = prevObj as Doctor;
            const nextDocs = doctorsRef.current.some(d => d.id === restored.id)
              ? doctorsRef.current.map(d => (d.id === restored.id ? restored : d))
              : [...doctorsRef.current, restored];
            doctorsRef.current = nextDocs;
            saveToStorage('doctors', nextDocs);
            setDoctors(nextDocs);
            ops.push({ kind: 'doc_upsert', collectionName: 'doctors', docId: restored.id, data: restored as unknown as Record<string, unknown> });
          } else {
            const restored = prevObj as StaffMember;
            const nextStaff = staffMembersRef.current.some(s => s.id === restored.id)
              ? staffMembersRef.current.map(s => (s.id === restored.id ? restored : s))
              : [...staffMembersRef.current, restored];
            staffMembersRef.current = nextStaff;
            saveToStorage('staff_members', nextStaff);
            setStaffMembers(nextStaff);
            ops.push({ kind: 'doc_upsert', collectionName: 'staff_members', docId: restored.id, data: restored as unknown as Record<string, unknown> });
          }
        } else if (entry.entityType === 'setting') {
          if (entry.entityId.startsWith('weekday_')) {
            const restored = prevObj as WeekdaySetting;
            const nextW = weekdaySettingsRef.current.map(w => (w.dayOfWeek === restored.dayOfWeek ? restored : w));
            weekdaySettingsRef.current = nextW;
            setWeekdaySettings(nextW);
            syncClinicConfigToCloud({ weekdaySettings: nextW });
          } else if (entry.entityId.startsWith('referral_')) {
            const restoredName = (prevObj as { name?: string })?.name;
            if (restoredName && !referralSourcesRef.current.includes(restoredName)) {
              const nextR = [...referralSourcesRef.current, restoredName];
              referralSourcesRef.current = nextR;
              setReferralSources(nextR);
              syncClinicConfigToCloud({ referralSources: nextR });
            }
          } else if (entry.entityId.startsWith('tag_')) {
            const restoredTag = (prevObj as { name?: string })?.name;
            if (restoredTag && !patientTagsRef.current.includes(restoredTag)) {
              const nextT = [...patientTagsRef.current, restoredTag];
              patientTagsRef.current = nextT;
              setPatientTags(nextT);
              syncClinicConfigToCloud({ patientTags: nextT });
            }
          } else {
            const restored = prevObj as ClinicUnit;
            const nextUnits = unitsRef.current.some(u => u.id === restored.id)
              ? unitsRef.current.map(u => (u.id === restored.id ? restored : u))
              : [...unitsRef.current, restored];
            unitsRef.current = nextUnits;
            saveToStorage('units', nextUnits);
            setUnits(nextUnits);
            ops.push({ kind: 'doc_upsert', collectionName: 'units', docId: restored.id, data: restored as unknown as Record<string, unknown> });
          }
        }
      }

      const updatedEntry: AuditLogEntry = normalizeAuditEntryForCloud({ ...entry, reverted: true });
      const nextAuditLogs = auditLogsRef.current.map(l => (l.id === logId ? updatedEntry : l));
      auditLogsRef.current = nextAuditLogs;
      saveToStorage('audit_logs', nextAuditLogs);
      setAuditLogs(nextAuditLogs);

      ops.push({
        kind: 'doc_upsert',
        collectionName: 'audit_logs',
        docId: updatedEntry.id,
        data: updatedEntry as unknown as Record<string, unknown>
      });
      void dispatchCloudOps(ops);
      return { success: true, message: 'تم إرجاع التعديل إلى حالته السابقة بنجاح' };
    } catch (err) {
      console.error('Revert failed:', err);
      return { success: false, message: 'تعذر إرجاع التعديل بسبب خطأ غير متوقع' };
    }
  };

  // Keep feedback, finished-work, and recurring tasks synchronized asynchronously so clicks stay instant
  useEffect(() => {
    if (!archiveReady) return;
    const timer = window.setTimeout(() => {
      const todayStr = cairoTodayStr;
      const hasFeedbackTask = tasks.some(t => isFeedbackTaskTitle(t.title));
      const feedbackProgress = hasFeedbackTask
        ? computeFeedbackTaskProgress(
            todayStr,
            weekdaySettings,
            appointments,
            patientFollowUpLogs,
            patients
          )
        : null;
      const shouldFeedbackBeDone = Boolean(
        feedbackProgress && feedbackProgress.totalPatients > 0 && feedbackProgress.remainingCount === 0
      );

      let latestFeedbackActor: string | undefined;
      if (shouldFeedbackBeDone && feedbackProgress) {
        const activeActor = resolveActiveStaffFromRefs();
        let latestLog: (typeof patientFollowUpLogs)[number] | undefined;
        let latestTs = -Infinity;
        for (let i = 0; i < patientFollowUpLogs.length; i++) {
          const l = patientFollowUpLogs[i];
          if (l.reverted) continue;
          if (
            l.feedbackDate === feedbackProgress.prevWorkDay &&
            (l.feedbackOutcome === 'done' || l.feedbackOutcome === 'not_done')
          ) {
            const ts = Date.parse(l.timestamp) || 0;
            if (ts > latestTs) {
              latestTs = ts;
              latestLog = l;
            }
          }
        }
        latestFeedbackActor = activeActor?.name || latestLog?.changedBy || 'تحديث تلقائي';
      }

      const hasFinishedWorkTask = tasks.some(t => isFinishedWorkTaskTitle(t.title));
      const finishedWorkProgress = hasFinishedWorkTask
        ? computeFinishedWorkTaskProgress(
            todayStr,
            weekdaySettings,
            patients,
            appointments,
            operations,
            invoices,
            patientFollowUpLogs
          )
        : null;
      const shouldFinishedWorkBeDone = Boolean(
        finishedWorkProgress &&
          finishedWorkProgress.totalPatients > 0 &&
          finishedWorkProgress.remainingCount === 0
      );

      const resolveFinishedWorkActorForDate = (targetDate: string, fwProg: ReturnType<typeof computeFinishedWorkTaskProgress>) => {
        const activeActor = resolveActiveStaffFromRefs();
        let latestLog: (typeof patientFollowUpLogs)[number] | undefined;
        let latestTs = -Infinity;
        for (let i = 0; i < patientFollowUpLogs.length; i++) {
          const l = patientFollowUpLogs[i];
          if (l.reverted) continue;
          const st = (l.newStatus || '').trim();
          const isRelevant =
            l.taskType === 'finished_work' ||
            st === FINISHED_WORK_STATUS_DONE ||
            st === FINISHED_WORK_STATUS_NOT_INTERESTED ||
            st === 'تم تحديد ميعاد';
          if (!isRelevant) continue;
          const actDate = (l.actionDate || getCairoDateStringFromIso(l.timestamp)).slice(0, 10);
          if (actDate === targetDate) {
            const ts = Date.parse(l.timestamp) || 0;
            if (ts > latestTs) {
              latestTs = ts;
              latestLog = l;
            }
          }
        }
        if (latestLog?.changedBy) {
          return activeActor?.name || latestLog.changedBy;
        }
        if (fwProg.carryoverCredit >= fwProg.quotaTarget && fwProg.quotaTarget > 0) {
          return 'ترحيل رصيد من يوم سابق';
        }
        return activeActor?.name || 'تحديث تلقائي';
      };

      const latestFinishedWorkActor =
        shouldFinishedWorkBeDone && finishedWorkProgress
          ? resolveFinishedWorkActorForDate(todayStr, finishedWorkProgress)
          : undefined;

      const cairoTimeStr = new Date().toLocaleTimeString('ar-EG', {
        timeZone: CAIRO_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit'
      });

      const changedTasks: Task[] = [];
      const nextTasks = tasks.map(t => {
        const recurrence = t.recurrence || 'once';
        const isFeedback = isFeedbackTaskTitle(t.title);
        const isFinishedWork = isFinishedWorkTaskTitle(t.title);

        if (isFeedback || isFinishedWork) {
          if (isFinishedWork && recurrence === 'once') {
            const targetEvalDate = t.dueDate || todayStr;
            const evalProg =
              targetEvalDate === todayStr && finishedWorkProgress
                ? finishedWorkProgress
                : computeFinishedWorkTaskProgress(
                    targetEvalDate,
                    weekdaySettings,
                    patients,
                    appointments,
                    operations,
                    invoices,
                    patientFollowUpLogs
                  );
            const shouldOnceBeDone =
              evalProg.totalPatients > 0 && evalProg.remainingCount === 0;
            const onceActor = shouldOnceBeDone
              ? resolveFinishedWorkActorForDate(targetEvalDate, evalProg)
              : undefined;
            if (t.isCompleted && t.adminCompleted) return t;
            if (Boolean(t.isCompleted) === shouldOnceBeDone) return t;
            const updated: Task = {
              ...t,
              isCompleted: shouldOnceBeDone,
              adminCompleted: false,
              completedAt: shouldOnceBeDone ? cairoTimeStr : undefined,
              completedBy: shouldOnceBeDone ? onceActor : undefined
            };
            changedTasks.push(updated);
            return updated;
          }

          const shouldBeDone = isFeedback ? shouldFeedbackBeDone : shouldFinishedWorkBeDone;
          const latestActor = isFeedback ? latestFeedbackActor : latestFinishedWorkActor;

          if (!doesTaskOccurOnDate(t, todayStr)) {
            return t;
          }
          if (recurrence === 'once') {
            if (t.isCompleted && t.adminCompleted) return t;
            if (Boolean(t.isCompleted) === shouldBeDone) return t;
            const updated: Task = {
              ...t,
              isCompleted: shouldBeDone,
              adminCompleted: false,
              completedAt: shouldBeDone ? cairoTimeStr : undefined,
              completedBy: shouldBeDone ? latestActor : undefined
            };
            changedTasks.push(updated);
            return updated;
          }
          const needsMigration = t.completedDates === undefined && t.isCompleted;
          const baseCompletedDates: Record<string, { completedAt?: string; completedBy?: string; adminCompleted?: boolean }> = t.completedDates
            ? { ...t.completedDates }
            : t.isCompleted && t.dueDate
            ? {
                [t.dueDate]: {
                  ...(t.completedAt ? { completedAt: t.completedAt } : {}),
                  ...(t.completedBy ? { completedBy: t.completedBy } : {}),
                  ...(t.adminCompleted ? { adminCompleted: t.adminCompleted } : {})
                }
              }
            : {};
          if (baseCompletedDates[todayStr]?.adminCompleted) {
            const entry = baseCompletedDates[todayStr];
            if (
              Boolean(t.isCompleted) &&
              Boolean(t.adminCompleted) &&
              t.completedAt === entry.completedAt &&
              t.completedBy === entry.completedBy
            ) {
              return t;
            }
            const updated: Task = {
              ...t,
              completedDates: baseCompletedDates,
              isCompleted: true,
              adminCompleted: true,
              completedAt: entry.completedAt,
              completedBy: entry.completedBy
            };
            changedTasks.push(updated);
            return updated;
          }
          const currentlyDoneToday = Boolean(baseCompletedDates[todayStr]);
          if (
            !needsMigration &&
            currentlyDoneToday === shouldBeDone &&
            Boolean(t.isCompleted) === shouldBeDone
          ) {
            return t;
          }
          if (shouldBeDone) {
            if (!baseCompletedDates[todayStr]) {
              baseCompletedDates[todayStr] = {
                completedAt: cairoTimeStr,
                completedBy: latestActor
              };
            }
          } else {
            delete baseCompletedDates[todayStr];
          }
          const todayEntry = baseCompletedDates[todayStr];
          const updated: Task = {
            ...t,
            completedDates: baseCompletedDates,
            isCompleted: Boolean(todayEntry),
            adminCompleted: Boolean(todayEntry?.adminCompleted),
            completedAt: todayEntry?.completedAt,
            completedBy: todayEntry?.completedBy
          };
          changedTasks.push(updated);
          return updated;
        }

        if (recurrence !== 'once') {
          const needsMigration = t.completedDates === undefined && t.isCompleted;
          const baseCompletedDates: Record<string, { completedAt?: string; completedBy?: string; adminCompleted?: boolean }> = t.completedDates
            ? { ...t.completedDates }
            : t.isCompleted && t.dueDate
            ? {
                [t.dueDate]: {
                  ...(t.completedAt ? { completedAt: t.completedAt } : {}),
                  ...(t.completedBy ? { completedBy: t.completedBy } : {}),
                  ...(t.adminCompleted ? { adminCompleted: t.adminCompleted } : {})
                }
              }
            : {};
          const todayEntry = baseCompletedDates[todayStr];
          const shouldBeCompletedToday = Boolean(todayEntry);
          if (
            !needsMigration &&
            Boolean(t.isCompleted) === shouldBeCompletedToday &&
            Boolean(t.adminCompleted) === Boolean(todayEntry?.adminCompleted) &&
            (t.completedAt || undefined) === (todayEntry?.completedAt || undefined) &&
            (t.completedBy || undefined) === (todayEntry?.completedBy || undefined)
          ) {
            return t;
          }
          const updated: Task = {
            ...t,
            completedDates: baseCompletedDates,
            isCompleted: shouldBeCompletedToday,
            adminCompleted: Boolean(todayEntry?.adminCompleted),
            completedAt: todayEntry?.completedAt,
            completedBy: todayEntry?.completedBy
          };
          changedTasks.push(updated);
          return updated;
        }

        return t;
      });

      if (changedTasks.length > 0) {
        tasksRef.current = nextTasks;
        saveToStorage('tasks', nextTasks);
        setTasks(nextTasks);
        void dispatchCloudOps(
          changedTasks.map(ct => ({
            kind: 'doc_upsert' as const,
            collectionName: 'tasks',
            docId: ct.id,
            data: ct as unknown as Record<string, unknown>
          }))
        );
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [tasks, patients, appointments, operations, invoices, patientFollowUpLogs, weekdaySettings, cairoTodayStr, archiveReady, currentUser.name]);

  const actionBindings = {
    refreshWebPushSubscription,
    enableMobilePushNotifications,
    scheduleTestNotificationInOneMinute,
    dismissTestNotification,
    recordStaffAlertTrigger,
    recordStaffAlertInteraction,
    deleteStaffAlertLog,
    clearStaffAlertLogs,
    clearPatientDetailFocusNotes,
    clearReportsInitialPeriod,
    openReportsForToday,
    setActiveView: handleSetActiveView,
    navigateToPatientFollowUp,
    clearFollowUpViewPrefill,
    goToPatient,
    goBack,
    switchBottomTab,
    registerScrollContainer,
    scrollToTop,
    resetToToday,
    stepDate,
    setIsQuickActionOpen: openQuickAction,
    setCurrentUser,
    addPatient,
    updatePatient,
    setPatientDefaultWhatsAppPhone,
    setPatientPhoneNoWhatsApp,
    registerPatientWhatsAppPhone,
    deletePatient,
    addPatientNote,
    updatePatientNote,
    deletePatientNote,
    togglePalmerTooth,
    addAppointment,
    updateAppointmentStatus,
    updateAppointment,
    deleteAppointment,
    checkAppointmentConflict,
    addInvoice,
    updateInvoice,
    voidInvoice,
    addPayment,
    updatePayment,
    voidPayment,
    payAllInvoices,
    addExpense,
    updateExpense,
    deleteExpense,
    addTask,
    updateTask,
    toggleTask,
    adminCompleteTask,
    deleteTask,
    clearShiftAlertFeedback,
    triggerShiftActionFromAlert,
    snoozeShiftStart,
    snoozeShiftEnd,
    clockIn,
    clockOut,
    editAttendanceRecord,
    deleteAttendanceRecord,
    openAttendanceShiftEdit,
    clearEditingAttendanceId,
    sendWhatsAppAlert,
    confirmWhatsAppAlertSent,
    markWhatsAppAlertOpened,
    dismissWhatsAppAlert,
    toggleWhatsAppTemplate,
    addWhatsAppTemplate,
    updateWhatsAppTemplate,
    addProcedure,
    updateProcedure,
    deleteProcedure,
    addOperation,
    updateOperation,
    deleteOperation,
    importPatientsFromExcel,
    exportDataToExcel,
    updateWeekdaySetting,
    addUnit,
    updateUnit,
    toggleUnitDisabled,
    deleteUnit,
    addDoctor,
    updateDoctor,
    toggleDoctorDisabled,
    deleteDoctor,
    addStaffMember,
    updateStaffMember,
    toggleStaffDisabled,
    deleteStaffMember,
    toggleStaffAttendanceExempt,
    grantStaffAttendanceLeave,
    removeStaffAttendanceLeave,
    updateStaffPermission,
    applyRolePresetPermissions,
    addReferralSource,
    updateReferralSource,
    deleteReferralSource,
    reorderReferralSources,
    addPatientTag,
    updatePatientTag,
    deletePatientTag,
    reorderPatientTags,
    addExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory,
    reorderExpenseCategories,
    addPatientFollowUpStatus,
    updatePatientFollowUpStatus,
    deletePatientFollowUpStatus,
    reorderPatientFollowUpStatuses,
    setListItemColor,
    changePatientFollowUpStatus,
    updatePatientFollowUpLog,
    deletePatientFollowUpLog,
    revertPatientFollowUpLog,
    updatePatientRequiredFields,
    updateStaffAlertSettings,
    reloadNativeDatabase,
    toggleDarkMode,
    updateClinicWorkingHours,
    login,
    logout,
    resetPasswordByEmail,
    retryCloudConnect,
    retryPendingCloudSync,
    flushPendingCloudOps,
    pushLocalChangesToCloud,
    deleteAuditLogEntry,
    clearAuditLogs,
    revertAuditLogEntry,
    logAuditAction,
    addStaffComment,
    repeatStaffComment,
    unrepeatStaffComment,
    hideStaffComment,
    restoreStaffComment,
    deleteStaffComment
  };

  const actionsRef = useRef(actionBindings);
  actionsRef.current = actionBindings;

  const stableActions = useMemo(() => {
    const out = {} as typeof actionBindings;
    (Object.keys(actionsRef.current) as Array<keyof typeof actionBindings>).forEach(k => {
      (out as Record<string, unknown>)[k as string] = (...args: unknown[]) =>
        (actionsRef.current[k] as (...a: unknown[]) => unknown)(...args);
    });
    return out;
  }, []);

  const contextValue = useMemo<ClinicContextType>(
    () => ({
      patients: effectivePatients,
      appointments,
      invoices,
      payments,
      expenses,
      tasks,
      attendance,
      whatsappTemplates,
      whatsappAlerts,
      doctors,
      units,
      staffMembers,
      procedures,
      operations,
      weekdaySettings,
      referralSources,
      patientTags,
      expenseCategories,
      patientFollowUpStatuses,
      listItemColors,
      patientFollowUpLogs,
      patientRequiredFields,
      staffAlertSettings,
      staffAlertLogs,
      staffAlertSnoozeUntil,
      testNotificationTriggerAt,
      isTestNotificationDue,
      webPushReady,
      currentDate,
      cairoTodayStr,
      activeView,
      selectedPatientId,
      patientDetailFocusNotes,
      reportsInitialPeriod,
      currentUser,
      restrictedUnit,
      isUnitAllowed,
      isPatientAllowed,
      hasPermission,
      isDrawerOpen,
      isQuickActionOpen,
      isGlobalSearchOpen,
      isPWAInstallModalOpen,
      deviceLayout,
      quickActionInitialTab,
      quickActionPrefill,
      followUpViewPrefill,
      patientsViewState,
      setPatientsViewState,
      invoicesTodayOnly,
      setInvoicesTodayOnly,
      paymentsTodayOnly,
      setPaymentsTodayOnly,
      expensesTodayOnly,
      setExpensesTodayOnly,
      setCurrentDate,
      setIsDrawerOpen,
      setIsGlobalSearchOpen,
      setIsPWAInstallModalOpen,
      shiftAlertFeedback,
      shiftStartSnoozeUntil,
      shiftEndSnoozeUntil,
      setStaffAlertSnoozeUntil,
      darkMode,
      setDarkMode,
      clinicStartHour,
      clinicEndHour,
      isLoggedIn,
      archiveReady,
      cloudUser,
      cloudAuthReady,
      cloudSynced,
      cloudAttendanceReady,
      completedShiftDates,
      cloudError,
      cloudNeedsConsoleSetup,
      pendingCloudCount,
      auditLogs,
      staffComments,
      editingAttendanceId,
      ...stableActions
    }),
    [
      patients,
      appointments,
      invoices,
      payments,
      expenses,
      tasks,
      attendance,
      whatsappTemplates,
      whatsappAlerts,
      doctors,
      units,
      staffMembers,
      procedures,
      operations,
      weekdaySettings,
      referralSources,
      patientTags,
      expenseCategories,
      patientFollowUpStatuses,
      listItemColors,
      patientFollowUpLogs,
      patientRequiredFields,
      staffAlertSettings,
      staffAlertLogs,
      staffAlertSnoozeUntil,
      testNotificationTriggerAt,
      isTestNotificationDue,
      webPushReady,
      currentDate,
      cairoTodayStr,
      activeView,
      selectedPatientId,
      patientDetailFocusNotes,
      reportsInitialPeriod,
      currentUser,
      restrictedUnit,
      isUnitAllowed,
      isPatientAllowed,
      hasPermission,
      isDrawerOpen,
      isQuickActionOpen,
      isGlobalSearchOpen,
      isPWAInstallModalOpen,
      deviceLayout,
      quickActionInitialTab,
      quickActionPrefill,
      followUpViewPrefill,
      patientsViewState,
      invoicesTodayOnly,
      paymentsTodayOnly,
      expensesTodayOnly,
      shiftAlertFeedback,
      shiftStartSnoozeUntil,
      shiftEndSnoozeUntil,
      darkMode,
      clinicStartHour,
      clinicEndHour,
      isLoggedIn,
      archiveReady,
      cloudUser,
      cloudAuthReady,
      cloudSynced,
      cloudAttendanceReady,
      completedShiftDates,
      cloudError,
      cloudNeedsConsoleSetup,
      pendingCloudCount,
      auditLogs,
      staffComments,
      editingAttendanceId,
      stableActions
    ]
  );

  return (
    <ClinicContext.Provider value={contextValue}>
      {children}
    </ClinicContext.Provider>
  );
};

export const useClinic = () => {
  const ctx = useContext(ClinicContext);
  if (!ctx) throw new Error('useClinic must be used within ClinicProvider');
  return ctx;
};
