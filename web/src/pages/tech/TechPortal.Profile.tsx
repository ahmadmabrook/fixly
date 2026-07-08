import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, LogOut, LifeBuoy, Landmark, Plus } from 'lucide-react';
import { api, ApiError, logout as apiLogout, TechnicianProfileMe, Service, SupportTicketItem, NotificationPreferences, BankAccount } from '../../lib/api';
import { useServices } from '../../hooks/useServices';
import { Card, ServiceIcon, Modal, ConfirmDialog, notify, SkeletonList } from '../../components/shared';

/* ---------- Profile / settings tab + sub-screens ---------- */

type ProfileScreen = 'personal-data' | 'services-pricing' | 'bank-account' | 'tech-notifications' | 'tech-support' | null;

export function ProfileTab() {
  const [screen, setScreen] = useState<ProfileScreen>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const menuItems: { key: Exclude<ProfileScreen, null>; label: string }[] = [
    { key: 'personal-data', label: 'البيانات الشخصية' },
    { key: 'services-pricing', label: 'الخدمات والأسعار' },
    { key: 'bank-account', label: 'الحساب البنكي' },
    { key: 'tech-notifications', label: 'الإشعارات' },
    { key: 'tech-support', label: 'الدعم' },
  ];

  async function doLogout() {
    setConfirmLogout(false);
    await apiLogout();
    window.location.assign('/');
  }

  return (
    <div>
      <Card>
        {menuItems.map((item) => (
          <button key={item.key} onClick={() => setScreen(item.key)} className="w-full px-4 py-3.5 flex items-center text-start border-b last:border-0 border-slate-100">
            <span className="flex-1" style={{ fontSize: 14, color: '#0F172A', fontWeight: 600 }}>{item.label}</span>
            <ChevronLeft size={16} color="#94A3B8" aria-hidden="true" />
          </button>
        ))}
        <button onClick={() => setConfirmLogout(true)} className="w-full px-4 py-3.5 flex items-center text-start gap-2">
          <LogOut size={16} color="#E5484D" aria-hidden="true" />
          <span className="flex-1" style={{ fontSize: 14, color: '#E5484D', fontWeight: 600 }}>تسجيل الخروج</span>
        </button>
      </Card>

      {screen === 'personal-data' && <PersonalDataModal onClose={() => setScreen(null)} />}
      {screen === 'services-pricing' && <ServicesPricingModal onClose={() => setScreen(null)} />}
      {screen === 'bank-account' && <BankAccountModal onClose={() => setScreen(null)} />}
      {screen === 'tech-notifications' && <NotificationsModal onClose={() => setScreen(null)} />}
      {screen === 'tech-support' && <SupportModal onClose={() => setScreen(null)} />}

      {confirmLogout && (
        <ConfirmDialog
          title="تسجيل الخروج؟"
          body="هل أنت متأكد من تسجيل الخروج؟"
          confirmLabel="تسجيل الخروج"
          onConfirm={() => void doLogout()}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  );
}

/**
 * Name edit. Phone stays read-only (identity anchor). Technicians share the
 * same `User` row as customers, so this reuses the generic PATCH /auth/me
 * that Account.tsx's customer-facing ProfileTab already calls — there is no
 * separate technician-only profile-update endpoint.
 *
 * NOTE: figma's TechPersonalData also shows an email field, but the `User`
 * model has no email column at all (only phone/name/avatarUrl) — there is
 * nothing to read or save, so it's intentionally omitted here rather than
 * wiring an input to a field that doesn't exist.
 */
function PersonalDataModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: meAuth } = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ name: string | null; phone: string }>('/auth/me') });
  const [name, setName] = useState<string | null>(null);
  const nameValue = name ?? meAuth?.name ?? '';

  async function save() {
    try {
      await api.patch('/auth/me', { name: nameValue.trim() || undefined });
      notify('تم الحفظ', 'success');
      void qc.invalidateQueries({ queryKey: ['me'] });
      onClose();
    } catch (e) { notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error'); }
  }

  return (
    <Modal title="البيانات الشخصية" onClose={onClose} variant="sheet" maxWidth="sm">
      <div className="mt-4 space-y-3">
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>الاسم الكامل</label>
          <input value={nameValue} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>رقم الهاتف</label>
          <div className="mt-1 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-4">
            <span style={{ fontFamily: 'Inter', color: '#94A3B8' }} dir="ltr">{meAuth?.phone}</span>
            <span className="ms-2 px-1.5 py-0.5 rounded" style={{ background: '#E2E8F0', color: '#64748B', fontSize: 10, fontWeight: 700 }}>لا يمكن تغييره</span>
          </div>
        </div>
      </div>
      <button onClick={() => void save()} className="mt-5 w-full h-12 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>حفظ التغييرات</button>
    </Modal>
  );
}

