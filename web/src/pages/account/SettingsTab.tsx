import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Trash2 } from 'lucide-react';
import { api, logout as apiLogout } from '../../lib/api';
import { Card, ConfirmDialog, notify } from '../../components/shared';
import { COLOR_BG_SUBTLE, COLOR_BRAND_PRIMARY, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_TEXT_SECONDARY } from '../../lib/theme';

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
        <button onClick={() => navigate('/terms')} className="text-start" style={{ color: COLOR_BRAND_PRIMARY, fontSize: 14, fontWeight: 600 }}>الشروط والأحكام</button>
        <div className="h-px bg-slate-100" />
        <button onClick={() => navigate('/privacy')} className="text-start" style={{ color: COLOR_BRAND_PRIMARY, fontSize: 14, fontWeight: 600 }}>سياسة الخصوصية</button>
      </Card>
      <button onClick={() => void apiLogout().then(() => window.location.assign('/'))} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontWeight: 600 }}>
        <LogOut size={16} /> تسجيل الخروج
      </button>
      <button onClick={() => setConfirmDelete(true)} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ color: COLOR_ERROR_TEXT, fontWeight: 600, border: `1px solid ${COLOR_ERROR_BORDER}` }}>
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
