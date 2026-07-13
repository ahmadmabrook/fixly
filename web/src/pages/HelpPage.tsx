import { useNavigate } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { Card, FaqAccordion } from '../components/shared';
import { FAQ_ITEMS } from '../lib/faq';
import { useAuth } from '../lib/store';
import { COLOR_BRAND_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

export default function HelpPage() {
  const navigate = useNavigate();
  const accessToken = useAuth((s) => s.accessToken);

  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <div className="flex items-center gap-2">
        <LifeBuoy size={26} color={COLOR_BRAND_PRIMARY} aria-hidden="true" />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>مركز المساعدة</h1>
      </div>
      <p className="mt-2" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>الأسئلة الأكثر شيوعاً حول الحجز والدفع والضمان.</p>

      <div className="mt-6">
        <FaqAccordion items={FAQ_ITEMS} />
      </div>

      <Card className="mt-6 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>لم تجد ما تبحث عنه؟</div>
          <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }} className="mt-1">افتح تذكرة دعم وسنرد خلال 5 دقائق.</div>
        </div>
        <button
          onClick={() => navigate(accessToken ? '/account?tab=support' : '/login?returnTo=%2Faccount%3Ftab%3Dsupport')}
          className="px-5 h-11 rounded-xl shrink-0"
          style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 14 }}
        >
          فتح تذكرة دعم
        </button>
      </Card>
    </main>
  );
}
