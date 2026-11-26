export type AppointmentStatus =
  | 'booked'       // محجوز (أبيض)
  | 'confirmed'    // مؤكد (أزرق)
  | 'arrived'      // وصل العيادة (برتقالي)
  | 'completed'    // مكتمل (أخضر)
  | 'cancelled'    // ملغي (رمادي/أحمر خفيف)
  | 'no_show';     // لم يحضر (أحمر)

export interface Patient {
  id: string;
  patientCode?: string;
  name: string;
  phone: string;
  secondaryPhone?: string;
  defaultWhatsAppPhone?: 'primary' | 'secondary';
  noWhatsAppPhones?: string[];
  age?: number;
  gender?: 'ذكر' | 'أنثى';
  referralSource?: string;
  referralDetails?: string;
  tags: string[];
  followUpStatus: string;
  registeredDate: string;
  createdAt?: string;
  totalBilled: number;
  totalPaid: number;
  outstandingBalance: number;
  palmerTeeth: number[]; // e.g. [11, 16, 21, 26, 36, 46]
  notes: PatientNote[];
  points?: number;
  address?: string;
  doctorName?: string;
  branchName?: string;
  lastVisitDate?: string;
  nextAppointmentDate?: string;
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
}

export interface PatientNote {
  id: string;
  patientId: string;
  authorName: string;
  authorRole: string;
  isAdminAuthored: boolean;
  content: string;
  toothNumber?: number;
  toothNumbers?: number[];
  createdAt: string; // ISO string
  audioDataUrl?: string;
  audioDurationSeconds?: number;
  appointmentDate?: string;
}

export interface Operation {
  id: string;
  operationNumber?: string;
  code: string;
  name: string;
  price: number;
  total: number;
  paid: number;
  discount: number;
  remaining: number;
  status: 'Completed' | 'In Progress' | 'Planned' | 'Condition' | 'Existing' | 'Rejected' | string;
  tooth?: string;
  childTeeth?: boolean;
  details?: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientCustomId?: string;
  doctorName: string;
  branchName: string;
  room?: string;
  date: string;
  time?: string;
  createdAt: string;
  invoiceRequired?: boolean;
  appointmentDate?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm in Cairo time
  durationMinutes: number; // 15, 30, 45, 60
  status: AppointmentStatus;
  unitId: string; // 'unit_1' | 'unit_2'
  unitName: string;
  doctorId: string;
  doctorName: string;
  procedureType?: string;
  cancellationReason?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  bookingSource?: FollowUpActionSource;
}

export interface ProcedureItem {
  id: string;
  name: string;
  category: string;
  defaultPrice: number;
}

export interface InvoiceItem {
  id: string;
  procedureId: string;
  procedureName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  toothNumbers?: number[];
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  discountType: 'none' | 'fixed' | 'percent';
  discountValue: number;
  discountAmount: number;
  netTotal: number;
  paidAmount: number;
  outstandingBalance: number;
  status: 'unpaid' | 'partial' | 'paid' | 'voided';
  notes?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  invoiceNumber?: string;
  patientId: string;
  patientName: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'wallet';
  date: string;
  receivedBy: string;
  notes?: string;
  status: 'valid' | 'voided';
  createdAt: string;
}

export interface ExpenseCategoryItem {
  name: string;
  defaultAmount?: number;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  unitId?: string;
  unitName?: string;
  notes?: string;
  loggedBy: string;
}

export interface TaskCompletionEntry {
  completedAt?: string;
  completedBy?: string;
  adminCompleted?: boolean;
  completionSource?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
  recurrence: 'once' | 'daily' | 'weekly' | 'monthly';
  isCompleted: boolean;
  adminCompleted?: boolean;
  completedAt?: string;
  completedBy?: string;
  completionSource?: string;
  completedDates?: Record<string, TaskCompletionEntry>;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  unitId: string;
  unitName: string;
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:mm
  clockOut?: string; // HH:mm
  isManual?: boolean;
  manualReason?: string;
  status: 'active' | 'completed';
}

