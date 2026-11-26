# ClinicFlow — تصفح تصميم قاعدة البيانات

> **مهم:** ده رسم لتصميم PostgreSQL المقترح على فرع التطوير، **مش قاعدة بيانات شغالة، ومش نسخة من Floot**. ما فيش بيانات مرضى حقيقية في الملف ده. المشروع ما زال محتاج فحص قاعدة Floot الفعلية قبل أي Migration.

## 1. المستخدمين، الفروع والمرضى

```mermaid
erDiagram
  organizations ||--o{ users : has
  organizations ||--o{ branches : has
  organizations ||--o{ patients : owns
  organizations ||--o{ patient_sources : manages
  organizations ||--o{ tags : manages
  organizations ||--|| patient_form_settings : configures
  users ||--|| user_credentials : signs_in
  users ||--o{ auth_sessions : sessions
  users ||--o{ branch_members : assigned
  branches ||--o{ branch_members : assignments
  patients ||--o{ patient_tags : tagged
  tags ||--o{ patient_tags : chosen
  patients ||--o{ patient_notes : notes
  patient_notes ||--o{ patient_note_audit : changes
  users ||--o{ patient_notes : authors
  organizations {
    uuid id PK
    text name
  }
  users {
    uuid id PK
    uuid organization_id FK
    text role
    boolean active
  }
  branches {
    uuid id PK
    text name
    int geofence_radius_m
  }
  patients {
    uuid id PK
    text full_name
    text phone
    uuid source_id FK
  }
  patient_notes {
    uuid id PK
    uuid patient_id FK
    uuid author_id FK
  }
```

## 2. المواعيد، المهام والحضور

```mermaid
erDiagram
  patients ||--o{ appointments : booked_for
  branches ||--o{ appointments : located_at
  procedures ||--o{ appointments : optional_service
  users ||--o{ appointments : created_by
  organizations ||--o{ tasks : manages
  users ||--o{ tasks : assigned_to
  tasks ||--o{ task_occurrences : scheduled
  users ||--o{ attendance : clocks
  branches ||--o{ attendance : location
  patients ||--o{ crm_followups : follows
  users ||--o{ crm_followups : assigned
  appointments {
    uuid id PK
    uuid patient_id FK
    uuid branch_id FK
    timestamptz scheduled_at
  }
  tasks {
    uuid id PK
    uuid assigned_user_id FK
    date start_date
    text recurrence
  }
  task_occurrences {
    uuid id PK
    uuid task_id FK
    date scheduled_on
    text status
  }
  attendance {
    uuid id PK
    uuid user_id FK
    uuid branch_id FK
    timestamptz clock_in_at
    timestamptz clock_out_at
  }
```

## 3. الفواتير والمدفوعات والمصاريف

```mermaid
erDiagram
  patients ||--o{ invoices : billed
  invoices ||--o{ invoice_items : has
  procedures ||--o{ invoice_items : service
  invoices ||--o{ payments : receives
  branches ||--o{ expenses : attributed_to
  organizations ||--o{ audit_logs : tracks
  users ||--o{ audit_logs : performs
  invoices {
    uuid id PK
    uuid patient_id FK
    text invoice_number
    numeric discount_amount
  }
  invoice_items {
    uuid id PK
    uuid invoice_id FK
    numeric quantity
    numeric unit_price
  }
  payments {
    uuid id PK
    uuid invoice_id FK
    numeric amount
    text method
  }
  expenses {
    uuid id PK
    numeric amount
    text category
  }
```

## الملفات والاختبارات

- [ملف إنشاء الجداول، العلاقات والقيود — 001_foundation.sql](../migrations/001_foundation.sql)
- [قيم مصادر المرضى والتاجز — 002_initial_options.sql](../migrations/002_initial_options.sql)
- [البرومبت الأحدث وقواعد التوافق مع Floot](./DEVELOPMENT_TARGET_2026-10-17.md)
- [فحص Schema الأصلي بأسئلة SQL للقراءة فقط](./FLOOT_SCHEMA_INSPECTION_READONLY.sql)
- [تسجيل الدخول — كود Backend مقترح](../api/auth/login.js)
- [جلسات المستخدمين](../api/auth/session.js)
- [اختبارات Postgres المؤقتة](../tests/auth.test.mjs)

### الخطوة المطلوبة لتحويل التصميم إلى Database حقيقية

نحتاج أولًا نفحص الجداول والعلاقات الموجودة فعلًا في **Floot PostgreSQL**، وبعدها نحدد إذا هنكمل قاعدة Floot نفسها أو نجهز Database مستقلة وننفذ نقل بيانات مُراجع وآمن. القاعدة الموجودة على GitHub هي **كود للتصميم**؛ GitHub مش بيشغل PostgreSQL.

> **تنبيه:** الرسم الحالي يوضح أول Schema تجريبي، وفيه ربط إلزامي للمهام والفواتير بفرع، بينما البرومبت الأحدث يطلب نظام بيانات موحدًا للعيادتين. **لا تطبّق SQL المقترح على قاعدة Floot** قبل تصحيح الفروق وفحص المخطط الأصلي.
