import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Check } from 'lucide-react';
import { api, Subscription } from '../../lib/api';
import { formatDateAr } from '../../lib/format';
import { Card, ConfirmDialog, notify } from '../../components/shared';
import { DEFAULT_PROTECTION_DISCOUNT_PERCENT, PROTECTION_GUARANTEE_DAYS } from '../../lib/constants';
import { COLOR_BRAND_PRIMARY, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_SECONDARY, COLOR_TEXT_STRONG, COLOR_WARNING_TEXT, COLOR_WHITE } from '../../lib/theme';

export function ProtectionTab() {
  const qc = useQueryClient();
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<Subscription | null>('/subscriptions/me') });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const active = sub?.status === 'ACTIVE';
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
