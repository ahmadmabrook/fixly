import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Gift, Copy, Users, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ReferralStats } from '../lib/api';
import { Card, notify } from '../components/shared';
import { COLOR_BG_SUBTLE, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

/** Customer referral program: invite code, share text, and stats. */
export default function ReferralPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['referral-stats'],
    queryFn: () => api.get<ReferralStats>('/referrals/me'),
  });

  async function copyCode() {
    if (!data?.referralCode) return;
    try {
      await navigator.clipboard.writeText(data.referralCode);
      notify('تم نسخ رمز الإحالة', 'success');
    } catch {
      notify('تعذّر النسخ، انسخ الرمز يدوياً', 'error');
    }
  }

  const shareText = data
    ? `جرّب Fixly لخدمات الصيانة المنزلية! استخدم رمز الإحالة ${data.referralCode} عند التسجيل واحصل على رصيد مجاني.`
    : '';

  async function share() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(shareText);
      notify('تم نسخ نص المشاركة', 'success');
    } catch {
      notify('تعذّر النسخ', 'error');
    }
  }

  return (
    <main className="max-w-[700px] mx-auto px-6 py-8">
      <button onClick={() => navigate('/account')} className="flex items-center gap-1" style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} /> حسابي
      </button>

      <div className="mt-4 flex items-center gap-2">
        <Gift size={26} color={COLOR_BRAND_PRIMARY} />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>ادعُ أصدقاءك</h1>
      </div>
      <p className="mt-2" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>
        شارك رمز الإحالة الخاص بك، واحصل على رصيد خدمة مجاني عن كل صديق ينضم إلى Fixly.
      </p>

      {isLoading && <p className="mt-6" style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>جارٍ التحميل...</p>}

      {data && (
        <>
          <Card className="mt-6 p-6 text-center">
            <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }}>رمز الإحالة الخاص بك</div>
            <div
              className="mt-2 inline-flex items-center gap-2 px-5 py-3 rounded-xl"
              style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 800, fontSize: 24, fontFamily: 'Inter', letterSpacing: 2 }}
            >
              {data.referralCode}
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => void copyCode()}
                className="flex items-center gap-1 px-4 h-11 rounded-xl"
                style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 14 }}
              >
                <Copy size={16} /> نسخ الرمز
              </button>
              <button
                onClick={() => void share()}
                className="flex items-center gap-1 px-4 h-11 rounded-xl"
                style={{ background: COLOR_BG_SUBTLE, color: COLOR_TEXT_SECONDARY, fontWeight: 600, fontSize: 14 }}
              >
                مشاركة
              </button>
            </div>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="p-5 text-center">
              <Users size={20} color={COLOR_BRAND_PRIMARY} className="mx-auto" />
              <div className="mt-2" style={{ fontWeight: 800, fontSize: 26, fontFamily: 'Inter' }}>{data.totalReferred}</div>
              <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>صديق تمت إحالته</div>
            </Card>
            <Card className="p-5 text-center">
              <Wallet size={20} color={COLOR_SUCCESS_TEXT} className="mx-auto" />
              <div className="mt-2" style={{ fontWeight: 800, fontSize: 26, fontFamily: 'Inter', color: COLOR_SUCCESS_TEXT }}>{data.totalCreditEarnedJod}</div>
              <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>دينار رصيد مكتسب</div>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
