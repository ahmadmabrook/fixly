import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wrench, Clock, Power, Star } from 'lucide-react';
import { api, ApiError, TechnicianProfileMe, NearbyJob, TechEarnings, BookingListItem, Service } from '../../lib/api';
import { useServices } from '../../hooks/useServices';
import { useCountdown } from '../../hooks/useCountdown';
import { Card, ServiceIcon, StatusBadge, Modal, notify, SkeletonList } from '../../components/shared';

export default function TechPortal() {
  const { data: me, isLoading, error, refetch } = useQuery({
    queryKey: ['technician-me'],
    retry: false,
    queryFn: () => api.get<TechnicianProfileMe>('/technician/me'),
  });

  if (isLoading) return <main className="max-w-[600px] mx-auto px-6 py-16"><SkeletonList count={3} rowHeight={80} /></main>;

  const notFound = error instanceof ApiError && error.status === 404;
  if (notFound || !me) return <Onboarding onDone={() => void refetch()} />;
  if (me.status === 'PENDING') return <StatusScreen title="طلبك قيد المراجعة" body="سنراجع طلبك خلال 24 ساعة ونعلمك بالنتيجة." tone="info" />;
  if (me.status === 'REJECTED') return <StatusScreen title="تم رفض الطلب" body={me.rejectionReason ?? 'يرجى مراجعة الدعم.'} tone="error" retry={() => void refetch()} />;
  if (me.status === 'SUSPENDED') return <StatusScreen title="الحساب موقوف" body={me.rejectionReason ?? 'تواصل مع الدعم.'} tone="error" />;
  return <Dashboard me={me} onChange={() => void refetch()} />;
}

