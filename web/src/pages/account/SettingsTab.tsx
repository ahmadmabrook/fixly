import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Trash2 } from 'lucide-react';
import { api, ApiError, logout as apiLogout, CustomerNotificationPreferences } from '../../lib/api';
import { Card, ConfirmDialog, Modal, SkeletonList, notify } from '../../components/shared';
import { COLOR_BG_SUBTLE, COLOR_BORDER_STRONG, COLOR_BRAND_PRIMARY, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY } from '../../lib/theme';

const DEFAULT_NOTIF_PREFS: CustomerNotificationPreferences = { bookings: true, arriving: true, completed: true, guarantee: true, promotions: false };

/** Backed by GET/PATCH /notifications/preferences — mirrors the technician
 *  side's NotificationsModal (TechPortal.Profile.tsx): each toggle saves
 *  immediately (optimistic update, reverted on failure). */
function NotificationsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.get<CustomerNotificationPreferences>('/notifications/preferences'),
  });
  const [prefs, setPrefs] = useState<CustomerNotificationPreferences | null>(null);
  const current = prefs ?? data ?? DEFAULT_NOTIF_PREFS;

  const rows: { key: keyof CustomerNotificationPreferences; label: string; sub: string }[] = [
    { key: 'bookings', label: 'تحديثات الحجوزات', sub: 'تأكيد، قبول، إلغاء' },
    { key: 'arriving', label: 'الفني في الطريق', sub: 'إشعار عند اقتراب الفني' },
    { key: 'completed', label: 'اكتمال الخدمة', sub: 'إيصال بعد الإنجاز' },
    { key: 'guarantee', label: 'تحديثات الضمان', sub: 'ردود على تذاكر الضمان' },
    { key: 'promotions', label: 'العروض والتخفيضات', sub: 'رموز الخصم والعروض الخاصة' },
  ];

  async function update(key: keyof CustomerNotificationPreferences) {
    const previous = current;
    const next = { ...current, [key]: !current[key] };
    setPrefs(next);
    try {
      const saved = await api.patch<CustomerNotificationPreferences>('/notifications/preferences', { [key]: next[key] });
      setPrefs(saved);
      qc.setQueryData(['notification-preferences'], saved);
    } catch (e) {
      setPrefs(previous);
      notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error');
    }
  }

  return (
    <Modal title="إعدادات الإشعارات" onClose={onClose} variant="sheet" maxWidth="sm">
      {isLoading ? (
        <div className="mt-4"><SkeletonList count={5} rowHeight={56} /></div>
      ) : (
        <div className="mt-4">
          {rows.map((r) => (
            <div key={r.key} className="py-3 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>{r.sub}</div>
              </div>
              <button onClick={() => void update(r.key)} role="switch" aria-checked={current[r.key]} aria-label={r.label} className="w-12 h-7 rounded-full relative transition-colors" style={{ background: current[r.key] ? COLOR_BRAND_PRIMARY : COLOR_BORDER_STRONG }}>
                <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ [current[r.key] ? 'right' : 'left']: 2 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function SettingsTab() {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
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
        <button onClick={() => setShowNotifPrefs(true)} className="text-start" style={{ color: COLOR_BRAND_PRIMARY, fontSize: 14, fontWeight: 600 }}>إعدادات الإشعارات</button>
        <div className="h-px bg-slate-100" />
        <button onClick={() => navigate('/terms')} className="text-start" style={{ color: COLOR_BRAND_PRIMARY, fontSize: 14, fontWeight: 600 }}>الشروط والأحكام</button>
        <div className="h-px bg-slate-100" />
        <button onClick={() => navigate('/privacy')} className="text-start" style={{ color: COLOR_BRAND_PRIMARY, fontSize: 14, fontWeight: 600 }}>سياسة الخصوصية</button>
      </Card>
      {showNotifPrefs && <NotificationsModal onClose={() => setShowNotifPrefs(false)} />}
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
