import { Briefcase, Wrench, Mail } from 'lucide-react';
import { Card } from '../components/shared';
import { COLOR_BRAND_PRIMARY, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

export default function CareersPage() {
  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <div className="flex items-center gap-2">
        <Briefcase size={26} color={COLOR_BRAND_PRIMARY} aria-hidden="true" />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>الوظائف</h1>
      </div>
      <p className="mt-3" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 15, lineHeight: 1.7 }}>
        لا توجد شواغر إدارية مفتوحة حالياً. راسلنا وسنتواصل معك عند توفر فرصة تناسب مهاراتك.
      </p>

      <Card className="mt-6 p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: COLOR_SUCCESS_BG }}>
          <Wrench size={22} color={COLOR_SUCCESS_TEXT} aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div style={{ fontWeight: 700, fontSize: 15 }}>هل أنت فني؟</div>
          <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }} className="mt-1">
            نرحّب دائماً بالفنيين المعتمدين. تواصل معنا لبدء إجراءات الانضمام إلى شبكة فنيي Fixly.
          </div>
        </div>
      </Card>

      <a
        href="mailto:careers@fixly.jo"
        className="mt-5 inline-flex items-center gap-2 px-5 h-12 rounded-xl"
        style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}
      >
        <Mail size={16} aria-hidden="true" /> راسلنا: careers@fixly.jo
      </a>
    </main>
  );
}
