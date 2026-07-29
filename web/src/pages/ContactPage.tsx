import { useNavigate } from 'react-router-dom';
import { Phone, Mail, MessageCircle, MapPin, LifeBuoy } from 'lucide-react';
import { Card } from '../components/shared';
import { COLOR_BG_SUBTLE, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_TINT, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

// §17.9: the human-support path is masked calling + a WhatsApp deep-link
// (full in-app chat is Phase 2) — WhatsApp was missing from this list.
const CHANNELS = [
  { icon: Phone, label: 'اتصل بنا', value: '+962 6 555 0000', href: 'tel:+96265550000' },
  { icon: MessageCircle, label: 'واتساب', value: '+962 79 555 0000', href: 'https://wa.me/962795550000' },
  { icon: Mail, label: 'راسلنا', value: 'support@fixly.jo', href: 'mailto:support@fixly.jo' },
];

export default function ContactPage() {
  const navigate = useNavigate();
  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <h1 style={{ fontWeight: 800, fontSize: 28 }}>تواصل معنا</h1>
      <p className="mt-2" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>نحن هنا لمساعدتك 24/7.</p>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        {CHANNELS.map((c) => (
          <a
            key={c.label}
            href={c.href}
            className="block"
          >
            <Card className="p-5 flex items-center gap-4 transition hover:-translate-y-0.5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: COLOR_BRAND_PRIMARY_TINT }}>
                <c.icon size={20} color={COLOR_BRAND_PRIMARY} aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
                <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13, fontFamily: 'Inter' }} dir="ltr">{c.value}</div>
              </div>
            </Card>
          </a>
        ))}
      </div>

      <Card className="mt-4 p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: COLOR_BG_SUBTLE }}>
          <MapPin size={20} color={COLOR_TEXT_SECONDARY} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>نخدم عمّان حالياً</div>
          <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }} className="mt-0.5">سنوسّع خدماتنا إلى مدن أخرى قريباً.</div>
        </div>
      </Card>

      <button
        onClick={() => navigate('/help')}
        className="mt-5 flex items-center gap-2 px-5 h-11 rounded-xl"
        style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700, fontSize: 14 }}
      >
        <LifeBuoy size={16} aria-hidden="true" /> مركز المساعدة
      </button>
    </main>
  );
}
