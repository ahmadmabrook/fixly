import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Wrench, Clock, Power, Star, ChevronLeft, LogOut, LifeBuoy,
  Landmark, AlertTriangle, MapPin, Plus,
} from 'lucide-react';
import { api, ApiError, logout as apiLogout, TechnicianProfileMe, NearbyJob, TechEarnings, BookingListItem, Service, TrustTier, TechnicianScorecard, SupportTicketItem, NotificationPreferences, BankAccount } from '../../lib/api';
import { useServices } from '../../hooks/useServices';
import { useCountdown } from '../../hooks/useCountdown';
import { Card, ServiceIcon, StatusBadge, Modal, ConfirmDialog, notify, SkeletonList } from '../../components/shared';

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

const TRUST_TIER_LABELS: Record<TrustTier, { ar: string; bg: string; fg: string }> = {
  PROBATION: { ar: 'تحت التجربة', bg: '#FEF3C7', fg: '#B45309' },
  VERIFIED:  { ar: 'موثّق',      bg: '#DBEAFE', fg: '#1366D6' },
  PRO:       { ar: 'محترف',      bg: '#DCFCE7', fg: '#15803D' },
  ELITE:     { ar: 'نخبة',       bg: '#EDE9FE', fg: '#6D28D9' },
};

function TrustTierBadge({ tier }: { tier: TrustTier }) {
  const t = TRUST_TIER_LABELS[tier] ?? TRUST_TIER_LABELS.PROBATION;
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1" style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700 }}>
      {t.ar}
    </span>
  );
}

function Dashboard({ me, onChange }: { me: TechnicianProfileMe; onChange: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'jobs' | 'active' | 'earnings' | 'ratings' | 'scorecard' | 'profile'>('jobs');
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
        <div className="flex items-center gap-2">
          <h1 style={{ fontWeight: 800, fontSize: 26 }}>لوحة الفني</h1>
          <TrustTierBadge tier={me.trustTier} />
        </div>
        <button onClick={() => void toggle()} className="flex items-center gap-2 px-4 h-11 rounded-full"
          style={{ background: available ? '#DCFCE7' : '#FEE2E2', color: available ? '#15803D' : '#B91C1C', fontWeight: 700, fontSize: 14 }}>
          <Power size={16} /> {available ? 'متاح' : 'غير متاح'}
        </button>
      </div>

      {me.trustTier === 'PROBATION' && (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: '#FEF3C7', color: '#92400E', fontSize: 13, fontWeight: 600 }}>
          قيد التجربة — أول 10 طلبات
        </div>
      )}

      {me.consecutiveRejections >= 3 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
          <AlertTriangle size={16} aria-hidden="true" />
          لديك {me.consecutiveRejections} رفضات متتالية — قد يؤثر ذلك على نسبة القبول وترتيبك في التوزيع.
        </div>
      )}

      <div className="mt-4 flex gap-2 flex-wrap">
        {([['jobs', 'طلبات قريبة'], ['active', 'مهامي'], ['earnings', 'الأرباح'], ['ratings', 'تقييماتي'], ['scorecard', 'أدائي'], ['profile', 'حسابي']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 h-10 rounded-full" style={{ background: tab === k ? '#1366D6' : '#FFF', color: tab === k ? '#FFF' : '#475569', fontWeight: 600, fontSize: 13, border: '1px solid #E2E8F0' }}>{l}</button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'jobs' && <NearbyJobs onAccepted={() => { void qc.invalidateQueries({ queryKey: ['tech-active'] }); }} />}
        {tab === 'active' && <ActiveJobs />}
        {tab === 'earnings' && <Earnings onChange={onChange} />}
        {tab === 'ratings' && <Ratings technicianId={me.id} />}
        {tab === 'scorecard' && <Scorecard />}
        {tab === 'profile' && <ProfileTab />}
      </div>
    </main>
  );
}

function Scorecard() {
  const { data } = useQuery({ queryKey: ['tech-scorecard'], queryFn: () => api.get<TechnicianScorecard>('/technician/scorecard') });
  const pct = (n: number) => `${n}%`;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>الالتزام بالموعد</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.onTimeRate) : '—'}</div>
      </Card>
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>نسبة إعادة الخدمة</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.redoRate) : '—'}</div>
      </Card>
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>نسبة الشكاوى</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.complaintRate) : '—'}</div>
      </Card>
      <Card className="p-4 text-center">
        <div style={{ color: '#475569', fontSize: 12 }}>نسبة قبول الطلبات</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', fontFamily: 'Inter' }}>{data ? pct(data.acceptanceRate) : '—'}</div>
      </Card>
    </div>
  );
}

