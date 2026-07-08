import { ShieldCheck, Star } from 'lucide-react';

export function PriceBadge({ amount, big = false }: { amount: number; big?: boolean }) {
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-lg"
      style={{
        background: big ? 'transparent' : '#E8F1FE',
        color: '#0E4FA8',
        padding: big ? 0 : '4px 10px',
        fontWeight: 700,
        fontSize: big ? 28 : 14,
      }}
    >
      <span style={{ fontFamily: 'Inter' }}>{amount}</span>
      <span style={{ fontSize: big ? 14 : 12, fontWeight: 600 }}>دينار</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { ar: string; bg: string; fg: string }> = {
    PENDING:            { ar: 'بانتظار الدفع',     bg: '#E2E8F0', fg: '#475569' },
    CONFIRMED:          { ar: 'تم القبول',         bg: '#DBEAFE', fg: '#1366D6' },
    EN_ROUTE:           { ar: 'الفني في الطريق',   bg: '#CCFBF1', fg: '#0F766E' },
    ARRIVED:            { ar: 'الفني وصل',         bg: '#CCFBF1', fg: '#0F766E' },
    IN_PROGRESS:        { ar: 'الخدمة جارية',      bg: '#FEF3C7', fg: '#B45309' },
    COMPLETED:          { ar: 'مكتملة',            bg: '#DCFCE7', fg: '#15803D' },
    CANCELLED:          { ar: 'ملغاة',             bg: '#FEE2E2', fg: '#B91C1C' },
    DISPUTED:           { ar: 'نزاع',              bg: '#FEE2E2', fg: '#B91C1C' },
  };
  const s = map[status] ?? { ar: status, bg: '#E2E8F0', fg: '#475569' };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
      style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600 }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.fg }} />
      {s.ar}
    </span>
  );
}

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ color: '#F5A623', fontWeight: 600, fontSize: size }}>
      <Star size={size} fill="#F5A623" strokeWidth={0} />
      <span style={{ fontFamily: 'Inter', color: '#0F172A' }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export function GuaranteePill() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11, fontWeight: 600 }}>
      <ShieldCheck size={12} />
      ضمان 30 يوم
    </div>
  );
}
