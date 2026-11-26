# Dr Mai Kassem — تقرير الاستكمال والتحقق المحلي، 25 أكتوبر 2026

## الفرع وحدود الشغل

- البداية: `f91caa6420dbd7ee44d68b99becd067ee0bc97d7` على `work/dr-mai-mobile-ux-v4-20261025`؛ مفيش commits أحدث وقت الـfetch.
- فرع الشغل: `work/dr-mai-codex-continuation-20261025`، بدون reset أو تغيير تاريخ Git.
- التغييرات والـcommits محلية. لم يتم push، أو إنشاء PR، أو تشغيل deployment/merge؛ تجنبنا أي نشر تلقائي من Git integrations.
- كل PostgreSQL المستخدم هنا محلي مؤقت داخل Docker، ببيانات synthetic فقط. لم يتم الاتصال بمشروع Neon أو أي قاعدة Production، ولم تُستخدم بيانات مرضى أو credentials حقيقية.
- التطبيق فضل عيادة واحدة ووحدتي عمل؛ الـfixtures الجديدة لها organization مستقل. اختبارات المستودع القديمة اشتغلت في قواعد محلية منفصلة، بدون خلط مع أي نظام فعلي.

## اللي اتنفّذ فعلًا

### إصلاحات الوظائف والبيانات

1. اتصلّحت قائمة `submitForm`: كانت بتستبعد `newWhatsappTemplate` و`editWhatsappTemplate` و`manualAttendance` رغم وجود handlers ليهم. دلوقتي إنشاء/تعديل القالب والبصمة اليدوية بيبعتوا للـAPI من الواجهة، مع منع الـnative form navigation والضغط المتكرر. اتضافت اختبارات لنفس handler، وتحققت العمليات من متصفح حقيقي.
2. السيرفر المحلي بقى بيسجّل `/api/whatsapp` و`/api/attendance-manual`، واختبار تطابق المسارات بقى في الاتجاهين بين السيرفر وVercel gateway.
3. أحداث WhatsApp لازم يكون مصدرها موجود ومرتبط بنفس المريض والمؤسسة. الأحداث اليتيمة أو ذات الربط القديم ما بتتحولش لتنبيهات قابلة للإرسال.
4. سجل إجراء الموظف على التنبيه بقى يحتفظ بالمستلم والرقم والنص المخصص وIDs وقت الإجراء، علشان إعادة تعيين الحجز لاحقًا ما تغيّرش معنى سجل التدقيق. الرد العام للـAPI بيفضل `id/status` فقط.
5. أرقام WhatsApp بتستخدم نفس Egyptian phone normalization المشترك، مع رفض الأرقام غير الصالحة.
6. اتصلّح شرط زر إضافة المهمة اللي كان ممكن يعرض `true` بدل الزر، واتضاف زر الرجوع لليوم مع تصحيح معالجته، وحالة الصفحة النشطة لزر «حسابات».
7. اتصلّح Escape في البحث، تباين نص الدخول، وتباين الـdate-picker overlay. اتصلّحت محاذاة اتصال/واتساب/تعديل المريض، وتعارض لون شريط الميعاد مع شارة حالته.

لم يتم تغيير الحسابات المالية أو حذف تاريخ قديم. التحقق الحقيقي أكد cents/rounding، ثبات invoice-item IDs، عدم تكرار procedure events، payment idempotency، منع overpayment، stale writes، الإلغاء والتدقيق والصلاحيات.

### واجهة الموبايل

- عناوين أقسام مستقلة بأيقونات وسياق عربي، بما فيها قوالب WhatsApp والتنبيهات اللي كان عنوانها ناقص.
- تحسين الكروت والمسافات والنماذج وbottom sheets والتنقل السفلي والـheader.
- مبالغ الفاتورة بقت حقول `dl/dt/dd` منفصلة للصافي والمدفوع والمتبقي؛ المدفوع والمتبقي لسه محميين بصلاحية payments-view، واتضاف تحقق مباشر من عدم ظهورهم لموظف invoice-only.
- تحسين عرض جدول اليوم وحالة الوردية وكارت رسالة WhatsApp، مع الحفاظ على الإجراءات والصلاحيات الموجودة.
- تحديث نسخة Service Worker shell cache، بدون توسيع الـallowlist لتشمل أي بيانات.

