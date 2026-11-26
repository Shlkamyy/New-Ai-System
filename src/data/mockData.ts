import {
  Patient,
  Appointment,
  ProcedureItem,
  Invoice,
  Payment,
  Expense,
  Task,
  AttendanceRecord,
  WhatsAppTemplate,
  WhatsAppAlert,
  Doctor,
  ClinicUnit,
  WeekdaySetting
} from '../types/clinic';

import { getCairoNowParts, addDaysToYmd } from '../utils/arabic';

// Helper for today's date in Cairo format YYYY-MM-DD
export function getTodayDateString(): string {
  return getCairoNowParts().dateStr;
}

const today = getTodayDateString();

// Calculate offset days for realistic demo calendar in Cairo time
export function getDateOffset(days: number): string {
  return addDaysToYmd(getTodayDateString(), days);
}

export const INITIAL_UNITS: ClinicUnit[] = [
  {
    id: 'unit_urabi',
    name: 'عيادة عرابي (المقر الرئيسي)',
    chairCount: 2,
    description: 'شارع أحمد عرابي، دمنهور - مجهزة بأحدث أجهزة الأشعة الرقمية والمايكروسكوب الجراحي'
  },
  {
    id: 'unit_urabi2',
    name: 'عيادة عرابي ٢ (الوحدة التخصصية)',
    chairCount: 1,
    description: 'شارع أحمد عرابي، دمنهور - مجهزة لجلسات الليزر والتركيبات الثابتة'
  },
  {
    id: 'unit_chow',
    name: 'عيادة تشاو مول',
    chairCount: 2,
    description: 'فرع مول تشاو التجاري، دمنهور - مجهزة لجلسات التقويم والزراعة والتبييض بالزووم'
  },
  {
    id: 'unit_1',
    name: 'عيادة ١ - وحدة الجراحة والزراعة',
    chairCount: 1,
    description: 'وحدة الجراحة المتقدمة'
  },
  {
    id: 'unit_2',
    name: 'عيادة ٢ - وحدة التقويم والتجميل',
    chairCount: 1,
    description: 'وحدة التقويم والتجميل'
  }
];

export const INITIAL_DOCTORS: Doctor[] = [
  {
    id: 'doc_1',
    name: 'د. محمد شلقامي',
    specialty: 'استشاري جراحة وزراعة وتقويم الأسنان وتجميل الابتسامة',
    phone: '01001234567',
    color: '#087e83'
  },
  {
    id: 'doc_2',
    name: 'د. ميار إيفي',
    specialty: 'أخصائية تقويم وتجميل الأسنان',
    phone: '01098765432',
    color: '#2563eb'
  },
  {
    id: 'doc_3',
    name: 'د. محمود الوكيل',
    specialty: 'أخصائي جراحة الفم وزراعة الأسنان',
    phone: '01129876543',
    color: '#059669'
  },
  {
    id: 'doc_4',
    name: 'د. أحمد بسيوني',
    specialty: 'أخصائي علاج الجذور وحشو العصب والتركيبات',
    phone: '01234567890',
    color: '#d97706'
  },
  {
    id: 'doc_5',
    name: 'د. سارة محمود',
    specialty: 'أخصائية طب أسنان الأطفال والتركيبات',
    phone: '01555544332',
    color: '#7c3aed'
  }
];