export type WhatsAppTriggerEvent =
  | 'patient_created'
  | 'appointment_created'
  | 'appointment_reminder'
  | 'invoice_issued'
  | 'invoice_procedure'
  | 'payment_received'
  | 'post_op_care'
  | 'manual';

export type WhatsAppTimingDirection = 'at' | 'before' | 'after';
export type WhatsAppTimingUnit = 'minute' | 'hour' | 'day' | 'week' | 'month';

export interface WhatsAppTemplate {
  id: string;
  title: string;
  triggerEvent: WhatsAppTriggerEvent;
  timingOffsetMinutes: number; // e.g. -1440 for 24h before
  timingDirection?: WhatsAppTimingDirection;
  timingValue?: number;
  timingUnit?: WhatsAppTimingUnit;
  procedureId?: string;
  procedureName?: string;
  messageTemplate: string;
  isActive: boolean;
}

export interface WhatsAppAlert {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  templateTitle: string;
  renderedMessage: string;
  status: 'pending' | 'opened' | 'sent' | 'dismissed';
  scheduledFor: string;
  createdAt: string;
  sentAt?: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  color: string;
  isDisabled?: boolean;
}

export interface ClinicUnit {
  id: string;
  name: string;
  chairCount: number;
  description: string;
  isDisabled?: boolean;
  latitude?: number;
  longitude?: number;
  allowedRadiusMeters?: number;
}

export interface WeekdaySetting {
  dayOfWeek: number; // 0 Sunday, 1 Monday, ... 6 Saturday
  dayName: string;
  isClosed: boolean;
  defaultUnitId: string;
  startHour: number; // e.g. 13 (1 PM)
  endHour: number;   // e.g. 22 (10 PM)
}

export interface PatientFieldRequirements {
  phone: boolean;
  secondaryPhone: boolean;
  age: boolean;
  gender: boolean;
  referralSource: boolean;
}

export type StaffAlertTargetMode = 'all' | 'specific';
export type NotificationChannelMode = 'website_only' | 'mobile_and_website';

export interface StaffAlertSettings {
  appointmentFollowUpEnabled: boolean;
  appointmentDelayMinutes: number;
  appointmentTargetMode?: StaffAlertTargetMode;
  appointmentTargetStaffIds?: string[];
  appointmentNotificationChannel?: NotificationChannelMode;
  shiftReminderEnabled?: boolean;
  shiftTargetMode?: StaffAlertTargetMode;
  shiftTargetStaffIds?: string[];
  shiftNotificationChannel?: NotificationChannelMode;
  notificationChannel: NotificationChannelMode;
}

export type ClinicColorListKey =
  | 'followUpStatuses'
  | 'patientTags'
  | 'expenseCategories'
  | 'referralSources';

export interface ClinicListItemColors {
  followUpStatuses?: Record<string, string>;
  patientTags?: Record<string, string>;
  expenseCategories?: Record<string, string>;
  referralSources?: Record<string, string>;
}

export type StaffAlertLogType = 'appointment' | 'shift_start' | 'shift_end' | 'test';
export type StaffAlertLogStatus = 'active' | 'snoozed' | 'resolved' | 'dismissed';

export interface StaffAlertInteraction {
  id: string;
  staffId: string;
  staffName: string;
  action: string;
  actionLabel: string;
  timestamp: string;
  source?: string;
}

export interface StaffAlertLogEntry {
  id: string;
  alertType: StaffAlertLogType;
  targetKey: string;
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
  status: StaffAlertLogStatus;
  triggeredAt: string;
  lastUpdatedAt: string;
  lastInteractionBy?: string;
  lastInteractionById?: string;
  lastInteractionLabel?: string;
  interactions: StaffAlertInteraction[];
}

export type StaffRole = 'admin' | 'doctor' | 'receptionist' | 'nurse' | 'accountant';

