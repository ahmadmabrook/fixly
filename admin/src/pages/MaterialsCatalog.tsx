import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, DEFAULT_PAGE_SIZE, type MaterialCatalogItem, type MaterialTier } from '../lib/api';
import { Card, Spinner, EmptyState, ActionBtn, Pagination, Drawer, Pill, notify, TableWrapper, Th, Td } from '../components/shared';
import { fmtFils } from '../lib/format';
import { COLOR_STATUS_DANGER, COLOR_STATUS_DANGER_BG, COLOR_STATUS_SUCCESS, COLOR_STATUS_SUCCESS_BG, COLOR_STATUS_WARNING_BG, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY, COLOR_TEXT_SUBTLE } from '../lib/theme';

/** §6.34/§10 — «متوسط» everywhere else in the app for the middle tier. */
const TIER_LABEL: Record<MaterialTier, string> = { ECONOMY: 'اقتصادي', STANDARD: 'متوسط', PREMIUM: 'ممتاز' };
const TIER_OPTIONS = Object.keys(TIER_LABEL) as MaterialTier[];
const CONFIDENCE_LABEL: Record<MaterialCatalogItem['priceConfidence'], { ar: string; bg: string; fg: string }> = {
  CONFIRMED: { ar: 'مؤكد', bg: COLOR_STATUS_SUCCESS_BG, fg: COLOR_STATUS_SUCCESS },
  ESTIMATED: { ar: 'تقديري', bg: COLOR_STATUS_WARNING_BG, fg: COLOR_TEXT_MUTED },
  UNDER_REVIEW: { ar: 'قيد المراجعة', bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
};
/** Mirrors backend RefreshCadence → days, so this table can flag a row overdue
 *  for its retail-refresh ritual without a second API round-trip (§17.5.6). */
const CADENCE_DAYS: Record<MaterialCatalogItem['refreshCadence'], number> = { MONTHLY: 30, QUARTERLY: 90, SEMIANNUAL: 180 };
function isStale(item: MaterialCatalogItem): boolean {
  const last = item.lastPricedAt ? new Date(item.lastPricedAt).getTime() : 0;
  return (Date.now() - last) / 864e5 > CADENCE_DAYS[item.refreshCadence];
}

interface ItemDraft {
  slug: string; nameAr: string; nameEn: string; unit: string; tier: MaterialTier;
  unitPriceJod: string; priceMinJod: string; priceMaxJod: string; varianceAlertPct: string;
  brand: string; coverageNote: string;
}
const EMPTY_DRAFT: ItemDraft = { slug: '', nameAr: '', nameEn: '', unit: '', tier: 'STANDARD', unitPriceJod: '', priceMinJod: '', priceMaxJod: '', varianceAlertPct: '15', brand: '', coverageNote: '' };

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
      slug: item.slug, nameAr: item.nameAr, nameEn: item.nameEn, unit: item.unit, tier: item.tier,
      unitPriceJod: fmtFils(item.unitPriceFils), priceMinJod: fmtFils(item.priceMinFils), priceMaxJod: fmtFils(item.priceMaxFils),
      varianceAlertPct: (item.varianceAlertBps / 100).toString(),
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
        tier: draft.tier,
        brand: draft.brand.trim() || undefined,
        coverageNote: draft.coverageNote.trim() || undefined,
        unitPriceFils: Math.round(Number(draft.unitPriceJod) * 1000),
        priceMinFils: Math.round(Number(draft.priceMinJod) * 1000),
        priceMaxFils: Math.round(Number(draft.priceMaxJod) * 1000),
        varianceAlertBps: Math.round(Number(draft.varianceAlertPct) * 100),
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
            <thead><tr><Th>الاسم</Th><Th>الفئة</Th><Th>الوحدة</Th><Th>السعر</Th><Th>النطاق</Th><Th>الثقة</Th><Th>آخر تحديث</Th><Th>{''}</Th></tr></thead>
            <tbody>
              {items.map((m) => {
                const stale = isStale(m);
                const confidence = CONFIDENCE_LABEL[m.priceConfidence];
                return (
                  <tr key={m.id}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{m.nameAr}</div>
                      <div style={{ fontSize: 11, color: COLOR_TEXT_SUBTLE }}>{m.slug}</div>
                    </Td>
                    <Td>{TIER_LABEL[m.tier]}</Td>
                    <Td>{m.unit}</Td>
                    <Td>{fmtFils(m.unitPriceFils)} د.أ</Td>
                    <Td>{fmtFils(m.priceMinFils)} – {fmtFils(m.priceMaxFils)}</Td>
                    <Td><Pill label={confidence.ar} bg={confidence.bg} fg={confidence.fg} /></Td>
                    <Td>
                      <span style={{ color: stale ? COLOR_STATUS_DANGER : COLOR_TEXT_MUTED, fontWeight: stale ? 700 : 400 }}>
                        {m.lastPricedAt ? new Date(m.lastPricedAt).toLocaleDateString('ar-JO-u-nu-latn') : '—'}
                        {stale ? ' · متأخر' : ''}
                      </span>
                    </Td>
                    <Td><ActionBtn variant="ghost" onClick={() => openEdit(m)}>تعديل</ActionBtn></Td>
                  </tr>
                );
              })}
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
            <Field label="الفئة">
              <select className={inputClass} value={draft.tier} onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value as MaterialTier }))}>
                {TIER_OPTIONS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="العلامة التجارية (اختياري)"><input className={inputClass} value={draft.brand} onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="الحد الأدنى (د.أ)"><input className={inputClass} style={inputStyle} value={draft.priceMinJod} onChange={(e) => setDraft((d) => ({ ...d, priceMinJod: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
              <Field label="السعر المرجعي (د.أ)"><input className={inputClass} style={inputStyle} value={draft.unitPriceJod} onChange={(e) => setDraft((d) => ({ ...d, unitPriceJod: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
              <Field label="الحد الأقصى (د.أ)"><input className={inputClass} style={inputStyle} value={draft.priceMaxJod} onChange={(e) => setDraft((d) => ({ ...d, priceMaxJod: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
            </div>
            <Field label="حد تنبيه الانحراف (%)"><input className={inputClass} style={inputStyle} value={draft.varianceAlertPct} onChange={(e) => setDraft((d) => ({ ...d, varianceAlertPct: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
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
