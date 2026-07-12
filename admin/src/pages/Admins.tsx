import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, AdminUserItem } from '../lib/api';
import { useAuth } from '../lib/store';
import { Card, Spinner, EmptyState, TableWrapper, Th, Td, ActionBtn, ConfirmDialog, notify, ADMIN_ROLES as ROLES, adminRoleLabel as roleLabel } from '../components/shared';

export default function Admins() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.admin);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'OPS' });
  // Pending confirmation for an authorization-changing action.
  const [activeConfirm, setActiveConfirm] = useState<{ admin: AdminUserItem; next: boolean } | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{ admin: AdminUserItem; next: string } | null>(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-admins'], queryFn: () => api.get<AdminUserItem[]>('/admins') });

  const create = useMutation({
    mutationFn: () => api.post('/admins', { email: form.email.trim(), password: form.password, name: form.name.trim(), role: form.role }),
    onSuccess: () => { notify('تم إنشاء المدير', 'success'); setForm({ email: '', password: '', name: '', role: 'OPS' }); void qc.invalidateQueries({ queryKey: ['admin-admins'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.post(`/admins/${id}/role`, { role }),
    onSuccess: () => { notify('تم تحديث الدور', 'success'); void qc.invalidateQueries({ queryKey: ['admin-admins'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });
  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.post(`/admins/${id}/active`, { isActive }),
    onSuccess: () => { notify('تم التحديث', 'success'); void qc.invalidateQueries({ queryKey: ['admin-admins'] }); },
    onError: (e) => notify(e instanceof Error ? e.message : 'خطأ', 'error'),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>إدارة المسؤولين</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>إنشاء حسابات المسؤولين وتعيين الأدوار (للمدير العام فقط).</p>
      </div>

      <Card className="p-5 max-w-2xl">
        <h2 style={{ fontWeight: 700, fontSize: 16 }}>إضافة مسؤول</h2>
        <div className="mt-3 grid md:grid-cols-2 gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم" className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="البريد الإلكتروني" className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder="كلمة المرور (12+ حرفاً)" className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14, direction: 'ltr' }} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="h-11 rounded-xl border border-slate-200 px-3" style={{ fontSize: 14 }}>
            {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="mt-3">
          <ActionBtn onClick={() => create.mutate()} disabled={!form.email.trim() || form.password.length < 12 || !form.name.trim() || create.isPending}>إنشاء</ActionBtn>
        </div>
      </Card>

      <Card>
        {isLoading && <Spinner />}
        {isError && <EmptyState message="تعذّر تحميل قائمة المسؤولين" />}
        {!isLoading && !isError && (data?.length ?? 0) === 0 && <EmptyState message="لا يوجد مسؤولون" />}
        {!isLoading && !isError && (data?.length ?? 0) > 0 && (
          <TableWrapper>
            <thead><tr style={{ background: '#F8FAFC' }}><Th>الاسم</Th><Th>البريد</Th><Th>الدور</Th><Th>الحالة</Th><Th>إجراء</Th></tr></thead>
            <tbody>
              {(data ?? []).map((a) => {
                const isSelf = a.id === me?.id;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td>{a.name}{isSelf && <span style={{ color: '#94A3B8', fontSize: 11 }}> (أنت)</span>}</Td>
                    <Td><span style={{ fontFamily: 'Inter', fontSize: 13, direction: 'ltr', display: 'inline-block' }}>{a.email}</span></Td>
                    <Td>
                      <select value={a.role} onChange={(e) => { if (e.target.value !== a.role) setRoleConfirm({ admin: a, next: e.target.value }); }} disabled={isSelf || setRole.isPending} className="h-8 rounded-lg border border-slate-200 px-2 disabled:opacity-50" style={{ fontSize: 12 }}>
                        {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </Td>
                    <Td>{a.isActive ? <span style={{ color: '#15803D', fontSize: 12, fontWeight: 600 }}>نشط</span> : <span style={{ color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>معطّل</span>}</Td>
                    <Td>
                      {!isSelf && (
                        <button onClick={() => setActiveConfirm({ admin: a, next: !a.isActive })} disabled={setActive.isPending} data-testid={`active-btn-${a.id}`} className="px-3 rounded-lg disabled:opacity-50" style={{ background: a.isActive ? '#FEE2E2' : '#DCFCE7', color: a.isActive ? '#B91C1C' : '#15803D', fontSize: 12, fontWeight: 600 }}>
                          {a.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
      </Card>
      <p style={{ color: '#94A3B8', fontSize: 12 }}>الأدوار: {ROLES.map(([, l]) => l).join(' · ')}</p>

      <ConfirmDialog
        open={activeConfirm !== null}
        title={activeConfirm?.next ? 'تأكيد تفعيل المسؤول' : 'تأكيد تعطيل المسؤول'}
        body={
          activeConfirm
            ? activeConfirm.next
              ? `سيُعاد تفعيل حساب ${activeConfirm.admin.name} ويتمكن من الدخول إلى لوحة الإدارة.`
              : `سيتم تعطيل حساب ${activeConfirm.admin.name} ولن يتمكن من الدخول إلى لوحة الإدارة.`
            : undefined
        }
        confirmLabel={activeConfirm?.next ? 'تفعيل' : 'تعطيل'}
        cancelLabel="إلغاء"
        confirmVariant={activeConfirm?.next ? 'primary' : 'danger'}
        onConfirm={() => {
          if (activeConfirm) setActive.mutate({ id: activeConfirm.admin.id, isActive: activeConfirm.next });
          setActiveConfirm(null);
        }}
        onCancel={() => setActiveConfirm(null)}
      />

      <ConfirmDialog
        open={roleConfirm !== null}
        title="تأكيد تغيير الدور"
        body={
          roleConfirm
            ? `سيتم تغيير دور ${roleConfirm.admin.name} من «${roleLabel(roleConfirm.admin.role)}» إلى «${roleLabel(roleConfirm.next)}». يؤثر هذا على صلاحياته فوراً.`
            : undefined
        }
        confirmLabel="تغيير الدور"
        cancelLabel="إلغاء"
        confirmVariant="primary"
        onConfirm={() => {
          if (roleConfirm) setRole.mutate({ id: roleConfirm.admin.id, role: roleConfirm.next });
          setRoleConfirm(null);
        }}
        onCancel={() => setRoleConfirm(null)}
      />
    </div>
  );
}
