import { ReactNode, useId, useEffect } from 'react';
import { toast } from 'sonner';
import { useDialog } from '../hooks/useDialog';
import type { AdminRole } from '../lib/store';
import {
  COLOR_BORDER_LIGHT,
  COLOR_BRAND_PRIMARY,
  COLOR_NEUTRAL_FAINT,
  COLOR_STATUS_DANGER,
  COLOR_STATUS_DANGER_BG,
  COLOR_STATUS_INFO_BG,
  COLOR_STATUS_SUCCESS,
  COLOR_STATUS_SUCCESS_BG,
  COLOR_STATUS_TEAL,
  COLOR_STATUS_TEAL_BG,
  COLOR_STATUS_WARNING,
  COLOR_STATUS_WARNING_BG,
  COLOR_SURFACE_MUTED,
  COLOR_SURFACE_SUBTLE,
  COLOR_TEXT_BODY,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_SUBTLE,
  COLOR_WHITE,
} from '../lib/theme';

export const notify = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => {
  if (kind === 'success') toast.success(msg);
  else if (kind === 'error') toast.error(msg);
  else toast(msg);
};

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-white rounded-2xl ${className}`}
      style={{ boxShadow: '0 2px 8px rgba(15,23,42,0.06)', ...style }}
    >
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { ar: string; bg: string; fg: string }> = {
    PENDING:     { ar: 'قيد الانتظار',   bg: COLOR_BORDER_LIGHT, fg: COLOR_TEXT_SECONDARY },
    CONFIRMED:   { ar: 'مؤكد',           bg: COLOR_STATUS_INFO_BG, fg: COLOR_BRAND_PRIMARY },
    EN_ROUTE:    { ar: 'في الطريق',      bg: COLOR_STATUS_TEAL_BG, fg: COLOR_STATUS_TEAL },
    ARRIVED:     { ar: 'وصل الفني',      bg: COLOR_STATUS_TEAL_BG, fg: COLOR_STATUS_TEAL },
    IN_PROGRESS: { ar: 'جارٍ التنفيذ',  bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
    COMPLETED:   { ar: 'مكتمل',          bg: COLOR_STATUS_SUCCESS_BG, fg: COLOR_STATUS_SUCCESS },
    CANCELLED:   { ar: 'ملغى',           bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
    DISPUTED:    { ar: 'نزاع',           bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
    // Payout statuses (COMPLETED reuses the green entry above)
    PROCESSING:  { ar: 'قيد المعالجة',  bg: COLOR_STATUS_WARNING_BG, fg: COLOR_STATUS_WARNING },
    FAILED:      { ar: 'فشل',            bg: COLOR_STATUS_DANGER_BG, fg: COLOR_STATUS_DANGER },
  };
  const s = map[status] ?? { ar: status, bg: COLOR_BORDER_LIGHT, fg: COLOR_TEXT_SECONDARY };
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

/** Generic colored status pill for pages whose status enum isn't the booking
 *  StatusBadge above (conduct reports, guarantee tickets, subscriptions,
 *  customer active/blocked). Matches AdminPanel.tsx's pill pattern
 *  (`px-2 py-0.5 rounded-full text-xs font-bold`) instead of plain text. */
export function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-1" style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
}

export function Avatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  const safeName = name && name.trim() ? name.trim() : '؟';
  const initials = safeName.split(' ').map(p => p[0]).slice(0, 2).join('');
  const hue = (safeName.charCodeAt(0) * 37) % 360;
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: `hsl(${hue} 50% 55%)`, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export function KpiCard({
  label, value, sub, icon, color, delta,
}: {
  label: string; value: string | number; sub?: string;
  icon?: ReactNode; color?: string; delta?: string;
}) {
  return (
    <Card className="p-4">
      {icon && color && (
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + '20', color }}>{icon}</div>
          {delta && <span style={{ fontSize: 12, fontWeight: 600, color: COLOR_STATUS_SUCCESS }}>{delta}</span>}
        </div>
      )}
      <div className={icon ? 'mt-3' : ''} style={{ fontSize: 28, fontWeight: 800, color: COLOR_TEXT_PRIMARY, fontFamily: 'Inter' }}>{value}</div>
      <div style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: icon ? 4 : 0 }}>{label}</div>
      {sub && <span style={{ fontSize: 12, color: COLOR_TEXT_SUBTLE }}>{sub}</span>}
    </Card>
  );
}

/** Small, iconless operational-metric tile — visually distinct (smaller,
 *  no icon chip) from KpiCard so secondary stats don't compete with headline
 *  KPIs. Matches AdminPanel.tsx's OpsStat. */
export function OpsStatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100">
      <div style={{ fontSize: 18, fontWeight: 800, color: COLOR_TEXT_PRIMARY, fontFamily: 'Inter' }}>{value}</div>
      <div style={{ fontSize: 12, color: COLOR_TEXT_MUTED, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: COLOR_BRAND_PRIMARY, borderTopColor: 'transparent' }}
      />
    </div>
  );
}

/* ── Shimmer skeleton ──────────────────────────────────────────────── */

const SKELETON_KEYFRAMES_ID = 'skeleton-shimmer-kf';

function ensureKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SKELETON_KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = SKELETON_KEYFRAMES_ID;
  style.textContent = `@keyframes skeleton-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
  document.head.appendChild(style);
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  className = '',
  style,
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  useEffect(() => { ensureKeyframes(); }, []);
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${COLOR_BORDER_LIGHT} 25%, ${COLOR_SURFACE_MUTED} 50%, ${COLOR_BORDER_LIGHT} 75%)`,
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/** KPI-shaped skeleton row: 4 cards per row. */
export function SkeletonKpiRow() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-5 flex flex-col gap-2">
          <Skeleton width={90} height={14} borderRadius={6} />
          <Skeleton width={60} height={28} borderRadius={6} />
        </Card>
      ))}
    </div>
  );
}

/** Chart-shaped skeleton block. */
export function SkeletonChart() {
  return (
    <Card className="p-6">
      <Skeleton width={160} height={18} borderRadius={6} style={{ marginBottom: 16 }} />
      <Skeleton width="100%" height={260} borderRadius={12} />
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center p-12 text-slate-400" style={{ fontSize: 14 }}>
      {message}
    </div>
  );
}

export function TableWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto table-scroll">
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th
      className="text-start py-3 px-4"
      style={{ fontSize: 12, fontWeight: 600, color: COLOR_TEXT_MUTED, borderBottom: `1px solid ${COLOR_SURFACE_MUTED}`, whiteSpace: 'nowrap' }}
    >
      {children}
    </th>
  );
}

export function Pagination({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  if (total <= limit) return null;
  const onLast = (page + 1) * limit >= total;
  const btn = (disabled: boolean): React.CSSProperties => ({
    fontSize: 13, color: COLOR_BRAND_PRIMARY, fontWeight: 600, background: 'none', border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
  });
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: COLOR_SURFACE_MUTED }}>
      <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0} style={btn(page === 0)}>السابق</button>
      <span style={{ fontSize: 13, color: COLOR_TEXT_MUTED }}>صفحة {page + 1} من {Math.max(1, Math.ceil(total / limit))}</span>
      <button onClick={() => onPage(page + 1)} disabled={onLast} style={btn(onLast)}>التالي</button>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={`py-3 px-4 ${className ?? ''}`}
      style={{ borderBottom: `1px solid ${COLOR_SURFACE_SUBTLE}`, color: COLOR_TEXT_BODY }}
    >
      {children}
    </td>
  );
}

export function ActionBtn({
  children,
  onClick,
  disabled,
  variant = 'primary',
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base: React.CSSProperties =
    variant === 'primary'
      ? { background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, border: 'none' }
      : { background: 'transparent', color: COLOR_BRAND_PRIMARY, border: `1px solid ${COLOR_BRAND_PRIMARY}` };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        borderRadius: 8,
        padding: '5px 14px',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity .15s',
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A minimal confirm dialog for destructive / irreversible admin actions
 * (verify technician, process payout). Keeps the contract simple: parent
 * owns the open state, dialog calls onConfirm / onCancel.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  // Open-guard wrapper: the body (which calls the useDialog hook) only mounts
  // while open, so the Escape/focus-trap listener never runs for a closed
  // dialog and the rules-of-hooks aren't violated by the early return.
  if (!props.open) return null;
  return <ConfirmDialogBody {...props} />;
}

function ConfirmDialogBody({
  title,
  body,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useDialog<HTMLDivElement>(onCancel);
  const titleId = useId();
  const bodyId = useId();
  const confirmStyle: React.CSSProperties =
    confirmVariant === 'danger'
      ? { background: COLOR_STATUS_DANGER, color: COLOR_WHITE, border: 'none' }
      : { background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, border: 'none' };
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.5)',
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLOR_WHITE, borderRadius: 16, padding: 24, width: '100%',
          maxWidth: 380, margin: '0 16px', boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
        }}
        dir="rtl"
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 18, color: COLOR_TEXT_PRIMARY }}>{title}</h3>
        {body && (
          <p id={bodyId} style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{body}</p>
        )}
        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 20px', borderRadius: 8, background: 'transparent',
              color: COLOR_TEXT_SECONDARY, border: `1px solid ${COLOR_NEUTRAL_FAINT}`, fontWeight: 600, fontSize: 14,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{ ...confirmStyle, padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const ADMIN_ROLES: ReadonlyArray<readonly [AdminRole, string]> = [
  ['SUPER_ADMIN', 'مدير عام'], ['OPS', 'عمليات'], ['FINANCE', 'مالية'], ['SUPPORT', 'دعم'],
];

export const adminRoleLabel = (role: string) => ADMIN_ROLES.find(([k]) => k === role)?.[1] ?? role;
