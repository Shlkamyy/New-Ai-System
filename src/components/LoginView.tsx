import React, { useState } from 'react';
import { useClinic } from '../context/ClinicContext';
import {
  Lock,
  User,
  Mail,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2
} from 'lucide-react';

type AuthMode = 'login' | 'forgot';

export const LoginView: React.FC = () => {
  const { login, resetPasswordByEmail } = useClinic();

  const [mode, setMode] = useState<AuthMode>('login');

  // Login state
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cf_mai_remember_me') !== 'false';
    } catch {
      return true;
    }
  });
  const [usernameOrEmail, setUsernameOrEmail] = useState(() => {
    try {
      if (localStorage.getItem('cf_mai_remember_me') !== 'false') {
        return localStorage.getItem('cf_mai_remembered_username') || '';
      }
    } catch {}
    return '';
  });
  const [password, setPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Forgot Password state
  const [forgotEmail, setForgotEmail] = useState('muhammed.shlkamy@gmail.com');
  const [forgotVerification, setForgotVerification] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [showForgotPass, setShowForgotPass] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next: AuthMode) => {
    setError('');
    setSuccessMsg('');
    setMode(next);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    setTimeout(() => {
      const res = login(usernameOrEmail, password, rememberMe);
      setLoading(false);
      if (!res.success) {
        setError(res.error || 'خطأ في تسجيل الدخول');
      }
    }, 180);
  };

  const handleForgotReset = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (forgotNewPass !== forgotConfirmPass) {
      setError('كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }

    const res = resetPasswordByEmail(forgotEmail, forgotVerification, forgotNewPass);
    if (!res.success) {
      setError(res.error || 'تعذر إعادة تعيين كلمة المرور');
      return;
    }

    setUsernameOrEmail(forgotEmail.trim());
    setPassword('');
    setForgotVerification('');
    setForgotNewPass('');
    setForgotConfirmPass('');
    setMode('login');
    setSuccessMsg('تم تحديث كلمة المرور بنجاح! يمكنك تسجيل الدخول الآن بكلمة المرور الجديدة.');
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-[#0b1419] via-[#12222d] to-[#087e83] flex items-center justify-center p-4 text-[#172f3d] font-sans selection:bg-[#bce7d9] selection:text-[#123844]"
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#d6e5e8] overflow-hidden p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header & Clinic Brand */}
        <div className="text-center space-y-2.5">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#087e83] to-[#12a19c] text-white flex items-center justify-center mx-auto shadow-xl shadow-[#087e83]/30">
            <svg
              viewBox="0 0 48 48"
              className="w-9 h-9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 6c-5 0-9 4-9 10 0 5 3 8 4 14 1 7 4 12 8 12 2 0 3-4 4-9 1-4 2-5 3-5s2 1 3 5c1 5 2 9 4 9 4 0 7-5 8-12 1-6 4-9 4-14 0-6-4-10-9-10-5 0-7 3-10 3s-5-3-10-3Z" />
            </svg>
          </div>
          <div>
            <div className="font-signature text-3xl text-[#087e83] leading-none" dir="ltr">
              Dr Shlkamy
            </div>
            <h1 className="text-base sm:text-lg font-extrabold text-[#172f3d] mt-1">
              عيادات د. محمد شلقامي
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'forgot'
                ? 'استعادة وتعيين كلمة مرور جديدة عبر البريد المسجل'
                : 'تسجيل الدخول باسم المستخدم وكلمة المرور'}
            </p>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* STANDARD LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم المستخدم أو البريد الإلكتروني *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={usernameOrEmail}
                  onChange={e => setUsernameOrEmail(e.target.value)}
                  placeholder="أدخل اسم المستخدم أو البريد الإلكتروني"
                  className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  required
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">كلمة المرور *</label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-[11px] text-[#087e83] hover:underline font-bold cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showLoginPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPass(v => !v)}
                  className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  tabIndex={-1}
                >
                  {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#087e83] focus:ring-[#087e83] cursor-pointer accent-[#087e83]"
              />
              <span className="text-xs font-bold text-slate-700">
                تذكرني على هذا الجهاز
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{loading ? 'جاري التحقق...' : 'تسجيل الدخول للنظام'}</span>
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD RECOVERY */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotReset} className="space-y-3.5">
            <div className="p-3 rounded-2xl bg-teal-50 border border-teal-200 text-[11px] text-teal-900 space-y-1">
              <div className="font-extrabold flex items-center gap-1.5 text-[#087e83]">
                <Mail className="w-4 h-4" />
                <span>استعادة كلمة المرور عبر البريد الإلكتروني</span>
              </div>
              <p className="leading-relaxed">
                أدخل البريد الإلكتروني المرتبط بحسابك (مثل{' '}
                <span className="font-mono font-bold" dir="ltr">muhammed.shlkamy@gmail.com</span>
                ) مع رمز الاستعادة (أو رقم الموبايل المسجل بالحساب) لتعيين كلمة مرور جديدة فوراً.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                البريد الإلكتروني المسجل *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="muhammed.shlkamy@gmail.com"
                  className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-semibold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  required
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رمز الاستعادة (Recovery PIN) أو رقم الموبايل المسجل *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-2.5 text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={forgotVerification}
                  onChange={e => setForgotVerification(e.target.value)}
                  placeholder="أدخل رمز الاستعادة أو رقم الهاتف المسجل"
                  className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                  required
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور الجديدة *
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-2.5 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showForgotPass ? 'text' : 'password'}
                    value={forgotNewPass}
                    onChange={e => setForgotNewPass(e.target.value)}
                    placeholder="••••••"
                    className="w-full pr-9 pl-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPass(v => !v)}
                    className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showForgotPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تأكيد كلمة المرور *
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-2.5 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showForgotPass ? 'text' : 'password'}
                    value={forgotConfirmPass}
                    onChange={e => setForgotConfirmPass(e.target.value)}
                    placeholder="••••••"
                    className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold focus:bg-white focus:border-[#087e83] focus:outline-none"
                    required
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#087e83] hover:bg-[#06686c] text-white font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>تحديث كلمة المرور</span>
              <CheckCircle2 className="w-4 h-4" />
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-xs font-bold text-slate-600 hover:text-[#087e83] hover:underline cursor-pointer"
              >
                العودة لشاشة تسجيل الدخول
              </button>
            </div>
          </form>
        )}

        <div className="pt-2 border-t border-slate-100 text-center text-[10px] text-slate-400 font-mono" dir="ltr">
          Build: {typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'} ·{' '}
          {typeof __APP_BUILT_AT__ !== 'undefined'
            ? new Date(__APP_BUILT_AT__).toLocaleString('en-GB', {
                timeZone: 'Africa/Cairo',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })
            : 'local'}
        </div>
      </div>
    </div>
  );
};
