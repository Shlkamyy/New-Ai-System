const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cur.trim());
      if (row.some(x => x.length > 0)) lines.push(row);
      row = [];
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.some(x => x.length > 0)) lines.push(row);
  }
  return lines;
}

const patientFiles = [
  path.join(__dirname, '../public/assets/aistudio/Patients_1_-_1000_83154ad5.csv'),
  path.join(__dirname, '../public/assets/aistudio/Patients_1001_-_2000_bfef422a.csv'),
  path.join(__dirname, '../public/assets/aistudio/Patients_2001_-_2460_a336dc8a.csv')
];

const appointmentFiles = [
  path.join(__dirname, '../public/assets/aistudio/Appointments_1_-_1000_a71596bf.csv'),
  path.join(__dirname, '../public/assets/aistudio/Appointments_1001_-_2000_193a23e7.csv'),
  path.join(__dirname, '../public/assets/aistudio/Appointments_2001_-_3000_97b0a528.csv'),
  path.join(__dirname, '../public/assets/aistudio/Appointments_3001_-_4000_c8375b73.csv'),
  path.join(__dirname, '../public/assets/aistudio/Appointments_4001_-_5000_494394c3.csv'),
  path.join(__dirname, '../public/assets/aistudio/Appointments_5001_-_6000_494394c3.csv'),
  path.join(__dirname, '../public/assets/aistudio/Appointments_6001_-_6738_7e19291f.csv')
];

const operationFiles = [
  path.join(__dirname, '../public/assets/aistudio/Operations_1_-_1000_d1897651.csv'),
  path.join(__dirname, '../public/assets/aistudio/Operations_1001_-_2000_377b9e80.csv'),
  path.join(__dirname, '../public/assets/aistudio/Operations_2001_-_2479_52f7b692.csv')
];

const notesFile = path.join(__dirname, '../public/assets/aistudio/Notes_1_-_668_d062fbd3.csv');

function cleanPhone(p) {
  if (!p) return '';
  let digits = p.replace(/[^0-9]/g, '');
  if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20') && digits.length >= 12) digits = digits.slice(2);
  else if (digits.startsWith('2') && digits.length === 11 && digits[1] === '1') digits = digits.slice(1);
  if (!digits.startsWith('0') && digits.length === 10) digits = '0' + digits;
  return digits;
}

function cleanName(first, last) {
  let f = (first || '').trim().replace(/^[\.\s]+|[\.\s]+$/g, '');
  let l = (last || '').trim().replace(/^[\.\s]+|[\.\s]+$/g, '');
  return (f + ' ' + l).trim().replace(/\s+/g, ' ');
}

