import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Wrench, Wallet, Users, LogOut, ShieldCheck, LifeBuoy, BarChart3, Megaphone, Banknote, UserCog } from 'lucide-react';
import { useAuth, type AdminRole } from '../lib/store';
import { logout as apiLogout } from '../lib/api';

// roles=undefined → visible to all admins. SUPER_ADMIN always sees everything.
const NAV: ReadonlyArray<{ to: string; icon: typeof LayoutDashboard; label: string; roles?: AdminRole[] }> = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
  { to: '/bookings',  icon: CalendarDays,    label: 'الحجوزات', roles: ['OPS'] },
  { to: '/technicians', icon: Wrench,        label: 'الفنيون', roles: ['OPS'] },
  { to: '/guarantee', icon: ShieldCheck,     label: 'الضمان', roles: ['OPS'] },
  { to: '/support',   icon: LifeBuoy,        label: 'الدعم', roles: ['SUPPORT'] },
  { to: '/customers', icon: Users,           label: 'العملاء', roles: ['OPS', 'SUPPORT'] },
  { to: '/payouts',   icon: Wallet,          label: 'المدفوعات', roles: ['FINANCE'] },
  { to: '/withdrawals', icon: Banknote,      label: 'طلبات السحب', roles: ['FINANCE'] },
  { to: '/reports',   icon: BarChart3,       label: 'التقارير', roles: ['FINANCE'] },
  { to: '/broadcast', icon: Megaphone,       label: 'إشعارات جماعية', roles: ['OPS'] },
  { to: '/admins',    icon: UserCog,         label: 'المسؤولون', roles: [] },
];

export default function Sidebar() {
  const admin = useAuth((s) => s.admin);
  const navigate = useNavigate();
  const role = admin?.role;
  const canSee = (roles?: AdminRole[]) => !roles || role === 'SUPER_ADMIN' || role === undefined || (role ? roles.includes(role) : false);
  const items = NAV.filter((n) => canSee(n.roles));

  async function handleLogout() {
    await apiLogout(); // revoke refresh token + clear cookie server-side
    navigate('/login', { replace: true });
  }

  return (
    <aside
      className="flex flex-col h-screen sticky top-0"
      style={{ width: 240, background: '#0F172A', color: '#FFF', flexShrink: 0 }}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b" style={{ borderColor: '#1E293B' }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: -0.5 }}>
          Fixly <span style={{ color: '#1366D6' }}>Admin</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-[#1366D6] text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Admin info + logout */}
      <div className="px-4 py-4 border-t" style={{ borderColor: '#1E293B' }}>
        {admin && (
          <div className="mb-3 px-1">
            <p className="text-white text-sm font-semibold truncate">{admin.name}</p>
            <p className="text-slate-500 text-xs truncate">{admin.email}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
