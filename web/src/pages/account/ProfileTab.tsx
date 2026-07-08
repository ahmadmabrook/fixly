import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, notify } from '../../components/shared';

export function ProfileTab() {
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