function NearbyJobs({ onAccepted }: { onAccepted: () => void }) {
  const qc = useQueryClient();
  // Poll at 30s (was 15s) to cut backend load; the address is only revealed
  // after accepting, so list rows show distance + price only.
  const { data: jobs } = useQuery({ queryKey: ['tech-jobs'], queryFn: () => api.get<NearbyJob[]>('/technician/jobs'), refetchInterval: 30000 });
  const [detailFor, setDetailFor] = useState<NearbyJob | null>(null);

  async function accept(id: string) {
    try {
      await api.post(`/bookings/${id}/accept`, {});
      notify('تم قبول الطلب', 'success');
      void qc.invalidateQueries({ queryKey: ['tech-jobs'] });
      setDetailFor(null);
      onAccepted();
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر القبول', 'error'); }
  }
  async function reject(id: string) {
    try {
      await api.post(`/bookings/${id}/reject`, {});
      notify('تم رفض الطلب');
      setDetailFor(null);
      void qc.invalidateQueries({ queryKey: ['tech-jobs'] });
      void qc.invalidateQueries({ queryKey: ['technician-me'] });
    } catch (e) { notify(e instanceof Error ? e.message : 'تعذّر الرفض', 'error'); }
  }
  return (
    <div className="space-y-3">
      {(jobs ?? []).length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد طلبات قريبة حالياً.</p>}
      {(jobs ?? []).map((j) => (
        <NearbyJobCard key={j.id} job={j} onAccept={() => void accept(j.id)} onDetails={() => setDetailFor(j)} />
      ))}
      {detailFor && (
        <JobDetailModal job={detailFor} onAccept={() => void accept(detailFor.id)} onReject={() => void reject(detailFor.id)} onClose={() => setDetailFor(null)} />
      )}
    </div>
  );
}

function NearbyJobCard({ job: j, onAccept, onDetails }: { job: NearbyJob; onAccept: () => void; onDetails: () => void }) {
  const remaining = useCountdown(j.expiresAt ?? null);
  const expired = remaining === 0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Card key={j.id} className="p-4" style={expired ? { opacity: 0.5 } : undefined}>
      <button onClick={onDetails} className="w-full text-start">
        <div className="flex items-center gap-3">
          <ServiceIcon nameAr={j.service?.nameAr ?? ''} size={20} />
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 15 }}>{j.service?.nameAr}</div>
            <div style={{ color: '#475569', fontSize: 12 }}>{j.distanceKm != null ? <>على بُعد <span style={{ fontFamily: 'Inter' }}>{j.distanceKm}</span> كم</> : 'قريب منك'}</div>
          </div>
          <span style={{ fontWeight: 700, color: '#0E4FA8' }}><span style={{ fontFamily: 'Inter' }}>{Number(j.totalJod)}</span> دينار</span>
        </div>
      </button>
      {/* Countdown timer */}
      {remaining != null && (
        <div className="mt-2 flex items-center gap-1" style={{ fontSize: 13, fontWeight: 600, color: expired ? '#B91C1C' : '#B45309', fontFamily: 'Inter' }}>
          <span aria-hidden="true">&#9201;</span>
          {expired ? <span style={{ fontFamily: 'Tajawal' }}>انتهت المهلة</span> : formatTime(remaining)}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onDetails} className="h-11 rounded-xl" style={{ border: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>تفاصيل</button>
        <button onClick={onAccept} disabled={expired} className="h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
          {expired ? 'انتهت المهلة' : 'قبول'}
        </button>
      </div>
    </Card>
  );
}

/** Full job-detail view (figma "Incoming"): service/price + accept/reject.
 *  NearbyJob doesn't expose the customer's exact address (withheld by the
 *  backend until accepted) or the platform commission percentage, so this
 *  shows the gross price only rather than a payout breakdown that isn't
 *  actually available from the API. */
function JobDetailModal({ job, onAccept, onReject, onClose }: { job: NearbyJob; onAccept: () => void; onReject: () => void; onClose: () => void }) {
  const remaining = useCountdown(job.expiresAt ?? null);
  const expired = remaining === 0;
  return (
    <Modal title="تفاصيل الطلب" onClose={onClose} variant="sheet" maxWidth="sm">
      <div className="mt-3 flex items-center gap-3">
        <ServiceIcon nameAr={job.service?.nameAr ?? ''} size={24} />
        <div className="flex-1">
          <div style={{ fontWeight: 800, fontSize: 18 }}>{job.service?.nameAr}</div>
          {job.service?.durationMin != null && <div style={{ color: '#475569', fontSize: 13 }}>المدة التقديرية: {job.service.durationMin} دقيقة</div>}
        </div>
      </div>
      <Card className="mt-3 p-3 flex items-center gap-2">
        <MapPin size={16} color="#475569" aria-hidden="true" />
        <span style={{ fontSize: 13 }}>
          {job.distanceKm != null ? <>على بُعد <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{job.distanceKm}</span> كم — يظهر العنوان الكامل بعد القبول</> : 'يظهر العنوان الكامل بعد القبول'}
        </span>
      </Card>
      <Card className="mt-3 p-3 flex items-center justify-between">
        <span style={{ fontSize: 14, fontWeight: 700 }}>سعر الخدمة</span>
        <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 18, color: '#0E4FA8' }}>{Number(job.totalJod)} دينار</span>
      </Card>
      {remaining != null && !expired && (
        <p className="mt-2 text-center" style={{ color: '#B45309', fontSize: 12, fontWeight: 600 }}>
          اقبل خلال <span style={{ fontFamily: 'Inter' }}>{Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, '0')}</span>
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onReject} className="h-12 rounded-xl" style={{ border: '1px solid #FECACA', color: '#B91C1C', fontWeight: 700 }}>رفض</button>
        <button onClick={onAccept} disabled={expired} className="h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
          {expired ? 'انتهت المهلة' : 'قبول'}
        </button>
      </div>
    </Modal>
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
  const [noShowFor, setNoShowFor] = useState<string | null>(null);
  const [checklistFor, setChecklistFor] = useState<{ id: string; stage: 'pre-start' | 'pre-close' } | null>(null);
  const active = (jobs ?? []).filter((b) => ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status));

  function refetchActive() { void qc.invalidateQueries({ queryKey: ['tech-active'] }); }

  async function advance(id: string, to: string) {
    try { await api.post(`/bookings/${id}/status`, { to }); refetchActive(); }
    catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function complete(id: string) {
    try { await api.post(`/bookings/${id}/complete`, {}); notify('تم إنهاء الخدمة', 'success'); refetchActive(); setRateFor(id); }
    catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function addExtra(id: string) {
    try {
      await api.post(`/bookings/${id}/additional-work`, { description: extraDesc.trim(), amountJod: Number(extraAmount) });
      notify('تم إرسال العمل الإضافي للعميل', 'success'); setExtraFor(null); setExtraDesc(''); setExtraAmount('');
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function reportNoShow(id: string) {
    try {
      await api.post(`/bookings/${id}/no-show`, {});
      notify('تم تسجيل عدم حضور العميل', 'success'); setNoShowFor(null); refetchActive();
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }
  async function submitChecklist(id: string, stage: 'pre-start' | 'pre-close', photoUrls: string[]) {
    try {
      await api.post(`/bookings/${id}/checklist/${stage}`, { photoUrls });
      setChecklistFor(null);
      if (stage === 'pre-start') { await advance(id, 'IN_PROGRESS'); }
      else { await complete(id); }
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }

  return (
    <div className="space-y-3">
      {active.length === 0 && <p style={{ color: '#94A3B8', fontSize: 14 }}>لا توجد مهام نشطة.</p>}
      {active.map((b) => {
        const next = NEXT_STATUS[b.status];
        // Both forward-progress transitions are gated behind an SOP photo checklist
        // (backend now 422s without it), so route these two buttons through the modal
        // instead of calling advance()/complete() directly.
        const isArrivedToInProgress = next && b.status === 'ARRIVED';
        return (
          <Card key={b.id} className="p-4">
            <div className="flex items-center gap-3">
              <ServiceIcon nameAr={b.service?.nameAr ?? ''} size={20} />
              <div className="flex-1"><div style={{ fontWeight: 700, fontSize: 15 }}>{b.service?.nameAr}</div></div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-3 flex gap-2">
              {next && (
                <button
                  onClick={() => (isArrivedToInProgress ? setChecklistFor({ id: b.id, stage: 'pre-start' }) : void advance(b.id, next.to))}
                  className="flex-1 h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}
                >
                  {next.label}
                </button>
              )}
              {b.status === 'IN_PROGRESS' && (
                <button onClick={() => setChecklistFor({ id: b.id, stage: 'pre-close' })} className="flex-1 h-11 rounded-xl" style={{ background: '#15803D', color: '#FFF', fontWeight: 700 }}>إنهاء الخدمة</button>
              )}
            </div>
            {b.status === 'ARRIVED' && (
              <button onClick={() => setNoShowFor(b.id)} className="mt-2 w-full h-10 rounded-xl" style={{ background: '#FEE2E2', color: '#B91C1C', fontWeight: 700, fontSize: 13 }}>
                العميل لم يحضر
              </button>
            )}
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
      {noShowFor && (
        <ConfirmDialog
          title="تسجيل عدم حضور العميل"
          body="قد تُطبّق رسوم كشف على العميل. هل أنت متأكد؟"
          confirmLabel="تأكيد"
          cancelLabel="إلغاء"
          onConfirm={() => void reportNoShow(noShowFor)}
          onCancel={() => setNoShowFor(null)}
        />
      )}
      {checklistFor && (
        <ChecklistModal
          stage={checklistFor.stage}
          onCancel={() => setChecklistFor(null)}
          onSubmit={(photoUrls) => void submitChecklist(checklistFor.id, checklistFor.stage, photoUrls)}
        />
      )}
    </div>
  );
}

/** SOP photo checklist gate — required before ARRIVED→IN_PROGRESS ("pre-start")
 *  and before completing the booking ("pre-close"). Backend rejects the
 *  transition with a 422 unless this was submitted first, so the modal always
 *  runs before the status call rather than reacting to the error. */
function ChecklistModal({ stage, onCancel, onSubmit }: { stage: 'pre-start' | 'pre-close'; onCancel: () => void; onSubmit: (photoUrls: string[]) => void }) {
  const [photoUrl, setPhotoUrl] = useState('');
  const isPreStart = stage === 'pre-start';
  return (
    <Modal title={isPreStart ? 'قائمة تحقق ما قبل الخدمة' : 'قائمة تحقق ما بعد الخدمة'} onClose={onCancel} variant="sheet" maxWidth="sm">
      <p className="mt-2" style={{ color: '#475569', fontSize: 13 }}>
        {isPreStart ? 'أضف رابط صورة واحدة على الأقل قبل بدء الخدمة.' : 'أضف رابط صورة واحدة على الأقل بعد انتهاء الخدمة.'}
      </p>
      <input
        value={photoUrl}
        onChange={(e) => setPhotoUrl(e.target.value)}
        placeholder={isPreStart ? 'رابط صورة قبل الخدمة' : 'رابط صورة بعد الخدمة'}
        className="mt-3 w-full h-11 rounded-xl border border-slate-200 px-4"
        style={{ fontSize: 14, direction: 'ltr' }}
        aria-label={isPreStart ? 'رابط صورة قبل الخدمة' : 'رابط صورة بعد الخدمة'}
      />
      <button
        onClick={() => onSubmit([photoUrl.trim()])}
        disabled={!photoUrl.trim()}
        className="mt-4 w-full h-11 rounded-xl disabled:opacity-50"
        style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}
      >
        متابعة
      </button>
    </Modal>
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
  const { data: bank } = useQuery({ queryKey: ['tech-bank-account'], queryFn: () => api.get<BankAccount>('/technician/bank-account') });
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const didPrefill = useRef(false);

  // Pre-fill IBAN and bank name from the saved bank-account settings screen.
  useEffect(() => {
    if (!bank || didPrefill.current) return;
    didPrefill.current = true;
    if (bank.iban) { setIban(bank.iban); setPrefilled(true); }
    if (bank.bankName) { setBankName(bank.bankName); }
  }, [bank]);

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

/* ---------- Profile / settings tab + sub-screens ---------- */

type ProfileScreen = 'personal-data' | 'services-pricing' | 'bank-account' | 'tech-notifications' | 'tech-support' | null;

function ProfileTab() {
  const [screen, setScreen] = useState<ProfileScreen>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const menuItems: { key: Exclude<ProfileScreen, null>; label: string }[] = [
    { key: 'personal-data', label: 'البيانات الشخصية' },
    { key: 'services-pricing', label: 'الخدمات والأسعار' },
    { key: 'bank-account', label: 'الحساب البنكي' },
    { key: 'tech-notifications', label: 'الإشعارات' },
    { key: 'tech-support', label: 'الدعم' },
  ];

  async function doLogout() {
    setConfirmLogout(false);
    await apiLogout();
    window.location.assign('/');
  }

  return (
    <div>
      <Card>
        {menuItems.map((item) => (
          <button key={item.key} onClick={() => setScreen(item.key)} className="w-full px-4 py-3.5 flex items-center text-start border-b last:border-0 border-slate-100">
            <span className="flex-1" style={{ fontSize: 14, color: '#0F172A', fontWeight: 600 }}>{item.label}</span>
            <ChevronLeft size={16} color="#94A3B8" aria-hidden="true" />
          </button>
        ))}
        <button onClick={() => setConfirmLogout(true)} className="w-full px-4 py-3.5 flex items-center text-start gap-2">
          <LogOut size={16} color="#E5484D" aria-hidden="true" />
          <span className="flex-1" style={{ fontSize: 14, color: '#E5484D', fontWeight: 600 }}>تسجيل الخروج</span>
        </button>
      </Card>

      {screen === 'personal-data' && <PersonalDataModal onClose={() => setScreen(null)} />}
      {screen === 'services-pricing' && <ServicesPricingModal onClose={() => setScreen(null)} />}
      {screen === 'bank-account' && <BankAccountModal onClose={() => setScreen(null)} />}
      {screen === 'tech-notifications' && <NotificationsModal onClose={() => setScreen(null)} />}
      {screen === 'tech-support' && <SupportModal onClose={() => setScreen(null)} />}

      {confirmLogout && (
        <ConfirmDialog
          title="تسجيل الخروج؟"
          body="هل أنت متأكد من تسجيل الخروج؟"
          confirmLabel="تسجيل الخروج"
          onConfirm={() => void doLogout()}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  );
}

/**
 * Name edit. Phone stays read-only (identity anchor). Technicians share the
 * same `User` row as customers, so this reuses the generic PATCH /auth/me
 * that Account.tsx's customer-facing ProfileTab already calls — there is no
 * separate technician-only profile-update endpoint.
 *
 * NOTE: figma's TechPersonalData also shows an email field, but the `User`
 * model has no email column at all (only phone/name/avatarUrl) — there is
 * nothing to read or save, so it's intentionally omitted here rather than
 * wiring an input to a field that doesn't exist.
 */
function PersonalDataModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: meAuth } = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ name: string | null; phone: string }>('/auth/me') });
  const [name, setName] = useState<string | null>(null);
  const nameValue = name ?? meAuth?.name ?? '';

  async function save() {
    try {
      await api.patch('/auth/me', { name: nameValue.trim() || undefined });
      notify('تم الحفظ', 'success');
      void qc.invalidateQueries({ queryKey: ['me'] });
      onClose();
    } catch (e) { notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error'); }
  }

  return (
    <Modal title="البيانات الشخصية" onClose={onClose} variant="sheet" maxWidth="sm">
      <div className="mt-4 space-y-3">
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>الاسم الكامل</label>
          <input value={nameValue} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>رقم الهاتف</label>
          <div className="mt-1 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-4">
            <span style={{ fontFamily: 'Inter', color: '#94A3B8' }} dir="ltr">{meAuth?.phone}</span>
            <span className="ms-2 px-1.5 py-0.5 rounded" style={{ background: '#E2E8F0', color: '#64748B', fontSize: 10, fontWeight: 700 }}>لا يمكن تغييره</span>
          </div>
        </div>
      </div>
      <button onClick={() => void save()} className="mt-5 w-full h-12 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>حفظ التغييرات</button>
    </Modal>
  );
}

/**
 * Services/rate edit after approval (figma TechServicesPricing). Backed by
 * PATCH /technician/services-pricing — a separate, additive path from
 * onboarding's apply() (which locks once APPROVED). Rate is clamped 40-60 JOD
 * client-side to match the server-side validation, mirroring Onboarding's picker.
 */
function ServicesPricingModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ['technician-me'], queryFn: () => api.get<TechnicianProfileMe>('/technician/me') });
  const { data: services } = useServices();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedIds = selected ?? (me?.services ?? []).map((s) => s.id);
  const rateValue = rate ?? String(me?.hourlyRateJod ?? '45');

  function toggle(id: string) {
    setSelected((selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]));
  }

  const rateNum = Number(rateValue);
  const canSave = selectedIds.length > 0 && rateNum >= 40 && rateNum <= 60;

  async function save() {
    setSaving(true);
    try {
      await api.patch('/technician/services-pricing', { serviceIds: selectedIds, hourlyRateJod: rateNum });
      notify('تم حفظ الخدمات والسعر', 'success');
      void qc.invalidateQueries({ queryKey: ['technician-me'] });
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="الخدمات والأسعار" onClose={onClose} variant="sheet" maxWidth="sm">
      {isLoading ? (
        <div className="mt-4"><SkeletonList count={2} rowHeight={48} /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }} className="mb-2">الخدمات</div>
            <div className="grid grid-cols-2 gap-2">
              {(services?.data ?? []).map((s: Service) => (
                <button key={s.id} onClick={() => toggle(s.id)} className="p-3 rounded-xl border-2 flex items-center gap-2 text-start"
                  style={{ borderColor: selectedIds.includes(s.id) ? '#1366D6' : '#E2E8F0', background: selectedIds.includes(s.id) ? '#E8F1FE' : '#FFF' }}>
                  <ServiceIcon nameAr={s.nameAr} size={18} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.nameAr}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>الأجر بالساعة (40–60 دينار)</label>
            <input
              value={rateValue}
              onChange={(ev) => setRate(ev.target.value.replace(/[^\d.]/g, ''))}
              className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4"
              style={{ fontSize: 14, direction: 'ltr' }}
            />
          </div>
          <button onClick={() => void save()} disabled={!canSave || saving} className="w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
            حفظ التغييرات
          </button>
        </div>
      )}
    </Modal>
  );
}

/**
 * Dedicated bank-account screen (figma TechBankAccount), backed by
 * GET/PATCH /technician/bank-account — a real, independently-saved settings
 * screen. The Earnings withdraw form shares the same ['tech-bank-account']
 * query for its default prefill.
 */
function BankAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: bank, isLoading } = useQuery({ queryKey: ['tech-bank-account'], queryFn: () => api.get<BankAccount>('/technician/bank-account') });
  const [iban, setIban] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ibanValue = iban ?? bank?.iban ?? '';
  const bankNameValue = bankName ?? bank?.bankName ?? '';

  async function save() {
    setSaving(true);
    try {
      const data = await api.patch<BankAccount>('/technician/bank-account', { iban: ibanValue.trim(), bankName: bankNameValue.trim() });
      qc.setQueryData(['tech-bank-account'], data);
      notify('تم الحفظ', 'success');
      onClose();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="الحساب البنكي" onClose={onClose} variant="sheet" maxWidth="sm">
      {isLoading ? (
        <div className="mt-4"><SkeletonList count={2} rowHeight={56} /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>اسم البنك</label>
            <input value={bankNameValue} onChange={(ev) => setBankName(ev.target.value)} placeholder="مثال: البنك العربي" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>رقم IBAN</label>
            <input value={ibanValue} onChange={(ev) => setIban(ev.target.value)} aria-label="رقم IBAN" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14, fontFamily: 'Inter' }} dir="ltr" />
          </div>
          <Card className="p-3 flex items-start gap-2" style={{ background: '#E8F1FE' }}>
            <Landmark size={16} color="#1366D6" className="mt-0.5" aria-hidden="true" />
            <p style={{ color: '#0E4FA8', fontSize: 12 }}>يُستخدم هذا الحساب تلقائياً عند طلب سحب الرصيد.</p>
          </Card>
        </div>
      )}
      <button onClick={() => void save()} disabled={!ibanValue.trim() || !bankNameValue.trim() || saving} className="mt-5 w-full h-12 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>حفظ التغييرات</button>
    </Modal>
  );
}

const DEFAULT_NOTIF_PREFS: NotificationPreferences = { newJobRequests: true, reminders: true, earningsUpdates: true, promotions: true };

/** Backed by GET/PATCH /technician/notification-preferences. Each toggle
 *  saves immediately (optimistic update, reverted on failure), matching the
 *  availability toggle's immediate-persist pattern elsewhere in this file. */
function NotificationsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tech-notification-preferences'],
    queryFn: () => api.get<NotificationPreferences>('/technician/notification-preferences'),
  });
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const current = prefs ?? data ?? DEFAULT_NOTIF_PREFS;

  const rows: { key: keyof NotificationPreferences; label: string; sub: string }[] = [
    { key: 'newJobRequests', label: 'طلبات جديدة', sub: 'إشعار فوري عند وصول طلب' },
    { key: 'reminders', label: 'تذكيرات المواعيد', sub: 'قبل الموعد بـ 15 دقيقة' },
    { key: 'earningsUpdates', label: 'تحديثات الأرباح', sub: 'عند استلام مبلغ جديد' },
    { key: 'promotions', label: 'العروض والأخبار', sub: 'نصائح وعروض Fixly' },
  ];

  async function update(key: keyof NotificationPreferences) {
    const previous = current;
    const next = { ...current, [key]: !current[key] };
    setPrefs(next);
    try {
      const saved = await api.patch<NotificationPreferences>('/technician/notification-preferences', { [key]: next[key] });
      setPrefs(saved);
      qc.setQueryData(['tech-notification-preferences'], saved);
    } catch (e) {
      setPrefs(previous);
      notify(e instanceof ApiError ? e.message : 'تعذّر الحفظ', 'error');
    }
  }

  return (
    <Modal title="الإشعارات" onClose={onClose} variant="sheet" maxWidth="sm">
      {isLoading ? (
        <div className="mt-4"><SkeletonList count={4} rowHeight={56} /></div>
      ) : (
        <div className="mt-4">
          {rows.map((r) => (
            <div key={r.key} className="py-3 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                <div style={{ color: '#94A3B8', fontSize: 12 }}>{r.sub}</div>
              </div>
              <button onClick={() => void update(r.key)} role="switch" aria-checked={current[r.key]} aria-label={r.label} className="w-12 h-7 rounded-full relative transition-colors" style={{ background: current[r.key] ? '#1366D6' : '#CBD5E1' }}>
                <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ [current[r.key] ? 'right' : 'left']: 2 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Support screen (figma TechSupport). Reuses the same role-agnostic
 *  /support endpoints the customer side uses (SupportService is tied to the
 *  authenticated user, not a role) — list tickets + open a new one. */
function SupportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: tickets } = useQuery({ queryKey: ['support'], queryFn: () => api.get<SupportTicketItem[]>('/support') });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '' });

  async function create() {
    try {
      await api.post('/support', { subject: form.subject.trim(), body: form.body.trim() });
      notify('تم إرسال بلاغك — الرد خلال 5 دقائق', 'success');
      setCreating(false); setForm({ subject: '', body: '' });
      void qc.invalidateQueries({ queryKey: ['support'] });
    } catch (e) { notify(e instanceof ApiError ? e.message : 'خطأ', 'error'); }
  }

  return (
    <Modal title="الدعم والمساعدة" onClose={onClose} variant="sheet" maxWidth="sm">
      <div className="mt-4 space-y-3">
        <Card className="p-4 flex items-center gap-3" style={{ background: 'linear-gradient(95deg,#1366D6 0%,#0E4FA8 100%)' }}>
          <LifeBuoy size={24} color="#FFF" aria-hidden="true" />
          <div>
            <div style={{ color: '#FFF', fontWeight: 700, fontSize: 15 }}>دعم الفنيين 24/7</div>
            <div style={{ color: '#CFE0FB', fontSize: 12 }}>الرد خلال 5 دقائق</div>
          </div>
        </Card>

        {(tickets ?? []).map((t) => (
          <Card key={t.id} className="p-3">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t.subject}</div>
            <div style={{ color: '#475569', fontSize: 12 }}>{t.status === 'OPEN' ? 'مفتوح' : t.status === 'IN_PROGRESS' ? 'قيد المعالجة' : 'مغلق'}</div>
          </Card>
        ))}

        {creating ? (
          <Card className="p-4 space-y-2">
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="الموضوع" aria-label="موضوع تذكرة الدعم" className="w-full h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="صف المشكلة (عميل · دفع · أخرى)" aria-label="وصف مشكلة الدعم" rows={3} className="w-full rounded-xl border border-slate-200 p-3" style={{ fontSize: 14 }} />
            <div className="flex gap-2">
              <button onClick={() => void create()} disabled={!form.subject.trim() || !form.body.trim()} className="flex-1 h-11 rounded-xl disabled:opacity-50" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إرسال</button>
              <button onClick={() => setCreating(false)} className="px-4 h-11 rounded-xl" style={{ color: '#475569' }}>إلغاء</button>
            </div>
          </Card>
        ) : (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1 px-4 h-11 rounded-xl" style={{ background: '#E8F1FE', color: '#0E4FA8', fontWeight: 600, fontSize: 14 }}>
            <Plus size={16} aria-hidden="true" /> الإبلاغ عن مشكلة
          </button>
        )}
      </div>
    </Modal>
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
        <span style={{ color: '#94A3B8', fontSize: 11 }}>{doneKeys.size} / {CERT_STEPS.length}</span>
      </div>
      {CERT_STEPS.map((st, i) => {
        const done = doneKeys.has(st.key);
        const active = i === currentIdx;
        const color = done ? '#15803D' : active ? '#1366D6' : '#94A3B8';
        return (
          <div key={st.key} className="flex items-center gap-3 py-1.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: done ? '#DCFCE7' : active ? '#E8F1FE' : '#F1F5F9', color }}>
              {done ? '✓' : i + 1}
            </div>
            <span className="flex-1" style={{ fontSize: 13, fontWeight: active || done ? 700 : 500, color: done || active ? '#0F172A' : '#94A3B8' }}>{st.ar}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color }}>{done ? 'مكتمل' : active ? 'الحالي' : 'قيد الانتظار'}</span>
          </div>
        );
      })}
      <p className="mt-2 pt-2 border-t border-slate-100" style={{ color: '#94A3B8', fontSize: 11 }}>
        بعد إرسال الطلب ومراجعته: سيتم التواصل معك لتحديد موعد مقابلة، ثم اختبار عملي وتدريب قصير على إجراءات السلامة، تليها فترة تجربة (أول 10 طلبات) قبل الاعتماد الكامل.
      </p>
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
      <div className="flex items-center gap-2"><Wrench size={24} color="#1366D6" /><h1 style={{ fontWeight: 800, fontSize: 24 }}>انضم كفني</h1></div>
      <p className="mt-2" style={{ color: '#475569', fontSize: 14 }}>اختر الخدمات التي تقدّمها وحدّد سعرك بالساعة.</p>

      <CertStepper kycDone={!!idDocUrl.trim() && !!selfieUrl.trim()} docsDone={!!certificateUrl.trim()} />

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

      <h2 className="mt-4" style={{ fontWeight: 700, fontSize: 16 }}>فيديو تعريفي (اختياري)</h2>
      <input value={introVideoUrl} onChange={(e) => setIntroVideoUrl(e.target.value)} placeholder="رابط الفيديو التعريفي" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-4" style={{ fontSize: 14, direction: 'ltr' }} />

      <label className="mt-5 flex items-start gap-2">
        <input type="checkbox" checked={agreementAccepted} onChange={(e) => setAgreementAccepted(e.target.checked)} className="mt-1" />
        <span style={{ fontSize: 13, color: '#475569' }}>أوافق على اتفاقية المتعاقدين وقواعد السلوك</span>
      </label>

      <button onClick={() => void submit()} disabled={selected.length === 0 || Number(rate) < 40 || Number(rate) > 60 || !agreementAccepted}
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
