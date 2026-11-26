import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';

export const ExcelImportView: React.FC = () => {
  const {
    patients,
    importPatientsFromExcel,
    exportDataToExcel,
    setActiveView
  } = useClinic();

  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState('');
  const [importErrorMessage, setImportErrorMessage] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setImportSuccessMessage('');
    setImportErrorMessage('');

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        setParsedRows(data);
      } catch {
        setImportErrorMessage('حدث خطأ أثناء قراءة ملف الإكسيل. يرجى التأكد من صيغة الملف (.xlsx أو .csv).');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setImportErrorMessage('تعذر قراءة الملف المختار. يرجى المحاولة مرة أخرى.');
      setIsProcessing(false);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Analysis of parsed data
  const totalRows = parsedRows.length;
  let rowsWithPhone = 0;
  let rowsMissingPhone = 0;
  let totalOpeningDebt = 0;

  parsedRows.forEach(row => {
    const phone = row['رقم الموبايل'] || row['الموبايل'] || row['الهاتف'] || row['phone'] || row['Phone'] || row['Mobile'];
    if (phone && String(phone).replace(/\D/g, '').length >= 9) {
      rowsWithPhone++;
    } else {
      rowsMissingPhone++;
    }
    const debt = Number(row['المتبقي'] || row['المديونية'] || row['Outstanding'] || row['إجمالي الحساب']) || 0;
    totalOpeningDebt += debt;
  });

  const handleCommitImport = () => {
    if (parsedRows.length === 0) return;
    const count = importPatientsFromExcel(parsedRows);
    setImportSuccessMessage(`تم بنجاح استيراد ${count} مريض في قاعدة بيانات العيادة!`);
    setParsedRows([]);
    setFileName('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm">
        <h1 className="text-lg sm:text-xl font-extrabold text-[#172f3d] flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          <span>استيراد وتصدير Excel</span>
        </h1>
      </div>

      {/* Error / Success Banners */}
      {importErrorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 flex items-center gap-2 font-bold text-sm animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{importErrorMessage}</span>
        </div>
      )}
      {importSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{importSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveView('patients')}
            className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white font-bold text-xs"
          >
            عرض المرضى
          </button>
        </div>
      )}

      {/* 1. Upload & Import Section */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-[#172f3d]">
          استيراد المرضى (Excel / CSV)
        </h2>

        {/* Upload Dropzone */}
        <div className="border-2 border-dashed border-[#087e83]/30 hover:border-[#087e83] rounded-3xl p-6 text-center bg-[#f7fbfb] transition-all space-y-3 cursor-pointer relative">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div className="w-12 h-12 rounded-2xl bg-[#e6f6f2] text-[#087e83] flex items-center justify-center mx-auto shadow-sm">
            <Upload className="w-6 h-6" />
          </div>
          <p className="font-extrabold text-sm text-[#172f3d]">
            {fileName ? fileName : 'اختر ملف Excel أو CSV'}
          </p>
        </div>

        {/* Pre-import Analysis & Verification */}
        {parsedRows.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-slate-100 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-[#172f3d] flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#087e83]" />
                <span>نتائج فحص وتدقيق الملف قبل الاستيراد:</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                إجمالي السجلات: {totalRows}
              </span>
            </div>

            {/* Metric counters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <span className="text-[11px] text-emerald-800 font-bold block">سجلات بأرقام هواتف صالحة</span>
                <span className="text-xl font-extrabold font-mono text-emerald-900">{rowsWithPhone}</span>
              </div>
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl">
                <span className="text-[11px] text-amber-800 font-bold block">أرقام هواتف غير مسجلة / ناقصة</span>
                <span className="text-xl font-extrabold font-mono text-amber-900">{rowsMissingPhone}</span>
              </div>
              <div className="p-3.5 bg-[#e7f5f2] border border-[#bfe2db] rounded-2xl">
                <span className="text-[11px] text-[#087e83] font-bold block">إجمالي المديونيات الافتتاحية</span>
                <span className="text-xl font-extrabold font-mono text-[#087e83]">{totalOpeningDebt.toLocaleString()} ج.م</span>
              </div>
            </div>

            {/* Preview Table of first 10 rows */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">اسم المريض</th>
                    <th className="p-2.5">رقم الموبايل</th>
                    <th className="p-2.5">المديونية / المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.slice(0, 15).map((row, i) => {
                    const name = row['اسم المريض'] || row['الاسم'] || row['name'] || row['Patient Name'] || 'غير مسمى';
                    const phone = row['رقم الموبايل'] || row['الموبايل'] || row['الهاتف'] || row['phone'] || 'غير مسجل';
                    const debt = row['المتبقي'] || row['المديونية'] || row['Outstanding'] || '0';
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono text-slate-400">{i + 1}</td>
                        <td className="p-2.5 font-bold text-slate-800">{name}</td>
                        <td className="p-2.5 font-mono" dir="ltr">{phone}</td>
                        <td className="p-2.5 font-mono font-bold text-[#087e83]">{debt} ج.م</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Confirm Import Button */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setParsedRows([])}
                className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-bold"
              >
                إلغاء وتفريغ الملف
              </button>

              <button
                type="button"
                onClick={handleCommitImport}
                className="px-6 py-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md shadow-[#087e83]/20 flex items-center gap-2"
              >
                <Database className="w-4 h-4" />
                <span>اعتماد واستيراد {totalRows} مريض الآن</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. One-Click Full Clinic Export Section */}
      <div className="bg-white border border-[#dce8eb] rounded-3xl p-5 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-[#172f3d]">
          تصدير البيانات
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => exportDataToExcel('all')}
            className="p-4 rounded-2xl bg-gradient-to-br from-[#e6f6f2] to-[#cbece4] border border-[#b4ded4] hover:shadow-md text-right transition-all group"
          >
            <div className="flex items-center justify-between text-[#087e83]">
              <span className="font-extrabold text-sm">نسخة شاملة</span>
              <Download className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => exportDataToExcel('patients')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#087e83] text-right transition-all group"
          >
            <div className="flex items-center justify-between text-slate-800">
              <span className="font-extrabold text-sm">المرضى ({patients.length})</span>
              <Download className="w-4 h-4 text-[#087e83] group-hover:scale-110 transition-transform" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => exportDataToExcel('invoices')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#087e83] text-right transition-all group"
          >
            <div className="flex items-center justify-between text-slate-800">
              <span className="font-extrabold text-sm">الفواتير</span>
              <Download className="w-4 h-4 text-[#087e83] group-hover:scale-110 transition-transform" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => exportDataToExcel('payments')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#087e83] text-right transition-all group"
          >
            <div className="flex items-center justify-between text-slate-800">
              <span className="font-extrabold text-sm">المقبوضات</span>
              <Download className="w-4 h-4 text-[#087e83] group-hover:scale-110 transition-transform" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
