import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, CustomerItem } from '../lib/api';
import { Card, Avatar, Spinner, EmptyState, TableWrapper, Th, Td } from '../components/shared';

export default function Customers() {
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-customers', page],
    queryFn: () =>
      api.list<CustomerItem>(`/customers?limit=${limit}&offset=${page * limit}`),
  });

  const customers = data?.items ?? [];
  const total = data?.total ?? 0;

  function fmt(iso: string) {
    return new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>العملاء</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
          قائمة عملاء المنصة المسجلين {total > 0 && <>— <span style={{ color: '#1366D6' }}>{total.toLocaleString('ar-JO')}</span> إجمالي</>}
        </p>
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل العملاء" />}
        {!isLoading && !isError && customers.length === 0 && <EmptyState message="لا يوجد عملاء" />}
        {!isLoading && !isError && customers.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>العميل</Th>
                <Th>الجوال</Th>
                <Th>تاريخ التسجيل</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar name={c.name} size={36} />
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                    </div>
                  </Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{c.phone ?? '—'}</span></Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{fmt(c.createdAt)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}

        {total > limit && (
          <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: '#F1F5F9' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ fontSize: 13, color: '#1366D6', fontWeight: 600, background: 'none', border: 'none', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}
            >
              السابق
            </button>
            <span style={{ fontSize: 13, color: '#64748B' }}>صفحة {page + 1} من {Math.max(1, Math.ceil(total / limit))}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * limit >= total}
              style={{ fontSize: 13, color: '#1366D6', fontWeight: 600, background: 'none', border: 'none', cursor: (page + 1) * limit >= total ? 'not-allowed' : 'pointer', opacity: (page + 1) * limit >= total ? 0.4 : 1 }}
            >
              التالي
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