### الاختبارات والتشغيل

- اتضاف `package-lock.json` ونجح `npm ci`؛ CI بقى بيستخدمه.
- اتضاف `test:all-local` و`test:http` و`test:clinical-browser`.
- اختبارات DB بترفض العناوين البعيدة وأي قاعدة غير محلية مخصصة للاختبار، حتى لو `DATABASE_URL` موجود.
- اتصلّح اختبار auth اللي كان بيعطّل كل الـadmins؛ بقى يختبر الحساب المقصود ويرجّعه في cleanup. واتصلّح اختيار admin غير تابع للمؤسسة في fixture قديم.
- JSDOM بيتقفل حتى لو assertion فشلت، ففشل الاختبار ما بيعلّقش التشغيل.
- تحديث توقعات قديمة للتصميم والعناوين وواجهة fresh install، بدون حذف اختبارات الصلاحيات أو إضعاف دقة الحسابات. فلاتر imported-debt غير المعروضة في fresh install تم التحقق من تصنيفها عبر الـAPI، واختبارات legacy debt الفعلية فضلت موجودة.

## النتائج المنفّذة

المجموعات دي متداخلة؛ الأعداد ما تتجمعش باعتبارها اختبارات مستقلة إضافية.

| المستوى/الأمر | النتيجة |
|---|---|
| `npm ci` و`check:server` | نجحوا |
| `test:all-local`، Node 24.19.0 وPostgreSQL 16 | 329/329، صفر failures وصفر skips |
| `test:ui-local`، source checks وhermetic JS handlers | 93/93 |
| `test:mobile-safe`، source/handler/JSDOM | 163/163 |
| `test:http`، HTTP حقيقي مع PostgreSQL | 5 سيناريوهات كاملة + parent = 6/6 |
| `test:mobile-browser`، Chromium وWebKit مع synthetic HTTP fixture | 2/2، 8 مقاسات هاتف و6 شاشات وaxe WCAG AA |
| `test:clinical-browser`، Chromium → HTTPS محلي → API → PostgreSQL | نجح السكريبت كاملًا، admin وموظف محدود الصلاحيات |
| Fresh-install migrations وbootstrap وverify-fresh ثم إعادة migrations/verify | نجحوا على قاعدة محلية جديدة؛ 20 migration بالترتيب |
| Actual Android/iOS hardware وhome-screen installation | لم يُنفّذ؛ مفيش أجهزة فعلية متاحة |
| Deployed Vercel API / Preview للـHEAD الجديد | لم يُنفّذ؛ لم يتم نشر هذا الـHEAD |

### تفاصيل التحقق الحقيقي

- HTTP: patient → booking → timeline، cross-tenant denial، concurrent receipts/replay/overpayment، stable item IDs، stale versions، financial module permissions.
- WhatsApp: إنشاء/تعديل/إيقاف/تفعيل القالب؛ موعد وتنبيه فعلي؛ rescheduling؛ cancellation؛ archived patient؛ missing/invalid phone؛ orphan source؛ current payment amount؛ concurrent sent/dismissed؛ immutable audit snapshot بعد patient reassignment.
- Attendance: admin-only/manual reason، GPS-free fields، duplicate/open-shift protection، GPS concurrent taps، الإغلاق بعد تغيير عضوية وحدة العمل، وسجلات التدقيق.
- المتصفح الكامل: nested patient creation، booking conflict acknowledgement، calendar modes، patient history/Palmer، invoice/payment، staff permissions، GPS، correction، expenses/filtering، WhatsApp template editing/toggling، deep-link handoff، manual sent، وبصمة admin بداية ونهاية.
- WhatsApp اتعترض محليًا في اختبار المتصفح. مفيش رسالة خرجت ولا ادعاء delivery confirmation؛ `deliveryConfirmed:false` متحقق منه في DB.
- الـPWA worker اتفعّل فعلًا عبر HTTPS محلي، واتراجع محتوى caches للتأكد إنه محصور في public shell assets، بدون HTML أو API/auth/clinical records.

### تجهيز بيئة الاختبار