export interface StaffPermissions {
  // Appointments
  viewAppointments: boolean;
  addAppointments: boolean;
  editAppointments: boolean;
  deleteAppointments: boolean;
  appointmentsOwnOnly?: boolean;

  // Patients
  viewPatients: boolean;
  addPatients: boolean;
  editPatients: boolean;
  deletePatients: boolean;
  patientsOwnOnly?: boolean;

  // Clinical Notes
  viewClinicalNotes: boolean;
  addClinicalNotes: boolean;
  editClinicalNotes: boolean;
  deleteClinicalNotes: boolean;
  hideAdminNotes?: boolean;

  // Invoices & Payments
  viewInvoicesPayments: boolean;
  addInvoicesPayments: boolean;
  editInvoicesPayments: boolean;
  deleteInvoicesPayments: boolean;
  viewFinancialReports: boolean;

  // Expenses
  viewExpenses: boolean;
  addExpenses: boolean;
  editExpenses: boolean;
  deleteExpenses: boolean;

  // Tasks
  viewTasks: boolean;
  addTasks: boolean;
  editTasks: boolean;
  deleteTasks: boolean;

  // Procedures & Pricing
  viewProcedures: boolean;
  addProcedures: boolean;
  editProcedures: boolean;
  deleteProcedures: boolean;

  // Attendance & Settings
  manualAttendance: boolean;
  manageSettings: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  username?: string;
  password?: string;
  email?: string;
  recoveryPin?: string;
  role: StaffRole;
  jobTitle: string;
  phone: string;
  branchName?: string;
  restrictedBranchId?: string;
  doctorId?: string;
  isDisabled?: boolean;
  exemptFromAttendance?: boolean;
  attendanceExemptDates?: string[];
  defaultUnitByDay?: Record<number, string>;
  shiftStartTime?: string; // HH:mm
  shiftEndTime?: string;   // HH:mm
  permissions: StaffPermissions;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: 'add' | 'update' | 'delete' | 'status_change';
  entityType: 'patient' | 'appointment' | 'invoice' | 'payment' | 'expense' | 'task' | 'procedure' | 'staff' | 'setting' | 'attendance';
  entityId: string;
  entityName: string;
  description: string;
  previousData?: any;
  newData?: any;
  targetView?: string;
  targetId?: string;
  reverted?: boolean;
}

export interface StaffComment {
  id: string;
  staffId: string;
  staffName: string;
  content: string;
  repeatCount: number;
  history: string[];
  createdAt: string;
  createdBy: string;
  isHidden?: boolean;
  hiddenAt?: string;
  durationDays?: number | null;
  durationLabel?: string;
  expiresAt?: string | null;
}

export type FinishedWorkActionType = 'finished' | 'unreachable' | 'not_interested' | 'postpone_week' | 'closed_file';

export type FollowUpActionSource =
  | 'task_card_button'
  | 'task_card_dropdown'
  | 'followup_outside'
  | 'appointments_schedule'
  | 'dashboard_schedule'
  | 'patients_list'
  | 'patient_detail'
  | 'staff_alerts'
  | 'quick_action';

export interface PatientFollowUpLogEntry {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  changedById: string;
  timestamp: string;
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
  actionSource?: FollowUpActionSource;
  reverted?: boolean;
  revertedAt?: string;
  revertedBy?: string;
}

export interface FollowUpViewPrefill {
  periodUnit: 'all' | 'day' | 'week' | 'month';
  dateBasis: 'last_appointment' | 'file_created';
  anchorDate: string;
  selectedAppointmentStatuses?: AppointmentStatus[];
  selectedFollowUpStatuses?: string[];
  excludeFollowUpStatuses?: string[];
  selectedTags?: string[];
  excludeTags?: string[];
  feedbackMode?: boolean;
  finishedWorkMode?: boolean;
  scrollToFirstCard?: boolean;
}



