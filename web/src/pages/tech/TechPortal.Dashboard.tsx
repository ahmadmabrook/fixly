import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Power, AlertTriangle } from 'lucide-react';
import { api, TechnicianProfileMe, TrustTier } from '../../lib/api';
import { notify } from '../../components/shared';
import { useTechnicianLocationPush } from '../../hooks/useTechnicianLocationPush';
import { NearbyJobs } from './TechPortal.NearbyJobs';
import { ActiveJobs } from './TechPortal.ActiveJobs';
import { Earnings } from './TechPortal.Earnings';
import { Ratings, Scorecard } from './TechPortal.Scorecard';
import { ProfileTab } from './TechPortal.Profile';

const TRUST_TIER_LABELS: Record<TrustTier, { ar: string; bg: string; fg: string }> = {
  PROBATION: { ar: 'تحت التجربة', bg: '#FEF3C7', fg: '#B45309' },
  VERIFIED:  { ar: 'موثّق',      bg: '#DBEAFE', fg: '#1366D6' },
  PRO:       { ar: 'محترف',      bg: '#DCFCE7', fg: '#15803D' },
  ELITE:     { ar: 'نخبة',       bg: '#EDE9FE', fg: '#6D28D9' },
};

function TrustTierBadge({ tier }: { tier: TrustTier }) {
  const t = TRUST_TIER_LABELS[tier] ?? TRUST_TIER_LABELS.PROBATION;
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1" style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700 }}>
      {t.ar}
    </span>
  );
}

export function Dashboard({ me, onChange }: { me: TechnicianProfileMe; onChange: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'jobs' | 'active' | 'earnings' | 'ratings' | 'scorecard' | 'profile'>('jobs');
  const [available, setAvailable] = useState(me.isAvailable);
  useTechnicianLocationPush(available);

  async function toggle() {
    try {
      const next = !available;
      await api.patch('/technician/availability', { isAvailable: next });
      setAvailable(next);
      notify(next ? 'أنت متاح الآن' : 'أنت غير متاح', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : 'خطأ', 'error'); }
  }

  return (
    <main className="max-w-[800px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 style={{ fontWeight: 800, fontSize: 26 }}>لوحة الفني</h1>
          <TrustTierBadge tier={me.trustTier} />
        </div>
        <button onClick={() => void toggle()} className="flex items-center gap-2 px-4 h-11 rounded-full"
          style={{ background: available ? '#DCFCE7' : '#FEE2E2', color: available ? '#15803D' : '#B91C1C', fontWeight: 700, fontSize: 14 }}>
          <Power size={16} /> {available ? 'متاح' : 'غير متاح'}
        </button>
      </div>

      {me.trustTier === 'PROBATION' && (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: '#FEF3C7', color: '#92400E', fontSize: 13, fontWeight: 600 }}>
          قيد التجربة — أول 10 طلبات
        </div>
      )}

      {me.consecutiveRejections >= 3 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
          <AlertTriangle size={16} aria-hidden="true" />
          لديك {me.consecutiveRejections} رفضات متتالية — قد يؤثر ذلك على نسبة القبول وترتيبك في التوزيع.
        </div>
      )}

      <div className="mt-4 flex gap-2 flex-wrap">
        {([['jobs', 'طلبات قريبة'], ['active', 'مهامي'], ['earnings', 'الأرباح'], ['ratings', 'تقييماتي'], ['scorecard', 'أدائي'], ['profile', 'حسابي']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 h-10 rounded-full" style={{ background: tab === k ? '#1366D6' : '#FFF', color: tab === k ? '#FFF' : '#475569', fontWeight: 600, fontSize: 13, border: '1px solid #E2E8F0' }}>{l}</button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'jobs' && <NearbyJobs onAccepted={() => { void qc.invalidateQueries({ queryKey: ['tech-active'] }); }} />}
        {tab === 'active' && <ActiveJobs />}
        {tab === 'earnings' && <Earnings onChange={onChange} />}
        {tab === 'ratings' && <Ratings technicianId={me.id} />}
        {tab === 'scorecard' && <Scorecard />}
        {tab === 'profile' && <ProfileTab />}
      </div>
    </main>
  );
}
