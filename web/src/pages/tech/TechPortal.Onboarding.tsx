import { useRef, useState } from 'react';
import { Video, Wrench, X } from 'lucide-react';
import { api, ApiError, Service } from '../../lib/api';
import { uploadFile } from '../../lib/upload';
import { useServices } from '../../hooks/useServices';
import { Card, MediaUpload, ServiceIcon, notify } from '../../components/shared';
import { COLOR_BG_SUBTLE, COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_TINT, COLOR_SUCCESS_BG, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../../lib/theme';

/**
 * Single-video variant of MediaUpload (shared/upload.tsx): that widget always
 * renders an <img> thumbnail, which breaks for a video URL, so the intro
 * video gets its own small picker backed by the same uploadFile() primitive.
 */
function VideoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadFile(file, 'intro_video'));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر رفع الفيديو', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  if (value) {
    return (
      <div className="mt-2 flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: COLOR_SUCCESS_TEXT, background: COLOR_SUCCESS_BG }}>
        <Video size={18} color={COLOR_SUCCESS_TEXT} />
        <span className="flex-1" style={{ fontSize: 13, fontWeight: 600, color: COLOR_SUCCESS_TEXT }}>تم رفع الفيديو التعريفي</span>
        <button type="button" onClick={() => onChange('')} aria-label="إزالة الفيديو" style={{ color: COLOR_SUCCESS_TEXT }}>
          <X size={16} />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className="mt-2 w-full p-4 rounded-xl border-2 border-dashed flex items-center gap-3 disabled:opacity-50"
      style={{ borderColor: COLOR_BORDER }}
    >
      {uploading
        ? <div className="animate-spin rounded-full shrink-0" style={{ width: 18, height: 18, border: `2px solid ${COLOR_BORDER}`, borderTopColor: COLOR_BRAND_PRIMARY }} />
        : <Video size={18} color={COLOR_TEXT_MUTED} />}
      <span style={{ fontSize: 13, fontWeight: 600, color: COLOR_TEXT_MUTED }}>{uploading ? 'جارٍ الرفع...' : 'رفع فيديو تعريفي قصير'}</span>
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => void handleFile(e.target.files)} />
    </button>
  );
}

/**
 * Certification stepper (figma CERT_STEPS: kyc → docs → interview → test →
 * training → probation → certified). The backend only has ONE real onboarding
 * action — POST /technician/onboarding, submitted atomically once below — so
 * there's no server-side concept of separately navigable pages for
 * interview/test/training to move between. Instead this renders a progress
 * card (matching figma's stepper) computed from the fields already filled in
 * on this single form, with the later stages shown as informational-only
 * ("سيتم التواصل معك...") rather than fake interactive screens.
 */
const CERT_STEPS: { key: string; ar: string }[] = [
  { key: 'kyc', ar: 'هوية (KYC)' },
  { key: 'docs', ar: 'المستندات المهنية' },
  { key: 'interview', ar: 'مقابلة' },
  { key: 'test', ar: 'اختبار عملي' },
  { key: 'training', ar: 'تدريب / SOP' },
  { key: 'probation', ar: 'قيد التجربة' },
  { key: 'certified', ar: 'معتمد' },
];