function normalizeArabic(s) {
  return (s || '')
    .trim()
    .replace(/^[\.\s]+|[\.\s]+$/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

const femaleFirstNames = new Set([
  'سهام', 'هنا', 'رزان', 'حبيبة', 'حبيبه', 'امينة', 'امينه', 'نورهان', 'سلمي', 'سلمى', 'اية', 'ايه', 'مريم', 'زينب', 'فريدة', 'فريده',
  'سالي', 'دهب', 'روان', 'جويريه', 'ماريا', 'نوره', 'نجلاء', 'تقي', 'تقى', 'شاهندا', 'سمية', 'سميه', 'صفاء', 'منه', 'منة', 'سحر', 'عبير',
  'ميادة', 'مياده', 'منال', 'ريهام', 'ريتال', 'ندي', 'ندى', 'نعمة', 'نعمه', 'شرين', 'شيرين', 'راقية', 'راقيه', 'ملك', 'امل', 'ناهد',
  'ابتسام', 'رهف', 'مروة', 'مروه', 'تهاني', 'فرح', 'اسراء', 'إسراء', 'اسماء', 'أسماء', 'جهاد', 'نادية', 'ناديه', 'سمر', 'ريناد', 'حنين',
  'فداء', 'امنية', 'امنيه', 'سندس', 'الفت', 'تسنيم', 'شيماء', 'محاسن', 'انوار', 'رتيبة', 'رتيبه', 'رويدا', 'فردوس', 'صباح', 'نورين', 'هالة',
  'هاله', 'الاء', 'آلاء', 'هند', 'يارا', 'بسملة', 'بسمله', 'نرمين', 'نيرمين', 'رانيا', 'رنيا', 'سما', 'صافي', 'داليا', 'وفاء', 'سماح', 'جني',
  'جنى', 'اصاله', 'فوقيه', 'خديجه', 'عفاف', 'ليله', 'احلام', 'شروق', 'صابرين', 'مرفت', 'هبه', 'تيا', 'غاده', 'غادة', 'هاله', 'هدير',
  'امال', 'آمال', 'سعاد', 'مهجه', 'علا', 'رنا', 'دعاء', 'يسرى', 'ضحى', 'لينا', 'كارما', 'كرمة', 'قمر', 'مبروكه', 'نغم', 'فاطمة', 'فاطمه',
  'ايسل', 'مها', 'كريمه', 'كريمان', 'نفين', 'همت', 'يمنى', 'ولاء', 'روان', 'ماجده', 'منار', 'ماسه', 'رقيه', 'سميره', 'ناريمان', 'رودينا',
  'روز', 'رولاا', 'بشري', 'وسام', 'شريهان', 'انتصار', 'ساميه', 'سامية', 'ليلى', 'لمياء', 'سيمون', 'هاجر', 'مارينا', 'مرينا', 'مريانا',
  'خلود', 'سوزان', 'عايدة', 'كارول', 'فاتن', 'شمس', 'عظيمه', 'جلشان', 'فوزيه', 'لوچين', 'حمديه', 'ثريا', 'سناء', 'شهد', 'ميرنا', 'ساره', 'سارة'
]);

function guessGender(firstName, title) {
  if (title && (title.toLowerCase().includes('mrs') || title.toLowerCase().includes('ms'))) return 'أنثى';
  const f = firstName.trim().split(/\s+/)[0];
  const norm = normalizeArabic(f);
  for (const name of femaleFirstNames) {
    if (norm === normalizeArabic(name)) return 'أنثى';
  }
  return 'ذكر';
}

function parseDateTime(dStr) {
  if (!dStr) return null;
  const parts = dStr.trim().split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '12:00';
  const dp = datePart.split('/');
  if (dp.length === 3) {
    const day = dp[0].padStart(2, '0');
    const month = dp[1].padStart(2, '0');
    const year = dp[2];
    return {
      date: `${year}-${month}-${day}`,
      time: timePart.slice(0, 5)
    };
  }
  return null;
}

function mapDoctor(d, userFrom) {
  const check = ((d || '') + ' ' + (userFrom || '')).toLowerCase();
  if (check.includes('mayar') || check.includes('ميار')) return { id: 'doc_2', name: 'د. ميار إيفي' };
  if (check.includes('wakil') || check.includes('الوكيل')) return { id: 'doc_3', name: 'د. محمود الوكيل' };
  if (check.includes('bassiony') || check.includes('بسيوني')) return { id: 'doc_4', name: 'د. أحمد بسيوني' };
  return { id: 'doc_1', name: 'د. محمد شلقامي' };
}

function mapBranchAndUnit(room, branch) {
  const str = (room || '') + ' ' + (branch || '');
  if (str.includes('تشاو')) {
    return { unitId: 'unit_chow', unitName: 'عيادة تشاو مول', branchName: 'فرع تشاو مول' };
  }
  if (str.includes('عرابي ٢') || str.includes('عرابي 2')) {
    return { unitId: 'unit_urabi2', unitName: 'عيادة عرابي ٢', branchName: 'فرع عرابي - الوحدة التخصصية' };
  }
  return { unitId: 'unit_urabi', unitName: 'عيادة عرابي', branchName: 'فرع عرابي الرئيسي' };
}

function cleanReferral(ref, subtype, fromPat, fromUser) {
  let base = (ref || '').trim();
  if (!base && subtype) base = subtype.trim();

  const map = {
    'حالة دكتور': 'تحويل طبيب',
    'عميل آخر': 'توصية مريض آخر',
    'اليافطة المضيئة': 'يافطة العيادة',
    'Social media smile': 'سوشيال ميديا (Smile)',
    'Social media smart': 'سوشيال ميديا (Smart)',
    'CliniDo': 'منصة كلينيدو (CliniDo)',
    'فيزيتا': 'منصة فيزيتا (Vezeeta)',
    'معارف و اصدقاء': 'معارف وأصدقاء',
    'متابعة شغل قديم': 'متابعة علاج سابق',
    'تقويم': 'استشارة تقويم'
  };

  let clean = map[base] || base || 'زيارة مباشرة للعيادة';
  if (fromPat && fromPat.trim()) {
    clean += ` (عن طريق المريض: ${fromPat.trim()})`;
  } else if (fromUser && fromUser.trim()) {
    clean += ` (بواسطة: ${fromUser.trim()})`;
  }
  return clean;
}

function cleanTags(rawTags) {
  if (!rawTags) return [];
  const tagList = rawTags.split(',').map(t => t.trim()).filter(Boolean);
  const tagMap = {
    'خلصت شغل': 'تم إنهاء العلاج',
    'Vip': 'VIP',
    'زراعة': 'زراعة أسنان',
    'شغل معمل': 'شغل معمل وتركيبات',
    'تقويم مجاني': 'تقويم أسنان',
    'كشف زراعه': 'كشف زراعة',
    'عرض التنضيف ٢٠٠': 'عرض تنظيف الأسنان',
    'عرض الكشف المجاني': 'كشف استشاري',
    'عرض التبييض ١٥٠٠': 'عرض تبييض الأسنان',
    'Follow Up New Rx': 'متابعة علاجية',
    'Follow Up Old Rx': 'متابعة دورية',
    'جروب الواتس': 'مجموعة واتساب',
    'No Main': 'علاج تكميلي',
    'Main': 'حالة رئيسية',
    'Remain': 'متبقي حساب',
    'Not interested': 'غير مهتم حالياً',
    'Potential': 'مريض واعد',
    'Maii': 'حالة د. مي',
    'دكتورة  رحمة': 'إشراف د. رحمة',
    'د سلمي': 'إشراف د. سلمى',
    'د ساره': 'إشراف د. سارة',
    'Clinido': 'حجز كلينيدو',
    'Vezeeta': 'حجز فيزيتا',
    'QR Code': 'مسح كود العيادة'
  };

  const set = new Set();
  tagList.forEach(t => {
    const mapped = tagMap[t] || t;
    set.add(mapped);
  });
  return Array.from(set);
}

function parseToothToPalmer(toothStr) {
  if (!toothStr || toothStr === 'mouth' || toothStr === 'upper' || toothStr === '0') return [];
  const results = [];
  const tokens = toothStr.split(/[,،\s]+/).filter(Boolean);
  for (const token of tokens) {
    const m = token.toUpperCase().match(/^(UR|UL|LL|LR)([1-8])$/);
    if (m) {
      const quad = m[1];
      const num = parseInt(m[2], 10);
      if (quad === 'UR') results.push(10 + num);
      else if (quad === 'UL') results.push(20 + num);
      else if (quad === 'LL') results.push(30 + num);
      else if (quad === 'LR') results.push(40 + num);
    } else {
      const n = parseInt(token, 10);
      if (n >= 11 && n <= 48 && (n % 10 <= 8) && (n % 10 >= 1)) {
        results.push(n);
      }
    }
  }
  return results;
}

// 1. Parse all patient rows
const rawPatientRows = [];
patientFiles.forEach((filePath, fIndex) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);
  if (rows.length > 0) {
    const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));
    rows.slice(1).forEach((r, rIdx) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] || '';
      });
      obj._fileIndex = fIndex;
      obj._rowNumber = rIdx + 1;
      rawPatientRows.push(obj);
    });
  }
});

