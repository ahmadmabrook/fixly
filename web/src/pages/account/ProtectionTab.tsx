import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Gift, Video, Check, Wallet } from 'lucide-react';
import { api, Subscription } from '../../lib/api';
import { formatDateAr } from '../../lib/format';
import { Card, ConfirmDialog, notify } from '../../components/shared';
import { DEFAULT_PROTECTION_DISCOUNT_PERCENT, PROTECTION_GUARANTEE_DAYS } from '../../lib/constants';
import { COLOR_BADGE_INFO_BG, COLOR_BG_SUBTLE, COLOR_BRAND_ACCENT_TEAL, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_TEXT_STRONG, COLOR_WARNING_TEXT, COLOR_WHITE } from '../../lib/theme';

/** Mirrors the backend `CreditReason` enum (backend/prisma/schema.prisma). */
type CreditReason = 'LATE_COMPENSATION' | 'REFERRAL' | 'GOODWILL' | 'PROMO' | 'ADJUSTMENT' | 'REDEMPTION';
interface CreditRow { id: string; amountJod: string | number; reason: CreditReason; createdAt: string }
const CREDIT_REASON_AR: Record<CreditReason, string> = {
  LATE_COMPENSATION: 'تعويض تأخير', REFERRAL: 'إحالة', GOODWILL: 'هدية', PROMO: 'عرض', ADJUSTMENT: 'تسوية', REDEMPTION: 'استخدام',
};

export function ProtectionTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<Subscription | null>('/subscriptions/me') });
  const { data: credits } = useQuery({ queryKey: ['credits'], queryFn: () => api.get<{ balanceJod: string | number; items: CreditRow[] }>('/credits/me') });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const active = sub?.status === 'ACTIVE';
  const balance = Number(credits?.balanceJod ?? 0);
  const fmtDate = (iso?: string | null) => (iso ? formatDateAr(iso, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

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
      <button onClick={() => navigate('/quotes')} className="flex items-center gap-2 px-4 h-11 rounded-xl w-fit" style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 600, fontSize: 14 }}>
        <Video size={16} aria-hidden="true" /> احصل على سعر ثابت بالفيديو (فحص مرئي)
      </button>

      {/* Service-credit wallet */}
      <Card className="p-6" style={{ background: `linear-gradient(120deg,${COLOR_BRAND_PRIMARY},${COLOR_BRAND_ACCENT_TEAL})` }}>
        <div style={{ color: COLOR_BADGE_INFO_BG, fontSize: 13 }}>الرصيد الحالي</div>
        <div className="mt-1" style={{ color: COLOR_WHITE, fontWeight: 800, fontSize: 36 }}>
          <span style={{ fontFamily: 'Inter' }}>{balance}</span> <span style={{ fontSize: 18 }}>دينار</span>
        </div>
        <div className="mt-1" style={{ color: COLOR_BADGE_INFO_BG, fontSize: 13 }}>يُخصم تلقائياً من فاتورتك القادمة</div>
      </Card>
      <h3 className="mt-6 mb-3" style={{ fontWeight: 700, fontSize: 16 }}>سجل الحركات</h3>
      {(credits?.items ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Wallet size={26} color={COLOR_TEXT_MUTED} aria-hidden="true" />
          <span style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا يوجد رصيد بعد</span>
        </div>
      ) : (
        <Card className="overflow-hidden">
          {(credits?.items ?? []).slice(0, 5).map((c) => {
            const positive = Number(c.amountJod) >= 0;
            return (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3.5 border-b last:border-0 border-slate-100">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: positive ? COLOR_SUCCESS_BG : COLOR_BG_SUBTLE }}>
                  <Gift size={16} color={positive ? COLOR_SUCCESS_TEXT : COLOR_TEXT_MUTED} aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{CREDIT_REASON_AR[c.reason] ?? c.reason}</div>
                  <div style={{ color: COLOR_TEXT_MUTED, fontSize: 12, fontFamily: 'Inter' }}>{fmtDate(c.createdAt)}</div>
                </div>
                <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 15, color: positive ? COLOR_SUCCESS_TEXT : COLOR_TEXT_SECONDARY }}>{positive ? '+' : ''}{Number(c.amountJod)}</span>
              </div>
            );
          })}
        </Card>
      )}

      {/* Protection subscription */}
      <Card className="p-6" style={{ border: active ? `2px solid ${COLOR_BRAND_PRIMARY}` : undefined }}>
        <div className="flex items-center gap-2"><ShieldCheck size={20} color={COLOR_BRAND_PRIMARY} /><h2 style={{ fontWeight: 800, fontSize: 18 }}>خطة الحماية</h2>
          {active && <span style={{ background: COLOR_SUCCESS_BG, color: COLOR_SUCCESS_TEXT, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>فعّالة</span>}
        </div>
        <ul className="mt-3 space-y-1.5" style={{ fontSize: 14, color: COLOR_TEXT_STRONG }}>
          <li className="flex items-center gap-2"><Check size={17} color={COLOR_SUCCESS_TEXT} aria-hidden="true" /> أولوية في الوصول خلال 30 دقيقة</li>
          <li className="flex items-center gap-2"><Check size={17} color={COLOR_SUCCESS_TEXT} aria-hidden="true" /> خصم {sub?.discountPercent ?? DEFAULT_PROTECTION_DISCOUNT_PERCENT}% على كل خدمة</li>
          <li className="flex items-center gap-2"><Check size={17} color={COLOR_SUCCESS_TEXT} aria-hidden="true" /> ضمان ممتد حتى {sub?.guaranteeDays ?? PROTECTION_GUARANTEE_DAYS} يوماً</li>
          <li className="flex items-center gap-2"><Check size={17} color={COLOR_SUCCESS_TEXT} aria-hidden="true" /> فحص وقائي مجاني كل 3 أشهر</li>
          <li className="flex items-center gap-2"><Check size={17} color={COLOR_SUCCESS_TEXT} aria-hidden="true" /> دعم VIP على مدار الساعة</li>
        </ul>
        {active ? (
          <div className="mt-5">
            <p style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>تتجدد في {fmtDate(sub?.currentPeriodEnd)}</p>
            {sub?.cancelledAt
              ? <p className="mt-2" style={{ color: COLOR_WARNING_TEXT, fontSize: 13, fontWeight: 600 }}>سيُلغى الاشتراك في نهاية الفترة الحالية.</p>
              : <button onClick={() => setConfirmCancel(true)} className="mt-3 h-11 px-5 rounded-xl" style={{ border: `1px solid ${COLOR_ERROR_BORDER}`, color: COLOR_ERROR_TEXT, fontWeight: 600, fontSize: 14 }}>إلغاء الاشتراك</button>}
          </div>
        ) : (
          <button onClick={() => void subscribe()} className="mt-5 w-full h-12 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 15 }}>
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
