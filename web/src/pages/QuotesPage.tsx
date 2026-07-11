import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api';
import { Card, notify, SkeletonList } from '../components/shared';

interface QuoteDto {
  id: string;
  status: 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  videoUrl: string;
  description: string | null;
  quotedJod: string | number | null;
  service?: { nameAr?: string | null };
  createdAt: string;
}
interface Svc { id: string; nameAr: string }

const STATUS_LABEL: Record<string, string> = { PENDING: 'بانتظار التسعير', QUOTED: 'جاهز — سعر ثابت', ACCEPTED: 'مقبول', DECLINED: 'مرفوض', EXPIRED: 'منتهٍ' };
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: '#FEF3C7', fg: '#B45309' },
  QUOTED: { bg: '#DCFCE7', fg: '#15803D' },
  ACCEPTED: { bg: '#E8F1FE', fg: '#0E4FA8' },
  DECLINED: { bg: '#FEE2E2', fg: '#B91C1C' },
  EXPIRED: { bg: '#F1F5F9', fg: '#94A3B8' },
};

export default function QuotesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: quotes, isLoading } = useQuery({ queryKey: ['quotes'], queryFn: () => api.get<QuoteDto[]>('/quotes') });
  const { data: services } = useQuery({ queryKey: ['services'], queryFn: () => api.get<Svc[]>('/services') });

  const [serviceId, setServiceId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/quotes', { serviceId, videoUrl: videoUrl.trim(), description: description.trim() || undefined }),
    onSuccess: () => {
      notify('تم إرسال الطلب — سنرسل لك سعراً ثابتاً قريباً', 'success');
      setServiceId(''); setVideoUrl(''); setDescription('');
      void qc.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر إرسال الطلب', 'error'),
  });

  const accept = useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/quotes/${id}/accept`, {}),
    onSuccess: () => { notify('تم إنشاء الحجز بالسعر المتفق عليه', 'success'); void qc.invalidateQueries({ queryKey: ['quotes'] }); navigate('/my-bookings'); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر قبول العرض', 'error'),
  });

  const validUrl = /^https:\/\/.+/.test(videoUrl.trim());

  return (
    <main className="max-w-[720px] mx-auto px-6 py-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1" style={{ color: '#1366D6', fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} aria-hidden="true" /> رجوع
      </button>
      <h1 className="mt-3 flex items-center gap-2" style={{ fontWeight: 800, fontSize: 26 }}><Video size={24} color="#1366D6" /> الفحص المرئي</h1>
      <p style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>أرسل فيديو للمشكلة واحصل على <b>سعر ثابت</b> قبل الحجز — بدون مفاجآت.</p>

      <Card className="p-6 mt-5 space-y-3">
        <div>
          <label className="block" style={{ fontSize: 13, color: '#475569' }}>الخدمة</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="اختر الخدمة" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }}>
            <option value="">اختر الخدمة</option>
            {(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </div>
        <div>
          <label className="block" style={{ fontSize: 13, color: '#475569' }}>رابط الفيديو (https)</label>
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." aria-label="رابط فيديو المشكلة" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
        </div>
        <div>
          <label className="block" style={{ fontSize: 13, color: '#475569' }}>وصف المشكلة (اختياري)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
        </div>
        <button onClick={() => create.mutate()} disabled={!serviceId || !validUrl || create.isPending} className="w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
          إرسال طلب التسعير
        </button>
      </Card>

      <h2 className="mt-7" style={{ fontWeight: 700, fontSize: 18 }}>طلباتي</h2>
      <div className="mt-3 space-y-3">
        {isLoading && <SkeletonList count={3} rowHeight={72} />}
        {!isLoading && (quotes ?? []).length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد طلبات بعد.</p>}
        {(quotes ?? []).map((q) => (
          <Card key={q.id} className="p-4">
            <div className="flex items-center justify-between">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{q.service?.nameAr ?? '—'}</div>
              <span className="px-2.5 py-1 rounded-full" style={{ background: STATUS_COLOR[q.status].bg, color: STATUS_COLOR[q.status].fg, fontSize: 12, fontWeight: 700 }}>{STATUS_LABEL[q.status]}</span>
            </div>
            {q.description && <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{q.description}</p>}
            {q.status === 'QUOTED' && q.quotedJod != null && (
              <div className="mt-3 flex items-center justify-between p-3 rounded-xl" style={{ background: '#E8F1FE' }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: '#0E4FA8', fontFamily: 'Inter' }}>{Number(q.quotedJod)} دينار</span>
                <button onClick={() => accept.mutate(q.id)} disabled={accept.isPending} className="h-10 px-5 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 14 }}>
                  اقبل واحجز
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
