import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Wrench, Wallet, Users, LogOut, ShieldCheck, LifeBuoy, BarChart3, Megaphone, Banknote, UserCog, Award, Flag, CreditCard, Video } from 'lucide-react';
import { useAuth } from '../lib/store';
import { logout as apiLogout } from '../lib/api';
import { ADMIN_ROUTES, canAccessRoles } from '../lib/permissions';
import {
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_BRAND_PRIMARY_TINT,
  COLOR_SURFACE_MUTED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_SUBTLE,
  COLOR_WHITE,
} from '../lib/theme';

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
      style={{ width: 240, background: COLOR_WHITE, borderInlineStart: `1px solid ${COLOR_BORDER_LIGHT}`, flexShrink: 0 }}
    >
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2 border-b" style={{ borderColor: COLOR_SURFACE_MUTED }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: COLOR_BRAND_PRIMARY }}>
          <Wrench size={16} color={COLOR_WHITE} />
        </div>
        <div>
          <div style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 800, fontSize: 18 }}>Fixly</div>
          <div style={{ color: COLOR_TEXT_SUBTLE, fontSize: 11 }}>لوحة العمليات</div>
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
                background: isActive ? COLOR_BRAND_PRIMARY_TINT : 'transparent',
                color: isActive ? COLOR_BRAND_PRIMARY : COLOR_TEXT_SECONDARY,
                borderInlineEnd: isActive ? `3px solid ${COLOR_BRAND_PRIMARY}` : '3px solid transparent',
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
      <div className="p-4 border-t flex items-center gap-2" style={{ borderColor: COLOR_SURFACE_MUTED }}>
        {admin && (
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 13, fontWeight: 700, color: COLOR_TEXT_PRIMARY }} className="truncate">{admin.name}</p>
            <p style={{ fontSize: 11, color: COLOR_TEXT_SUBTLE }} className="truncate">{admin.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          aria-label="تسجيل الخروج"
          className="p-1.5 rounded-lg hover:bg-slate-100 shrink-0"
          style={{ color: COLOR_TEXT_MUTED }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