function Dashboard({ me, onChange }: { me: TechnicianProfileMe; onChange: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'jobs' | 'active' | 'earnings' | 'ratings'>('jobs');
  const [available, setAvailable] = useState(me.isAvailable);

  async function toggle() {
    try {
      const next = !available;
      await api.patch('/technician/availability', { isAvailable: next });
      setAvailable(next);
      notify(next ? 'أنت متاح الآن' : 'أنت غير متاح', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }

  return (
    <main className="max-w-[800px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 style={{ fontWeight: 800, fontSize: 26 }}>لوحة الفني</h1>
        <button onClick={() => void toggle()} className="flex items-center gap-2 px-4 h-11 rounded-full"
          style={{ background: available ? '#DCFCE7' : '#FEE2E2', color: available ? '#15803D' : '#B91C1C', fontWeight: 700, fontSize: 14 }}>
          <Power size={16} /> {available ? 'متاح' : 'غير متاح'}
        </button>
      </div>

      <div className="mt-4 flex gap-2 flex-wrap">
        {([['jobs', 'طلبات قريبة'], ['active', 'مهامي'], ['earnings', 'الأرباح'], ['ratings', 'تقييماتي']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 h-10 rounded-full" style={{ background: tab === k ? '#1366D6' : '#FFF', color: tab === k ? '#FFF' : '#475569', fontWeight: 600, fontSize: 13, border: '1px solid #E2E8F0' }}>{l}</button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'jobs' && <NearbyJobs onAccepted={() => { void qc.invalidateQueries({ queryKey: ['tech-active'] }); }} />}
        {tab === 'active' && <ActiveJobs />}
        {tab === 'earnings' && <Earnings onChange={onChange} />}
        {tab === 'ratings' && <Ratings technicianId={me.id} />}
      </div>
    </main>
  );
}

function NearbyJobs({ onAccepted }: { onAccepted: () => void }) {
  const qc = useQueryClient();
  // Poll at 30s (was 15s) to cut backend load; the address is only revealed
  // after accepting, so list rows show distance + price only.
  const { data: jobs } = useQuery({ queryKey: ['tech-jobs'], queryFn: () => api.get<NearbyJob[]>('/technician/jobs'), refetchInterval: 30000 });
  async function accept(id: string) {
    try {
      await api.post(`/bookings/${id}/accept`, {});
      notify('تم قبول الطلب', 'success');
      void qc.invalidateQueries({ queryKey: ['tech-jobs'] });
      onAccepted();
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر القبول', 'error'); }
  }
  return (
    <div className="space-y-3">
      {(jobs ?? []).length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد طلبات قريبة حالياً.</p>}
      {(jobs ?? []).map((j) => (
        <NearbyJobCard key={j.id} job={j} onAccept={() => void accept(j.id)} />
      ))}
    </div>
  );
}

function NearbyJobCard({ job: j, onAccept }: { job: NearbyJob; onAccept: () => void }) {
  const remaining = useCountdown(j.expiresAt ?? null);
  const expired = remaining === 0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Card key={j.id} className="p-4" style={expired ? { opacity: 0.5 } : undefined}>
      <div className="flex items-center gap-3">
        <ServiceIcon nameAr={j.service?.nameAr ?? ''} size={20} />
        <div className="flex-1">
          <div style={{ fontWeight: 700, fontSize: 15 }}>{j.service?.nameAr}</div>
          <div style={{ color: '#475569', fontSize: 12 }}>{j.distanceKm != null ? <>على بُعد <span style={{ fontFamily: 'Inter' }}>{j.distanceKm}</span> كم</> : 'قريب منك'}</div>
        </div>
        <span style={{ fontWeight: 700, color: '#0E4FA8' }}><span style={{ fontFamily: 'Inter' }}>{Number(j.totalJod)}</span> دينار</span>
      </div>
      {/* Countdown timer */}
      {remaining != null && (
        <div className="mt-2 flex items-center gap-1" style={{ fontSize: 13, fontWeight: 600, color: expired ? '#B91C1C' : '#B45309', fontFamily: 'Inter' }}>
          <span aria-hidden="true">&#9201;</span>
          {expired ? <span style={{ fontFamily: 'Tajawal' }}>انتهت المهلة</span> : formatTime(remaining)}
        </div>
      )}
      <button onClick={onAccept} disabled={expired} className="mt-3 w-full h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
        {expired ? 'انتهت المهلة' : 'قبول'}
      </button>
    </Card>
  );
}

const NEXT_STATUS: Record<string, { to: string; label: string }> = {
  CONFIRMED: { to: 'EN_ROUTE', label: 'بدء التوجه' },
  EN_ROUTE: { to: 'ARRIVED', label: 'وصلت' },
  ARRIVED: { to: 'IN_PROGRESS', label: 'بدء الخدمة' },
};

function ActiveJobs() {
  const qc = useQueryClient();
  const { data: jobs } = useQuery({ queryKey: ['tech-active'], queryFn: () => api.get<BookingListItem[]>('/bookings'), refetchInterval: 30000 });
  const [extraFor, setExtraFor] = useState<string | null>(null);
  const [extraDesc, setExtraDesc] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [rateFor, setRateFor] = useState<string | null>(null);
  const active = (jobs ?? []).filter((b) => ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status));
  async function advance(id: string, to: string) {
    try { await api.post(`/bookings/${id}/status`, { to }); void qc.invalidateQueries({ queryKey: ['tech-active'] }); }
    catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function complete(id: string) {
    try { await api.post(`/bookings/${id}/complete`, {}); notify('تم إنهاء الخدمة', 'success'); void qc.invalidateQueries({ queryKey: ['tech-active'] }); setRateFor(id); }
    catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function addExtra(id: string) {
    try {
      await api.post(`/bookings/${id}/additional-work`, { description: extraDesc.trim(), amountJod: Number(extraAmount) });
      notify('تم إرسال العمل الإضافي للعميل', 'success'); setExtraFor(null); setExtraDesc(''); setExtraAmount('');
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  return (
    <div className="space-y-3">
      {active.length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد مهام نشطة.</p>}
      {active.map((b) => {
        const next = NEXT_STATUS[b.status];
        return (
          <Card key={b.id} className="p-4">
            <div className="flex items-center gap-3">
              <ServiceIcon nameAr={b.service?.nameAr ?? ''} size={20} />
              <div className="flex-1"><div style={{ fontWeight: 700, fontSize: 15 }}>{b.service?.nameAr}</div></div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-3 flex gap-2">
              {next && <button onClick={() => void advance(b.id, next.to)} className="flex-1 h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>{next.label}</button>}
              {b.status === 'IN_PROGRESS' && <button onClick={() => void complete(b.id)} className="flex-1 h-11 rounded-xl" style={{ background: '#15803D', color: '#FFF', fontWeight: 700 }}>إنهاء الخدمة</button>}
            </div>
            {b.status === 'IN_PROGRESS' && (
              extraFor === b.id ? (
                <div className="mt-2 space-y-2">
                  <input value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} placeholder="وصف العمل الإضافي" className="w-full h-10 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
                  <div className="flex gap-2">
                    <input value={extraAmount} onChange={(e) => setExtraAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="المبلغ" className="flex-1 h-10 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
                    <button onClick={() => void addExtra(b.id)} disabled={!extraDesc.trim() || !extraAmount} className="px-4 h-10 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700, fontSize: 13 }}>إرسال</button>
                    <button onClick={() => setExtraFor(null)} className="px-3 h-10 rounded-xl" style={{ color: '#64748B', fontSize: 13 }}>إلغاء</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setExtraFor(b.id)} className="mt-2 text-start" style={{ color: '#1366D6', fontSize: 13, fontWeight: 600 }}>+ إضافة عمل إضافي</button>
              )
            )}
          </Card>
        );
      })}
      {rateFor && <RateCustomerModal bookingId={rateFor} onClose={() => setRateFor(null)} />}
    </div>
  );
}

function RateCustomerModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  async function submit() {
    try { await api.post(`/bookings/${bookingId}/review`, { rating, comment: comment.trim() || undefined }); notify('شكراً لتقييمك', 'success'); onClose(); }
    catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  return (
    <Modal title="قيّم العميل" variant="sheet" maxWidth="sm" onClose={onClose}>
      <div className="mt-4 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} نجوم`} aria-pressed={n <= rating}>
            <Star size={32} fill={n <= rating ? '#F5A623' : 'none'} color="#F5A623" strokeWidth={n <= rating ? 0 : 2} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="تعليق (اختياري)" aria-label="تعليق التقييم" rows={2} className="mt-3 w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
      <button onClick={() => void submit()} disabled={rating === 0} className="mt-3 w-full h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إرسال</button>
    </Modal>
  );
}

function Ratings({ technicianId }: { technicianId: string }) {
  const { data } = useQuery({
    queryKey: ['tech-my-reviews', technicianId],
    queryFn: () => api.get<{ summary: { rating: string | number; totalReviews: number }; items: Array<{ id: string; rating: number; comment: string | null; reviewerName: string | null }> }>(`/technicians/${technicianId}/reviews`),
  });
  return (
    <div className="space-y-3">
      {data && (
        <Card className="p-5 text-center">
          <div style={{ fontWeight: 800, fontSize: 32, color: '#F5A623', fontFamily: 'Inter' }}>{Number(data.summary.rating).toFixed(1)}</div>
          <div style={{ color: '#64748B', fontSize: 13 }}>{data.summary.totalReviews} تقييم</div>
        </Card>
      )}
      {(data?.items ?? []).map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reviewerName ?? 'عميل'}</span>
            <span style={{ color: '#F5A623', fontWeight: 700, fontFamily: 'Inter' }}>{r.rating}★</span>
          </div>
          {r.comment && <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>{r.comment}</p>}
        </Card>
      ))}
      {data && data.items.length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد تقييمات بعد.</p>}
    </div>
  );
}

function Earnings({ onChange }: { onChange: () => void }) {
  const qc = useQueryClient();
  const { data: e } = useQuery({ queryKey: ['tech-earnings'], queryFn: () => api.get<TechEarnings>('/technician/earnings') });
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const didPrefill = useRef(false);

  // Pre-fill IBAN and bank name from last withdrawal when data arrives
  useEffect(() => {
    if (!e || didPrefill.current) return;
    didPrefill.current = true;
    if (e.savedIban) { setIban(e.savedIban); setPrefilled(true); }
    if (e.savedBankName) { setBankName(e.savedBankName); }
  }, [e]);

  async function withdraw() {
    try {
      await api.post('/technician/withdrawals', { amountJod: Number(amount), iban: iban.trim() || undefined, bankName: bankName.trim() || undefined });
      notify('تم إرسال طلب السحب', 'success'); setAmount(''); setIban(''); setBankName('');
      setPrefilled(false); didPrefill.current = false;
      void qc.invalidateQueries({ queryKey: ['tech-earnings'] }); onChange();
    } catch (err) { notify(err instanceof ApiError ? err.message : 'خطأ', 'error'); }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="اليوم" value={e?.todayJod ?? '0'} />
        <Stat label="هذا الشهر" value={e?.monthJod ?? '0'} />
        <Stat label="الرصيد" value={e?.balanceJod ?? '0'} highlight />
      </div>
      <Card className="p-5">
        <h3 style={{ fontWeight: 700, fontSize: 16 }}>سحب الرصيد</h3>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>الحد الأدنى 20 ديناراً — مرة كل 24 ساعة.</p>
        <input value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ''))} placeholder="المبلغ (دينار)" className="mt-3 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
        <input value={iban} onChange={(ev) => { setIban(ev.target.value); setPrefilled(false); }} placeholder="IBAN" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
        {prefilled && (
          <p className="mt-1" style={{ color: '#1366D6', fontSize: 11 }}>تم استخدام آخر IBAN مُسجّل</p>
        )}
        <input value={bankName} onChange={(ev) => setBankName(ev.target.value)} placeholder="اسم البنك (اختياري)" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
        <button onClick={() => void withdraw()} disabled={Number(amount) < 20} className="mt-3 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>سحب الرصيد</button>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className="p-4 text-center" style={highlight ? { background: '#E8F1FE' } : undefined}>
      <div style={{ color: '#475569', fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20, color: highlight ? '#0E4FA8' : '#0F172A' }}>
        <span style={{ fontFamily: 'Inter' }}>{Number(value)}</span> <span style={{ fontSize: 12 }}>د</span>
      </div>
    </Card>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const { data: services } = useServices();
  const [selected, setSelected] = useState<string[]>([]);
  const [rate, setRate] = useState('45');
  const [vehicle, setVehicle] = useState('');
  const [idDocUrl, setIdDocUrl] = useState('');
  const [certificateUrl, setCertificateUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
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
      });
      notify('تم إرسال طلبك', 'success'); onDone();
    } catch (e) { notify(e instanceof ApiError ? e.message : 'خطأ', 'error'); }
  }
  return (
    <main className="max-w-[600px] mx-auto px-6 py-8">
      <div className="flex items-center gap-2"><Wrench size={24} color="#1366D6" /><h1 style={{ fontWeight: 800, fontSize: 24 }}>انضم كفني</h1></div>
      <p className="mt-2" style={{ color: '#475569', fontSize: 14 }}>اختر الخدمات التي تقدّمها وحدّد سعرك بالساعة.</p>

      <h2 className="mt-6" style={{ fontWeight: 700, fontSize: 16 }}>الخدمات</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(services?.data ?? []).map((s: Service) => (
          <button key={s.id} onClick={() => toggle(s.id)} className="p-3 rounded-xl border-2 flex items-center gap-2 text-start"
            style={{ borderColor: selected.includes(s.id) ? '#1366D6' : '#E2E8F0', background: selected.includes(s.id) ? '#E8F1FE' : '#FFF' }}>
            <ServiceIcon nameAr={s.nameAr} size={18} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{s.nameAr}</span>
          </button>
        ))}
      </div>

      <h2 className="mt-6" style={{ fontWeight: 700, fontSize: 16 }}>السعر بالساعة (40–60 دينار)</h2>
      <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14, direction: 'ltr' }} />

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>المركبة (اختياري)</h2>
      <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="مثال: Hyundai H1 أبيض" className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14 }} />

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>المستندات (روابط الصور)</h2>
      <p style={{ color: '#94A3B8', fontSize: 12 }}>ارفع صورك على خدمة تخزين وألصق الروابط (الرفع المباشر قريباً).</p>
      <input value={idDocUrl} onChange={(e) => setIdDocUrl(e.target.value)} placeholder="رابط صورة الهوية" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14, direction: 'ltr' }} />
      <input value={certificateUrl} onChange={(e) => setCertificateUrl(e.target.value)} placeholder="رابط الشهادة (اختياري)" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14, direction: 'ltr' }} />
      <input value={selfieUrl} onChange={(e) => setSelfieUrl(e.target.value)} placeholder="رابط الصورة الشخصية" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14, direction: 'ltr' }} />

      <button onClick={() => void submit()} disabled={selected.length === 0 || Number(rate) < 40 || Number(rate) > 60}
        className="mt-6 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
        إرسال الطلب
      </button>
    </main>
  );
}

function StatusScreen({ title, body, tone, retry }: { title: string; body: string; tone: 'info' | 'error'; retry?: () => void }) {
  return (
    <main className="max-w-[500px] mx-auto px-6 py-16 text-center">
      <div className="inline-flex w-16 h-16 rounded-full items-center justify-center" style={{ background: tone === 'error' ? '#FEE2E2' : '#E8F1FE' }}>
        <Clock size={28} color={tone === 'error' ? '#B91C1C' : '#1366D6'} />
      </div>
      <h1 className="mt-4" style={{ fontWeight: 800, fontSize: 22 }}>{title}</h1>
      <p className="mt-2" style={{ color: '#475569', fontSize: 15 }}>{body}</p>
      {retry && <button onClick={retry} className="mt-5 px-5 h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إعادة التقديم</button>}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="max-w-[600px] mx-auto px-6 py-16 text-center"><p style={{ color: '#94A3B8', fontSize: 16 }}>{children}</p></main>;
}