/**
 * Services/rate edit after approval (figma TechServicesPricing). Backed by
 * PATCH /technician/services-pricing — a separate, additive path from
 * onboarding's apply() (which locks once APPROVED). Rate is clamped 40-60 JOD
 * client-side to match the server-side validation, mirroring Onboarding's picker.
 */
function ServicesPricingModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ['technician-me'], queryFn: () => api.get<TechnicianProfileMe>('/technician/me') });
  const { data: services } = useServices();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedIds = selected ?? (me?.services ?? []).map((s) => s.id);
  const rateValue = rate ?? String(me?.hourlyRateJod ?? '45');

  function toggle(id: string) {
    setSelected((selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]));
  }

  const rateNum = Number(rateValue);
  const canSave = selectedIds.length > 0 && rateNum >= 40 && rateNum <= 60;

  async function save() {
    setSaving(true);
    try {
      await api.patch('/technician/services-pricing', { serviceIds: selectedIds, hourlyRateJod: rateNum });
      notify('تم حفظ الخدمات والسعر', 'success');
      void qc.invalidateQueries({ queryKey: ['technician-me'] });
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="الخدمات والأسعار" onClose={onClose} variant="sheet" maxWidth="sm">
      {isLoading ? (
        <div className="mt-4"><SkeletonList count={2} rowHeight={48} /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }} className="mb-2">الخدمات</div>
            <div className="grid grid-cols-2 gap-2">
              {(services?.data ?? []).map((s: Service) => (
                <button key={s.id} onClick={() => toggle(s.id)} className="p-3 rounded-xl border-2 flex items-center gap-2 text-start"
                  style={{ borderColor: selectedIds.includes(s.id) ? '#1366D6' : '#E2E8F0', background: selectedIds.includes(s.id) ? '#E8F1FE' : '#FFF' }}>
                  <ServiceIcon nameAr={s.nameAr} size={18} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.nameAr}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>الأجر بالساعة (40–60 دينار)</label>
            <input
              value={rateValue}
              onChange={(ev) => setRate(ev.target.value.replace(/[^\d.]/g, ''))}
              className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4"
              style={{ fontSize: 14, direction: 'ltr' }}
            />
          </div>
          <button onClick={() => void save()} disabled={!canSave || saving} className="w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
            حفظ التغييرات
          </button>
        </div>
      )}
    </Modal>
  );
}

/**
 * Dedicated bank-account screen (figma TechBankAccount), backed by
 * GET/PATCH /technician/bank-account — a real, independently-saved settings
 * screen. The Earnings withdraw form shares the same ['tech-bank-account']
 * query for its default prefill.
 */
function BankAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: bank, isLoading } = useQuery({ queryKey: ['tech-bank-account'], queryFn: () => api.get<BankAccount>('/technician/bank-account') });
  const [iban, setIban] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ibanValue = iban ?? bank?.iban ?? '';
  const bankNameValue = bankName ?? bank?.bankName ?? '';

  async function save() {
    setSaving(true);
    try {
      const data = await api.patch<BankAccount>('/technician/bank-account', { iban: ibanValue.trim(), bankName: bankNameValue.trim() });
      qc.setQueryData(['tech-bank-account'], data);
      notify('تم الحفظ', 'success');
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="الحساب البنكي" onClose={onClose} variant="sheet" maxWidth="sm">
      {isLoading ? (
        <div className="mt-4"><SkeletonList count={2} rowHeight={56} /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>اسم البنك</label>
            <input value={bankNameValue} onChange={(ev) => setBankName(ev.target.value)} placeholder="مثال: البنك العربي" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>رقم IBAN</label>
            <input value={ibanValue} onChange={(ev) => setIban(ev.target.value)} aria-label="رقم IBAN" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14, fontFamily: 'Inter' }} dir="ltr" />
          </div>
          <Card className="p-3 flex items-start gap-2" style={{ background: '#E8F1FE' }}>
            <Landmark size={16} color="#1366D6" className="mt-0.5" aria-hidden="true" />
            <p style={{ color: '#0E4FA8', fontSize: 12 }}>يُستخدم هذا الحساب تلقائياً عند طلب سحب الرصيد.</p>
          </Card>
        </div>
      )}
      <button onClick={() => void save()} disabled={!ibanValue.trim() || !bankNameValue.trim() || saving} className="mt-5 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>حفظ التغييرات</button>
    </Modal>
  );
}

const DEFAULT_NOTIF_PREFS: NotificationPreferences = { newJobRequests: true, reminders: true, earningsUpdates: true, promotions: true };

/** Backed by GET/PATCH /technician/notification-preferences. Each toggle
 *  saves immediately (optimistic update, reverted on failure), matching the
 *  availability toggle's immediate-persist pattern elsewhere in this file. */
function NotificationsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tech-notification-preferences'],
    queryFn: () => api.get<NotificationPreferences>('/technician/notification-preferences'),
  });
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const current = prefs ?? data ?? DEFAULT_NOTIF_PREFS;

  const rows: { key: keyof NotificationPreferences; label: string; sub: string }[] = [
    { key: 'newJobRequests', label: 'طلبات جديدة', sub: 'إشعار فوري عند وصول طلب' },
    { key: 'reminders', label: 'تذكيرات المواعيد', sub: 'قبل الموعد بـ 15 دقيقة' },
    { key: 'earningsUpdates', label: 'تحديثات الأرباح', sub: 'عند استلام مبلغ جديد' },
    { key: 'promotions', label: 'العروض والأخبار', sub: 'نصائح وعروض Fixly' },
  ];

  async function update(key: keyof NotificationPreferences) {
    const previous = current;
    const next = { ...current, [key]: !current[key] };
    setPrefs(next);
    try {
      const saved = await api.patch<NotificationPreferences>('/technician/notification-preferences', { [key]: next[key] });
      setPrefs(saved);
      qc.setQueryData(['tech-notification-preferences'], saved);
    } catch (e) {
      setPrefs(previous);
      notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error');
    }
  }

  return (
    <Modal title="الإشعارات" onClose={onClose} variant="sheet" maxWidth="sm">
      {isLoading ? (
        <div className="mt-4"><SkeletonList count={4} rowHeight={56} /></div>
      ) : (
        <div className="mt-4">
          {rows.map((r) => (
            <div key={r.key} className="py-3 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                <div style={{ color: '#94A3B8', fontSize: 12 }}>{r.sub}</div>
              </div>
              <button onClick={() => void update(r.key)} role="switch" aria-checked={current[r.key]} aria-label={r.label} className="w-12 h-7 rounded-full relative transition-colors" style={{ background: current[r.key] ? '#1366D6' : '#CBD5E1' }}>
                <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ [current[r.key] ? 'right' : 'left']: 2 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Support screen (figma TechSupport). Reuses the same role-agnostic
 *  /support endpoints the customer side uses (SupportService is tied to the
 *  authenticated user, not a role) — list tickets + open a new one. */
function SupportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: tickets } = useQuery({ queryKey: ['support'], queryFn: () => api.get<SupportTicketItem[]>('/support') });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '' });

  async function create() {
    try {
      await api.post('/support', { subject: form.subject.trim(), body: form.body.trim() });
      notify('تم إرسال بلاغك — الرد خلال 5 دقائق', 'success');
      setCreating(false); setForm({ subject: '', body: '' });
      void qc.invalidateQueries({ queryKey: ['support'] });
    } catch (e) { notify(e instanceof ApiError ? e.message : 'خطأ', 'error'); }
  }

  return (
    <Modal title="الدعم والمساعدة" onClose={onClose} variant="sheet" maxWidth="sm">
      <div className="mt-4 space-y-3">
        <Card className="p-4 flex items-center gap-3" style={{ background: 'linear-gradient(95deg,#1366D6 0%,#0E4FA8 100%)' }}>
          <LifeBuoy size={24} color="#FFF" aria-hidden="true" />
          <div>
            <div style={{ color: '#FFF', fontWeight: 700, fontSize: 15 }}>دعم الفنيين 24/7</div>
            <div style={{ color: '#CFE0FB', fontSize: 12 }}>الرد خلال 5 دقائق</div>
          </div>
        </Card>

        {(tickets ?? []).map((t) => (
          <Card key={t.id} className="p-3">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t.subject}</div>
            <div style={{ color: '#475569', fontSize: 12 }}>{t.status === 'OPEN' ? 'مفتوح' : t.status === 'IN_PROGRESS' ? 'قيد المعالجة' : 'مغلق'}</div>
          </Card>
        ))}

        {creating ? (
          <Card className="p-4 space-y-2">
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="الموضوع" aria-label="موضوع تذكرة الدعم" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="صف المشكلة (عميل · دفع · أخرى)" aria-label="وصف مشكلة الدعم" rows={3} className="w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
            <div className="flex gap-2">
              <button onClick={() => void create()} disabled={!form.subject.trim() || !form.body.trim()} className="flex-1 h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إرسال</button>
              <button onClick={() => setCreating(false)} className="px-4 h-11 rounded-xl" style={{ color: '#475569' }}>إلغاء</button>
            </div>
          </Card>
        ) : (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1 px-4 h-11 rounded-xl" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 14 }}>
            <Plus size={16} aria-hidden="true" /> الإبلاغ عن مشكلة
          </button>
        )}
      </div>
    </Modal>
  );
}
