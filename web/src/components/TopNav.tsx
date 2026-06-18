import { useState } from 'react';
import { Menu, X, LogOut, Globe } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useT, useLang } from '../lib/i18n';

interface TopNavProps {
  authed: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

type ActiveKey = 'landing' | 'catalog' | 'myBookings' | 'guarantee' | 'account' | 'tech';

function activeFor(pathname: string): ActiveKey {
  if (pathname.startsWith('/services')) return 'catalog';
  if (pathname.startsWith('/my-bookings') || pathname.startsWith('/bookings')) return 'myBookings';
  if (pathname.startsWith('/guarantee')) return 'guarantee';
  if (pathname.startsWith('/account')) return 'account';
  if (pathname.startsWith('/tech')) return 'tech';
  return 'landing';
}

// [key, i18nKey, path, authedOnly]
const NAV_ITEMS: ReadonlyArray<readonly [ActiveKey, string, string, boolean]> = [
  ['landing', 'nav.home', '/', false],
  ['catalog', 'nav.services', '/services', false],
  ['myBookings', 'nav.bookings', '/my-bookings', true],
  ['guarantee', 'nav.guarantee', '/guarantee', true],
  ['account', 'nav.account', '/account', true],
  ['tech', 'nav.tech', '/tech', true],
];

export default function TopNav({ authed, onLogin, onLogout }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = activeFor(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useT();
  const { lang, setLang } = useLang();
  const toggleLang = () => setLang(lang === 'ar' ? 'en' : 'ar');

  const items = NAV_ITEMS.filter(([, , , authedOnly]) => authed || !authedOnly);

  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  return (
    <header
      className="sticky top-0 z-20"
      style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E2E8F0' }}
    >
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center gap-6">
        <button
          onClick={() => go('/')}
          className="flex items-center gap-2"
          aria-label="Fixly — الصفحة الرئيسية"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1366D6' }} aria-hidden="true">🔧</div>
          <span style={{ color: '#1366D6', fontWeight: 800, fontSize: 22 }}>Fixly</span>
        </button>
        <nav className="hidden md:flex items-center gap-6" aria-label="التنقل الرئيسي">
          {items.map(([k, label, path]) => (
            <button
              key={k}
              onClick={() => navigate(path)}
              aria-current={active === k ? 'page' : undefined}
              style={{ fontSize: 14, fontWeight: 600, color: active === k ? '#1366D6' : '#475569' }}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
          style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}
          aria-label="Toggle language"
        >
          <Globe size={15} aria-hidden="true" /> {lang === 'ar' ? 'EN' : 'ع'}
        </button>
        {authed ? (
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ color: '#475569', fontSize: 14 }}
          >
            <LogOut size={16} aria-hidden="true" /> {t('nav.logout')}
          </button>
        ) : (
          <button
            onClick={onLogin}
            className="hidden md:block px-4 py-2 rounded-lg"
            style={{ background: '#1366D6', color: '#FFF', fontSize: 14, fontWeight: 600 }}
          >
            {t('nav.login')}
          </button>
        )}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="md:hidden"
          aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          className="md:hidden border-t"
          style={{ borderColor: '#E2E8F0', background: '#FFF' }}
          aria-label="التنقل الرئيسي"
        >
          <div className="max-w-[1200px] mx-auto px-6 py-2 flex flex-col">
            {items.map(([k, label, path]) => (
              <button
                key={k}
                onClick={() => go(path)}
                aria-current={active === k ? 'page' : undefined}
                className="text-start py-3"
                style={{ fontSize: 15, fontWeight: 600, color: active === k ? '#1366D6' : '#475569' }}
              >
                {t(label)}
              </button>
            ))}
            {!authed && (
              <button
                onClick={() => { setMenuOpen(false); onLogin(); }}
                className="text-start py-3"
                style={{ fontSize: 15, fontWeight: 700, color: '#1366D6' }}
              >
                {t('nav.login')}
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
