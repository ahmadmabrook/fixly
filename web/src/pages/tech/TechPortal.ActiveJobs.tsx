import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api, BookingListItem } from '../../lib/api';
import { Card, ServiceIcon, StatusBadge, Modal, ConfirmDialog, notify } from '../../components/shared';

const NEXT_STATUS: Record<string, { to: string; label: string }> = {
  CONFIRMED: { to: 'EN_ROUTE', label: 'بدء التوجه' },
  EN_ROUTE: { to: 'ARRIVED', label: 'وصلت' },
  ARRIVED: { to: 'IN_PROGRESS', label: 'بدء الخدمة' },
};

export function ActiveJobs() {
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
