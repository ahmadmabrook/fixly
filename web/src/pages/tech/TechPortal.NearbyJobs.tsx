import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { api, NearbyJob } from '../../lib/api';
import { useCountdown } from '../../hooks/useCountdown';
import { Card, ServiceIcon, Modal, notify } from '../../components/shared';
import { REALTIME_POLL_INTERVAL_MS } from '../../lib/constants';
import { COLOR_BORDER, COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_ERROR_BORDER, COLOR_ERROR_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_WARNING_TEXT, COLOR_WHITE } from '../../lib/theme';

export function NearbyJobs({ onAccepted }: { onAccepted: () => void }) {
  const qc = useQueryClient();
  // Poll at 30s (was 15s) to cut backend load; the address is only revealed
  // after accepting, so list rows show distance + price only.
  const { data: jobs } = useQuery({ queryKey: ['tech-jobs'], queryFn: () => api.get<NearbyJob[]>('/technician/jobs'), refetchInterval: REALTIME_POLL_INTERVAL_MS });
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
      {(jobs ?? []).length === 0 && <p style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>لا توجد طلبات قريبة حالياً.</p>}
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
            <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 12 }}>{j.distanceKm != null ? <>على بُعد <span style={{ fontFamily: 'Inter' }}>{j.distanceKm}</span> كم</> : 'قريب منك'}</div>
          </div>
          <span style={{ fontWeight: 700, color: COLOR_BRAND_PRIMARY_DARK }}><span style={{ fontFamily: 'Inter' }}>{Number(j.totalJod)}</span> دينار</span>
        </div>
      </button>
      {/* Countdown timer */}
      {remaining != null && (
        <div className="mt-2 flex items-center gap-1" style={{ fontSize: 13, fontWeight: 600, color: expired ? COLOR_ERROR_TEXT : COLOR_WARNING_TEXT, fontFamily: 'Inter' }}>
          <span aria-hidden="true">&#9201;</span>
          {expired ? <span style={{ fontFamily: 'Tajawal' }}>انتهت المهلة</span> : formatTime(remaining)}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onDetails} className="h-11 rounded-xl" style={{ border: `1px solid ${COLOR_BORDER}`, color: COLOR_TEXT_SECONDARY, fontWeight: 700 }}>تفاصيل</button>
        <button onClick={onAccept} disabled={expired} className="h-11 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
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
          {job.service?.durationMin != null && <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }}>المدة التقديرية: {job.service.durationMin} دقيقة</div>}
        </div>
      </div>
      <Card className="mt-3 p-3 flex items-center gap-2">
        <MapPin size={16} color={COLOR_TEXT_SECONDARY} aria-hidden="true" />
        <span style={{ fontSize: 13 }}>
          {job.distanceKm != null ? <>على بُعد <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{job.distanceKm}</span> كم — يظهر العنوان الكامل بعد القبول</> : 'يظهر العنوان الكامل بعد القبول'}
        </span>
      </Card>
      <Card className="mt-3 p-3 flex items-center justify-between">
        <span style={{ fontSize: 14, fontWeight: 700 }}>سعر الخدمة</span>
        <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 18, color: COLOR_BRAND_PRIMARY_DARK }}>{Number(job.totalJod)} دينار</span>
      </Card>
      {remaining != null && !expired && (
        <p className="mt-2 text-center" style={{ color: COLOR_WARNING_TEXT, fontSize: 12, fontWeight: 600 }}>
          اقبل خلال <span style={{ fontFamily: 'Inter' }}>{Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, '0')}</span>
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onReject} className="h-12 rounded-xl" style={{ border: `1px solid ${COLOR_ERROR_BORDER}`, color: COLOR_ERROR_TEXT, fontWeight: 700 }}>رفض</button>
        <button onClick={onAccept} disabled={expired} className="h-12 rounded-xl disabled:opacity-50" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
          {expired ? 'انتهت المهلة' : 'قبول'}
        </button>
      </div>
    </Modal>
  );
}
