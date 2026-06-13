import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Wrench, Wallet, Users, LogOut } from 'lucide-react';
import { useAuth } from '../lib/store';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
  { to: '/bookings',  icon: CalendarDays,    label: 'الحجوزات' },
  { to: '/technicians', icon: Wrench,        label: 'الفنيون' },
  { to: '/payouts',   icon: Wallet,          label: 'المدفوعات' },
  { to: '/customers', icon: Users,           label: 'العملاء' },
];

export default function Sidebar() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
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
        {NAV.map(({ to, icon: Icon, label }) => (
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
