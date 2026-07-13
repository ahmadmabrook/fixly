import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, TechnicianScorecard } from '../lib/api';
import { Card, Avatar, Spinner, EmptyState, ConfirmDialog, notify, OpsStatTile, Pill } from '../components/shared';
import {
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_BRAND_PRIMARY_DARK,
  COLOR_BRAND_PRIMARY_TINT,
  COLOR_NEUTRAL_FAINT,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_DANGER_BG,
  COLOR_STATUS_INFO_BG,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_SUCCESS_BG,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_MUTED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SUBTLE,
  COLOR_TIER_PRO,
  COLOR_TIER_PRO_BG,
  COLOR_WHITE,
} from '../lib/theme';

interface QualityTech {
  id: string;
  trustTier: 'PROBATION' | 'VERIFIED' | 'PRO' | 'ELITE';
  bgCheckStatus: 'PENDING' | 'PASSED' | 'FAILED';
  skillsTestPassedAt: string | null;
  isInsured: boolean;
  rating: string | number;
  totalReviews: number;
  jobsCompleted: number;
  offPlatformFlags: number;
  status: string;
  user?: { name?: string | null; phone?: string | null };
}

const TIERS = ['PROBATION', 'VERIFIED', 'PRO', 'ELITE'] as const;
const TIER_LABEL: Record<string, string> = { PROBATION: 'تحت التجربة', VERIFIED: 'موثّق', PRO: 'محترف', ELITE: 'نخبة' };
const TIER_COLOR: Record<string, string> = { PROBATION: COLOR_STATUS_WARNING, VERIFIED: COLOR_BRAND_PRIMARY, PRO: COLOR_TIER_PRO, ELITE: COLOR_STATUS_SUCCESS };
const TIER_BG: Record<string, string> = { PROBATION: COLOR_STATUS_WARNING_BG, VERIFIED: COLOR_STATUS_INFO_BG, PRO: COLOR_TIER_PRO_BG, ELITE: COLOR_STATUS_SUCCESS_BG };
const BG_LABEL: Record<string, string> = { PENDING: 'معلّق', PASSED: 'اجتاز', FAILED: 'فشل' };

