import { useQuery } from '@tanstack/react-query';
import { api, type FeatureFlagItem } from '../lib/api';
import { Card, Spinner, EmptyState } from '../components/shared';
import { COLOR_STATUS_DANGER, COLOR_STATUS_DANGER_BG, COLOR_STATUS_SUCCESS, COLOR_STATUS_SUCCESS_BG, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY } from '../lib/theme';

/** Phase-3+ streams from the Figma FeatureFlags() reference (AdminPanel.tsx)
 *  that aren't wired as real env vars anywhere in the backend yet — shown as
 *  a plain roadmap list (no toggle, nothing to click) rather than fabricating
 *  an interactive control for a flag that doesn't exist server-side. */
const PLANNED_NOT_WIRED = [
  { key: 'FEATURE_VIDEO_PRECHECK', note: 'فحص فيديو مسبق لخدمات fixed_scope الاختيارية — شرط أساسي لـ quote_first، وليس بوابة مرحلة بحد ذاته' },
  { key: 'FEATURE_SCHEDULED_BOOKING', note: 'حجوزات مجدولة (غير فورية) — تتطلب نموذج بيانات availability_slots' },
  { key: 'FEATURE_IN_APP_CHAT', note: 'محادثة كاملة داخل التطبيق — النسخة الحالية تعتمد اتصال مقنّع ورابط واتساب' },
  { key: 'FEATURE_TECH_PRO_SUB', note: '15 د.أ/شهر لتعزيز ظهور الفني — ضمن نفس مستوى الثقة فقط، لا يتجاوز الظهور المدفوع مستوى الثقة أبداً' },
  { key: 'FEATURE_B2B_ADS', note: '500–1000 د.أ/شهر مساحات إعلانية للموردين — خارج نطاق الإطلاق الأولي صراحةً' },
  { key: 'FEATURE_MULTI_CITY', note: 'لا يتم دخول أي سوق جديد قبل إثبات نموذج عمّان' },
];

function FlagCard({ flag }: { flag: FeatureFlagItem }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13 }}>{flag.key}</span>
          <span
            className="px-2 py-0.5 rounded-full"
            style={{ fontSize: 11, fontWeight: 600, background: flag.enabled ? COLOR_STATUS_SUCCESS_BG : COLOR_STATUS_DANGER_BG, color: flag.enabled ? COLOR_STATUS_SUCCESS : COLOR_STATUS_DANGER }}
          >
            {flag.enabled ? 'مُفعّلة' : 'معطّلة (افتراضي)'}
          </span>
        </div>
        <p style={{ fontSize: 12, color: COLOR_TEXT_MUTED, marginTop: 4 }}>{flag.phase}</p>
        <p style={{ fontSize: 12, color: COLOR_TEXT_SECONDARY, marginTop: 4 }}>
          الشرط التشغيلي: {flag.prerequisite}
          {flag.prerequisiteMet !== null && (
            <span style={{ fontWeight: 700, color: flag.prerequisiteMet ? COLOR_STATUS_SUCCESS : COLOR_STATUS_DANGER }}>
              {' '}— {flag.prerequisiteMet ? 'متحقق' : 'غير متحقق'}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * §0.6.1/§17.16 — read-only visibility into the launch-gated feature flags.
 * These are env-configured at deploy time (a flag turns on when its named
 * *operating* prerequisite is met, not when the code compiles), so this page
 * intentionally has no toggle switch — a live in-app toggle would either do
 * nothing (misleading) or flip production behavior for every customer with
 * no deploy/rollback path, which is a real-money decision this UI must not
 * make on its own.
 */
export default function FeatureFlags() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: () => api.get<FeatureFlagItem[]>('/feature-flags'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>مفاتيح الميزات</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>
            لا تُفعَّل أي ميزة إلا عند دعم العملية التشغيلية لها. جميع المفاتيح معطّلة افتراضياً عند الإطلاق (§0.6.1).
          </p>
        </div>
        <span className="px-3 py-1 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: COLOR_STATUS_DANGER_BG, color: COLOR_STATUS_DANGER }}>
          للمدير العام فقط
        </span>
      </div>

      {isLoading && <Card className="p-6"><Spinner /></Card>}
      {isError && <Card className="p-6"><EmptyState message="تعذّر تحميل حالة المفاتيح" /></Card>}

      {data && (
        <div className="space-y-3">
          {data.map((f) => <FlagCard key={f.key} flag={f} />)}
        </div>
      )}

      <Card className="p-4">
        <h3 style={{ fontWeight: 700, fontSize: 13, color: COLOR_TEXT_PRIMARY, marginBottom: 8 }}>مخطط لمراحل لاحقة — غير مُضافة كمتغيرات بيئة بعد</h3>
        <div className="space-y-2">
          {PLANNED_NOT_WIRED.map((f) => (
            <div key={f.key} className="flex items-start gap-2">
              <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: COLOR_TEXT_SECONDARY, whiteSpace: 'nowrap' }}>{f.key}</span>
              <p style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>{f.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="p-4 rounded-2xl" style={{ background: '#FEF3C7' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>شرط جاهزية التشغيل الفردي (§17.16)</p>
        <p style={{ fontSize: 12, color: '#92400E', marginTop: 4 }}>
          يجب أن تبقى جميع المفاتيح أعلاه معطّلة حتى: تصبح طوابير المراجعة قابلة للوصول عبر رابط مباشر على الجوال، ويعمل التراجع التلقائي خلال ساعتين، وتُتحقق النسخ الاحتياطية كل 6 ساعات عبر تجربة استرجاع فعلية، وتعمل تنبيهات فحص الصحة (health-check).
        </p>
      </div>
    </div>
  );
}