console.log(`Parsed ${rawPatientRows.length} raw Patient CSV rows.`);

// 2. Deduplicate patients
const dedupeMap = new Map();
rawPatientRows.forEach((row, i) => {
  const fullName = cleanName(row['First Name'], row['Last Name']);
  const phone = cleanPhone(row['Phone Number']) || `010${String(i).padStart(8, '0')}`;
  const key = `${normalizeArabic(fullName)}___${phone}`;

  if (!dedupeMap.has(key)) {
    dedupeMap.set(key, { ...row, _allRows: [row] });
  } else {
    const existing = dedupeMap.get(key);
    existing._allRows.push(row);

    const exPaid = parseFloat(existing['Total Payments'] || 0) || 0;
    const curPaid = parseFloat(row['Total Payments'] || 0) || 0;
    existing['Total Payments'] = String(Math.max(exPaid, curPaid));

    const exRem = parseFloat(existing['Remaining'] || 0) || 0;
    const curRem = parseFloat(row['Remaining'] || 0) || 0;
    existing['Remaining'] = String(curRem > 0 ? curRem : exRem);

    const t1 = existing['patientTags'] || '';
    const t2 = row['patientTags'] || '';
    const combined = Array.from(new Set([...t1.split(','), ...t2.split(',')])).filter(Boolean).join(',');
    existing['patientTags'] = combined;

    if (!existing['Details'] && row['Details']) existing['Details'] = row['Details'];
    if (!existing['Secondary Number'] && row['Secondary Number']) existing['Secondary Number'] = row['Secondary Number'];
    if (!existing['Address'] && row['Address']) existing['Address'] = row['Address'];
    if (!existing['Last Appointment Date'] && row['Last Appointment Date']) {
      existing['Last Appointment Date'] = row['Last Appointment Date'];
      existing['Last Appointment Status'] = row['Last Appointment Status'];
      existing['Last Appointment Room'] = row['Last Appointment Room'];
    }
  }
});

console.log(`Deduplicated into ${dedupeMap.size} unique patients.`);

// 3. Build patient structures
const patients = [];
const patientLookupByPhone = new Map();
const patientLookupByName = new Map();
const patientLookupByNamePhone = new Map();
const patientLookupByNameDate = new Map();
const patientsByName = new Map();

function findMatchingPatient(rawName, rawPhone, rawDate) {
  const normName = normalizeArabic(rawName);
  if (normName && rawPhone) {
    const byNP = patientLookupByNamePhone.get(`${normName}___${rawPhone}`);
    if (byNP) return byNP;
  }
  if (normName && rawDate) {
    const byND = patientLookupByNameDate.get(`${normName}___${rawDate}`);
    if (byND) return byND;
  }
  if (normName) {
    const candidates = patientsByName.get(normName) || [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const matchPhone = candidates.find(c => c.phone === rawPhone || c.secondaryPhone === rawPhone);
      if (matchPhone) return matchPhone;
      return candidates[0];
    }
  }
  if (rawPhone) {
    const byPhone = patientLookupByPhone.get(rawPhone);
    if (byPhone) {
      const pFirst = normalizeArabic(byPhone.name).split(' ')[0];
      const rFirst = normName.split(' ')[0];
      if (!normName || (pFirst && rFirst && pFirst === rFirst)) {
        return byPhone;
      }
    }
  }
  return null;
}

let pIndex = 1;

