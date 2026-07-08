import { useState, useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Phone, KeyRound, Gift } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/store';
import { useDialog } from '../hooks/useDialog';
import { notify } from './shared';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Read the `role` claim from a JWT without verifying it (the server is the
 * source of truth — this is only for choosing client-side UI defaults). JWT
 * payloads are base64URL ("-"/"_", no padding), which `atob` can't decode
 * directly, so normalise first. Any malformed token falls back to CUSTOMER
 * instead of throwing and failing an otherwise-successful login.
 */
function roleFromJwt(token: string): string {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { role?: string };
    return payload.role ?? 'CUSTOMER';
  } catch {
    return 'CUSTOMER';
  }
}

function errorMessage(e: unknown, fallback = 'حدث خطأ'): string {
  return e instanceof Error ? e.message : fallback;
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [params] = useSearchParams();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+962');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  // Pre-filled from a `?ref=CODE` deep link (e.g. a shared referral link), but
  // still editable — the backend only applies it on first-time signup.
  const [referralCode, setReferralCode] = useState(() => params.get('ref') ?? '');
  const { setTokens } = useAuth();
  const ref = useDialog<HTMLDivElement>(onClose);
  const titleId = useId();

  async function requestOtp() {
    setLoading(true);
    try {
      await api.post('/auth/otp/request', { phone });
      setStep('otp');
      notify('تم إرسال رمز التحقق', 'success');
    } catch (e: unknown) {
      notify(errorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      // The refresh token is set by the server as an httpOnly cookie (same as
      // /auth/refresh), so it's never JS-readable. The access token is kept in
      // memory only. We deliberately do NOT persist any token to localStorage —
      // doing so would re-expose it to XSS, defeating the whole token model.
      const { accessToken } = await api.post<{ accessToken: string }>('/auth/otp/verify', {
        phone,
        code: otp,
        referralCode: referralCode.trim() || undefined,
      });
      setTokens(accessToken, roleFromJwt(accessToken));
      notify('تم تسجيل الدخول بنجاح', 'success');
      onSuccess();
    } catch (e: unknown) {
      notify(errorMessage(e), 'error');
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
            <div className="flex items-center gap-2 h-12 px-4 rounded-xl border border-slate-200 bg-slate-50">
              <Gift size={18} color="#94A3B8" />
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 14, direction: 'ltr' }}
                placeholder="رمز الإحالة (اختياري)"
                dir="ltr"
                aria-label="رمز الإحالة"
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
