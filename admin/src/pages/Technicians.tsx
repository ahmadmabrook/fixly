import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Search, FileText, PlayCircle } from 'lucide-react';
import { api, TechnicianItem, TechnicianDetail, TechnicianScorecard } from '../lib/api';
import { Card, Avatar, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify, Pagination, OpsStatTile, Pill } from '../components/shared';

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['PENDING', 'قيد المراجعة'], ['APPROVED', 'موثّق'], ['REJECTED', 'مرفوض'], ['SUSPENDED', 'موقوف'],
];

const STATUS_LABEL: Record<string, { ar: string; bg: string; fg: string }> = {
  PENDING: { ar: 'قيد المراجعة', bg: '#FEF3C7', fg: '#B45309' },
  APPROVED: { ar: 'موثّق', bg: '#DCFCE7', fg: '#15803D' },
  REJECTED: { ar: 'مرفوض', bg: '#FEE2E2', fg: '#B91C1C' },
  SUSPENDED: { ar: 'موقوف', bg: '#FEE2E2', fg: '#B91C1C' },
};

export default function Technicians() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const limit = 50;
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-technicians', statusFilter, page, search],
    queryFn: () => api.list<TechnicianItem>(`/technicians?${statusFilter ? `status=${statusFilter}&` : ''}${search ? `search=${encodeURIComponent(search)}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const verify = useMutation({
    mutationFn: (id: string) => api.post<TechnicianItem>(`/technicians/${id}/verify`),
    onSuccess: () => {
      notify('تم توثيق الفني بنجاح', 'success');
      void qc.invalidateQueries({ queryKey: ['admin-technicians'] });
    },
    onError: () => notify('فشل توثيق الفني', 'error'),
  });

  const technicians = data?.items ?? [];
  const total = data?.total ?? 0;

  function statusOf(t: TechnicianItem): string {
    return t.status ?? (t.isVerified ? 'APPROVED' : 'PENDING');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>الفنيون</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            إدارة وتوثيق الفنيين المسجلين {total > 0 && <>— <span style={{ color: '#1366D6' }}>{total.toLocaleString('ar-JO')}</span> إجمالي</>}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg" style={{ background: '#F1F5F9', width: 260 }}>
          <Search size={16} color="#94A3B8" />
          <input
            value={search}
            onChange={(e) => {
              setPage(0);
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set('search', e.target.value); else next.delete('search');
              setSearchParams(next);
            }}
            className="flex-1 bg-transparent outline-none"
            placeholder="بحث بالاسم أو رقم الهاتف..."
            style={{ fontSize: 13 }}
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatusFilter(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: statusFilter === k ? '#1366D6' : '#FFF', color: statusFilter === k ? '#FFF' : '#475569', fontSize: 13, fontWeight: 600, border: '1px solid #E2E8F0' }}>{label}</button>
        ))}
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل الفنيين" />}
        {!isLoading && !isError && technicians.length === 0 && <EmptyState message="لا يوجد فنيون" />}
        {!isLoading && !isError && technicians.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>الفني</Th><Th>الجوال</Th><Th>التقييم</Th><Th>عدد التقييمات</Th><Th>الحالة</Th><Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((t) => {
                const st = statusOf(t);
                const sl = STATUS_LABEL[st] ?? { ar: st, bg: '#F1F5F9', fg: '#475569' };
                return (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <button className="flex items-center gap-2" onClick={() => setDetailId(t.id)}>
                        <Avatar name={t.user.name} size={36} />
                        <span style={{ fontWeight: 600, color: '#1366D6' }}>{t.user.name ?? t.user.phone ?? '—'}</span>
                      </button>
                    </Td>
                    <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{t.user.phone ?? '—'}</span></Td>
                    <Td><span style={{ fontFamily: 'Inter', fontWeight: 600 }}>{t.rating != null ? Number(t.rating).toFixed(1) : '—'}</span></Td>
                    <Td><span style={{ fontFamily: 'Inter' }}>{t.totalReviews ?? 0}</span></Td>
                    <Td>
                      {st === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1"><Pill label="موثّق" bg={sl.bg} fg={sl.fg} /> <BadgeCheck size={14} color="#15803D" aria-hidden="true" /></span>
                      ) : (
                        <Pill label={sl.ar} bg={sl.bg} fg={sl.fg} />
                      )}
                    </Td>
                    <Td>
                      <div className="flex gap-2">
                        {!t.isVerified && st !== 'SUSPENDED' && (
                          <ActionBtn onClick={() => setConfirmId(t.id)} disabled={verify.isPending} data-testid={`verify-btn-${t.id}`}>توثيق</ActionBtn>
                        )}
                        <button onClick={() => setDetailId(t.id)} className="px-3 rounded-lg" style={{ border: '1px solid #CBD5E1', color: '#475569', fontSize: 12, fontWeight: 600 }}>تفاصيل</button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={total} limit={limit} onPage={setPage} />
      </Card>

      <ConfirmDialog
        open={confirmId !== null}
        title="تأكيد توثيق الفني"
        body="سيتم منح الفني صلاحية استقبال الحجوزات. لا يمكن التراجع عن هذا الإجراء إلا بتعطيل الحساب يدوياً."
        confirmLabel="توثيق"
        cancelLabel="إلغاء"
        onConfirm={() => { if (confirmId) verify.mutate(confirmId); setConfirmId(null); }}
        onCancel={() => setConfirmId(null)}
      />

      {detailId && <DetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={() => { setDetailId(null); void qc.invalidateQueries({ queryKey: ['admin-technicians'] }); }} />}
    </div>
  );
}

function DetailDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: t, isLoading, isError } = useQuery({ queryKey: ['admin-technician', id], queryFn: () => api.get<TechnicianDetail>(`/technicians/${id}`) });
  const { data: scorecard } = useQuery({
    queryKey: ['admin-technician-scorecard', id],
    queryFn: () => api.get<TechnicianScorecard>(`/technicians/${id}/scorecard`),
    enabled: !!t,
  });
  const [reason, setReason] = useState('');
  // Pending confirmation for a destructive technician action (reject / suspend / reinstate).
  const [confirmAction, setConfirmAction] = useState<'reject' | 'suspend' | 'reinstate' | null>(null);
  const reject = useMutation({
    mutationFn: () => api.post(`/technicians/${id}/reject`, { reason: reason.trim() }),
    onSuccess: () => { notify('تم رفض الفني', 'success'); onChanged(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const suspend = useMutation({
    mutationFn: () => api.post(`/technicians/${id}/suspend`, { reason: reason.trim() }),
    onSuccess: () => { notify('تم إيقاف الفني', 'success'); onChanged(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const reinstate = useMutation({
    mutationFn: () => api.post(`/technicians/${id}/reinstate`),
    onSuccess: () => { notify('تم إعادة تفعيل الفني', 'success'); onChanged(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const docs: Array<[string, string | null | undefined]> = t
    ? [['الهوية', t.idDocUrl], ['الشهادة', t.certificateUrl], ['صورة شخصية', t.selfieUrl]]
    : [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="h-full bg-white overflow-auto" style={{ width: 460 }} onClick={(e) => e.stopPropagation()} dir="rtl">
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل بيانات الفني" />}
        {t && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={t.user.name} size={48} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{t.user.name ?? 'بدون اسم'}</div>
                <div style={{ color: '#64748B', fontSize: 13, fontFamily: 'Inter' }}>{t.user.phone}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <OpsStatTile label="التقييم" value={Number(t.rating) > 0 ? Number(t.rating).toFixed(1) : '—'} />
              <OpsStatTile label="المهام" value={t.jobsCompleted ?? 0} />
              <OpsStatTile label="البلاغات" value={t.offPlatformFlags ?? 0} />
            </div>
            <div style={{ fontSize: 14 }}>
              <div><span style={{ color: '#64748B' }}>السعر/ساعة:</span> {t.hourlyRateJod != null ? `${Number(t.hourlyRateJod)} دينار` : '—'}</div>
              <div><span style={{ color: '#64748B' }}>المركبة:</span> {t.vehicle ?? '—'}</div>
              <div><span style={{ color: '#64748B' }}>عدد التقييمات:</span> {t.totalReviews}</div>
            </div>
            {scorecard && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>بطاقة الأداء</div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: 13 }}>
                  <div><span style={{ color: '#64748B' }}>الالتزام بالوقت:</span> {Math.round(scorecard.onTimeRate)}%</div>
                  <div><span style={{ color: '#64748B' }}>إعادة/ضمان:</span> {Math.round(scorecard.redoRate)}%</div>
                  <div><span style={{ color: '#64748B' }}>الشكاوى:</span> {Math.round(scorecard.complaintRate)}%</div>
                  <div><span style={{ color: '#64748B' }}>معدل القبول:</span> {Math.round(scorecard.acceptanceRate)}%</div>
                </div>
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>الخدمات</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {t.services.map((s) => <span key={s.id} className="px-2 py-1 rounded-full" style={{ background: '#E8F1FE', color: '#0E4FA8', fontSize: 12 }}>{s.nameAr}</span>)}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>المستندات</div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {docs.map(([label, url]) => (
                  url ? (
                    <a key={label} href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-100 hover:bg-slate-200 flex flex-col items-center justify-center gap-1" style={{ aspectRatio: '3 / 4' }}>
                      <FileText size={22} color="#475569" />
                      <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
                    </a>
                  ) : (
                    <div key={label} className="rounded-lg bg-slate-50 flex flex-col items-center justify-center gap-1" style={{ aspectRatio: '3 / 4' }}>
                      <FileText size={22} color="#CBD5E1" />
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>{label}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
            {t.introVideoUrl && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>الفيديو التعريفي</div>
                <a href={t.introVideoUrl} target="_blank" rel="noreferrer" aria-label="تشغيل الفيديو التعريفي" className="mt-1 w-full aspect-video rounded-lg flex items-center justify-center" style={{ background: '#0F172A' }}>
                  <PlayCircle size={36} color="#FFF" />
                </a>
              </div>
            )}
            {t.recentReviews.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>آخر التقييمات</div>
                {t.recentReviews.map((r) => (
                  <div key={r.id} className="mt-1 p-2 rounded-lg" style={{ background: '#F8FAFC', fontSize: 13 }}>
                    <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{r.rating}★</span> {r.comment} <span style={{ color: '#94A3B8' }}>— {r.reviewer.name}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t" style={{ borderColor: '#F1F5F9' }}>
              <label className="block" style={{ fontSize: 13, color: '#64748B' }}>سبب الرفض/الإيقاف</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 p-2" style={{ fontSize: 14 }} />
              <div className="mt-2 flex gap-2">
                {t.status !== 'REJECTED' && t.status !== 'APPROVED' && (
                  <button onClick={() => setConfirmAction('reject')} disabled={!reason.trim() || reject.isPending} data-testid="reject-tech-btn" className="px-4 h-9 rounded-lg disabled:opacity-50" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>رفض</button>
                )}
                {t.status === 'APPROVED' && (
                  <button onClick={() => setConfirmAction('suspend')} disabled={!reason.trim() || suspend.isPending} data-testid="suspend-tech-btn" className="px-4 h-9 rounded-lg disabled:opacity-50" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>إيقاف</button>
                )}
                {t.status === 'SUSPENDED' && (
                  <button onClick={() => setConfirmAction('reinstate')} disabled={reinstate.isPending} data-testid="reinstate-tech-btn" className="px-4 h-9 rounded-lg disabled:opacity-50" style={{ background: '#DCFCE7', color: '#15803D', fontSize: 12, fontWeight: 600 }}>إعادة تفعيل</button>
                )}
                <button onClick={onClose} className="px-4 h-9 rounded-lg" style={{ color: '#64748B', fontSize: 12 }}>إغلاق</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === 'reject' ? 'تأكيد رفض الفني' : confirmAction === 'suspend' ? 'تأكيد إيقاف الفني' : 'تأكيد إعادة تفعيل الفني'}
        body={
          confirmAction === 'reject'
            ? 'سيتم رفض طلب التحاق الفني ولن يتمكن من استقبال الحجوزات.'
            : confirmAction === 'suspend'
              ? 'سيتم إيقاف حساب الفني فوراً ولن يتمكن من استقبال حجوزات جديدة.'
              : 'سيتم إعادة تفعيل حساب الفني وسيتمكن من استقبال حجوزات جديدة بعد أن يفعّل حالة التوفر بنفسه.'
        }
        confirmLabel={confirmAction === 'reject' ? 'رفض' : confirmAction === 'suspend' ? 'إيقاف' : 'إعادة تفعيل'}
        cancelLabel="إلغاء"
        confirmVariant={confirmAction === 'reinstate' ? 'primary' : 'danger'}
        onConfirm={() => {
          if (confirmAction === 'reject') reject.mutate();
          else if (confirmAction === 'suspend') suspend.mutate();
          else if (confirmAction === 'reinstate') reinstate.mutate();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