for (const [key, row] of dedupeMap.entries()) {
  const fullName = cleanName(row['First Name'], row['Last Name']);
  const phone = cleanPhone(row['Phone Number']) || `010${String(pIndex).padStart(8, '0')}`;
  const secPhone = cleanPhone(row['Secondary Number']);
  const patId = `pat_${pIndex}`;
  const patientCode = `P-${String(pIndex).padStart(4, '0')}`;

  const doctorInfo = mapDoctor(row['Doctor'], row['From User']);
  const branchInfo = mapBranchAndUnit(row['Last Appointment Room'] || row['Active Appointment Room'], row['Branch']);

  const totalPaid = parseFloat(row['Total Payments'] || 0) || 0;
  const outstandingBalance = parseFloat(row['Remaining'] || 0) || 0;
  const totalBilled = Math.round((totalPaid + outstandingBalance) * 100) / 100;

  const createdParsed = parseDateTime(row['Created']);
  const registeredDate = createdParsed ? createdParsed.date : '2025-01-01';

  let age = undefined;
  if (row['Date of Birth']) {
    const dobParsed = parseDateTime(row['Date of Birth']);
    if (dobParsed) {
      const birthYear = parseInt(dobParsed.date.split('-')[0], 10);
      if (birthYear > 1920 && birthYear <= 2026) {
        age = 2026 - birthYear;
      }
    }
  }
  const gender = guessGender(row['First Name'], row['Title']);

  const tags = cleanTags(row['patientTags']);
  if (totalBilled >= 10000 && !tags.includes('VIP')) {
    tags.unshift('VIP');
  }

  let followUpStatus = 'جديد';
  const activeApptStatus = row['Active Appointment Status'];
  const lastApptStatus = row['Last Appointment Status'];

  if (tags.includes('تم إنهاء العلاج')) {
    followUpStatus = 'مكتمل';
  } else if (activeApptStatus === 'Open' || activeApptStatus === 'Confirmed' || activeApptStatus === 'Checked In') {
    followUpStatus = 'موعد قادم';
  } else if (outstandingBalance > 0 || tags.includes('متابعة علاجية') || tags.includes('متابعة دورية')) {
    followUpStatus = 'قيد المتابعة';
  } else if (lastApptStatus === 'Completed') {
    followUpStatus = 'مكتمل';
  } else if (lastApptStatus === 'Canceled') {
    followUpStatus = 'تم الإلغاء';
  }

  const address = row['Address'] ? row['Address'].trim() : (branchInfo.branchName.includes('تشاو') ? 'دمنهور - بالقرب من تشاو مول' : 'دمنهور - شارع عرابي');

  const notes = [];
  let noteIndex = 1;
  if (row['Details'] && row['Details'].trim()) {
    notes.push({
      id: `note_${patId}_${noteIndex++}`,
      patientId: patId,
      authorName: doctorInfo.name,
      authorRole: 'استشاري العيادة',
      isAdminAuthored: true,
      content: row['Details'].trim().replace(/^[-_]\s*/, ''),
      createdAt: `${registeredDate}T10:00:00.000Z`
    });
  }

  const referralDetails = (row['Referral Details'] || '').trim();
  const fromPatient = (row['From Patient'] || '').trim();
  if (fromPatient) {
    notes.push({
      id: `note_${patId}_${noteIndex++}`,
      patientId: patId,
      authorName: 'فريق الاستقبال',
      authorRole: 'استقبال',
      isAdminAuthored: false,
      content: `تم تسجيل المريض بتوصية مباشرة من المريض: ${fromPatient}`,
      createdAt: `${registeredDate}T09:30:00.000Z`
    });
  } else if (referralDetails) {
    notes.push({
      id: `note_${patId}_${noteIndex++}`,
      patientId: patId,
      authorName: 'فريق الاستقبال',
      authorRole: 'استقبال',
      isAdminAuthored: false,
      content: `مصدر الإحالة: ${referralDetails}`,
      createdAt: `${registeredDate}T09:30:00.000Z`
    });
  }

  let emergencyContact = undefined;
  if (row['Emergency First Name'] || row['Emergency Phone Number']) {
    emergencyContact = {
      name: `${row['Emergency First Name']} ${row['Emergency Last Name']}`.trim(),
      phone: cleanPhone(row['Emergency Phone Number']) || row['Emergency Phone Number'],
      relationship: row['Relationship'] || 'قريب'
    };
  }

  const lastApptParsed = parseDateTime(row['Last Appointment Date']);
  const prevApptParsed = parseDateTime(row['Prev Appointment Date']);
  const activeApptParsed = parseDateTime(row['Active Appointment Date']);

  let lastVisitDate = lastApptParsed ? lastApptParsed.date : (prevApptParsed ? prevApptParsed.date : undefined);
  let nextAppointmentDate = activeApptParsed ? activeApptParsed.date : undefined;

  const patientObj = {
    id: patId,
    patientCode,
    name: fullName,
    phone,
    secondaryPhone: secPhone || undefined,
    age,
    gender,
    referralSource: cleanReferral(row['Referral'], row['Referral Subtype'], row['From Patient'], row['From User']),
    tags,
    followUpStatus,
    registeredDate,
    totalBilled,
    totalPaid,
    outstandingBalance,
    palmerTeeth: tags.includes('زراعة أسنان') ? [16, 26] : tags.includes('شغل معمل وتركيبات') ? [11, 21] : [],
    notes,
    points: row['Points'] && parseFloat(row['Points']) > 0 ? parseFloat(row['Points']) : undefined,
    address,
    doctorName: doctorInfo.name,
    branchName: branchInfo.branchName,
    lastVisitDate,
    nextAppointmentDate,
    emergencyContact,
    _rawRow: row
  };

  patients.push(patientObj);
  if (phone) {
    patientLookupByPhone.set(phone, patientObj);
    patientLookupByNamePhone.set(`${normalizeArabic(fullName)}___${phone}`, patientObj);
  }
  const normName = normalizeArabic(fullName);
  patientLookupByName.set(normName, patientObj);
  patientLookupByNameDate.set(`${normName}___${registeredDate}`, patientObj);
  if (!patientsByName.has(normName)) patientsByName.set(normName, []);
  patientsByName.get(normName).push(patientObj);

  pIndex++;
}

// 4. Parse Appointments
const appointments = [];
const patientApptsMap = new Map();
const apptDedupSet = new Set();

const statusMap = {
  'Completed': 'completed',
  'Open': 'booked',
  'Confirmed': 'confirmed',
  'Checked In': 'arrived',
  'In Progress': 'arrived',
  'Canceled': 'cancelled',
  'No Show': 'no_show',
  'Delayed': 'booked'
};

let aptIndex = 1;