function CertStepper({ kycDone, docsDone }: { kycDone: boolean; docsDone: boolean }) {
  const doneKeys = new Set<string>();
  if (kycDone) doneKeys.add('kyc');
  if (docsDone) doneKeys.add('docs');
  const currentIdx = !kycDone ? 0 : !docsDone ? 1 : 2;

  return (
    <Card className="p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontWeight: 700, fontSize: 14 }}>مراحل الاعتماد</h3>
        <span style={{ color: COLOR_TEXT_MUTED, fontSize: 11 }}>{doneKeys.size} / {CERT_STEPS.length}</span>
      </div>
      {CERT_STEPS.map((st, i) => {
        const done = doneKeys.has(st.key);
        const active = i === currentIdx;
        const color = done ? COLOR_SUCCESS_TEXT : active ? COLOR_BRAND_PRIMARY : COLOR_TEXT_MUTED;
        return (
          <div key={st.key} className="flex items-center gap-3 py-1.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: done ? COLOR_SUCCESS_BG : active ? COLOR_BRAND_PRIMARY_TINT : COLOR_BG_SUBTLE, color }}>
              {done ? '✓' : i + 1}
            </div>
            <span className="flex-1" style={{ fontSize: 13, fontWeight: active || done ? 700 : 500, color: done || active ? COLOR_TEXT_PRIMARY : COLOR_TEXT_MUTED }}>{st.ar}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color }}>{done ? 'مكتمل' : active ? 'الحالي' : 'قيد الانتظار'}</span>
          </div>
        );
      })}
      <p className="mt-2 pt-2 border-t border-slate-100" style={{ color: COLOR_TEXT_MUTED, fontSize: 11 }}>
        بعد إرسال الطلب ومراجعته: سيتم التواصل معك لتحديد موعد مقابلة، ثم اختبار عملي وتدريب قصير على إجراءات السلامة، تليها فترة تجربة (أول 10 طلبات) قبل الاعتماد الكامل.
      </p>
    </Card>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { data: services } = useServices();
  const [selected, setSelected] = useState<string[]>([]);
  const [rate, setRate] = useState('45');
  const [vehicle, setVehicle] = useState('');
  const [idDocUrl, setIdDocUrl] = useState('');
  const [certificateUrl, setCertificateUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [introVideoUrl, setIntroVideoUrl] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  function toggle(id: string) { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  async function submit() {
    try {
      await api.post('/technician/onboarding', {
        serviceIds: selected,
        hourlyRateJod: Number(rate),
        vehicle: vehicle.trim() || undefined,
        idDocUrl: idDocUrl.trim() || undefined,
        certificateUrl: certificateUrl.trim() || undefined,
        selfieUrl: selfieUrl.trim() || undefined,
        introVideoUrl: introVideoUrl.trim() || undefined,
        agreementAccepted,
      });
      notify('تم إرسال طلبك', 'success'); onDone();
    } catch (e) { notify(e instanceof ApiError ? e.message : 'خطأ', 'error'); }
  }
  return (
    <main className="max-w-[600px] mx-auto px-6 py-8">
      <div className="flex items-center gap-2"><Wrench size={24} color={COLOR_BRAND_PRIMARY} /><h1 style={{ fontWeight: 800, fontSize: 24 }}>انضم كفني</h1></div>
      <p className="mt-2" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>اختر الخدمات التي تقدّمها وحدّد سعرك بالساعة.</p>

      <CertStepper kycDone={!!idDocUrl.trim() && !!selfieUrl.trim()} docsDone={!!certificateUrl.trim()} />

      <h2 className="mt-6" style={{ fontWeight: 700, fontSize: 16 }}>الخدمات</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(services?.data ?? []).map((s: Service) => (
          <button key={s.id} onClick={() => toggle(s.id)} className="p-3 rounded-xl border-2 flex items-center gap-2 text-start"
            style={{ borderColor: selected.includes(s.id) ? COLOR_BRAND_PRIMARY : COLOR_BORDER, background: selected.includes(s.id) ? COLOR_BRAND_PRIMARY_TINT : COLOR_WHITE }}>
            <ServiceIcon nameAr={s.nameAr} size={18} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{s.nameAr}</span>
          </button>
        ))}
      </div>

      <h2 className="mt-6" style={{ fontWeight: 700, fontSize: 16 }}>السعر بالساعة (40–60 دينار)</h2>
      <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14, direction: 'ltr' }} />

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>المركبة (اختياري)</h2>
      <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="مثال: Hyundai H1 أبيض" className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14 }} />

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>صورة الهوية الوطنية</h2>
      <MediaUpload value={idDocUrl ? [idDocUrl] : []} onChange={(urls) => setIdDocUrl(urls[urls.length - 1] ?? '')} purpose="kyc_doc" max={1} />

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>الشهادة المهنية (اختياري)</h2>
      <MediaUpload value={certificateUrl ? [certificateUrl] : []} onChange={(urls) => setCertificateUrl(urls[urls.length - 1] ?? '')} purpose="certificate" max={1} />

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>صورة شخصية</h2>
      <MediaUpload value={selfieUrl ? [selfieUrl] : []} onChange={(urls) => setSelfieUrl(urls[urls.length - 1] ?? '')} purpose="selfie" max={1} />

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>فيديو تعريفي (اختياري)</h2>
      <VideoUpload value={introVideoUrl} onChange={setIntroVideoUrl} />

      <label className="mt-5 flex items-start gap-2">
        <input type="checkbox" checked={agreementAccepted} onChange={(e) => setAgreementAccepted(e.target.checked)} className="mt-1" />
        <span style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>أوافق على اتفاقية المتعاقدين وقواعد السلوك</span>
      </label>

      <button onClick={() => void submit()} disabled={selected.length === 0 || Number(rate) < 40 || Number(rate) > 60 || !agreementAccepted}
        className="mt-6 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
        إرسال الطلب
      </button>
    </main>
  );
}
