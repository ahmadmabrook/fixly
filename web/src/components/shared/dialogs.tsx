import { ReactNode, useId } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { COLOR_BRAND_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../../lib/theme';

/**
 * Accessible modal shell: backdrop click + Escape close, focus trap, focus
 * restore on unmount, and the required dialog ARIA wiring. Use this for any
 * bottom-sheet / centered dialog so a11y behaviour is consistent everywhere
 * instead of being re-implemented (and forgotten) per page.
 */
export function Modal({
  title,
  onClose,
  children,
  variant = 'sheet',
  maxWidth = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 'sheet' = bottom sheet on mobile, centered on desktop; 'center' = always centered. */
  variant?: 'sheet' | 'center';
  maxWidth?: 'sm' | 'md';
}) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const titleId = useId();
  const align = variant === 'sheet' ? 'items-end md:items-center' : 'items-center';
  const radius = variant === 'sheet' ? 'rounded-t-2xl md:rounded-2xl' : 'rounded-2xl';
  const width = maxWidth === 'sm' ? 'md:max-w-sm' : 'md:max-w-md';
  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${align}`}
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white ${radius} p-5 w-full ${width} max-h-[85vh] overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 18, textAlign: variant === 'center' ? 'center' : undefined }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, body, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء',
  onConfirm, onCancel,
}: {
  title: string; body?: string; confirmLabel?: string; cancelLabel?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useDialog<HTMLDivElement>(onCancel);
  const titleId = useId();
  const bodyId = useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onCancel}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="mx-5 bg-white rounded-2xl p-5 shadow-2xl"
        style={{ maxWidth: 360, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ fontWeight: 700, fontSize: 18, textAlign: 'center' }}>{title}</h3>
        {body && <p id={bodyId} style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14, textAlign: 'center', marginTop: 8 }}>{body}</p>}
        <div className="mt-5 space-y-2">
          <button onClick={onConfirm} className="w-full h-[52px] rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>{confirmLabel}</button>
          <button onClick={onCancel} className="w-full h-[52px] rounded-xl" style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 600 }}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
