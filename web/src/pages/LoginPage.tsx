import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, Gift } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/store';
import { Card, notify } from '../components/shared';

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

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '/';
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+962');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  // Pre-filled from a `?ref=CODE` deep link (e.g. a shared referral link), but
  // still editable — the backend only applies it on first-time signup.
  const [referralCode, setReferralCode] = useState(() => params.get('ref') ?? '');
  const { setTokens } = useAuth();

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
      navigate(returnTo, { replace: true });
    } catch (e: unknown) {
      notify(errorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-[420px] mx-auto px-6 py-16">
      <Card className="p-8">
        <h1 style={{ fontWeight: 700, fontSize: 22, color: '#0F172A', textAlign: 'center' }}>تسجيل الدخول</h1>
        <p style={{ color: '#475569', fontSize: 14, marginTop: 4, textAlign: 'center' }}>
          {step === 'phone' ? 'أدخل رقم هاتفك للمتابعة' : `أدخل الرمز المرسل إلى ${phone}`}
        </p>

        {step === 'phone' ? (
          <div className="mt-6 space-y-4">
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
              onClick={() => void requestOtp()}
              disabled={loading || phone.length < 10}
              className="w-full h-12 rounded-xl disabled:opacity-50"
              style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 15 }}
            >
              {loading ? '...' : 'إرسال الرمز'}
            </button>
            <p style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>بالمتابعة، أنت توافق على الشروط والأحكام وسياسة الخصوصية.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {/* A single invisible input captures typing/paste/native SMS autofill
                (autoComplete="one-time-code"); the 6 boxes below are purely a
                visual reflection of its value, clicking any box focuses it. */}
            <div className="relative flex items-center justify-center gap-2" dir="ltr">
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="absolute inset-0 w-full h-full opacity-0"
                style={{ fontSize: 24 }}
                maxLength={6}
                aria-label="رمز التحقق"
                autoComplete="one-time-code"
              />
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="flex items-center justify-center rounded-xl border"
                  style={{
                    width: 48, height: 56, fontSize: 22, fontFamily: 'Inter', fontWeight: 700,
                    borderColor: i === otp.length ? '#1366D6' : '#E2E8F0',
                    background: '#F8FAFC', color: '#0F172A',
                  }}
                >
                  {otp[i] ?? ''}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>في بيئة التطوير الرمز هو 000000</p>
            <button
              onClick={() => void verifyOtp()}
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
      </Card>
    </main>
  );
}