appointmentFiles.forEach((fPath) => {
  if (!fs.existsSync(fPath)) return;
  const content = fs.readFileSync(fPath, 'utf8');
  const rows = parseCSV(content);
  if (rows.length === 0) return;
  const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));

  const startIdx = headers.indexOf('Start');
  const endIdx = headers.indexOf('End');
  const statusIdx = headers.indexOf('Status');
  const roomIdx = headers.indexOf('Room');
  const typeIdx = headers.indexOf('Type');
  const docIdx = headers.indexOf('Doctor');
  const branchIdx = headers.indexOf('Branch');
  const patIdx = headers.indexOf('Patient');
  const phoneIdx = headers.indexOf('Phone Number');
  const cancelIdx = headers.indexOf('Cancellation Reason');
  const detailsIdx = headers.indexOf('Details');
  const createdIdx = headers.indexOf('Created');

  rows.slice(1).forEach((r) => {
    const rawStart = r[startIdx];
    const rawEnd = r[endIdx];
    const rawPatient = r[patIdx];
    const rawPhone = cleanPhone(r[phoneIdx]);
    const rawDoctor = r[docIdx];
    const rawRoom = r[roomIdx];
    const rawBranch = r[branchIdx];
    const rawStatus = r[statusIdx];
    const rawType = r[typeIdx];
    const rawCancel = r[cancelIdx];
    const rawDetails = r[detailsIdx];
    const rawCreated = r[createdIdx];

    const startParsed = parseDateTime(rawStart);
    if (!startParsed) return;

    const matchedPat = findMatchingPatient(rawPatient, rawPhone, startParsed.date);

    const patId = matchedPat ? matchedPat.id : `pat_appt_${aptIndex}`;
    const patName = matchedPat ? matchedPat.name : rawPatient;
    const patPhone = matchedPat ? matchedPat.phone : rawPhone;

    const dedupKey = `${patId}_${startParsed.date}_${startParsed.time}`;
    if (apptDedupSet.has(dedupKey)) return;
    apptDedupSet.add(dedupKey);

    const docInfo = mapDoctor(rawDoctor);
    const roomInfo = mapBranchAndUnit(rawRoom, rawBranch);
    const apptStatus = statusMap[rawStatus] || 'completed';

    let durationMinutes = 30;
    if (rawEnd) {
      const endParsed = parseDateTime(rawEnd);
      if (endParsed && endParsed.date === startParsed.date) {
        const [sh, sm] = startParsed.time.split(':').map(Number);
        const [eh, em] = endParsed.time.split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0 && diff <= 240) durationMinutes = diff;
      }
    }

    const procType = rawType && rawType.trim() ? rawType.trim() : 'كشف ومتابعة أسنان';
    const cancelReason = rawCancel && rawCancel.trim() ? rawCancel.trim() : undefined;

    let notes = `إجراء: ${procType}`;
    if (cancelReason) notes += ` | سبب الإلغاء: ${cancelReason}`;
    if (rawDetails && rawDetails.trim()) notes += ` | ملاحظات: ${rawDetails.trim()}`;

    const createdParsed = parseDateTime(rawCreated);
    const createdAt = createdParsed ? `${createdParsed.date}T${createdParsed.time}:00.000Z` : `${startParsed.date}T09:00:00.000Z`;

    const apptObj = {
      id: `apt_real_${aptIndex}`,
      patientId: patId,
      patientName: patName,
      patientPhone: patPhone,
      date: startParsed.date,
      time: startParsed.time,
      durationMinutes,
      status: apptStatus,
      unitId: roomInfo.unitId,
      unitName: roomInfo.unitName,
      doctorId: docInfo.id,
      doctorName: docInfo.name,
      procedureType: procType,
      cancellationReason: cancelReason,
      notes,
      createdAt
    };

    appointments.push(apptObj);

    if (matchedPat) {
      if (!patientApptsMap.has(matchedPat.id)) {
        patientApptsMap.set(matchedPat.id, []);
      }
      patientApptsMap.get(matchedPat.id).push(apptObj);
    }

    aptIndex++;
  });
});

console.log(`Imported ${appointments.length} appointments from official Appointments CSV files.`);

