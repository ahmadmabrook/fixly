import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '../lib/store';
import { notify } from '../components/shared';

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
      style={{ background: '#F6F8FB' }}
    >
      <Toaster position="top-center" richColors />
      <div
        className="bg-white rounded-2xl p-8 w-full"
        style={{ maxWidth: 400, boxShadow: '0 4px 24px rgba(15,23,42,0.10)' }}
      >
        <div className="mb-8 text-center">
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A' }}>
            Fixly <span style={{ color: '#1366D6' }}>Admin</span>
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 4 }}>لوحة إدارة المنصة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
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
                border: '1.5px solid #E2E8F0',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label htmlFor="admin-password" style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
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
                border: '1.5px solid #E2E8F0',
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
              background: '#1366D6',
              color: '#FFF',
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
