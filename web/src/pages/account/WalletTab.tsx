import { useQuery } from '@tanstack/react-query';
import { Gift, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateAr } from '../../lib/format';
import { Card } from '../../components/shared';
import { COLOR_BADGE_INFO_BG, COLOR_BG_SUBTLE, COLOR_BRAND_ACCENT_TEAL, COLOR_BRAND_PRIMARY, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_WHITE } from '../../lib/theme';

/** Mirrors the backend `CreditReason` enum (backend/prisma/schema.prisma). */
type CreditReason = 'LATE_COMPENSATION' | 'REFERRAL' | 'GOODWILL' | 'PROMO' | 'ADJUSTMENT' | 'REDEMPTION';
interface CreditRow { id: string; amountJod: string | number; reason: CreditReason; createdAt: string }
const CREDIT_REASON_AR: Record<CreditReason, string> = {
  LATE_COMPENSATION: 'تعويض تأخير', REFERRAL: 'إحالة', GOODWILL: 'هدية', PROMO: 'عرض', ADJUSTMENT: 'تسوية', REDEMPTION: 'استخدام',
};

/** §0.3 service-credit wallet — its own account tab (design: "رصيدي"), not
 *  bundled with the Protection subscription card. Late-comp/referral/goodwill
 *  credits land here regardless of whether the customer ever subscribes. */
export function WalletTab() {
  const { data: credits } = useQuery({ queryKey: ['credits'], queryFn: () => api.get<{ balanceJod: string | number; items: CreditRow[] }>('/credits/me') });
  const balance = Number(credits?.balanceJod ?? 0);
  const fmtDate = (iso?: string | null) => (iso ? formatDateAr(iso, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  const items = credits?.items ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-6" style={{ background: `linear-gradient(120deg,${COLOR_BRAND_PRIMARY},${COLOR_BRAND_ACCENT_TEAL})` }}>
        <div style={{ color: COLOR_BADGE_INFO_BG, fontSize: 13 }}>الرصيد الحالي</div>
        <div className="mt-1" style={{ color: COLOR_WHITE, fontWeight: 800, fontSize: 36 }}>
          <span style={{ fontFamily: 'Inter' }}>{balance}</span> <span style={{ fontSize: 18 }}>دينار</span>
        </div>
        <div className="mt-1" style={{ color: COLOR_BADGE_INFO_BG, fontSize: 13 }}>يُخصم تلقائياً من فاتورتك القادمة</div>
      </Card>
      <h3 className="mt-6 mb-3" style={{ fontWeight: 700, fontSize: 16 }}>سجل الحركات</h3>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Wallet size={26} color={COLOR_TEXT_MUTED} aria-hidden="true" />
          <span style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا يوجد رصيد بعد</span>
        </div>
      ) : (
        <Card className="overflow-hidden">
          {items.map((c) => {
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
                <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 15, color: positive ? COLOR_SUCCESS_TEXT : COLOR_TEXT_MUTED }}>{positive ? '+' : ''}{Number(c.amountJod)}</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