// 5. For patients with historical appointments
patients.forEach(pat => {
  const row = pat._rawRow;
  if (!row) return;

  const lastApptParsed = parseDateTime(row['Last Appointment Date']);
  const prevApptParsed = parseDateTime(row['Prev Appointment Date']);
  const activeApptParsed = parseDateTime(row['Active Appointment Date']);
  const branchInfo = mapBranchAndUnit(row['Last Appointment Room'], row['Branch']);
  const doctorInfo = mapDoctor(row['Doctor'], row['From User']);

  if (lastApptParsed) {
    const dedupKey = `${pat.id}_${lastApptParsed.date}_${lastApptParsed.time}`;
    if (!apptDedupSet.has(dedupKey)) {
      apptDedupSet.add(dedupKey);
      const apptStatus = statusMap[row['Last Appointment Status']] || 'completed';
      const apptObj = {
        id: `apt_hist_${aptIndex++}`,
        patientId: pat.id,
        patientName: pat.name,
        patientPhone: pat.phone,
        date: lastApptParsed.date,
        time: lastApptParsed.time,
        durationMinutes: 30,
        status: apptStatus,
        unitId: branchInfo.unitId,
        unitName: branchInfo.unitName,
        doctorId: doctorInfo.id,
        doctorName: doctorInfo.name,
        procedureType: 'كشف ومتابعة علاجية',
        notes: pat.tags.length > 0 ? `إجراءات: ${pat.tags.join('، ')}` : 'جلسة متابعة وفحص سريري',
        createdAt: `${lastApptParsed.date}T09:00:00.000Z`
      };
      appointments.push(apptObj);
      if (!patientApptsMap.has(pat.id)) patientApptsMap.set(pat.id, []);
      patientApptsMap.get(pat.id).push(apptObj);
    }
  }

  if (prevApptParsed) {
    const dedupKey = `${pat.id}_${prevApptParsed.date}_${prevApptParsed.time}`;
    if (!apptDedupSet.has(dedupKey)) {
      apptDedupSet.add(dedupKey);
      const prevRoom = mapBranchAndUnit(row['Prev Appointment Room'], row['Branch']);
      const apptStatus = statusMap[row['Prev Appointment Status']] || 'completed';
      const apptObj = {
        id: `apt_prev_${aptIndex++}`,
        patientId: pat.id,
        patientName: pat.name,
        patientPhone: pat.phone,
        date: prevApptParsed.date,
        time: prevApptParsed.time,
        durationMinutes: 30,
        status: apptStatus,
        unitId: prevRoom.unitId,
        unitName: prevRoom.unitName,
        doctorId: doctorInfo.id,
        doctorName: doctorInfo.name,
        procedureType: 'كشف واستشارة سابقة',
        notes: 'جلسة سابقة - كشف واستشارة أولية',
        createdAt: `${prevApptParsed.date}T09:00:00.000Z`
      };
      appointments.push(apptObj);
      if (!patientApptsMap.has(pat.id)) patientApptsMap.set(pat.id, []);
      patientApptsMap.get(pat.id).push(apptObj);
    }
  }

  if (activeApptParsed) {
    const dedupKey = `${pat.id}_${activeApptParsed.date}_${activeApptParsed.time}`;
    if (!apptDedupSet.has(dedupKey)) {
      apptDedupSet.add(dedupKey);
      const apptStatus = row['Active Appointment Status'] === 'Confirmed' ? 'confirmed' : 'booked';
      const apptObj = {
        id: `apt_active_${aptIndex++}`,
        patientId: pat.id,
        patientName: pat.name,
        patientPhone: pat.phone,
        date: activeApptParsed.date,
        time: activeApptParsed.time,
        durationMinutes: 30,
        status: apptStatus,
        unitId: branchInfo.unitId,
        unitName: branchInfo.unitName,
        doctorId: doctorInfo.id,
        doctorName: doctorInfo.name,
        procedureType: 'موعد قادم للمتابعة',
        notes: 'موعد قادم للمتابعة واستكمال خطة العلاج',
        createdAt: `${activeApptParsed.date}T09:00:00.000Z`
      };
      appointments.push(apptObj);
      if (!patientApptsMap.has(pat.id)) patientApptsMap.set(pat.id, []);
      patientApptsMap.get(pat.id).push(apptObj);
    }
  }

  delete pat._rawRow;
});

// Sort appointments
appointments.sort((a, b) => {
  const dComp = b.date.localeCompare(a.date);
  if (dComp !== 0) return dComp;
  return b.time.localeCompare(a.time);
});

// 6. Parse Operations and Deduplicate
const operations = [];
const patientOpsMap = new Map(); // patientId -> Operation[]
const opDedupSet = new Set();
let opIndex = 1;

operationFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(content);
  if (rows.length === 0) return;
  const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));

  const nameIdx = headers.indexOf('Name');
  const codeIdx = headers.indexOf('Code');
  const priceIdx = headers.indexOf('Price');
  const statusIdx = headers.indexOf('Status');
  const toothIdx = headers.indexOf('Tooth');
  const totalIdx = headers.indexOf('Total');
  const childTeethIdx = headers.indexOf('Child Teeth');
  const detailsIdx = headers.indexOf('Details');
  const discIdx = headers.indexOf('Discount');
  const paidIdx = headers.indexOf('Paid');
  const remIdx = headers.indexOf('Remaining');
  const patIdx = headers.indexOf('Patient');
  const patIdIdx = headers.indexOf('Patient ID');
  const phoneIdx = headers.indexOf('Phone Number');
  const docIdx = headers.indexOf('Doctor');
  const branchIdx = headers.indexOf('Branch');
  const roomIdx = headers.indexOf('Room');
  const invIdx = headers.indexOf('Invoice');
  const apptDateIdx = headers.indexOf('Appointment');
  const createdIdx = headers.indexOf('Created');

  rows.slice(1).forEach(r => {
    const rawPatient = r[patIdx];
    const rawPhone = cleanPhone(r[phoneIdx]);
    const rawName = r[nameIdx];
    const rawCode = r[codeIdx];
    const rawPrice = parseFloat(r[priceIdx] || 0) || 0;
    const rawTotal = parseFloat(r[totalIdx] || 0) || rawPrice;
    const rawPaid = parseFloat(r[paidIdx] || 0) || 0;
    const rawDiscount = parseFloat(r[discIdx] || 0) || 0;
    const rawRemaining = parseFloat(r[remIdx] || 0) || Math.max(0, rawTotal - rawPaid);
    const rawTooth = r[toothIdx] || '';
    const rawStatus = r[statusIdx] || 'Completed';
    const rawDoctor = r[docIdx];
    const rawBranch = r[branchIdx];
    const rawRoom = r[roomIdx];
    const rawCreated = r[createdIdx];
    const rawDetails = r[detailsIdx];
    const rawInvoice = r[invIdx];
    const rawAppt = r[apptDateIdx];
    const rawChildTeeth = (r[childTeethIdx] || '').toLowerCase() === 'true';

    const createdParsed = parseDateTime(rawCreated);
    const opDate = createdParsed ? createdParsed.date : '2026-10-20';
    const opTime = createdParsed ? createdParsed.time : '12:00';

    // Match patient accurately without family-phone collisions
    const matchedPat = findMatchingPatient(rawPatient, rawPhone, opDate);
    const patId = matchedPat ? matchedPat.id : `pat_op_${opIndex}`;
    const patName = matchedPat ? matchedPat.name : rawPatient;
    const patPhone = matchedPat ? matchedPat.phone : rawPhone;

    const docInfo = mapDoctor(rawDoctor);
    const roomInfo = mapBranchAndUnit(rawRoom, rawBranch);

    const opObj = {
      id: `op_${opIndex}`,
      operationNumber: `OP-${String(opIndex).padStart(5, '0')}`,
      code: rawCode,
      name: rawName,
      price: rawPrice,
      total: rawTotal,
      paid: rawPaid,
      discount: rawDiscount,
      remaining: rawRemaining,
      status: rawStatus,
      tooth: rawTooth,
      childTeeth: rawChildTeeth,
      details: rawDetails && rawDetails.trim() ? rawDetails.trim() : undefined,
      patientId: patId,
      patientName: patName,
      patientPhone: patPhone,
      patientCustomId: r[patIdIdx] || undefined,
      doctorName: docInfo.name,
      branchName: roomInfo.branchName,
      room: roomInfo.unitName,
      date: opDate,
      time: opTime,
      createdAt: createdParsed ? `${createdParsed.date}T${createdParsed.time}:00.000Z` : `${opDate}T12:00:00.000Z`,
      invoiceRequired: (rawInvoice || '').toLowerCase() === 'true',
      appointmentDate: rawAppt || undefined
    };

    operations.push(opObj);

    if (matchedPat) {
      if (!patientOpsMap.has(matchedPat.id)) {
        patientOpsMap.set(matchedPat.id, []);
      }
      patientOpsMap.get(matchedPat.id).push(opObj);

      // Add teeth to patient palmerTeeth
      const teethNums = parseToothToPalmer(rawTooth);
      if (teethNums.length > 0) {
        if (!matchedPat.palmerTeeth) matchedPat.palmerTeeth = [];
        const existingTeeth = new Set(matchedPat.palmerTeeth);
        teethNums.forEach(t => existingTeeth.add(t));
        matchedPat.palmerTeeth = Array.from(existingTeeth);
      }
    }

    opIndex++;
  });
});

console.log(`Imported and deduplicated ${operations.length} clinical operations.`);

// 7. Parse and Merge Notes
let noteAddCount = 0;
if (fs.existsSync(notesFile)) {
  const content = fs.readFileSync(notesFile, 'utf8');
  const rows = parseCSV(content);
  if (rows.length > 0) {
    const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));
    const detIdx = headers.indexOf('Details');
    const patIdx = headers.indexOf('Patient');
    const toothIdx = headers.indexOf('Tooth');
    const docIdx = headers.indexOf('Doctor');
    const apptIdx = headers.indexOf('Appointment');
    const createdIdx = headers.indexOf('Created');

    rows.slice(1).forEach((r, idx) => {
      const rawPat = r[patIdx];
      const rawDetails = (r[detIdx] || '').trim();
      if (!rawDetails) return;

      const matchedPat = patientLookupByName.get(normalizeArabic(rawPat));
      if (!matchedPat) return;

      if (!matchedPat.notes) matchedPat.notes = [];

      // Avoid duplicating identical notes
      const isDup = matchedPat.notes.some(n => n.content.trim().toLowerCase() === rawDetails.toLowerCase());
      if (isDup) return;

      const rawCreated = r[createdIdx];
      const createdParsed = parseDateTime(rawCreated);
      const createdAt = createdParsed ? `${createdParsed.date}T${createdParsed.time}:00.000Z` : `${matchedPat.registeredDate}T12:00:00.000Z`;

      const rawTooth = r[toothIdx];
      const toothNum = parseInt(rawTooth, 10);

      const docInfo = mapDoctor(r[docIdx]);

      matchedPat.notes.push({
        id: `note_doc_${matchedPat.id}_${idx + 1}`,
        patientId: matchedPat.id,
        authorName: docInfo.name,
        authorRole: 'استشاري العيادة',
        isAdminAuthored: true,
        content: rawDetails,
        toothNumber: (toothNum > 0) ? toothNum : undefined,
        createdAt,
        appointmentDate: r[apptIdx] || undefined
      });

      if (toothNum > 0) {
        if (!matchedPat.palmerTeeth) matchedPat.palmerTeeth = [];
        if (!matchedPat.palmerTeeth.includes(toothNum)) {
          matchedPat.palmerTeeth.push(toothNum);
        }
      }

      noteAddCount++;
    });
  }
}

console.log(`Merged ${noteAddCount} doctor clinical notes into patients.`);

