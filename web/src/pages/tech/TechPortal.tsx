import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { api, ApiError, TechnicianProfileMe } from '../../lib/api';
import { SkeletonList } from '../../components/shared';
import { Onboarding } from './TechPortal.Onboarding';
import { Dashboard } from './TechPortal.Dashboard';

export default function TechPortal() {
  const { data: me, isLoading, error, refetch } = useQuery({
    queryKey: ['technician-me'],
    retry: false,
    queryFn: () => api.get<TechnicianProfileMe>('/technician/me'),
  });

  if (isLoading) return <main className="max-w-[600px] mx-auto px-6 py-16"><SkeletonList count={3} rowHeight={80} /></main>;

  const notFound = error instanceof ApiError && error.status === 404;
  if (notFound || !me) return <Onboarding onDone={() => void refetch()} />;
  if (me.status === 'PENDING') return <StatusScreen title="طلبك قيد المراجعة" body="سنراجع طلبك خلال 24 ساعة ونعلمك بالنتيجة." tone="info" />;
  if (me.status === 'REJECTED') return <StatusScreen title="تم رفض الطلب" body={me.rejectionReason ?? 'يرجى مراجعة الدعم.'} tone="error" retry={() => void refetch()} />;
  if (me.status === 'SUSPENDED') return <StatusScreen title="الحساب موقوف" body={me.rejectionReason ?? 'تواصل مع الدعم.'} tone="error" />;
  return <Dashboard me={me} onChange={() => void refetch()} />;
}

function StatusScreen({ title, body, tone, retry }: { title: string; body: string; tone: 'info' | 'error'; retry?: () => void }) {
  return (
    <main className="max-w-[500px] mx-auto px-6 py-16 text-center">
      <div className="inline-flex w-16 h-16 rounded-full items-center justify-center" style={{ background: tone === 'error' ? '#FEE2E2' : '#E8F1FE' }}>
        <Clock size={28} color={tone === 'error' ? '#B91C1C' : '#1366D6'} />
      </div>
      <h1 className="mt-4" style={{ fontWeight: 800, fontSize: 22 }}>{title}</h1>
      <p className="mt-2" style={{ color: '#475569', fontSize: 15 }}>{body}</p>
      {retry && <button onClick={retry} className="mt-5 px-5 h-11 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>إعادة التقديم</button>}
    </main>
  );
}
