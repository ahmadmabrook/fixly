import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { api, TechnicianItem } from '../lib/api';
import { Card, Avatar, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify } from '../components/shared';

export default function Technicians() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const qc = useQueryClient();

  // ID staged for confirm — null means no confirm dialog is open.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-technicians', page],
    queryFn: () =>
      api.list<TechnicianItem>(`/technicians?limit=${limit}&offset=${page * limit}`),
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

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>الفنيون</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
          إدارة وتوثيق الفنيين المسجلين {total > 0 && <>— <span style={{ color: '#1366D6' }}>{total.toLocaleString('ar-JO')}</span> إجمالي</>}
        </p>
      </div>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل الفنيين" />}
        {!isLoading && !isError && technicians.length === 0 && <EmptyState message="لا يوجد فنيون" />}
        {!isLoading && !isError && technicians.length > 0 && (
          <TableWrapper>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <Th>الفني</Th>
                <Th>الجوال</Th>
                <Th>التقييم</Th>
                <Th>عدد التقييمات</Th>
                <Th>الحالة</Th>
                <Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {technicians.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar name={t.user.name} size={36} />
                      <span style={{ fontWeight: 600 }}>{t.user.name}</span>
                    </div>
                  </Td>
                  <Td><span style={{ fontFamily: 'Inter', fontSize: 13 }}>{t.user.phone ?? '—'}</span></Td>
                  <Td>
                    <span style={{ fontFamily: 'Inter', fontWeight: 600 }}>
                      {t.rating != null ? Number(t.rating).toFixed(1) : '—'}
                    </span>
                  </Td>
                  <Td><span style={{ fontFamily: 'Inter' }}>{t.totalReviews ?? 0}</span></Td>
                  <Td>
                    {t.isVerified ? (
                      <span className="inline-flex items-center gap-1" style={{ color: '#15803D', fontSize: 12, fontWeight: 600 }}>
                        <BadgeCheck size={14} />
                        موثّق
                      </span>
                    ) : (
                      <span style={{ color: '#B45309', fontSize: 12, fontWeight: 600 }}>غير موثّق</span>
                    )}
                  </Td>
                  <Td>
                    {!t.isVerified && (
                      <ActionBtn
                        onClick={() => setConfirmId(t.id)}
                        disabled={verify.isPending}
                        data-testid={`verify-btn-${t.id}`}
                      >
                        توثيق
                      </ActionBtn>
                    )}
                  </Td>
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

      <ConfirmDialog
        open={confirmId !== null}
        title="تأكيد توثيق الفني"
        body="سيتم منح الفني صلاحية استقبال الحجوزات. لا يمكن التراجع عن هذا الإجراء إلا بتعطيل الحساب يدوياً."
        confirmLabel="توثيق"
        cancelLabel="إلغاء"
        onConfirm={() => {
          if (confirmId) verify.mutate(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
