import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '../lib/store';
import { notify } from '../components/shared';
import {
  COLOR_APP_BACKGROUND,
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_TEXT_FORM_LABEL,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_WHITE,
  SHADOW_PANEL,
} from '../lib/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/login', {
        method: 'POST',
        credentials: 'include', // accept the httpOnly refresh cookie
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await res.json();
      if (!res.ok) {
        const msg = payload?.error?.message ?? payload?.message ?? 'فشل تسجيل الدخول';
        notify(msg, 'error');
        return;
      }
      const { accessToken, admin } = payload.data as {
        accessToken: string;
        admin: { id: string; name: string; email: string };
      };
      setAuth(accessToken, admin);
      navigate('/dashboard', { replace: true });
    } catch {
      notify('حدث خطأ، حاول مجدداً', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: COLOR_APP_BACKGROUND }}
    >
      <Toaster position="top-center" richColors />
      <div
        className="bg-white rounded-2xl p-8 w-full"
        style={{ maxWidth: 400, boxShadow: SHADOW_PANEL }}
      >
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: COLOR_BRAND_PRIMARY }} aria-hidden="true">🔧</span>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>
              Fixly <span style={{ color: COLOR_BRAND_PRIMARY }}>Admin</span>
            </h1>
          </div>
          <p style={{ fontSize: 14, color: COLOR_TEXT_MUTED, marginTop: 4 }}>لوحة إدارة المنصة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" style={{ fontSize: 13, fontWeight: 600, color: COLOR_TEXT_FORM_LABEL, display: 'block', marginBottom: 6 }}>
              البريد الإلكتروني
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@fixly.jo"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: `1.5px solid ${COLOR_BORDER_LIGHT}`,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label htmlFor="admin-password" style={{ fontSize: 13, fontWeight: 600, color: COLOR_TEXT_FORM_LABEL, display: 'block', marginBottom: 6 }}>
              كلمة المرور
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: `1.5px solid ${COLOR_BORDER_LIGHT}`,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 12,
              background: COLOR_BRAND_PRIMARY,
              color: COLOR_WHITE,
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: 8,
            }}
          >
            {loading ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
