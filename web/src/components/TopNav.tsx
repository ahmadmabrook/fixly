import { Menu, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { notify } from './shared';

interface TopNavProps {
  authed: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

type ActiveKey = 'landing' | 'catalog' | 'myBookings';

function activeFor(pathname: string): ActiveKey {
  if (pathname.startsWith('/services')) return 'catalog';
  if (pathname.startsWith('/my-bookings')) return 'myBookings';
  return 'landing';
}

const NAV_ITEMS: ReadonlyArray<readonly [ActiveKey, string, string]> = [
  ['landing', 'الرئيسية', '/'],
  ['catalog', 'الخدمات', '/services'],
  ['myBookings', 'طلباتي', '/my-bookings'],
];

export default function TopNav({ authed, onLogin, onLogout }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = activeFor(location.pathname);

  return (
    <header
      className="sticky top-0 z-20"
      style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E2E8F0' }}
    >
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center gap-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2"
          aria-label="Fixly — الصفحة الرئيسية"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1366D6' }} aria-hidden="true">🔧</div>
          <span style={{ color: '#1366D6', fontWeight: 800, fontSize: 22 }}>Fixly</span>
        </button>
        <nav className="hidden md:flex items-center gap-6" aria-label="التنقل الرئيسي">
          {NAV_ITEMS.map(([k, label, path]) => {
            const isActive = active === k;
            // Hide "my-bookings" from anonymous users (they would be redirected).
            if (k === 'myBookings' && !authed) return null;
            return (
              <button
                key={k}
                onClick={() => navigate(path)}
                aria-current={isActive ? 'page' : undefined}
                style={{ fontSize: 14, fontWeight: 600, color: isActive ? '#1366D6' : '#475569' }}
              >
                {label}
              </button>
            );
          })}
        </nav>
        <div className="flex-1" />
        {authed ? (
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ color: '#475569', fontSize: 14 }}
          >
            <LogOut size={16} aria-hidden="true" /> خروج
          </button>
        ) : (
          <button
            onClick={onLogin}
            className="hidden md:block px-4 py-2 rounded-lg"
            style={{ background: '#1366D6', color: '#FFF', fontSize: 14, fontWeight: 600 }}
          >
            تسجيل دخول
          </button>
        )}
        <button
          onClick={() => notify('القائمة')}
          className="md:hidden"
          aria-label="فتح القائمة"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
