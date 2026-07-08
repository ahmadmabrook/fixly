import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Trash2, Plus } from 'lucide-react';
import { api, Address } from '../../lib/api';
import { Card, notify } from '../../components/shared';
import MapAddressPicker, { type AddressValue } from '../../components/MapAddressPicker';

export function AddressesTab() {
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
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="التسمية (مثال: المنزل)" aria-label="تسمية العنوان" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
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
