import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, Pagination, notify } from '../components/shared';

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
const TIER_COLOR: Record<string, string> = { PROBATION: '#B45309', VERIFIED: '#0E4FA8', PRO: '#7C3AED', ELITE: '#15803D' };
const BG_LABEL: Record<string, string> = { PENDING: 'معلّق', PASSED: 'اجتاز', FAILED: 'فشل' };

export default function Quality() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-quality', page],
    queryFn: () => api.list<QualityTech>(`/admin/quality/techs?limit=${limit}&offset=${page * limit}`),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin-quality'] });

  const setTier = useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) => api.post(`/admin/technicians/${id}/trust-tier`, { tier }),
    onSuccess: () => { notify('تم تحديث الفئة', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const bgCheck = useMutation({
    mutationFn: ({ id, result }: { id: string; result: 'PASSED' | 'FAILED' }) => api.post(`/admin/technicians/${id}/bg-check`, { result }),
    onSuccess: () => { notify('تم تسجيل نتيجة الفحص', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const skills = useMutation({
    mutationFn: (id: string) => api.post(`/admin/technicians/${id}/skills-test`),
    onSuccess: () => { notify('تم اعتماد الاختبار', 'success'); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>الجودة والثقة</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>فئات الثقة، فحص الخلفية، اختبار المهارات، وبلاغات السلوك.</p>
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل البيانات" />}
        {!isLoading && !isError && items.length === 0 && <EmptyState message="لا يوجد فنيون" />}
        {!isLoading && !isError && items.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>الفني</Th><Th>الفئة</Th><Th>الخلفية</Th><Th>المهارات</Th><Th>التقييم</Th><Th>مهام</Th><Th>بلاغات</Th><Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <Td>{t.user?.name ?? '—'}</Td>
                  <Td>
                    <select
                      value={t.trustTier}
                      onChange={(e) => setTier.mutate({ id: t.id, tier: e.target.value })}
                      disabled={setTier.isPending}
                      style={{ color: TIER_COLOR[t.trustTier], fontWeight: 700, fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 8, padding: '4px 6px', background: '#FFF' }}
                    >
                      {TIERS.map((tier) => <option key={tier} value={tier}>{TIER_LABEL[tier]}</option>)}
                    </select>
                  </Td>
                  <Td>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.bgCheckStatus === 'PASSED' ? '#15803D' : t.bgCheckStatus === 'FAILED' ? '#B91C1C' : '#B45309' }}>{BG_LABEL[t.bgCheckStatus]}</span>
                    <div className="flex gap-1 mt-1">
                      <button onClick={() => bgCheck.mutate({ id: t.id, result: 'PASSED' })} disabled={bgCheck.isPending} className="px-2 rounded" style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11, fontWeight: 600 }}>اجتاز</button>
                      <button onClick={() => bgCheck.mutate({ id: t.id, result: 'FAILED' })} disabled={bgCheck.isPending} className="px-2 rounded" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 11, fontWeight: 600 }}>فشل</button>
                    </div>
                  </Td>
                  <Td>
                    {t.skillsTestPassedAt
                      ? <span style={{ color: '#15803D', fontSize: 12, fontWeight: 600 }}>مُعتمد</span>
                      : <button onClick={() => skills.mutate(t.id)} disabled={skills.isPending} className="px-2 rounded" style={{ background: '#E8F1FE', color: '#0E4FA8', fontSize: 11, fontWeight: 600 }}>اعتماد</button>}
                  </Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{Number(t.rating).toFixed(1)} ({t.totalReviews})</span></Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{t.jobsCompleted}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter', fontWeight: 700, color: t.offPlatformFlags > 0 ? '#B91C1C' : '#94A3B8' }}>{t.offPlatformFlags}</span></Td>
                  <Td><span style={{ fontSize: 12, color: t.status === 'SUSPENDED' ? '#B91C1C' : '#64748B' }}>{t.status === 'SUSPENDED' ? 'موقوف' : t.isInsured ? 'مؤمَّن' : '—'}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
      </Card>
    </div>
  );
}
