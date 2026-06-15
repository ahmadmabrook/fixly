import { ReactNode, useId } from 'react';
import { toast } from 'sonner';
import { useDialog } from '../hooks/useDialog';

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
    PENDING:     { ar: 'قيد الانتظار',   bg: '#E2E8F0', fg: '#475569' },
    CONFIRMED:   { ar: 'مؤكد',           bg: '#DBEAFE', fg: '#1366D6' },
    EN_ROUTE:    { ar: 'في الطريق',      bg: '#CCFBF1', fg: '#0F766E' },
    ARRIVED:     { ar: 'وصل الفني',      bg: '#CCFBF1', fg: '#0F766E' },
    IN_PROGRESS: { ar: 'جارٍ التنفيذ',  bg: '#FEF3C7', fg: '#B45309' },
    COMPLETED:   { ar: 'مكتمل',          bg: '#DCFCE7', fg: '#15803D' },
    CANCELLED:   { ar: 'ملغى',           bg: '#FEE2E2', fg: '#B91C1C' },
    DISPUTED:    { ar: 'نزاع',           bg: '#FEE2E2', fg: '#B91C1C' },
    // Payout statuses (COMPLETED reuses the green entry above)
    PROCESSING:  { ar: 'قيد المعالجة',  bg: '#FEF3C7', fg: '#B45309' },
    FAILED:      { ar: 'فشل',            bg: '#FEE2E2', fg: '#B91C1C' },
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

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('');
  const hue = (name.charCodeAt(0) * 37) % 360;
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: `hsl(${hue} 50% 55%)`, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5 flex flex-col gap-1">
      <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', fontFamily: 'Inter' }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: '#94A3B8' }}>{sub}</span>}
    </Card>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: '#1366D6', borderTopColor: 'transparent' }}
      />
    </div>
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
    <div className="overflow-x-auto">
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
      style={{ fontSize: 12, fontWeight: 600, color: '#64748B', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' }}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={`py-3 px-4 ${className ?? ''}`}
      style={{ borderBottom: '1px solid #F8FAFC', color: '#1E293B' }}
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
      ? { background: '#1366D6', color: '#FFF', border: 'none' }
      : { background: 'transparent', color: '#1366D6', border: '1px solid #1366D6' };
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
      ? { background: '#B91C1C', color: '#FFF', border: 'none' }
      : { background: '#1366D6', color: '#FFF', border: 'none' };
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
          background: '#FFF', borderRadius: 16, padding: 24, width: '100%',
          maxWidth: 380, margin: '0 16px', boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
        }}
        dir="rtl"
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 18, color: '#0F172A' }}>{title}</h3>
        {body && (
          <p id={bodyId} style={{ color: '#475569', fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{body}</p>
        )}
        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 20px', borderRadius: 8, background: 'transparent',
              color: '#475569', border: '1px solid #CBD5E1', fontWeight: 600, fontSize: 14,
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
