import { BadgeCheck, CreditCard, ShieldCheck, Clock, Headphones } from 'lucide-react';
import { Card } from '../components/shared';
import { COLOR_ACCENT_AMBER, COLOR_ACCENT_PURPLE, COLOR_BG_SUBTLE, COLOR_BRAND_ACCENT_TEAL, COLOR_BRAND_PRIMARY, COLOR_SUCCESS_TEXT, COLOR_TEXT_SECONDARY } from '../lib/theme';

const VALUES = [
  { i: <BadgeCheck size={24} color={COLOR_BRAND_PRIMARY} aria-hidden="true" />, t: 'فنيون معتمدون', b: 'كل فني يمر بفحص هوية وخلفية قبل الانضمام إلى المنصة.' },
  { i: <Clock size={24} color={COLOR_ACCENT_AMBER} aria-hidden="true" />, t: 'خلال 30 دقيقة', b: 'نصل إليك بأسرع وقت ممكن في عمّان.' },
  { i: <CreditCard size={24} color={COLOR_BRAND_ACCENT_TEAL} aria-hidden="true" />, t: 'سعر ثابت مسبقاً', b: 'تعرف على السعر قبل تأكيد الحجز، بلا مفاجآت.' },
  { i: <ShieldCheck size={24} color={COLOR_SUCCESS_TEXT} aria-hidden="true" />, t: 'ضمان 30 يوماً', b: 'أي مشكلة بالإصلاح خلال 30 يوماً نعالجها دون أي تكلفة إضافية.' },
  { i: <Headphones size={24} color={COLOR_ACCENT_PURPLE} aria-hidden="true" />, t: 'دعم على مدار الساعة', b: 'فريق الدعم متاح للرد على استفساراتك في أي وقت.' },
];

export default function AboutPage() {
  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <h1 style={{ fontWeight: 800, fontSize: 32 }}>عن Fixly</h1>
      <p className="mt-3" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 15, lineHeight: 1.7 }}>
        Fixly منصة تربطك بفنيي صيانة منزلية معتمدين في عمّان — كهرباء، سباكة، تكييف، دهان، وتركيب أثاث.
        هدفنا تبسيط حجز الصيانة: احجز، تابع وصول الفني لحظة بلحظة، وادفع إلكترونياً بأمان، مع ضمان على كل خدمة.
      </p>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        {VALUES.map((v) => (
          <Card key={v.t} className="p-5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: COLOR_BG_SUBTLE }}>{v.i}</div>
            <div className="mt-3" style={{ fontWeight: 700, fontSize: 15 }}>{v.t}</div>
            <div className="mt-1" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }}>{v.b}</div>
          </Card>
        ))}
      </div>
    </main>
  );
}
