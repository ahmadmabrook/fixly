import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, DEFAULT_PAGE_SIZE } from '../lib/api';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify, Pagination, Pill } from '../components/shared';
import {
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_DANGER_BG,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_MUTED,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_SUBTLE,
  COLOR_WHITE,
} from '../lib/theme';

interface ConductItem {
  id: string;
  kind: string;
  details: string | null;
  status: 'OPEN' | 'REVIEWING' | 'UPHELD' | 'DISMISSED';
  createdAt: string;
  reporter?: { name?: string | null; phone?: string | null };
  subjectTech?: { id: string; user?: { name?: string | null } } | null;
}

const STATUS_TABS: ReadonlyArray<readonly [string, string]> = [
  ['', 'الكل'], ['OPEN', 'مفتوح'], ['UPHELD', 'مؤكد'], ['DISMISSED', 'مرفوض'],
];
const STATUS_PILL: Record<string, { ar: string; bg: string; fg: string }> = {
  OPEN: { ar: 'مفتوح', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  REVIEWING: { ar: 'قيد المراجعة', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
  UPHELD: { ar: 'مؤكد', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
  DISMISSED: { ar: 'مرفوض', bg: COLOR_BORDER_LIGHT, fg: COLOR_TEXT_SECONDARY },
};
const KIND_LABEL: Record<string, string> = {
  OFF_PLATFORM_SOLICIT: 'محاولة خارج المنصة', NO_SHOW: 'عدم حضور', QUALITY: 'جودة', SAFETY: 'سلامة', OTHER: 'أخرى',
};

export default function ConductReports() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<{ id: string; decision: 'UPHELD' | 'DISMISSED' } | null>(null);
  const limit = DEFAULT_PAGE_SIZE;
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-conduct', status, page],
    queryFn: () => api.list<ConductItem>(`/conduct-reports?${status ? `status=${status}&` : ''}limit=${limit}&offset=${page * limit}`),
  });

  const resolve = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'UPHELD' | 'DISMISSED' }) => api.post(`/conduct-reports/${id}/resolve`, { decision }),
    onSuccess: () => { notify('تم حسم البلاغ', 'success'); void qc.invalidateQueries({ queryKey: ['admin-conduct'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>بلاغات السلوك</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>تأكيد البلاغ يزيد عدّاد مخالفات الفني وقد يخفّض فئته.</p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setStatus(k); setPage(0); }} className="px-3 h-9 rounded-full" style={{ background: status === k ? COLOR_BRAND_PRIMARY : COLOR_WHITE, color: status === k ? COLOR_WHITE : COLOR_TEXT_SECONDARY, fontSize: 13, fontWeight: 600, border: `1px solid ${COLOR_BORDER_LIGHT}` }}>{label}</button>
        ))}
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل بلاغات السلوك" />}
        {!isLoading && !isError && items.length === 0 && <EmptyState message="لا توجد بلاغات" />}
        {!isLoading && !isError && items.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: COLOR_SURFACE_SUBTLE }}>
                <Th>النوع</Th><Th>المُبلِّغ</Th><Th>الفني</Th><Th>التفاصيل</Th><Th>الحالة</Th><Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td><span style={{ fontWeight: 600 }}>{KIND_LABEL[r.kind] ?? r.kind}</span></Td>
                  <Td>{r.reporter?.name ?? '—'}</Td>
                  <Td>{r.subjectTech?.user?.name ?? '—'}</Td>
                  <Td><span style={{ color: COLOR_TEXT_MUTED }}>{(r.details ?? '').slice(0, 50)}</span></Td>
                  <Td><Pill label={STATUS_PILL[r.status]?.ar ?? r.status} bg={STATUS_PILL[r.status]?.bg ?? COLOR_BORDER_LIGHT} fg={STATUS_PILL[r.status]?.fg ?? COLOR_TEXT_SECONDARY} /></Td>
                  <Td>
                    {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                      <div className="flex gap-2">
                        <ActionBtn onClick={() => setConfirm({ id: r.id, decision: 'UPHELD' })} disabled={resolve.isPending}>تأكيد</ActionBtn>
                        <button onClick={() => setConfirm({ id: r.id, decision: 'DISMISSED' })} disabled={resolve.isPending} className="px-3 rounded-lg" style={{ background: COLOR_SURFACE_MUTED, color: COLOR_TEXT_SECONDARY, fontSize: 12, fontWeight: 600 }}>رفض</button>
                      </div>
                    ) : <span style={{ color: COLOR_TEXT_SUBTLE, fontSize: 12 }}>محسوم</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
        <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.decision === 'UPHELD' ? 'تأكيد البلاغ' : 'رفض البلاغ'}
        body={confirm?.decision === 'UPHELD' ? 'سيُحتسب على الفني مخالفة قد تؤدي لتخفيض فئته أو إيقافه.' : 'سيُغلق البلاغ دون أثر على الفني.'}
        confirmLabel={confirm?.decision === 'UPHELD' ? 'تأكيد' : 'رفض'}
        cancelLabel="إلغاء"
        confirmVariant={confirm?.decision === 'UPHELD' ? 'danger' : 'primary'}
        onConfirm={() => { if (confirm) resolve.mutate(confirm); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
