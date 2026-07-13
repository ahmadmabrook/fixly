import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Trash2, Plus } from 'lucide-react';
import { api, PaymentMethod } from '../../lib/api';
import { Card, notify } from '../../components/shared';
import { COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ERROR_TEXT, COLOR_SUCCESS_TEXT, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../../lib/theme';

export function PaymentTab() {
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
      <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>دفع آمن 100% — لا يتم تخزين رقم البطاقة كاملاً. لا دفع نقدي.</p>
      {(items ?? []).map((c) => (
        <Card key={c.id} className="p-4 flex items-center gap-3">
          <CreditCard size={18} color={COLOR_BRAND_PRIMARY} />
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{c.brand} •••• {c.last4}</div>
            <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12, fontFamily: 'Inter' }}>{c.expMonth}/{c.expYear} {c.isDefault && <span style={{ color: COLOR_SUCCESS_TEXT }}>• افتراضية</span>}</div>
          </div>
          <button onClick={() => void del(c.id)} aria-label="حذف"><Trash2 size={16} color={COLOR_ERROR_TEXT} /></button>
        </Card>
      ))}
      {adding ? (
        <Card className="p-4 space-y-2">
          <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} aria-label="نوع البطاقة" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }}>
            <option value="visa">Visa</option><option value="mastercard">Mastercard</option>
          </select>
          <input value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="آخر 4 أرقام" aria-label="آخر 4 أرقام من البطاقة" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.expMonth} onChange={(e) => setForm({ ...form, expMonth: e.target.value })} placeholder="MM" aria-label="شهر الانتهاء" className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
            <input value={form.expYear} onChange={(e) => setForm({ ...form, expYear: e.target.value })} placeholder="YYYY" aria-label="سنة الانتهاء" className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => void add()} disabled={form.last4.length !== 4} className="flex-1 h-11 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>حفظ</button>
            <button onClick={() => setAdding(false)} className="px-4 h-11 rounded-xl" style={{ color: COLOR_TEXT_SECONDARY }}>إلغاء</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-4 h-11 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 600, fontSize: 14 }}>
          <Plus size={16} /> إضافة بطاقة
        </button>
      )}
    </div>
  );
}
