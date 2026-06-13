import { useState, useId } from 'react';
import { Phone, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/store';
import { useDialog } from '../hooks/useDialog';
import { notify } from './shared';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+962');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { setTokens } = useAuth();
  const ref = useDialog<HTMLDivElement>(onClose);
  const titleId = useId();

  async function requestOtp() {
    setLoading(true);
    try {
      await api.post('/auth/otp/request', { phone });
      setStep('otp');
      notify('تم إرسال رمز التحقق', 'success');
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const res = await api.post<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', { phone, code: otp });
      const { accessToken, refreshToken } = res;
      // decode role from JWT payload (base64 middle segment)
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      setTokens(accessToken, payload.role ?? 'CUSTOMER');
      localStorage.setItem('refresh_token', refreshToken);
      notify('تم تسجيل الدخول بنجاح', 'success');
      onSuccess();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl p-6 shadow-2xl w-full mx-4"
        style={{ maxWidth: 400 }}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} style={{ fontWeight: 700, fontSize: 22, color: '#0F172A' }}>تسجيل الدخول</h2>
        <p style={{ color: '#475569', fontSize: 14, marginTop: 4 }}>
          {step === 'phone' ? 'أدخل رقم هاتفك للمتابعة' : `أدخل الرمز المرسل إلى ${phone}`}
        </p>

        {step === 'phone' ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2 h-12 px-4 rounded-xl border border-slate-200 bg-slate-50">
              <Phone size={18} color="#94A3B8" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 16, direction: 'ltr' }}
                placeholder="+962799000000"
                dir="ltr"
                aria-label="رقم الهاتف"
                autoComplete="tel"
              />
            </div>
            <button
              onClick={requestOtp}
              disabled={loading || phone.length < 10}
              className="w-full h-12 rounded-xl disabled:opacity-50"
              style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 15 }}
            >
              {loading ? '...' : 'إرسال الرمز'}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2 h-12 px-4 rounded-xl border border-slate-200 bg-slate-50">
              <KeyRound size={18} color="#94A3B8" />
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="flex-1 bg-transparent outline-none text-center"
                style={{ fontSize: 24, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 8 }}
                placeholder="000000"
                maxLength={6}
                dir="ltr"
                aria-label="رمز التحقق"
                autoComplete="one-time-code"
              />
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>في بيئة التطوير الرمز هو 000000</p>
            <button
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full h-12 rounded-xl disabled:opacity-50"
              style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 15 }}
            >
              {loading ? '...' : 'تحقق والدخول'}
            </button>
            <button onClick={() => setStep('phone')} style={{ color: '#1366D6', fontWeight: 600, fontSize: 13, width: '100%', textAlign: 'center' }}>
              تغيير الرقم
            </button>
          </div>
        )}

        <button onClick={onClose} className="mt-4 w-full" style={{ color: '#94A3B8', fontSize: 13 }}>إلغاء</button>
      </div>
    </div>
  );
}