WebKit احتاج مكتبات Linux إضافية؛ تم تنزيلها من Debian واستخراجها محليًا وربطها داخل browser cache، بدون تغيير كود التطبيق أو assertions. شُغلت المتصفحات فعليًا باستخدام `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` لأن فحص النظام لا يرى المكتبات المستخرجة. ده تجاوز لفحص تجهيز النظام فقط؛ اختبارات المتصفح نفسها لم يتم skip لها. CI يثبت المكتبات بالطريقة المعتادة باستخدام Playwright.

اختبار HTTPS المحلي بيستخدم certificate مؤقت self-signed؛ Chromium في سكريبت القبول فقط بيستخدم `--ignore-certificate-errors` علشان تسجيل الـService Worker المحلي. ده إعداد fixture، وليس تغييرًا في التطبيق أو بيئة نشر.

## الصور والمراجعة

صور synthetic موجودة محليًا، وغير مرفوعة إلى Git:

- `artifacts/clinical-qa/patient-390.png`
- `artifacts/clinical-qa/invoices-360.png`
- `artifacts/clinical-qa/alerts-{360,390,430,768,1280}.png`
- `artifacts/mobile-qa/` لصور الـnative smoke suite.

## المتبقي قبل أي إطلاق، بالترتيب

1. اختبار الـHEAD نفسه على بيئة Preview معزولة مرتبطة بـDr Mai QA فقط، بعد السماح بالنشر؛ الـHTTP المحلي لا يثبت إعدادات Vercel المنشورة أو cookies/origins هناك.
2. QA على Android/iPhone فعليين: لوحة المفاتيح، date pickers، GPS permission، safe areas، تبديل التطبيقات وWhatsApp، وتثبيت الـPWA على الشاشة الرئيسية.
3. مراجعة التصميم وسيناريوهات التشغيل مع مستخدم العيادة، ثم قرار إطلاق مستقل. مفيش ادعاء Production readiness أو سماح ضمني بالنشر هنا.

مفيش known failing local automated check بعد الإصلاحات. لم تحدث أي عملية Production أو تعديل قاعدة Neon أو deploy أو merge.

## الملفات المتغيرة من baseline

- `.github/workflows/backend-foundation.yml`
- `.github/workflows/backend-safety.yml`
- `.github/workflows/dr-mai-native-mobile.yml`
- `.gitignore`
- `api/whatsapp.js`
- `native-mobile.css`
- `package-lock.json`
- `package.json`
- `pilot.css`
- `pilot.html`
- `pilot.js`
- `scripts/run-local-tests.mjs`
- `server.mjs`
- `sw.js`
- `tests/admin-analytics.test.mjs`
- `tests/appointment-detail.test.mjs`
- `tests/attendance-adjust.test.mjs`
- `tests/attendance-integration.test.mjs`
- `tests/auth.test.mjs`
- `tests/booking-weekday-settings.test.mjs`
- `tests/branch-management.test.mjs`
- `tests/crm.test.mjs`
- `tests/disposable-database.test.mjs`
- `tests/dr-mai-http-integration.test.mjs`
- `tests/dr-mai-whatsapp-handler.test.mjs`
- `tests/expenses.test.mjs`
- `tests/finance-audit.test.mjs`
- `tests/finance.test.mjs`
- `tests/financial-edit.test.mjs`
- `tests/financial-ledger.test.mjs`
- `tests/global-search.test.mjs`
- `tests/helpers/disposable-database.mjs`
- `tests/incremental-ux.test.mjs`
- `tests/invoice-statement.test.mjs`
- `tests/legacy-debt.test.mjs`
- `tests/legacy-source-notes.test.mjs`
- `tests/mobile-browser.mjs`
- `tests/native-mobile-browser.test.mjs`
- `tests/native-mobile-submit.test.mjs`
- `tests/ops.test.mjs`
- `tests/patient-record-management.test.mjs`
- `tests/patient-voice-notes.test.mjs`
- `tests/payment-source.test.mjs`
- `tests/pilot.test.mjs`
- `tests/staff-account-management.test.mjs`
- `tests/task-calendar.test.mjs`
- `tests/vercel-hobby.test.mjs`
- `docs/DR_MAI_CONTINUATION_20261025.md`