// Sort notes inside each patient newest first
patients.forEach(pat => {
  if (pat.notes && pat.notes.length > 0) {
    pat.notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
});

// 8. Generate Invoices & Payments based on verified invoiced operations and patient balances
const invoices = [];
const payments = [];

patients.forEach(pat => {
  const pOps = patientOpsMap.get(pat.id) || [];
  const pOpsInvoiced = pOps.filter(op => op.invoiceRequired);
  const patBilled = pat.totalBilled;
  const patPaid = pat.totalPaid;

  if (patBilled <= 0 && pOpsInvoiced.length === 0) return;

  const invId = `inv_${pat.id}`;
  const invNumber = `INV-${pat.patientCode}`;
  const invDate = pat.lastVisitDate || pat.registeredDate;

  let items = [];
  let opDiscountSum = 0;

  if (pOpsInvoiced.length > 0) {
    items = pOpsInvoiced.map((op, oIdx) => {
      opDiscountSum += (op.discount || 0);
      const unitAmt = Math.round(((op.total || op.price || 0) * 100)) / 100;
      return {
        id: `item_${invId}_${oIdx + 1}`,
        procedureId: op.code ? `proc_${op.code}` : `proc_${op.id}`,
        procedureName: `${op.name}${op.tooth && op.tooth !== 'mouth' ? ` (سن ${op.tooth})` : ''}`,
        quantity: 1,
        unitPrice: unitAmt,
        lineTotal: unitAmt
      };
    });
  } else if (patBilled > 0) {
    let itemName = 'جلسات علاج وفحص الأسنان المتكامل';
    if (pat.tags.includes('زراعة أسنان')) itemName = 'زراعة وتركيب دعامة جراحية متطورة';
    else if (pat.tags.includes('تقويم أسنان')) itemName = 'جلسات متابعة وتركيب تقويم أسنان';
    else if (pat.tags.includes('شغل معمل وتركيبات')) itemName = 'تركيبات ثابتة وتيجان زيركون تجميلية';
    else if (pat.tags.includes('عرض تبييض الأسنان')) itemName = 'جلسة تبييض احترافي وتنظيف ليزر';
    else if (pat.tags.includes('عرض تنظيف الأسنان')) itemName = 'تنظيف وتلميع وإزالة الجير بالموجات فوق الصوتية';

    items.push({
      id: `item_${invId}_1`,
      procedureId: 'proc_custom',
      procedureName: itemName,
      quantity: 1,
      unitPrice: patBilled,
      lineTotal: patBilled
    });
  }

  let subtotal = Math.round(items.reduce((sum, it) => sum + it.lineTotal, 0) * 100) / 100;
  let discountAmount = Math.round(opDiscountSum * 100) / 100;

  if (patBilled > 0) {
    const opsNet = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
    if (patBilled > opsNet + 0.01) {
      const diff = Math.round((patBilled - opsNet) * 100) / 100;
      items.push({
        id: `item_${invId}_${items.length + 1}`,
        procedureId: 'proc_consult_fee',
        procedureName: 'رسوم كشف / متابعة سريرية',
        quantity: 1,
        unitPrice: diff,
        lineTotal: diff
      });
      subtotal = Math.round((subtotal + diff) * 100) / 100;
    } else if (opsNet > patBilled + 0.01) {
      discountAmount = Math.round((subtotal - patBilled) * 100) / 100;
    }
  } else if (pOpsInvoiced.length > 0 && patBilled === 0 && patPaid === 0) {
    // Exclude unbilled/waived rows if patient total billed and paid are both zero
    return;
  }

  const netTotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  const paidAmount = Math.min(patPaid, netTotal);
  const outstandingBalance = Math.max(0, Math.round((netTotal - paidAmount) * 100) / 100);

  invoices.push({
    id: invId,
    invoiceNumber: invNumber,
    patientId: pat.id,
    patientName: pat.name,
    date: invDate,
    items,
    subtotal,
    discountType: discountAmount > 0 ? 'fixed' : 'none',
    discountValue: discountAmount > 0 ? discountAmount : 0,
    discountAmount,
    netTotal,
    paidAmount,
    outstandingBalance,
    status: outstandingBalance <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
    notes: `فاتورة علاج ${pat.name} - ${pat.branchName}`,
    createdAt: `${invDate}T12:00:00.000Z`
  });

  if (paidAmount > 0) {
    payments.push({
      id: `pay_${pat.id}`,
      receiptNumber: `REC-${pat.patientCode}`,
      invoiceId: invId,
      invoiceNumber: invNumber,
      patientId: pat.id,
      patientName: pat.name,
      amount: paidAmount,
      paymentMethod: 'cash',
      date: invDate,
      receivedBy: pat.doctorName,
      notes: `سند قبض نقدي رسمي عن علاج ${pat.name}`,
      status: 'valid',
      createdAt: `${invDate}T12:30:00.000Z`
    });
  }
});

// Sort operations chronologically newest first
operations.sort((a, b) => {
  const dComp = b.date.localeCompare(a.date);
  if (dComp !== 0) return dComp;
  return (b.time || '').localeCompare(a.time || '');
});

console.log(`\nGenerated Final Database:`);
console.log(`- ${patients.length} patients`);
console.log(`- ${appointments.length} appointments`);
console.log(`- ${operations.length} unique clinical operations`);
console.log(`- ${invoices.length} invoices`);
console.log(`- ${payments.length} payments`);

// Write out JSON files
const outDir = path.join(__dirname, '../src/data');
fs.writeFileSync(path.join(outDir, 'nativePatients.json'), JSON.stringify(patients, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'nativeAppointments.json'), JSON.stringify(appointments, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'nativeOperations.json'), JSON.stringify(operations, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'nativeInvoices.json'), JSON.stringify(invoices, null, 2), 'utf8');
fs.writeFileSync(path.join(outDir, 'nativePayments.json'), JSON.stringify(payments, null, 2), 'utf8');

console.log('Successfully written all database files to src/data!');
