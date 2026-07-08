import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Gift, Video } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, ConfirmDialog, notify } from '../../components/shared';

interface SubscriptionDto {
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
  priceJod: string | number;
  discountPercent: number;
  guaranteeDays: number;
  currentPeriodEnd: string;
  cancelledAt: string | null;
}
interface CreditRow { id: string; amountJod: string | number; reason: string; createdAt: string }
const CREDIT_REASON_AR: Record<string, string> = {
  LATE_COMPENSATION: 'تعويض تأخير', REFERRAL: 'إحالة', GOODWILL: 'هدية', PROMO: 'عرض', ADJUSTMENT: 'تسوية', REDEMPTION: 'استخدام',
};

export function ProtectionTab() {
  const qc = useQueryClient();
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<SubscriptionDto | null>('/subscriptions/me') });
  const { data: credits } = useQuery({ queryKey: ['credits'], queryFn: () => api.get<{ balanceJod: string | number; items: CreditRow[] }>('/credits/me') });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const active = sub?.status === 'ACTIVE';
  const balance = Number(credits?.balanceJod ?? 0);
  const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

  async function subscribe() {
    try {
      await api.post('/subscriptions', {});
      notify('تم تفعيل خطة الحماية', 'success');
      void qc.invalidateQueries({ queryKey: ['subscription'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر الاشتراك', 'error'); }
  }
  async function cancel() {
    setConfirmCancel(false);
    try {
      await api.post('/subscriptions/cancel', {});
      notify('سيتم إلغاء الاشتراك في نهاية الفترة', 'success');
      void qc.invalidateQueries({ queryKey: ['subscription'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر الإلغاء', 'error'); }
  }

  return (
    <div className="space-y-4">
      {/* Video pre-check entry point */}
      <a href="/quotes" className="flex items-center gap-2 px-4 h-11 rounded-xl w-fit" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 14 }}>
        <Video size={16} aria-hidden="true" /> احصل على سعر ثابت بالفيديو (فحص مرئي)
      </a>

      {/* Service-credit wallet */}
      <Card className="p-5">
        <div className="flex items-center gap-2"><Gift size={18} color="#1366D6" /><h2 style={{ fontWeight: 700, fontSize: 16 }}>رصيد الخدمة</h2></div>
        <div className="mt-2" style={{ fontWeight: 800, fontSize: 28, fontFamily: 'Inter', color: balance > 0 ? '#15803D' : '#0F172A' }}>{balance} دينار</div>
        <p style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>يُخصم تلقائياً من فاتورتك القادمة — تعويضات التأخير، الإحالات، والهدايا.</p>
        {(credits?.items ?? []).slice(0, 5).map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2" style={{ borderTop: '1px solid #F1F5F9', fontSize: 13 }}>
            <span style={{ color: '#475569' }}>{CREDIT_REASON_AR[c.reason] ?? c.reason}</span>
            <span style={{ fontFamily: 'Inter', fontWeight: 700, color: Number(c.amountJod) >= 0 ? '#15803D' : '#B91C1C' }}>{Number(c.amountJod) >= 0 ? '+' : ''}{Number(c.amountJod)} د</span>
          </div>
        ))}
      </Card>

      {/* Protection subscription */}
      <Card className="p-6" style={{ border: active ? '2px solid #1366D6' : undefined }}>
        <div className="flex items-center gap-2"><ShieldCheck size={20} color="#1366D6" /><h2 style={{ fontWeight: 800, fontSize: 18 }}>خطة الحماية</h2>
          {active && <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>فعّالة</span>}
        </div>
        <ul className="mt-3 space-y-1.5" style={{ fontSize: 14, color: '#334155' }}>
          <li>✅ أولوية في الوصول خلال 30 دقيقة</li>
          <li>✅ خصم {sub?.discountPercent ?? 15}% على كل خدمة</li>
          <li>✅ ضمان ممتد حتى {sub?.guaranteeDays ?? 90} يوماً</li>
          <li>✅ فحص وقائي مجاني كل 3 أشهر</li>
          <li>✅ دعم VIP على مدار الساعة</li>
        </ul>
        {active ? (
          <div className="mt-5">
            <p style={{ fontSize: 13, color: '#475569' }}>تتجدد في {fmtDate(sub?.currentPeriodEnd)}</p>
            {sub?.cancelledAt
              ? <p className="mt-2" style={{ color: '#B45309', fontSize: 13, fontWeight: 600 }}>سيُلغى الاشتراك في نهاية الفترة الحالية.</p>
              : <button onClick={() => setConfirmCancel(true)} className="mt-3 h-11 px-5 rounded-xl" style={{ border: '1px solid #FECACA', color: '#B91C1C', fontWeight: 600, fontSize: 14 }}>إلغاء الاشتراك</button>}
          </div>
        ) : (
          <button onClick={() => void subscribe()} className="mt-5 w-full h-12 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 15 }}>
            اشترك — 5 دنانير / شهر
          </button>
        )}
      </Card>

      {confirmCancel && (
        <ConfirmDialog
          title="إلغاء خطة الحماية؟"
          body="ستبقى المزايا فعّالة حتى نهاية الفترة الحالية، ثم لن يتجدد الاشتراك."
          confirmLabel="إلغاء الاشتراك"
          onConfirm={() => void cancel()}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
