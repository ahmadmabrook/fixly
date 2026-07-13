import { useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, CheckoutState, CheckoutSession } from '../lib/api';
import { Card, notify } from '../components/shared';
import HyperPayWidget from '../components/HyperPayWidget';
import { COLOR_BRAND_PRIMARY, COLOR_ERROR_TEXT, COLOR_SUCCESS_TEXT, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

type Phase = 'loading' | CheckoutState | 'error';

/** Terminal checkout states that should stop polling. */
const TERMINAL_STATES: ReadonlySet<string> = new Set(['authorized', 'rejected']);

/** Max number of re-polls when state is `pending` (~3 s apart = ~21 s ceiling). */
const MAX_POLL_ATTEMPTS = 7;

/**
 * Landing page HyperPay redirects to after the customer submits the payment widget.
 * Finalizes the checkout (idempotently — the webhook may have already resolved it) and
 * shows the outcome. On rejection the customer can retry with a fresh session.
 *
 * When the initial status is `pending`, the component re-polls every 3 s (up to
 * MAX_POLL_ATTEMPTS) so the user sees the final result without a manual refresh.
 */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const bookingId = params.get('bookingId') ?? '';
  const [retrySession, setRetrySession] = useState<CheckoutSession | null>(null);
  const pollCount = useRef(0);

  const { data, isError } = useQuery<CheckoutState>({
    queryKey: ['payment-status', bookingId],
    queryFn: async () => {
      const { state } = await api.get<{ state: CheckoutState }>(`/bookings/${bookingId}/payment-status`);
      return state;
    },
    enabled: !!bookingId,
    retry: 1,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state || TERMINAL_STATES.has(state)) return false;
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLL_ATTEMPTS) return false;
      return 3_000;
    },
  });

  // Derive a single UI phase from query state + bookingId presence.
  const resolvedPhase: Phase = !bookingId || isError ? 'error' : data ?? 'loading';

  const retry = useCallback(async () => {
    try {
      const session = await api.post<CheckoutSession>(`/bookings/${bookingId}/checkout`, {});
      setRetrySession(session);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'تعذّر بدء الدفع', 'error');
    }
  }, [bookingId]);

  if (retrySession) {
    const returnUrl = `${window.location.origin}/payment/return?bookingId=${bookingId}`;
    return (
      <main className="max-w-[640px] mx-auto px-6 py-10">
        <h1 style={{ fontSize: 20, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>إعادة المحاولة</h1>
        <Card className="p-6 mt-4"><HyperPayWidget session={retrySession} returnUrl={returnUrl} /></Card>
      </main>
    );
  }

  return (
    <main className="max-w-[640px] mx-auto px-6 py-16 text-center">
      <Card className="p-8">
        {resolvedPhase === 'loading' && <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 16 }}>جارٍ التحقق من حالة الدفع…</p>}

        {resolvedPhase === 'authorized' && (
          <Result tone="success" title="تم تأكيد الدفع" body="تم حجز المبلغ وسيُخصم بعد إتمام الخدمة.">
            <PrimaryButton onClick={() => navigate('/my-bookings')}>عرض حجوزاتي</PrimaryButton>
          </Result>
        )}

        {resolvedPhase === 'pending' && (
          <Result tone="muted" title="الدفع قيد المعالجة" body="سنحدّث حالة الحجز فور تأكيد الدفع.">
            <PrimaryButton onClick={() => navigate('/my-bookings')}>عرض حجوزاتي</PrimaryButton>
          </Result>
        )}

        {resolvedPhase === 'rejected' && (
          <Result tone="error" title="تعذّر إتمام الدفع" body="لم يتم تأكيد الدفع. يمكنك المحاولة مرة أخرى.">
            <PrimaryButton onClick={() => void retry()}>حاول مرة أخرى</PrimaryButton>
          </Result>
        )}

        {resolvedPhase === 'error' && (
          <Result tone="error" title="حدث خطأ" body="تعذّر التحقق من حالة الدفع.">
            <PrimaryButton onClick={() => navigate('/my-bookings')}>عرض حجوزاتي</PrimaryButton>
          </Result>
        )}
      </Card>
    </main>
  );
}

function Result({ tone, title, body, children }: { tone: 'success' | 'error' | 'muted'; title: string; body: string; children: React.ReactNode }) {
  const color = tone === 'success' ? COLOR_SUCCESS_TEXT : tone === 'error' ? COLOR_ERROR_TEXT : COLOR_TEXT_PRIMARY;
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color }}>{title}</h1>
      <p style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14, margin: '8px 0 20px' }}>{body}</p>
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-12 px-6 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
      {children}
    </button>
  );
}
