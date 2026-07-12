import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Wrench, Wallet, Users, LogOut, ShieldCheck, LifeBuoy, BarChart3, Megaphone, Banknote, UserCog, Award, Flag, CreditCard, Video } from 'lucide-react';
import { useAuth } from '../lib/store';
import { logout as apiLogout } from '../lib/api';
import { ADMIN_ROUTES, canAccessRoles } from '../lib/permissions';

// Icons keyed by route path — the roles/labels themselves live in
// lib/permissions.ts (single source of truth shared with the RequireRole
// route guard in App.tsx, so the nav and the actual page gate can't drift).
const ICONS: Record<string, typeof LayoutDashboard> = {
  '/dashboard': LayoutDashboard,
  '/bookings': CalendarDays,
  '/technicians': Wrench,
  '/quality': Award,
  '/conduct': Flag,
  '/quotes': Video,
  '/guarantee': ShieldCheck,
  '/subscriptions': CreditCard,
  '/support': LifeBuoy,
  '/customers': Users,
  '/payouts': Wallet,
  '/withdrawals': Banknote,
  '/reports': BarChart3,
  '/broadcast': Megaphone,
  '/admins': UserCog,
};

export default function Sidebar() {
  const admin = useAuth((s) => s.admin);
  const navigate = useNavigate();
  const role = admin?.role;
  // Least privilege: items with no `roles` are visible to every admin; everything
  // else requires SUPER_ADMIN or an explicit role match. An unknown role sees
  // ONLY the unrestricted items (never the SUPER_ADMIN-only sections). The server
  // is the source of truth for access; this only governs what the nav reveals.
  const items = ADMIN_ROUTES.filter((n) => canAccessRoles(role, n.roles));

  async function handleLogout() {
    await apiLogout(); // revoke refresh token + clear cookie server-side
    navigate('/login', { replace: true });
  }

  return (
    <aside
      className="flex flex-col h-screen sticky top-0 border-slate-200"
      style={{ width: 240, background: '#FFFFFF', borderInlineStart: '1px solid #E2E8F0', flexShrink: 0 }}
    >
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2 border-b" style={{ borderColor: '#F1F5F9' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1366D6' }}>
          <Wrench size={16} color="#FFF" />
        </div>
        <div>
          <div style={{ color: '#1366D6', fontWeight: 800, fontSize: 18 }}>Fixly</div>
          <div style={{ color: '#94A3B8', fontSize: 11 }}>لوحة العمليات</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map(({ to, labelAr }) => {
          const Icon = ICONS[to] ?? LayoutDashboard;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `w-full px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${isActive ? '' : 'hover:bg-slate-50'}`
              }
              style={({ isActive }) => ({
                background: isActive ? '#E8F1FE' : 'transparent',
                color: isActive ? '#1366D6' : '#475569',
                borderInlineEnd: isActive ? '3px solid #1366D6' : '3px solid transparent',
                fontWeight: isActive ? 700 : 500,
              })}
            >
              <Icon size={18} strokeWidth={2} />
              {labelAr}
            </NavLink>
          );
        })}
      </nav>

      {/* Admin info + logout */}
      <div className="p-4 border-t flex items-center gap-2" style={{ borderColor: '#F1F5F9' }}>
        {admin && (
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }} className="truncate">{admin.name}</p>
            <p style={{ fontSize: 11, color: '#94A3B8' }} className="truncate">{admin.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          aria-label="تسجيل الخروج"
          className="p-1.5 rounded-lg hover:bg-slate-100 shrink-0"
          style={{ color: '#64748B' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
