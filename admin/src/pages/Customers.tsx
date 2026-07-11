import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, CustomerItem, CustomerBookingItem } from '../lib/api';
import { Card, Avatar, Spinner, EmptyState, TableWrapper, Th, Td, Pagination, StatusBadge, ConfirmDialog, notify, Pill, OpsStatTile } from '../components/shared';

export default function Customers() {
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Pending confirmation for a block/unblock action.
  const [confirm, setConfirm] = useState<{ customer: CustomerItem; blocked: boolean } | null>(null);
  const limit = 50;
  const qc = useQueryClient();
  // Deep-linkable from the global header search (`/customers?search=...`).
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-customers', page, search],
    queryFn: () => api.list<CustomerItem>(`/customers?limit=${limit}&offset=${page * limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const block = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) => api.post(`/customers/${id}/${blocked ? 'block' : 'unblock'}`),
    onSuccess: () => { notify('تم التحديث', 'success'); void qc.invalidateQueries({ queryKey: ['admin-customers'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  const customers = data?.items ?? [];
  const total = data?.total ?? 0;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>العملاء</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            قائمة عملاء المنصة المسجلين {total > 0 && <>— <span style={{ color: '#1366D6' }}>{total.toLocaleString('ar-JO')}</span> إجمالي</>}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg" style={{ background: '#F1F5F9', width: 260 }}>
          <Search size={16} color="#94A3B8" />
          <input
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearchParams(e.target.value ? { search: e.target.value } : {});
            }}
            className="flex-1 bg-transparent outline-none"
            placeholder="بحث بالاسم أو رقم الهاتف..."
            style={{ fontSize: 13 }}
          />
        </div>
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل العملاء" />}
        {!isLoading && !isError && customers.length === 0 && <EmptyState message="لا يوجد عملاء" />}
        {!isLoading && !isError && customers.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>العميل</Th><Th>الجوال</Th><Th>الحالة</Th><Th>تاريخ التسجيل</Th><Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const blocked = c.isActive === false;
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <button className="flex items-center gap-2" onClick={() => setDetailId(c.id)}>
                        <Avatar name={c.name} size={36} />
                        <span style={{ fontWeight: 600, color: '#1366D6' }}>{c.name ?? c.phone ?? '—'}</span>
                      </button>
                    </Td>
                    <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{c.phone ?? '—'}</span></Td>
                    <Td>
                      {blocked ? <Pill label="محظور" bg="#FEE2E2" fg="#B91C1C" /> : <Pill label="نشط" bg="#DCFCE7" fg="#15803D" />}
                    </Td>
                    <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{fmt(c.createdAt)}</span></Td>
                    <Td>
                      <div className="flex gap-2">
                        <button onClick={() => setDetailId(c.id)} className="px-3 rounded-lg" style={{ border: '1px solid #CBD5E1', color: '#475569', fontSize: 12, fontWeight: 600 }}>الحجوزات</button>
                        <button onClick={() => setConfirm({ customer: c, blocked: !blocked })} disabled={block.isPending} data-testid={`block-btn-${c.id}`} className="px-3 rounded-lg disabled:opacity-50" style={{ background: blocked ? '#DCFCE7' : '#FEE2E2', color: blocked ? '#15803D' : '#B91C1C', fontSize: 12, fontWeight: 600 }}>
                          {blocked ? 'إلغاء الحظر' : 'حظر'}
                        </button>
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

      {detailId && (
        <HistoryDrawer
          id={detailId}
          customer={customers.find((c) => c.id === detailId) ?? null}
          onClose={() => setDetailId(null)}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.blocked ? 'تأكيد حظر العميل' : 'تأكيد إلغاء الحظر'}
        body={
          confirm
            ? confirm.blocked
              ? `سيتم منع ${confirm.customer.name ?? confirm.customer.phone ?? 'هذا العميل'} من استخدام المنصة وإنشاء حجوزات جديدة.`
              : `سيُعاد تفعيل حساب ${confirm.customer.name ?? confirm.customer.phone ?? 'هذا العميل'} ويتمكن من استخدام المنصة.`
            : undefined
        }
        confirmLabel={confirm?.blocked ? 'حظر' : 'إلغاء الحظر'}
        cancelLabel="إلغاء"
        confirmVariant={confirm?.blocked ? 'danger' : 'primary'}
        onConfirm={() => {
          if (confirm) block.mutate({ id: confirm.customer.id, blocked: confirm.blocked });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function HistoryDrawer({ id, customer, onClose }: { id: string; customer: CustomerItem | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['admin-customer-bookings', id], queryFn: () => api.list<CustomerBookingItem>(`/customers/${id}/bookings?limit=100`) });
  const items = data?.items ?? [];
  const totalSpent = items
    .filter((b) => b.status === 'COMPLETED')
    .reduce((sum, b) => sum + Number(b.totalJod), 0);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(15,23,42,0.4)' }} onClick={onClose}>
      <div className="h-full bg-white overflow-auto" style={{ width: 440 }} onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <Avatar name={customer?.name ?? null} size={44} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{customer?.name ?? customer?.phone ?? '—'}</div>
              {customer?.phone && <div style={{ color: '#64748B', fontSize: 12, fontFamily: 'Inter' }}>{customer.phone}</div>}
            </div>
          </div>
          {!isLoading && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <OpsStatTile label="عدد الحجوزات" value={items.length} />
              <OpsStatTile label="إجمالي الإنفاق" value={`${totalSpent} د`} />
            </div>
          )}
          <h2 className="mt-5" style={{ fontWeight: 800, fontSize: 18 }}>سجل الحجوزات</h2>
          {isLoading && <Spinner />}
          {!isLoading && (data?.items.length ?? 0) === 0 && <EmptyState message="لا توجد حجوزات" />}
          <div className="mt-4 space-y-2">
            {(data?.items ?? []).map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#F8FAFC' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{b.service?.nameAr ?? '—'}</div>
                  <div style={{ color: '#94A3B8', fontSize: 12 }}>{new Date(b.createdAt).toLocaleDateString('ar-JO')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.status} />
                  <span style={{ fontFamily: 'Inter', fontWeight: 700 }}>{Number(b.totalJod)} د</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="mt-5 w-full h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
