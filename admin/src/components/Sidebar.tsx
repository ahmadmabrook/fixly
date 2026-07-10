import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Wrench, Wallet, Users, LogOut, ShieldCheck, LifeBuoy, BarChart3, Megaphone, Banknote, UserCog, Award, Flag, CreditCard, Video } from 'lucide-react';
import { useAuth, type AdminRole } from '../lib/store';
import { logout as apiLogout } from '../lib/api';

// roles=undefined → visible to all admins. SUPER_ADMIN always sees everything.
const NAV: ReadonlyArray<{ to: string; icon: typeof LayoutDashboard; label: string; roles?: AdminRole[] }> = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
  { to: '/bookings',  icon: CalendarDays,    label: 'الحجوزات', roles: ['OPS'] },
  { to: '/technicians', icon: Wrench,        label: 'الفنيون', roles: ['OPS'] },
  { to: '/quality',   icon: Award,           label: 'الجودة والثقة', roles: ['OPS'] },
  { to: '/conduct',   icon: Flag,            label: 'بلاغات السلوك', roles: ['OPS'] },
  { to: '/quotes',    icon: Video,           label: 'الفحص المرئي', roles: ['OPS'] },
  { to: '/guarantee', icon: ShieldCheck,     label: 'الضمان', roles: ['OPS'] },
  { to: '/subscriptions', icon: CreditCard,  label: 'الاشتراكات', roles: ['OPS', 'FINANCE'] },
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
  // Least privilege: items with no `roles` are visible to every admin; everything
  // else requires SUPER_ADMIN or an explicit role match. An unknown role sees
  // ONLY the unrestricted items (never the SUPER_ADMIN-only sections). The server
  // is the source of truth for access; this only governs what the nav reveals.
  const canSee = (roles?: AdminRole[]) => {
    if (!roles) return true;            // unrestricted (e.g. dashboard)
    if (role === 'SUPER_ADMIN') return true;
    if (!role) return false;            // unknown role → least privilege
    return roles.includes(role);
  };
  const items = NAV.filter((n) => canSee(n.roles));

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
        {items.map(({ to, icon: Icon, label }) => (
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
            {label}
          </NavLink>
        ))}
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
