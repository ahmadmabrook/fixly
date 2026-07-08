import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, TechEarnings, BankAccount } from '../../lib/api';
import { Card, notify } from '../../components/shared';

export function Earnings({ onChange }: { onChange: () => void }) {
  const qc = useQueryClient();
  const { data: e } = useQuery({ queryKey: ['tech-earnings'], queryFn: () => api.get<TechEarnings>('/technician/earnings') });
  const { data: bank } = useQuery({ queryKey: ['tech-bank-account'], queryFn: () => api.get<BankAccount>('/technician/bank-account') });
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const didPrefill = useRef(false);

  // Pre-fill IBAN and bank name from the saved bank-account settings screen.
  useEffect(() => {
    if (!bank || didPrefill.current) return;
    didPrefill.current = true;
    if (bank.iban) { setIban(bank.iban); setPrefilled(true); }
    if (bank.bankName) { setBankName(bank.bankName); }
  }, [bank]);

  async function withdraw() {
    try {
      await api.post('/technician/withdrawals', { amountJod: Number(amount), iban: iban.trim() || undefined, bankName: bankName.trim() || undefined });
      notify('تم إرسال طلب السحب', 'success'); setAmount(''); setIban(''); setBankName('');
      setPrefilled(false); didPrefill.current = false;
      void qc.invalidateQueries({ queryKey: ['tech-earnings'] }); onChange();
    } catch (err) { notify(err instanceof ApiError ? err.message : 'خطأ', 'error'); }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="اليوم" value={e?.todayJod ?? '0'} />
        <Stat label="هذا الشهر" value={e?.monthJod ?? '0'} />
        <Stat label="الرصيد" value={e?.balanceJod ?? '0'} highlight />
      </div>
      <Card className="p-5">
        <h3 style={{ fontWeight: 700, fontSize: 16 }}>سحب الرصيد</h3>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>الحد الأدنى 20 ديناراً — مرة كل 24 ساعة.</p>
        <input value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ''))} placeholder="المبلغ (دينار)" className="mt-3 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
        <input value={iban} onChange={(ev) => { setIban(ev.target.value); setPrefilled(false); }} placeholder="IBAN" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
        {prefilled && (
          <p className="mt-1" style={{ color: '#1366D6', fontSize: 11 }}>تم استخدام آخر IBAN مُسجّل</p>
        )}
        <input value={bankName} onChange={(ev) => setBankName(ev.target.value)} placeholder="اسم البنك (اختياري)" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
        <button onClick={() => void withdraw()} disabled={Number(amount) < 20} className="mt-3 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>سحب الرصيد</button>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className="p-4 text-center" style={highlight ? { background: '#E8F1FE' } : undefined}>
      <div style={{ color: '#475569', fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20, color: highlight ? '#0E4FA8' : '#0F172A' }}>
        <span style={{ fontFamily: 'Inter' }}>{Number(value)}</span> <span style={{ fontSize: 12 }}>د</span>
      </div>
    </Card>
  );
}