export default function Quality() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const qc = useQueryClient();

  // The kanban board shows every technician at once (no pagination — a board
  // is meant to be scanned as a whole); 200 is the list endpoints' max limit.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-quality'],
    queryFn: () => api.list<QualityTech>('/quality/techs?limit=200'),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin-quality'] });

  const setTier = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) => api.post(`/technicians/${id}/trust-tier`, { tier }),
    onSuccess: () => { notify('تم تحديث الفئة', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const bgCheck = useMutation({
    mutationFn: ({ id, result }: { id: string; result: 'PASSED' | 'FAILED' }) => api.post(`/technicians/${id}/bg-check`, { result }),
    onSuccess: () => { notify('تم تسجيل نتيجة الفحص', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const skills = useMutation({
    mutationFn: (id: string) => api.post(`/technicians/${id}/skills-test`),
    onSuccess: () => { notify('تم اعتماد الاختبار', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const items = data?.items ?? [];
  const detailTech = items.find((t) => t.id === detailId) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>الجودة والثقة</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>فئات الثقة، فحص الخلفية، اختبار المهارات، وبلاغات السلوك.</p>
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل البيانات" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا يوجد فنيون" /></Card>}

      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((tier) => {
            const col = items.filter((t) => t.trustTier === tier);
            return (
              <Card key={tier} className="p-3">
                <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                  <Pill label={TIER_LABEL[tier]} bg={TIER_BG[tier]} fg={TIER_COLOR[tier]} />
                  <span style={{ marginInlineStart: 'auto', fontSize: 12, color: COLOR_TEXT_SUBTLE }}>{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setDetailId(t.id)}
                      data-testid={`quality-card-${t.id}`}
                      className="w-full text-start p-2 rounded-lg hover:bg-slate-50 transition-colors"
                      style={{ border: `1px solid ${COLOR_SURFACE_MUTED}` }}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={t.user?.name ?? '—'} size={28} />
                        <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: COLOR_TEXT_PRIMARY }}>{t.user?.name ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 6, fontSize: 11, color: COLOR_TEXT_MUTED }}>
                        <span style={{ fontFamily: 'Inter' }}>{Number(t.rating).toFixed(1)}★</span>
                        <span>·</span>
                        <span>{t.jobsCompleted} مهمة</span>
                        {t.offPlatformFlags > 0 && (
                          <span style={{ color: COLOR_STATUS_DANGER, fontWeight: 700 }}>بلاغات: {t.offPlatformFlags}</span>
                        )}
                      </div>
                    </button>
                  ))}
                  {col.length === 0 && (
                    <div className="text-center" style={{ padding: '16px 0', fontSize: 12, color: COLOR_NEUTRAL_FAINT }}>فارغ</div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {detailTech && (
        <QualityDrawer
          tech={detailTech}
          onClose={() => setDetailId(null)}
          onSetTier={(tier) => setTier.mutate({ id: detailTech.id, tier })}
          setTierPending={setTier.isPending}
          onBgCheck={(result) => bgCheck.mutate({ id: detailTech.id, result })}
          bgCheckPending={bgCheck.isPending}
          onSkills={() => skills.mutate(detailTech.id)}
          skillsPending={skills.isPending}
        />
      )}
    </div>
  );
}

function QualityDrawer({
  tech,
  onClose,
  onSetTier,
  setTierPending,
  onBgCheck,
  bgCheckPending,
  onSkills,
  skillsPending,
}: {
  tech: QualityTech;
  onClose: () => void;
  onSetTier: (tier: string) => void;
  setTierPending: boolean;
  onBgCheck: (result: 'PASSED' | 'FAILED') => void;
  bgCheckPending: boolean;
  onSkills: () => void;
  skillsPending: boolean;
}) {
  const { data: scorecard } = useQuery({
    queryKey: ['admin-technician-scorecard', tech.id],
    queryFn: () => api.get<TechnicianScorecard>(`/technicians/${tech.id}/scorecard`),
  });
  const [pendingTier, setPendingTier] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="h-full bg-white overflow-auto" style={{ width: 460 }} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={tech.user?.name ?? '—'} size={48} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{tech.user?.name ?? '—'}</div>
              <div style={{ color: COLOR_TEXT_MUTED, fontSize: 13, fontFamily: 'Inter' }}>{tech.user?.phone ?? '—'}</div>
              <div className="mt-1"><Pill label={TIER_LABEL[tech.trustTier]} bg={TIER_BG[tech.trustTier]} fg={TIER_COLOR[tech.trustTier]} /></div>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>فئة الثقة</div>
            <select
              value={tech.trustTier}
              onChange={(e) => setPendingTier(e.target.value)}
              disabled={setTierPending}
              className="mt-1"
              style={{ color: TIER_COLOR[tech.trustTier], fontWeight: 700, fontSize: 13, border: `1px solid ${COLOR_BORDER_LIGHT}`, borderRadius: 8, padding: '6px 8px', background: COLOR_WHITE }}
            >
              {TIERS.map((tier) => <option key={tier} value={tier}>{TIER_LABEL[tier]}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>فحص الخلفية</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: tech.bgCheckStatus === 'PASSED' ? COLOR_STATUS_SUCCESS : tech.bgCheckStatus === 'FAILED' ? COLOR_STATUS_DANGER : COLOR_STATUS_WARNING }}>
              {BG_LABEL[tech.bgCheckStatus]}
            </span>
            <div className="flex gap-1 mt-1">
              <button onClick={() => onBgCheck('PASSED')} disabled={bgCheckPending} className="px-2 rounded" style={{ background: COLOR_STATUS_SUCCESS_BG, color: COLOR_STATUS_SUCCESS, fontSize: 11, fontWeight: 600 }}>اجتاز</button>
              <button onClick={() => onBgCheck('FAILED')} disabled={bgCheckPending} className="px-2 rounded" style={{ background: COLOR_STATUS_DANGER_BG, color: COLOR_STATUS_DANGER, fontSize: 11, fontWeight: 600 }}>فشل</button>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>اختبار المهارات</div>
            {tech.skillsTestPassedAt
              ? <span style={{ color: COLOR_STATUS_SUCCESS, fontSize: 12, fontWeight: 600 }}>مُعتمد</span>
              : <button onClick={onSkills} disabled={skillsPending} className="px-2 rounded" style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontSize: 11, fontWeight: 600 }}>اعتماد</button>}
          </div>

          {scorecard && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>بطاقة الأداء</div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: 13 }}>
                <div><span style={{ color: COLOR_TEXT_MUTED }}>الالتزام بالوقت:</span> {Math.round(scorecard.onTimeRate)}%</div>
                <div><span style={{ color: COLOR_TEXT_MUTED }}>إعادة/ضمان:</span> {Math.round(scorecard.redoRate)}%</div>
                <div><span style={{ color: COLOR_TEXT_MUTED }}>الشكاوى:</span> {Math.round(scorecard.complaintRate)}%</div>
                <div><span style={{ color: COLOR_TEXT_MUTED }}>معدل القبول:</span> {Math.round(scorecard.acceptanceRate)}%</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <OpsStatTile label="التقييم" value={Number(tech.rating) > 0 ? Number(tech.rating).toFixed(1) : '—'} />
            <OpsStatTile label="المهام" value={tech.jobsCompleted} />
            <OpsStatTile label="البلاغات" value={tech.offPlatformFlags} />
          </div>
          <div style={{ fontSize: 14 }}>
            <div><span style={{ color: COLOR_TEXT_MUTED }}>عدد التقييمات:</span> {tech.totalReviews}</div>
            <div><span style={{ color: COLOR_TEXT_MUTED }}>الحالة:</span> {tech.status === 'SUSPENDED' ? 'موقوف' : tech.isInsured ? 'مؤمَّن' : '—'}</div>
          </div>

          <div className="pt-2 border-t" style={{ borderColor: COLOR_SURFACE_MUTED }}>
            <button onClick={onClose} className="px-4 h-9 rounded-lg" style={{ color: COLOR_TEXT_MUTED, fontSize: 12 }}>إغلاق</button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingTier !== null}
        title="تأكيد تغيير فئة الثقة"
        body={pendingTier ? `سيتم نقل الفني إلى فئة "${TIER_LABEL[pendingTier]}". قد يؤثر هذا على أولوية توزيع الحجوزات.` : undefined}
        confirmLabel="تأكيد"
        cancelLabel="إلغاء"
        onConfirm={() => { if (pendingTier) onSetTier(pendingTier); setPendingTier(null); }}
        onCancel={() => setPendingTier(null)}
      />
    </div>
  );
}