export const INITIAL_PROCEDURES: ProcedureItem[] = [
  { id: 'proc_1', name: 'حشو عصب (جلسة متكاملة)', category: 'علاج جذور وعصب', defaultPrice: 2250 },
  { id: 'proc_2', name: 'اعادة حشو عصب 2250', category: 'علاج جذور وعصب', defaultPrice: 2250 },
  { id: 'proc_3', name: 'حشو عصب ٣ قنوات (مولار)', category: 'علاج جذور وعصب', defaultPrice: 1700 },
  { id: 'proc_4', name: 'حشو عصب قناتين (بريمولار)', category: 'علاج جذور وعصب', defaultPrice: 1700 },
  { id: 'proc_5', name: 'حشو عصب قناة واحدة (امامي)', category: 'علاج جذور وعصب', defaultPrice: 1700 },
  { id: 'proc_6', name: 'تنظيف جير و تلميع', category: 'تنظيف ووقائي', defaultPrice: 350 },
  { id: 'proc_7', name: 'عرض تنظيف الجير و التلميع', category: 'تنظيف ووقائي', defaultPrice: 200 },
  { id: 'proc_8', name: 'كومبوزت خلفي بدون توفليماير 950', category: 'حشوات تجميلية', defaultPrice: 950 },
  { id: 'proc_9', name: 'كومبوزت خلفي بتوفليماير 950', category: 'حشوات تجميلية', defaultPrice: 950 },
  { id: 'proc_10', name: 'كومبوزت امامي تجميلي', category: 'حشوات تجميلية', defaultPrice: 850 },
  { id: 'proc_11', name: 'كراون زيركون ألماني عالي الشفافية', category: 'تركيبات وتيجان', defaultPrice: 2500 },
  { id: 'proc_12', name: 'زيركون امامي متدرج/ مقوي', category: 'تركيبات وتيجان', defaultPrice: 2500 },
  { id: 'proc_13', name: 'كراون بورسلين', category: 'تركيبات وتيجان', defaultPrice: 1500 },
  { id: 'proc_14', name: 'كراون ايماكس تجميلي E-Max', category: 'تركيبات وتيجان', defaultPrice: 3000 },
  { id: 'proc_15', name: 'بوست كور دعامة فايبر وبناء', category: 'تركيبات وتيجان', defaultPrice: 850 },
  { id: 'proc_16', name: 'لزق تركيبة 250', category: 'تركيبات وتيجان', defaultPrice: 250 },
  { id: 'proc_17', name: 'خلع بسيط', category: 'جراحة وخلع', defaultPrice: 300 },
  { id: 'proc_18', name: 'خلع جراحي لضرس معقد', category: 'جراحة وخلع', defaultPrice: 600 },
  { id: 'proc_19', name: 'خلع ضرس عقل مدفون', category: 'جراحة وخلع', defaultPrice: 1500 },
  { id: 'proc_20', name: 'خلع ضرس العقل عادي', category: 'جراحة وخلع', defaultPrice: 700 },
  { id: 'proc_21', name: 'عصب اطفال وجلسة متخصصة', category: 'طب أسنان أطفال', defaultPrice: 650 },
  { id: 'proc_22', name: 'ستانلس ستيل كراون للأطفال', category: 'طب أسنان أطفال', defaultPrice: 450 },
  { id: 'proc_23', name: 'حشو عادي اطفال', category: 'طب أسنان أطفال', defaultPrice: 450 },
  { id: 'proc_24', name: 'تبييض اسنان بجهاز الزووم والليزر', category: 'تجميل وتبييض', defaultPrice: 1500 },
  { id: 'proc_25', name: 'عرض كومبوزت فينيرز للسن', category: 'تجميل وتبييض', defaultPrice: 1150 },
  { id: 'proc_26', name: 'هوليوود سمايل المتحركة (سناب اون)', category: 'تجميل وتبييض', defaultPrice: 3500 },
  { id: 'proc_27', name: 'زراعة سن متكامل مع الدعامة', category: 'زراعة أسنان', defaultPrice: 7500 },
  { id: 'proc_28', name: 'دفعة وقسط تقويم أسنان', category: 'تقويم أسنان', defaultPrice: 1000 },
  { id: 'proc_29', name: 'مثبت تقويم بعد العلاج', category: 'تقويم أسنان', defaultPrice: 1000 },
  { id: 'proc_30', name: 'كشف واستشارة وتشخيص أولي', category: 'كشف واستشارة', defaultPrice: 80 }
];

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'exp_1',
    title: 'شراء عبوات بنج أسنان كربول وتيوب تخدير موضعي',
    category: 'مستلزمات أسنان',
    amount: 1850,
    date: today,
    unitName: 'عيادة ١ - وحدة الجراحة والزراعة',
    notes: 'فاتورة شركة الدلتا للمستلزمات الطبية',
    loggedBy: 'مريم'
  },
  {
    id: 'exp_2',
    title: 'صيانة وفحص فلتر كمبروسر الهواء وجهاز الشفط الجراحي',
    category: 'صيانة ومعامل',
    amount: 950,
    date: getDateOffset(-3),
    unitName: 'جميع الوحدات',
    notes: 'الصيانة الدورية الشهرية',
    loggedBy: 'د. محمد شلقامي'
  },
  {
    id: 'exp_3',
    title: 'أكياس تعقيم وجوانتيات معقمة ومطهرات جراحية',
    category: 'مستلزمات أسنان',
    amount: 1200,
    date: getDateOffset(-5),
    notes: 'مخزن التعقيم المركزي',
    loggedBy: 'فاطمة (تمريض)'
  }
];

export const INITIAL_TASKS: Task[] = [
  {
    id: 'task_1',
    title: 'تعقيم وتجهيز أدوات الزراعة الجراحية لعيادة ١',
    description: 'تشغيل الأوتوكلاف الدورة الثانية والتأكد من مؤشرات التعقيم الكيميائي',
    dueDate: today,
    assignedTo: 'فاطمة (تمريض)',
    priority: 'high',
    recurrence: 'daily',
    isCompleted: false
  },
  {
    id: 'task_2',
    title: 'الاتصال بالحالات المؤكدة للغد لتأكيد المواعيد',
    description: 'تأكيد مواعيد عيادات د. شلقامي والتذكير بإحضار الأشعات والتحاليل المطلوبة',
    dueDate: today,
    assignedTo: 'مريم (الاستقبال)',
    priority: 'medium',
    recurrence: 'daily',
    isCompleted: true,
    completedAt: '12:30',
    completedBy: 'مريم'
  },
  {
    id: 'task_3',
    title: 'استلام مقاسات معمل الأسنان للزيركون وحالات الفينير',
    description: 'معمل ديجيتال دينتال - طربوشين زيركون لمريض عمر طارق ومريضة مريم',
    dueDate: getDateOffset(1),
    assignedTo: 'مريم (الاستقبال)',
    priority: 'high',
    recurrence: 'once',
    isCompleted: false
  },
  {
    id: 'task_4',
    title: 'مراجعة وجرد مستلزمات الحشوات والمبردات المعقمة',
    description: 'حصر النواقص لإرسال طلبية شركة التوريدات الأسبوعية',
    dueDate: getDateOffset(-1),
    assignedTo: 'فاطمة (تمريض)',
    priority: 'low',
    recurrence: 'weekly',
    isCompleted: false
  }
];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

