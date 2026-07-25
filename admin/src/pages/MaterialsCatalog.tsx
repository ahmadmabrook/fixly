import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, DEFAULT_PAGE_SIZE, type MaterialCatalogItem, type MaterialTier } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, Pagination, Drawer, notify, TableWrapper, Th, Td } from '../components/shared';
import { fmtFils } from '../lib/format';
import { COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SUBTLE } from '../lib/theme';

const TIER_LABEL: Record<MaterialTier, string> = { ECONOMY: 'اقتصادي', STANDARD: 'قياسي', PREMIUM: 'ممتاز' };

interface ItemDraft {
  slug: string; nameAr: string; nameEn: string; unit: string;
  unitPriceJod: string; priceMinJod: string; priceMaxJod: string;
  brand: string; coverageNote: string;
}
const EMPTY_DRAFT: ItemDraft = { slug: '', nameAr: '', nameEn: '', unit: '', unitPriceJod: '', priceMinJod: '', priceMaxJod: '', brand: '', coverageNote: '' };

/** Field wrapper: label above a bare input, matching this panel's dense form style. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1" style={{ fontSize: 12, color: COLOR_TEXT_MUTED }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle: React.CSSProperties = { fontSize: 13, direction: 'ltr' };
const inputClass = 'h-9 w-full rounded-lg border border-slate-200 px-2';

/**
 * The Fixly materials price book (§17.5.6-§17.5.8). unitPriceFils must sit
 * within [priceMinFils, priceMaxFils] — enforced server-side; this is the
 * anti-padding control the whole materials layer is built around.
 */
export default function MaterialsCatalog() {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MaterialCatalogItem | 'new' | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const limit = DEFAULT_PAGE_SIZE;
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-materials', page],
    queryFn: () => api.list<MaterialCatalogItem>(`/materials?limit=${limit}&offset=${page * limit}`),
  });
  const items = data?.items ?? [];

  const openNew = () => { setDraft(EMPTY_DRAFT); setEditing('new'); };
  const openEdit = (item: MaterialCatalogItem) => {
    setDraft({
      slug: item.slug, nameAr: item.nameAr, nameEn: item.nameEn, unit: item.unit,
      unitPriceJod: fmtFils(item.unitPriceFils), priceMinJod: fmtFils(item.priceMinFils), priceMaxJod: fmtFils(item.priceMaxFils),
      brand: item.brand ?? '', coverageNote: item.coverageNote ?? '',
    });
    setEditing(item);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        slug: draft.slug.trim(),
        nameAr: draft.nameAr.trim(),
        nameEn: draft.nameEn.trim(),
        unit: draft.unit.trim(),
        brand: draft.brand.trim() || undefined,
        coverageNote: draft.coverageNote.trim() || undefined,
        unitPriceFils: Math.round(Number(draft.unitPriceJod) * 1000),
        priceMinFils: Math.round(Number(draft.priceMinJod) * 1000),
        priceMaxFils: Math.round(Number(draft.priceMaxJod) * 1000),
      };
      return editing !== 'new' && editing ? api.patch(`/materials/${editing.id}`, body) : api.post('/materials', body);
    },
    onSuccess: () => { notify('تم الحفظ', 'success'); setEditing(null); void qc.invalidateQueries({ queryKey: ['admin-materials'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'تعذّر الحفظ — تأكد أن السعر ضمن النطاق [الأدنى، الأقصى]', 'error'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>كتالوج المواد</h1>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 2 }}>دفتر الأسعار المرجعي — كل بند مادة في أي عرض أو قائمة مواد يُسعَّر منه فقط.</p>
        </div>
        <ActionBtn onClick={openNew}><Plus size={14} className="inline" /> إضافة بند</ActionBtn>
      </div>

      {isLoading && <Card><Spinner /></Card>}
      {isError && <Card><EmptyState message="تعذّر تحميل الكتالوج" /></Card>}
      {!isLoading && !isError && items.length === 0 && <Card><EmptyState message="لا توجد بنود بعد" /></Card>}
      {!isLoading && !isError && items.length > 0 && (
        <Card>
          <TableWrapper>
            <thead><tr><Th>الاسم</Th><Th>الفئة</Th><Th>الوحدة</Th><Th>السعر</Th><Th>النطاق</Th><Th>{''}</Th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{m.nameAr}</div>
                    <div style={{ fontSize: 11, color: COLOR_TEXT_SUBTLE }}>{m.slug}</div>
                  </Td>
                  <Td>{TIER_LABEL[m.tier]}</Td>
                  <Td>{m.unit}</Td>
                  <Td>{fmtFils(m.unitPriceFils)} د.أ</Td>
                  <Td>{fmtFils(m.priceMinFils)} – {fmtFils(m.priceMaxFils)}</Td>
                  <Td><ActionBtn variant="ghost" onClick={() => openEdit(m)}>تعديل</ActionBtn></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          <Pagination page={page} total={data?.total ?? 0} limit={limit} onPage={setPage} />
        </Card>
      )}

      {editing && (
        <Drawer ariaLabel={editing === 'new' ? 'إضافة بند مادة' : 'تعديل بند مادة'} onClose={() => setEditing(null)}>
          <div className="p-5 space-y-3">
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>{editing === 'new' ? 'إضافة بند مادة' : 'تعديل بند مادة'}</h2>
            <Field label="المعرّف (slug)"><input className={inputClass} style={inputStyle} value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))} /></Field>
            <Field label="الاسم (عربي)"><input className={inputClass} value={draft.nameAr} onChange={(e) => setDraft((d) => ({ ...d, nameAr: e.target.value }))} /></Field>
            <Field label="الاسم (إنجليزي)"><input className={inputClass} style={inputStyle} value={draft.nameEn} onChange={(e) => setDraft((d) => ({ ...d, nameEn: e.target.value }))} /></Field>
            <Field label="الوحدة"><input className={inputClass} style={inputStyle} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} placeholder="bucket / m2 / piece" /></Field>
            <Field label="العلامة التجارية (اختياري)"><input className={inputClass} value={draft.brand} onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="الحد الأدنى (د.أ)"><input className={inputClass} style={inputStyle} value={draft.priceMinJod} onChange={(e) => setDraft((d) => ({ ...d, priceMinJod: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
              <Field label="السعر المرجعي (د.أ)"><input className={inputClass} style={inputStyle} value={draft.unitPriceJod} onChange={(e) => setDraft((d) => ({ ...d, unitPriceJod: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
              <Field label="الحد الأقصى (د.أ)"><input className={inputClass} style={inputStyle} value={draft.priceMaxJod} onChange={(e) => setDraft((d) => ({ ...d, priceMaxJod: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
            </div>
            <Field label="ملاحظة التغطية (اختياري)"><input className={inputClass} value={draft.coverageNote} onChange={(e) => setDraft((d) => ({ ...d, coverageNote: e.target.value }))} placeholder="مثال: علبة واحدة ≈ 24 م² للطبقة" /></Field>
            <div className="flex justify-end pt-2">
              <ActionBtn
                onClick={() => save.mutate()}
                disabled={save.isPending || !draft.slug.trim() || !draft.nameAr.trim() || !draft.nameEn.trim() || !draft.unit.trim() || !(Number(draft.unitPriceJod) > 0)}
              >حفظ</ActionBtn>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
