import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api, EligibleBooking, GuaranteeTicketItem } from '../lib/api';
import { Card, ServiceIcon, Modal, notify } from '../components/shared';

const STATUS_LABEL: Record<string, { ar: string; color: string }> = {
  OPEN: { ar: 'مفتوح', color: '#1366D6' },
  IN_REVIEW: { ar: 'قيد المراجعة', color: '#B45309' },
  RESOLVED: { ar: 'تمت الموافقة', color: '#15803D' },
  REJECTED: { ar: 'مرفوض', color: '#B91C1C' },
};

export default function GuaranteePage() {
  const qc = useQueryClient();
  const [openFor, setOpenFor] = useState<EligibleBooking | null>(null);
  const [desc, setDesc] = useState('');

  const { data: eligible } = useQuery({ queryKey: ['guarantee-eligible'], queryFn: () => api.get<EligibleBooking[]>('/guarantee/eligible') });
  const { data: tickets } = useQuery({ queryKey: ['guarantee-tickets'], queryFn: () => api.get<GuaranteeTicketItem[]>('/guarantee') });

  async function submit() {
    if (!openFor || !desc.trim()) return;
    try {
      await api.post('/guarantee', { bookingId: openFor.id, description: desc.trim() });
      notify('تم فتح تذكرة الضمان — سيتم الرد خلال ساعتين', 'success');
      setOpenFor(null);
      setDesc('');
      void qc.invalidateQueries({ queryKey: ['guarantee-tickets'] });
      void qc.invalidateQueries({ queryKey: ['guarantee-eligible'] });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر فتح التذكرة', 'error');
    }
  }

  return (
    <main className="max-w-[800px] mx-auto px-6 py-8">
      <div className="flex items-center gap-2">
        <ShieldCheck size={26} color="#15803D" />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>الضمان (30 يوم)</h1>
      </div>
      <p className="mt-2" style={{ color: '#475569', fontSize: 14 }}>
        كل خدمة مضمونة لمدة 30 يوماً. إذا واجهت أي مشكلة، افتح تذكرة وسنعيد الفني مجاناً.
      </p>

      <h2 className="mt-8" style={{ fontWeight: 700, fontSize: 18 }}>خدمات مؤهّلة للضمان</h2>
      <div className="mt-3 space-y-3">
        {(eligible ?? []).length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد خدمات مؤهّلة حالياً.</p>}
        {(eligible ?? []).map((b) => (
          <Card key={b.id} className="p-4 flex items-center gap-4">
            <ServiceIcon nameAr={b.service?.nameAr ?? ''} size={20} />
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{b.service?.nameAr}</div>
              <div style={{ color: '#475569', fontSize: 12 }}>{b.completedAt ? new Date(b.completedAt).toLocaleDateString('ar-JO') : ''}</div>
            </div>
            <button onClick={() => setOpenFor(b)} className="px-4 h-10 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 600, fontSize: 13 }}>
              فتح تذكرة
            </button>
          </Card>
        ))}
      </div>

      <h2 className="mt-8" style={{ fontWeight: 700, fontSize: 18 }}>تذاكري</h2>
      <div className="mt-3 space-y-3">
        {(tickets ?? []).length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد تذاكر بعد.</p>}
        {(tickets ?? []).map((t) => {
          const s = STATUS_LABEL[t.status] ?? { ar: t.status, color: '#475569' };
          return (
            <Card key={t.id} className="p-4">
              <div className="flex items-center justify-between">
                <span style={{ fontWeight: 700, fontSize: 15 }}>{t.booking?.service?.nameAr ?? 'خدمة'}</span>
                <span style={{ color: s.color, fontWeight: 700, fontSize: 13 }}>{s.ar}</span>
              </div>
              {t.description && <p style={{ color: '#475569', fontSize: 13, marginTop: 6 }}>{t.description}</p>}
              {t.adminNote && <p style={{ color: '#0E4FA8', fontSize: 13, marginTop: 6, background: '#E8F1FE', padding: 8, borderRadius: 8 }}>رد الدعم: {t.adminNote}</p>}
              {t.scheduledVisitAt && <p style={{ color: '#15803D', fontSize: 13, marginTop: 6 }}>زيارة مجانية مجدولة: {new Date(t.scheduledVisitAt).toLocaleString('ar-JO')}</p>}
            </Card>
          );
        })}
      </div>

      {openFor && (
        <Modal title="فتح تذكرة ضمان" variant="sheet" maxWidth="md" onClose={() => setOpenFor(null)}>
          <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>{openFor.service?.nameAr}</p>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="صف المشكلة التي واجهتها..."
            aria-label="وصف مشكلة الضمان"
            rows={4}
            className="mt-3 w-full rounded-xl border border-slate-200 p-3 outline-none"
            style={{ fontSize: 14 }}
          />
          <button onClick={() => void submit()} disabled={!desc.trim()} className="mt-4 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
            إرسال (سيتم الرد خلال ساعتين)
          </button>
        </Modal>
      )}
    </main>
  );
}
