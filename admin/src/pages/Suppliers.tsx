import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, DEFAULT_PAGE_SIZE, type SupplierItem } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, Pagination, Drawer, notify, Pill, TableWrapper, Th, Td } from '../components/shared';
import { COLOR_STATUS_DANGER_BG, COLOR_STATUS_DANGER, COLOR_STATUS_SUCCESS_BG, COLOR_STATUS_SUCCESS, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY } from '../lib/theme';

interface SupplierDraft { name: string; contactPhone: string; categories: string }
const EMPTY_DRAFT: SupplierDraft = { name: '', contactPhone: '', categories: '' };

/**
 * Pilot retail-shop referral partners (§17.5.16) — a zero-risk 30-day field
 * test, no wholesale contract: the technician buys from the shop, the shop
 * pays Fixly a referral commission on the sale. commissionPaidOk /
 * priceManipulationObserved are the two behavioural facts the trial answers.
 */
export default function Suppliers() {
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<SupplierDraft>(EMPTY_DRAFT);
  const limit = DEFAULT_PAGE_SIZE;
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-suppliers', page],
    queryFn: () => api.list<SupplierItem>(`/suppliers?limit=${limit}&offset=${page * limit}`),
  });
  const items = data?.items ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin-suppliers'] });

  const create = useMutation({
    mutationFn: () => api.post('/suppliers', {
      name: draft.name.trim(),
      contactPhone: draft.contactPhone.trim() || undefined,
      categories: draft.categories.split(',').map((c) => c.trim()).filter(Boolean),
    }),
    onSuccess: () => { notify('تمت إضافة المورّد', 'success'); setCreating(false); setDraft(EMPTY_DRAFT); invalidate(); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّرت الإضافة', 'error'),
  });

  const setTrialVerdict = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: 'commissionPaidOk' | 'priceManipulationObserved'; value: boolean }) =>
      api.patch(`/suppliers/${id}`, { [field]: value }),
    onSuccess: () => invalidate(),
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>الموردون</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>محلات تجريبية بعمولة إحالة فقط — بلا عقد توريد.</p>
        </div>
        <ActionBtn onClick={() => setCreating(true)}><Plus size={14} className="inline" /> إضافة مورّد</ActionBtn>
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل الموردين" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا يوجد موردون بعد" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <Card>
          <TableWrapper>
            <thead><tr><Th>الاسم</Th><Th>الفئات</Th><Th>العمولة</Th><Th>الاتفاق</Th><Th>التجربة (30 يوم)</Th><Th>نتيجة التجربة</Th></tr></thead>
            <tbody>
              {items.map((s) => {
                const trialDay = s.trialStartedAt ? Math.min(30, Math.max(0, Math.floor((Date.now() - new Date(s.trialStartedAt).getTime()) / 864e5))) : null;
                return (
                <tr key={s.id}>
                  <Td>{s.name}</Td>
                  <Td>{s.categories.join('، ') || '—'}</Td>
                  <Td>{s.referralCommissionBps != null ? `${(s.referralCommissionBps / 100).toFixed(1)}%` : '—'}</Td>
                  <Td>{s.agreementKind === 'verbal' ? 'شفهي' : s.agreementKind === 'message' ? 'رسالة' : 'مكتوب'}</Td>
                  <Td>
                    {trialDay != null
                      ? <span style={{ fontFamily: 'Inter', fontWeight: trialDay >= 30 ? 700 : 400, color: trialDay >= 30 ? COLOR_STATUS_DANGER : undefined }}>اليوم {trialDay}/30</span>
                      : '—'}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button onClick={() => setTrialVerdict.mutate({ id: s.id, field: 'commissionPaidOk', value: !s.commissionPaidOk })}>
                        <Pill label={s.commissionPaidOk ? 'العمولة دُفعت' : 'لم تُدفع بعد'} bg={s.commissionPaidOk ? COLOR_STATUS_SUCCESS_BG : COLOR_STATUS_DANGER_BG} fg={s.commissionPaidOk ? COLOR_STATUS_SUCCESS : COLOR_STATUS_DANGER} />
                      </button>
                      <button onClick={() => setTrialVerdict.mutate({ id: s.id, field: 'priceManipulationObserved', value: !s.priceManipulationObserved })}>
                        <Pill label={s.priceManipulationObserved ? 'لوحظ تلاعب' : 'لا تلاعب'} bg={s.priceManipulationObserved ? COLOR_STATUS_DANGER_BG : COLOR_STATUS_SUCCESS_BG} fg={s.priceManipulationObserved ? COLOR_STATUS_DANGER : COLOR_STATUS_SUCCESS} />
                      </button>
                    </div>
                  </Td>
                </tr>
                );
              })}
            </tbody>
          </TableWrapper>
          <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
        </Card>
      )}

      {creating && (
        <Drawer ariaLabel="إضافة مورّد" onClose={() => setCreating(false)}>
          <div className="p-5 space-y-3">
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>إضافة مورّد</h2>
            <label className="block">
              <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>الاسم</span>
              <input className="h-9 w-full rounded-lg border border-slate-200 px-2" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>رقم التواصل</span>
              <input className="h-9 w-full rounded-lg border border-slate-200 px-2" style={{ direction: 'ltr' }} value={draft.contactPhone} onChange={(e) => setDraft((d) => ({ ...d, contactPhone: e.target.value }))} />
            </label>
            <label className="block">
              <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>الفئات (مفصولة بفاصلة)</span>
              <input className="h-9 w-full rounded-lg border border-slate-200 px-2" style={{ direction: 'ltr' }} value={draft.categories} onChange={(e) => setDraft((d) => ({ ...d, categories: e.target.value }))} placeholder="paint, electrical" />
            </label>
            <div className="flex justify-end pt-2">
              <ActionBtn onClick={() => create.mutate()} disabled={create.isPending || !draft.name.trim()}>حفظ</ActionBtn>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
