import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Trash2 } from 'lucide-react';
import { api, logout as apiLogout } from '../../lib/api';
import { Card, ConfirmDialog, notify } from '../../components/shared';

export function SettingsTab() {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function doDelete() {
    setConfirmDelete(false);
    try {
      await api.delete('/auth/me');
      notify('تم حذف حسابك', 'success');
      await apiLogout();
      window.location.assign('/');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر حذف الحساب', 'error');
    }
  }
  return (
    <div className="space-y-3">
      <Card className="p-5 space-y-2">
        <button onClick={() => navigate('/terms')} className="text-start" style={{ color: '#1366D6', fontSize: 14, fontWeight: 600 }}>الشروط والأحكام</button>
        <div className="h-px bg-slate-100" />
        <button onClick={() => navigate('/privacy')} className="text-start" style={{ color: '#1366D6', fontSize: 14, fontWeight: 600 }}>سياسة الخصوصية</button>
      </Card>
      <button onClick={() => void apiLogout().then(() => window.location.assign('/'))} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: '#F1F5F9', color: '#475569', fontWeight: 600 }}>
        <LogOut size={16} /> تسجيل الخروج
      </button>
      <button onClick={() => setConfirmDelete(true)} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ color: '#B91C1C', fontWeight: 600, border: '1px solid #FECACA' }}>
        <Trash2 size={16} /> حذف الحساب نهائياً
      </button>
      {confirmDelete && (
        <ConfirmDialog
          title="حذف الحساب نهائياً؟"
          body="لا يمكن التراجع عن هذا الإجراء. سيتم إلغاء تفعيل حسابك."
          confirmLabel="حذف"
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