export const INITIAL_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tmpl_1',
    title: 'تأكيد حجز موعد جديد',
    triggerEvent: 'appointment_created',
    timingOffsetMinutes: 0,
    messageTemplate: 'أهلاً بحضرتك يا {{patient_name}} 👋 تم تأكيد حجز موعدك في عيادات د. شلقامي يوم {{date}} الساعة {{time}} مع {{doctor_name}} في {{unit_name}}. نتمنى لك ابتسامة مشرقة وصحة دائمة! ✨',
    isActive: true
  },
  {
    id: 'tmpl_2',
    title: 'تذكير بالموعد قبل 24 ساعة',
    triggerEvent: 'appointment_reminder',
    timingOffsetMinutes: -1440,
    messageTemplate: 'تذكير ودود يا {{patient_name}} بموعدك غداً {{date}} الساعة {{time}} في عيادات د. شلقامي. في حال الرغبة بتأكيد أو تعديل الموعد يرجى الرد على هذه الرسالة. ننتظرك بكل ترحيب! 🦷',
    isActive: true
  },
  {
    id: 'tmpl_3',
    title: 'إشعار بإصدار فاتورة وتفاصيل العلاج',
    triggerEvent: 'invoice_issued',
    timingOffsetMinutes: 0,
    messageTemplate: 'عزيزي/عزيزتي {{patient_name}}، تم إصدار فاتورة علاجية رقم {{invoice_number}} بمبلغ {{amount}} ج.م. إجمالي الرصيد المتبقي: {{balance}} ج.م. شكراً لثقتكم الغالية بعيادتنا.',
    isActive: true
  },
  {
    id: 'tmpl_4',
    title: 'إيصال استلام دفعة وتحديث الرصيد',
    triggerEvent: 'payment_received',
    timingOffsetMinutes: 0,
    messageTemplate: 'تم بنجاح استلام دفعة مالية بقيمة {{amount}} ج.م من {{patient_name}}. الرصيد المتبقي الحالي: {{balance}} ج.م. نسعد دائماً بخدمتكم في عيادات د. شلقامي.',
    isActive: true
  },
  {
    id: 'tmpl_5',
    title: 'تعليمات ورعاية ما بعد الخلع أو الجراحة',
    triggerEvent: 'post_op_care',
    timingOffsetMinutes: 120,
    messageTemplate: 'حمداً لله على سلامتك يا {{patient_name}}! 🌸 تذكير بتعليمات ما بعد الجراحة: ١) العض على القطنة لمدة ساعة كاملة. ٢) تجنب المضمضة أو البصق أو الساخن أول 24 ساعة. ٣) تناول الدواء في مواعيده المحددة. فريق د. شلقامي يتمنى لك شفاءً عاجلاً.',
    isActive: true
  }
];

export const INITIAL_ALERTS: WhatsAppAlert[] = [
  {
    id: 'alert_1',
    patientId: 'pat_1',
    patientName: 'مريم عبد العزيز الشناوي',
    patientPhone: '01098765432',
    templateTitle: 'تأكيد حجز موعد جديد',
    renderedMessage: 'أهلاً بحضرتك يا مريم عبد العزيز الشناوي 👋 تم تأكيد حجز موعدك في عيادات د. شلقامي اليوم الساعة 02:00 م مع د. محمد شلقامي. نتمنى لك ابتسامة مشرقة وصحة دائمة! ✨',
    status: 'pending',
    scheduledFor: today,
    createdAt: new Date().toISOString()
  },
  {
    id: 'alert_2',
    patientId: 'pat_4',
    patientName: 'حازم مصطفى الجوهري',
    patientPhone: '01555544332',
    templateTitle: 'تذكير بالموعد قبل 24 ساعة',
    renderedMessage: 'تذكير ودود يا حازم مصطفى بموعدك اليوم الساعة 05:00 م في عيادات د. شلقامي لإجراء الخلع الجراحي. ننتظرك بكل ترحيب! 🦷',
    status: 'pending',
    scheduledFor: today,
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_WEEKDAYS: WeekdaySetting[] = [
  { dayOfWeek: 6, dayName: 'السبت', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 0, dayName: 'الأحد', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 1, dayName: 'الاثنين', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 2, dayName: 'الثلاثاء', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 3, dayName: 'الأربعاء', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 4, dayName: 'الخميس', isClosed: false, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 },
  { dayOfWeek: 5, dayName: 'الجمعة', isClosed: true, defaultUnitId: 'unit_1', startHour: 13, endHour: 22 } // إجازة أسبوعية
];

