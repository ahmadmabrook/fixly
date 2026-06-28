import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, MapPin, CreditCard, Bell, LifeBuoy, Trash2, Plus, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { api, logout as apiLogout, Address, PaymentMethod, Notification, SupportTicketItem } from '../lib/api';
import { useLang } from '../lib/i18n';
import { Card, ConfirmDialog, notify } from '../components/shared';
import MapAddressPicker, { type AddressValue } from '../components/MapAddressPicker';

type Tab = 'profile' | 'addresses' | 'payment' | 'notifications' | 'support' | 'settings';
const TABS: ReadonlyArray<readonly [Tab, string, typeof User]> = [
  ['profile', 'حسابي', User],
  ['addresses', 'العناوين', MapPin],
  ['payment', 'الدفع', CreditCard],
  ['notifications', 'الإشعارات', Bell],
  ['support', 'الدعم', LifeBuoy],
  ['settings', 'الإعدادات', SettingsIcon],
];

export default function Account() {
  const [tab, setTab] = useState<Tab>('profile');
  return (
    <main className="max-w-[900px] mx-auto px-6 py-8">
      <h1 style={{ fontWeight: 800, fontSize: 28 }}>حسابي</h1>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 px-4 h-10 rounded-full shrink-0"
            style={{ background: tab === k ? '#1366D6' : '#FFF', color: tab === k ? '#FFF' : '#475569', fontWeight: 600, fontSize: 13, border: '1px solid #E2E8F0' }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'addresses' && <AddressesTab />}
        {tab === 'payment' && <PaymentTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'support' && <SupportTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </main>
  );
}

function SettingsTab() {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { lang, setLang } = useLang();
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
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <span style={{ fontWeight: 600, fontSize: 14 }}>اللغة / Language</span>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: '#F1F5F9' }}>
            {(['ar', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className="px-3 h-8 rounded-md" style={{ background: lang === l ? '#FFF' : 'transparent', color: lang === l ? '#1366D6' : '#475569', fontWeight: 700, fontSize: 13, boxShadow: lang === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <Card className="p-5 space-y-2">
        <a href="/terms" onClick={(e) => { e.preventDefault(); notify('الشروط والأحكام'); }} style={{ color: '#1366D6', fontSize: 14, fontWeight: 600 }}>الشروط والأحكام</a>
        <div className="h-px bg-slate-100" />
        <a href="/privacy" onClick={(e) => { e.preventDefault(); notify('سياسة الخصوصية'); }} style={{ color: '#1366D6', fontSize: 14, fontWeight: 600 }}>سياسة الخصوصية</a>
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

function ProfileTab() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ name: string | null; phone: string }>('/auth/me') });
  const [name, setName] = useState<string | null>(null);
  const value = name ?? me?.name ?? '';
  async function save() {
    try {
      await api.patch('/auth/me', { name: value.trim() });
      notify('تم الحفظ', 'success');
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر الحفظ', 'error'); }
  }
  return (
    <Card className="p-6">
      <label className="block" style={{ fontSize: 13, color: '#475569' }}>الاسم</label>
      <input value={value} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
      <label className="block mt-4" style={{ fontSize: 13, color: '#475569' }}>رقم الهاتف</label>
      <input value={me?.phone ?? ''} readOnly className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none bg-slate-50" style={{ fontSize: 14, direction: 'ltr' }} />
      <button onClick={() => void save()} className="mt-5 w-full h-12 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>حفظ</button>
    </Card>
  );
}

function AddressesTab() {
  const qc = useQueryClient();
  const { data: items } = useQuery({ queryKey: ['addresses'], queryFn: () => api.get<Address[]>('/addresses') });
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [addr, setAddr] = useState<AddressValue>({ address: '', lat: 31.9539, lng: 35.9106 });
  function reset() { setAdding(false); setLabel(''); setAddr({ address: '', lat: 31.9539, lng: 35.9106 }); }
  async function add() {
    try {
      await api.post('/addresses', { label: label.trim(), line: addr.address.trim(), lat: addr.lat, lng: addr.lng });
      notify('تم الحفظ', 'success'); reset();
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function del(id: string) {
    try {
      await api.delete(`/addresses/${id}`);
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر حذف العنوان', 'error'); }
  }
  return (
    <div className="space-y-3">
      {(items ?? []).length === 0 && !adding && <p style={{ color: '#94A3B8', fontSize: 14 }}>أضف عنوانك الأول.</p>}
      {(items ?? []).map((a) => (
        <Card key={a.id} className="p-4 flex items-center gap-3">
          <MapPin size={18} color="#1366D6" />
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{a.label} {a.isDefault && <span style={{ color: '#15803D', fontSize: 11 }}>• افتراضي</span>}</div>
            <div style={{ color: '#475569', fontSize: 12 }}>{a.line}</div>
          </div>
          <button onClick={() => void del(a.id)} aria-label="حذف"><Trash2 size={16} color="#B91C1C" /></button>
        </Card>
      ))}
      {adding ? (
        <Card className="p-4 space-y-3">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="التسمية (مثال: المنزل)" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
          <MapAddressPicker value={addr} onChange={setAddr} height={220} />
          <div className="flex gap-2">
            <button onClick={() => void add()} disabled={!label.trim() || !addr.address.trim()} className="flex-1 h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>حفظ</button>
            <button onClick={reset} className="px-4 h-11 rounded-xl" style={{ color: '#475569' }}>إلغاء</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-4 h-11 rounded-xl" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 14 }}>
          <Plus size={16} /> إضافة عنوان
        </button>
      )}
    </div>
  );
}

function PaymentTab() {
  const qc = useQueryClient();
  const { data: items } = useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<PaymentMethod[]>('/payment-methods') });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ brand: 'visa', last4: '', expMonth: '12', expYear: '2030' });
  async function add() {
    try {
      await api.post('/payment-methods', { brand: form.brand, last4: form.last4, expMonth: Number(form.expMonth), expYear: Number(form.expYear) });
      notify('تمت إضافة البطاقة', 'success'); setAdding(false); setForm({ brand: 'visa', last4: '', expMonth: '12', expYear: '2030' });
      void qc.invalidateQueries({ queryKey: ['payment-methods'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function del(id: string) {
    try {
      await api.delete(`/payment-methods/${id}`);
      void qc.invalidateQueries({ queryKey: ['payment-methods'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر حذف البطاقة', 'error'); }
  }
  return (
    <div className="space-y-3">
      <p style={{ color: '#475569', fontSize: 12 }}>دفع آمن 100% — لا يتم تخزين رقم البطاقة كاملاً. لا دفع نقدي.</p>
      {(items ?? []).map((c) => (
        <Card key={c.id} className="p-4 flex items-center gap-3">
          <CreditCard size={18} color="#1366D6" />
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{c.brand} •••• {c.last4}</div>
            <div style={{ color: '#475569', fontSize: 12, fontFamily: 'Inter' }}>{c.expMonth}/{c.expYear} {c.isDefault && <span style={{ color: '#15803D' }}>• افتراضية</span>}</div>
          </div>
          <button onClick={() => void del(c.id)} aria-label="حذف"><Trash2 size={16} color="#B91C1C" /></button>
        </Card>
      ))}
      {adding ? (
        <Card className="p-4 space-y-2">
          <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }}>
            <option value="visa">Visa</option><option value="mastercard">Mastercard</option>
          </select>
          <input value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="آخر 4 أرقام" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.expMonth} onChange={(e) => setForm({ ...form, expMonth: e.target.value })} placeholder="MM" className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
            <input value={form.expYear} onChange={(e) => setForm({ ...form, expYear: e.target.value })} placeholder="YYYY" className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => void add()} disabled={form.last4.length !== 4} className="flex-1 h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>حفظ</button>
            <button onClick={() => setAdding(false)} className="px-4 h-11 rounded-xl" style={{ color: '#475569' }}>إلغاء</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-4 h-11 rounded-xl" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 14 }}>
          <Plus size={16} /> إضافة بطاقة
        </button>
      )}
    </div>
  );
}

function NotificationsTab() {
  const qc = useQueryClient();
  const { data: items } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<Notification[]>('/notifications') });
  async function readAll() {
    try {
      await api.post('/notifications/read-all', {});
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر تحديث الإشعارات', 'error'); }
  }
  return (
    <div className="space-y-3">
      {(items ?? []).length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد إشعارات.</p>}
      {(items ?? []).some((n) => !n.isRead) && (
        <button onClick={() => void readAll()} style={{ color: '#1366D6', fontSize: 13, fontWeight: 600 }}>تعليم الكل كمقروء</button>
      )}
      {(items ?? []).map((n) => (
        <Card key={n.id} className="p-4" style={{ background: n.isRead ? '#FFF' : '#F0F7FF' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{n.titleAr}</div>
          <div style={{ color: '#475569', fontSize: 13, marginTop: 2 }}>{n.bodyAr}</div>
          <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('ar-JO')}</div>
        </Card>
      ))}
    </div>
  );
}

function SupportTab() {
  const qc = useQueryClient();
  const { data: tickets } = useQuery({ queryKey: ['support'], queryFn: () => api.get<SupportTicketItem[]>('/support') });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '' });
  async function create() {
    try {
      const t = await api.post<SupportTicketItem>('/support', { subject: form.subject.trim(), body: form.body.trim() });
      notify('تم إرسال طلب الدعم — الرد خلال 5 دقائق', 'success'); setCreating(false); setForm({ subject: '', body: '' });
      void qc.invalidateQueries({ queryKey: ['support'] }); setOpenId(t.id);
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  if (openId) return <SupportThread id={openId} onBack={() => setOpenId(null)} />;
  return (
    <div className="space-y-3">
      <p style={{ color: '#475569', fontSize: 13 }}>نحن هنا لمساعدتك 24/7 — الرد خلال 5 دقائق.</p>
      {(tickets ?? []).map((t) => (
        <Card key={t.id} className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => setOpenId(t.id)}>
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t.subject}</div>
            <div style={{ color: '#475569', fontSize: 12 }}>{t.status === 'OPEN' ? 'مفتوح' : t.status === 'IN_PROGRESS' ? 'قيد المعالجة' : 'مغلق'}</div>
          </div>
        </Card>
      ))}
      {creating ? (
        <Card className="p-4 space-y-2">
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="الموضوع" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="كيف يمكننا مساعدتك؟" rows={3} className="w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
          <div className="flex gap-2">
            <button onClick={() => void create()} disabled={!form.subject.trim() || !form.body.trim()} className="flex-1 h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إرسال</button>
            <button onClick={() => setCreating(false)} className="px-4 h-11 rounded-xl" style={{ color: '#475569' }}>إلغاء</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setCreating(true)} className="flex items-center gap-1 px-4 h-11 rounded-xl" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 14 }}>
          <Plus size={16} /> تذكرة دعم جديدة
        </button>
      )}
    </div>
  );
}

function SupportThread({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: ticket } = useQuery({ queryKey: ['support', id], queryFn: () => api.get<SupportTicketItem>(`/support/${id}`) });
  const [msg, setMsg] = useState('');
  async function send() {
    if (!msg.trim()) return;
    try {
      await api.post(`/support/${id}/messages`, { body: msg.trim() });
      setMsg('');
      void qc.invalidateQueries({ queryKey: ['support', id] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر إرسال الرسالة', 'error'); }
  }
  return (
    <div>
      <button onClick={onBack} style={{ color: '#1366D6', fontWeight: 600, fontSize: 14 }}>← رجوع</button>
      <h2 className="mt-2" style={{ fontWeight: 700, fontSize: 16 }}>{ticket?.subject}</h2>
      <div className="mt-3 space-y-2">
        {(ticket?.messages ?? []).map((m) => (
          <div key={m.id} className={`max-w-[80%] p-3 rounded-2xl ${m.senderRole === 'CUSTOMER' ? 'ms-auto' : ''}`}
            style={{ background: m.senderRole === 'CUSTOMER' ? '#1366D6' : '#F1F5F9', color: m.senderRole === 'CUSTOMER' ? '#FFF' : '#0F172A', fontSize: 14 }}>
            {m.body}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="اكتب رسالتك..." className="flex-1 h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
        <button onClick={() => void send()} className="px-4 h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إرسال</button>
      </div>
    </div>
  );
}
