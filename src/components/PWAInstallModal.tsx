import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Smartphone, CheckCircle2, Share, PlusSquare, ArrowUpRight, ShieldCheck, Sparkles } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [linkCopied, setLinkCopied] = React.useState(false);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    const outcome = await install();
    if (outcome === 'accepted') {
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#d6e5e8] flex flex-col overflow-hidden max-h-[92vh] animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-[#e2eaee] flex items-center justify-between bg-gradient-to-r from-[#087e83] to-[#12a19c] text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-inner flex-shrink-0">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-extrabold">تثبيت تطبيق Dr Shlkamy</h2>
                <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">
                  PWA Native
                </span>
              </div>
              <p className="text-xs text-[#d5eee8] mt-0.5">
                تطبيق عيادات د. محمد شلقامي على شاشة موبايلك
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-[#172f3d]">
          {/* Status Banner */}
          {isInstalled ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm">التطبيق مثبت بالفعل على جهازك!</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  يمكنك فتحه مباشرة من شاشة التطبيقات على الموبايل كأي تطبيق أصلي بدون شريط المتصفح.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* One-click native install button if browser triggers beforeinstallprompt */}
              {isInstallable && (
                <div className="p-4 rounded-2xl bg-[#e6f4f1] border border-[#bce2db] text-center space-y-2.5">
                  <div className="inline-flex items-center gap-1.5 text-[#087e83] font-extrabold text-sm">
                    <Sparkles className="w-4 h-4 text-[#1ab3bd]" />
                    <span>جاهز للتثبيت الفوري بنقرة واحدة</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    يدعم متصفحك التثبيت المباشر الآن لتطبيق Dr Shlkamy على شاشة هاتفك
                  </p>
                  <button
                    type="button"
                    onClick={handleNativeInstall}
                    className="w-full py-3 px-4 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-lg shadow-[#087e83]/25 flex items-center justify-center gap-2 transition-transform active:scale-95"
                  >
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>تثبيت التطبيق الآن على الهاتف</span>
                  </button>
                </div>
              )}

              {/* Explicit instructions explaining how to install and why "this app cannot be installed" occurs */}
              <div className="space-y-3">
                <div className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-[#087e83]" />
                  <span>طريقة التثبيت السريعة على هاتفك المحمول:</span>
                </div>

                {/* Android / Chrome instructions */}
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#087e83] text-white text-[10px] flex items-center justify-center font-bold">1</span>
                      <span>أجهزة أندرويد و Google Chrome:</span>
                    </span>
                    <span className="text-[10px] text-[#087e83] bg-white px-2 py-0.5 rounded-md border border-slate-200">Android / Chrome</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px] leading-relaxed pr-2">
                    <li>اضغط على <strong>نقاط القائمة الثلاث (⋮)</strong> في أعلى يمين متصفح Chrome.</li>
                    <li>اختر <strong>"تثبيت التطبيق" (Install app)</strong> أو <strong>"الإضافة إلى الشاشة الرئيسية"</strong>.</li>
                    <li>اضغط على <strong>"تثبيت" (Install)</strong> للتأكيد.</li>
                  </ol>
                  <div className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200">
                    💡 <strong>ملاحظة هامة:</strong> إذا ظهرت رسالة "This app cannot be installed" في شريط المعاينة، افتح الرابط المباشر للتطبيق مباشرة في نافذة المتصفح الرئيسية (خارج الـ iFrame) ليسمح Chrome بتثبيته بنجاح.
                  </div>
                </div>

                {/* iPhone / iOS Safari instructions */}
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#087e83] text-white text-[10px] flex items-center justify-center font-bold">2</span>
                      <span>أجهزة آيفون وآيباد (Apple Safari):</span>
                    </span>
                    <span className="text-[10px] text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">iOS Safari</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px] leading-relaxed pr-2">
                    <li>اضغط على زر <strong>المشاركة (Share)</strong> في أسفل شاشة Safari.</li>
                    <li>مرر للأسفل واضغط على <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</strong>.</li>
                    <li>اضغط على <strong>"إضافة" (Add)</strong> في الزاوية العلوية.</li>
                  </ol>
                </div>
              </div>

              {/* Direct App Link button for opening in real browser */}
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const currentUrl = window.location.href;
                    navigator.clipboard?.writeText(currentUrl).catch(() => {});
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 4000);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4 text-[#087e83]" />
                  <span>نسخ رابط العيادة لفتحه على هاتفك</span>
                </button>
                {linkCopied && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold text-center">
                    تم نسخ رابط التطبيق إلى الحافظة! افتحه في متصفح الموبايل لتثبيته بنقرة واحدة.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-[#fafcfc] border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>يعمل بدون إنترنت (Offline Ready) · خفيف وسريع</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
