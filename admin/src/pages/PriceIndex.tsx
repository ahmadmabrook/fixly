import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, DEFAULT_PAGE_SIZE, type PriceIndexReadingItem } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, Pagination, notify, TableWrapper, Th, Td } from '../components/shared';
import { COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SUBTLE } from '../lib/theme';

const KIND_LABEL: Record<string, string> = {
  dos_cpi: 'مؤشر الأسعار (عام)',
  dos_cpi_maintenance: 'مؤشر خدمات صيانة المسكن',
  memr_fuel: 'سعر الوقود',
  chamber_of_industry: 'غرفة الصناعة (معادن)',
};
const KINDS = Object.keys(KIND_LABEL);

/**
 * §17.5.13 — the monthly re-basing ritual: ~15 minutes on two official free
 * sources (DoS CPI, Ministry of Energy fuel prices), recorded here. The
 * catalogue re-bases itself against these readings — this is manual entry
 * by design, deliberately not a scraper/API integration.
 */
export default function PriceIndex() {
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState(KINDS[0]);
  const [periodMonth, setPeriodMonth] = useState('');
  const [valueNumeric, setValueNumeric] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const limit = DEFAULT_PAGE_SIZE;
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-price-index', page],
    queryFn: () => api.list<PriceIndexReadingItem>(`/price-index?limit=${limit}&offset=${page * limit}`),
  });
  const items = data?.items ?? [];

  const record = useMutation({
    mutationFn: () => api.post('/price-index', {
      kind, periodMonth, valueNumeric: Number(valueNumeric),
      sourceUrl: sourceUrl.trim() || undefined,
    }),
    onSuccess: () => {
      notify('تم تسجيل القراءة', 'success');
      setPeriodMonth(''); setValueNumeric(''); setSourceUrl('');
      void qc.invalidateQueries({ queryKey: ['admin-price-index'] });
    },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر التسجيل', 'error'),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>مؤشر الأسعار</h1>
        <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>القراءة الشهرية الرسمية — الكتالوج يعيد التسعير تلقائياً بناءً عليها.</p>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <label className="block">
            <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>المؤشر</span>
            <select className="h-9 w-full rounded-lg border border-slate-200 px-2" style={{ fontSize: 13 }} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>الشهر</span>
            <input type="month" className="h-9 w-full rounded-lg border border-slate-200 px-2" style={{ fontSize: 13, direction: 'ltr' }} value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
          </label>
          <label className="block">
            <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>القيمة</span>
            <input className="h-9 w-full rounded-lg border border-slate-200 px-2" style={{ fontSize: 13, direction: 'ltr' }} value={valueNumeric} onChange={(e) => setValueNumeric(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="block col-span-2">
            <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>رابط المصدر</span>
            <input className="h-9 w-full rounded-lg border border-slate-200 px-2" style={{ fontSize: 13, direction: 'ltr' }} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </label>
        </div>
        <div className="flex justify-end mt-3">
          <ActionBtn onClick={() => record.mutate()} disabled={record.isPending || !periodMonth || !(Number(valueNumeric) > 0)}>تسجيل القراءة</ActionBtn>
        </div>
      </Card>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل السجل" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد قراءات بعد" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <Card>
          <TableWrapper>
            <thead><tr><Th>المؤشر</Th><Th>الشهر</Th><Th>القيمة</Th><Th>المصدر</Th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <Td>{KIND_LABEL[r.kind] ?? r.kind}</Td>
                  <Td>{r.periodMonth.slice(0, 7)}</Td>
                  <Td>{`${r.valueNumeric} ${r.unit ?? ''}`.trim()}</Td>
                  <Td>{r.sourceUrl ? <a href={r.sourceUrl.startsWith('https://') ? r.sourceUrl : undefined} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: COLOR_TEXT_SUBTLE }}>مصدر</a> : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
        </Card>
      )}
    </div>
  );
}
