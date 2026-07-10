import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '../lib/store';
import { adminRoleLabel } from './shared';

/**
 * Global top header: customer/technician-by-phone-or-name search (routes to
 * the Customers list, the only page wired to accept a search param so far),
 * current-admin role badge, and a notification bell that opens the live
 * activity feed on the Dashboard (no separate admin-notification/unread-count
 * system exists — this deliberately doesn't fake an unread badge).
 */
export default function Header() {
  const admin = useAuth((s) => s.admin);
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4" dir="rtl">
      <div className="flex-1 flex items-center gap-2 max-w-md px-3 h-9 rounded-lg" style={{ background: '#F1F5F9' }}>
        <Search size={16} color="#94A3B8" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              navigate(`/customers?search=${encodeURIComponent(q.trim())}`);
            }
          }}
          className="flex-1 bg-transparent outline-none"
          placeholder="البحث عن عميل بالاسم أو رقم الهاتف..."
          style={{ fontSize: 13 }}
        />
      </div>
      {admin?.role && (
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#E8F1FE', color: '#1366D6', fontWeight: 700 }}>
          {adminRoleLabel(admin.role)}
        </span>
      )}
      <button
        onClick={() => navigate('/dashboard')}
        aria-label="النشاط الأخير"
        className="relative w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center"
        style={{ color: '#475569' }}
      >
        <Bell size={18} />
      </button>
    </header>
  );
}
