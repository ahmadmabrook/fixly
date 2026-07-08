import { useQuery } from '@tanstack/react-query';
import { api, TechnicianScorecard } from '../../lib/api';
import { Card } from '../../components/shared';

export function Scorecard() {
  const { data } = useQuery({ queryKey: ['tech-scorecard'], queryFn: () => api.get<TechnicianScorecard>('/technician/scorecard') });
  const pct = (n: number) => `${n}%`;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>الالتزام بالموعد</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.onTimeRate) : '—'}</div>
      </Card>
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>نسبة إعادة الخدمة</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.redoRate) : '—'}</div>
      </Card>
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>نسبة الشكاوى</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.complaintRate) : '—'}</div>
      </Card>
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>نسبة قبول الطلبات</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.acceptanceRate) : '—'}</div>
      </Card>
    </div>
  );
}

export function Ratings({ technicianId }: { technicianId: string }) {
  const { data } = useQuery({
    queryKey: ['tech-my-reviews', technicianId],
    queryFn: () => api.get<{ summary: { rating: string | number; totalReviews: number }; items: Array<{ id: string; rating: number; comment: string | null; reviewerName: string | null }> }>(`/technicians/${technicianId}/reviews`),
  });
  return (
    <div className="space-y-3">
      {data && (
        <Card className="p-5 text-center">
          <div style={{ fontWeight: 800, fontSize: 32, color: '#F5A623', fontFamily: 'Inter' }}>{Number(data.summary.rating).toFixed(1)}</div>
          <div style={{ color: '#64748B', fontSize: 13 }}>{data.summary.totalReviews} تقييم</div>
        </Card>
      )}
      {(data?.items ?? []).map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reviewerName ?? 'عميل'}</span>
            <span style={{ color: '#F5A623', fontWeight: 700, fontFamily: 'Inter' }}>{r.rating}★</span>
          </div>
          {r.comment && <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>{r.comment}</p>}
        </Card>
      ))}
      {data && data.items.length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد تقييمات بعد.</p>}
    </div>
  );
}
