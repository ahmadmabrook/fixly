import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Star, Navigation, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Booking, AdditionalWorkItem } from '../lib/api';
import { Card, ServiceIcon, StatusBadge, InlineRow, ConfirmDialog, notify } from '../components/shared';

type FullBooking = Booking & {
  technicianId: string | null;
  discountJod?: string | number;
  scheduledAt: string | null;
  completedAt?: string | null;
  createdAt?: string;
  payment?: { status: string; capturedAmountJod: string | number | null } | null;
};

export default function BookingDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [showRate, setShowRate] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reschedule, setReschedule] = useState('');

  const { data: b, isLoading, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get<FullBooking>(`/bookings/${id}`),
  });
  const { data: extra } = useQuery({
    queryKey: ['booking-extra', id],
    queryFn: () => api.get<AdditionalWorkItem[]>(`/bookings/${id}/additional-work`),
  });

  if (isLoading) return <Centered>جارٍ التحميل...</Centered>;
  if (!b) return <Centered tone="error">الحجز غير موجود</Centered>;

  const price = Number(b.service?.priceJod ?? b.totalJod);
  const discount = Number(b.discountJod ?? 0);
  const approvedExtras = (extra ?? []).filter((e) => e.status === 'APPROVED');
  const proposedExtras = (extra ?? []).filter((e) => e.status === 'PROPOSED');

  async function respondExtra(itemId: string, approve: boolean) {
    try {
      await api.post(`/bookings/${id}/additional-work/${itemId}/respond`, { approve });
      notify(approve ? 'تمت الموافقة على العمل الإضافي' : 'تم رفض العمل الإضافي', 'success');
      void qc.invalidateQueries({ queryKey: ['booking-extra', id] });
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'خطأ', 'error');
    }
  }
  const isScheduled = ['PENDING', 'CONFIRMED'].includes(b.status) && !!b.scheduledAt;
  const isActive = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status);
  const within30d = b.completedAt ? Date.now() - new Date(b.completedAt).getTime() < 30 * 864e5 : false;

  async function submitReview() {
    try {
      await api.post(`/bookings/${id}/review`, { rating, comment: comment.trim() || undefined });
      notify('شكراً لتقييمك', 'success');
      setShowRate(false);
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر إرسال التقييم', 'error');
    }
  }

  async function doReschedule() {
    if (!reschedule) return;
    try {
      await api.post(`/bookings/${id}/reschedule`, { scheduledAt: new Date(reschedule).toISOString() });
      notify('تم تغيير الموعد', 'success');
      setReschedule('');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر تغيير الموعد', 'error');
    }
  }

  async function doCancel() {
    setCancelling(false);
    try {
      await api.post(`/bookings/${id}/cancel`, { reason: 'تم الإلغاء من التطبيق' });
      notify('تم إلغاء الحجز وإصدار المبلغ المسترد', 'success');
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void refetch();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر الإلغاء', 'error');
    }
  }

  return (
    <main className="max-w-[700px] mx-auto px-6 py-8">
      <button onClick={() => navigate('/my-bookings')} className="flex items-center gap-1" style={{ color: '#1366D6', fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} /> طلباتي
      </button>

      <Card className="mt-4 p-6">
        <div className="flex items-center gap-4">
          <ServiceIcon nameAr={b.service?.nameAr ?? ''} size={24} />
          <div className="flex-1">
            <div style={{ fontWeight: 800, fontSize: 18 }}>{b.service?.nameAr}</div>
            <div style={{ color: '#475569', fontSize: 12 }}>
              {b.scheduledAt ? new Date(b.scheduledAt).toLocaleString('ar-JO') : 'فوراً'}
            </div>
          </div>
          <StatusBadge status={b.status} />
        </div>

        <div className="my-4 h-px bg-slate-100" />
        <h2 style={{ fontWeight: 700, fontSize: 15 }}>الإيصال</h2>
        <InlineRow label="سعر الخدمة" value={`${price} دينار`} />
        {discount > 0 && <InlineRow label="الخصم" value={`- ${discount} دينار`} />}
        {approvedExtras.map((e) => (
          <InlineRow key={e.id} label={`عمل إضافي: ${e.description}`} value={`${Number(e.amountJod)} دينار`} />
        ))}
        <div className="my-2 h-px bg-slate-100" />
        <InlineRow strong label="الإجمالي المدفوع" value={`${Number(b.totalJod)} دينار`} />
        {b.payment && (
          <p className="mt-2" style={{ color: '#15803D', fontSize: 12 }}>حالة الدفع: {b.payment.status}</p>
        )}
      </Card>

      {proposedExtras.length > 0 && (
        <Card className="mt-4 p-5" style={{ border: '1px solid #FDE68A' }}>
          <h2 style={{ fontWeight: 700, fontSize: 15 }}>عمل إضافي بانتظار موافقتك</h2>
          {proposedExtras.map((e) => (
            <div key={e.id} className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.description}</div>
                <div style={{ color: '#0E4FA8', fontWeight: 700, fontSize: 14 }}><span style={{ fontFamily: 'Inter' }}>{Number(e.amountJod)}</span> دينار</div>
              </div>
              <button onClick={() => void respondExtra(e.id, true)} className="px-4 h-10 rounded-xl" style={{ background: '#15803D', color: '#FFF', fontWeight: 700, fontSize: 13 }}>موافقة</button>
              <button onClick={() => void respondExtra(e.id, false)} className="px-4 h-10 rounded-xl" style={{ background: '#FEE2E2', color: '#B91C1C', fontWeight: 600, fontSize: 13 }}>رفض</button>
            </div>
          ))}
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {isActive && (
          <button onClick={() => navigate(`/bookings/${id}/track`)} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
            <Navigation size={18} /> تتبّع الحجز
          </button>
        )}
        {b.status === 'COMPLETED' && (
          <button onClick={() => setShowRate(true)} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
            <Star size={18} /> قيّم الخدمة
          </button>
        )}
        {b.status === 'COMPLETED' && within30d && (
          <button onClick={() => navigate('/guarantee')} className="w-full h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: '#DCFCE7', color: '#15803D', fontWeight: 700 }}>
            <ShieldCheck size={18} /> فتح تذكرة ضمان
          </button>
        )}
        {isScheduled && (
          <Card className="p-4">
            <label className="block" style={{ fontSize: 13, color: '#475569' }}>تغيير الموعد</label>
            <div className="mt-2 flex gap-2">
              <input type="datetime-local" value={reschedule} onChange={(e) => setReschedule(e.target.value)} className="flex-1 h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
              <button onClick={() => void doReschedule()} disabled={!reschedule} className="px-4 h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 13 }}>تأكيد</button>
            </div>
          </Card>
        )}
        {isScheduled && (
          <button onClick={() => setCancelling(true)} className="w-full h-12 rounded-xl" style={{ color: '#B91C1C', fontWeight: 600, border: '1px solid #FECACA' }}>
            إلغاء الحجز
          </button>
        )}
      </div>

      {showRate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowRate(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl p-5 w-full md:max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: 18, textAlign: 'center' }}>قيّم تجربتك</h3>
            <div className="mt-4 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} نجوم`}>
                  <Star size={36} fill={n <= rating ? '#F5A623' : 'none'} color="#F5A623" strokeWidth={n <= rating ? 0 : 2} />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="أضف تعليقاً (اختياري)"
              className="mt-4 w-full rounded-xl border border-slate-200 p-3 outline-none"
              rows={3}
              style={{ fontSize: 14 }}
            />
            <button
              onClick={() => void submitReview()}
              disabled={rating === 0}
              className="mt-4 w-full h-12 rounded-xl disabled:opacity-50"
              style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}
            >
              إرسال
            </button>
          </div>
        </div>
      )}

      {cancelling && (
        <ConfirmDialog
          title="هل أنت متأكد من إلغاء الحجز؟"
          body="سيتم إصدار المبلغ المسترد وفق سياسة الاسترجاع."
          confirmLabel="تأكيد الإلغاء"
          onConfirm={() => void doCancel()}
          onCancel={() => setCancelling(false)}
        />
      )}
    </main>
  );
}

function Centered({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return <main className="max-w-[700px] mx-auto px-6 py-16 text-center"><p style={{ color: tone === 'error' ? '#B91C1C' : '#94A3B8', fontSize: 16 }}>{children}</p></main>;
}
