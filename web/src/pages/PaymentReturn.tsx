import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api, ApiError, CheckoutState, CheckoutSession } from '../lib/api';
import { Card, notify } from '../components/shared';
import HyperPayWidget from '../components/HyperPayWidget';

type Phase = 'loading' | CheckoutState | 'error';

/**
 * Landing page HyperPay redirects to after the customer submits the payment widget.
 * Finalizes the checkout (idempotently — the webhook may have already resolved it) and
 * shows the outcome. On rejection the customer can retry with a fresh session.
 */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const bookingId = params.get('bookingId') ?? '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [retrySession, setRetrySession] = useState<CheckoutSession | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setPhase('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { state } = await api.get<{ state: CheckoutState }>(`/bookings/${bookingId}/payment-status`);
        if (!cancelled) setPhase(state);
      } catch (e) {
        if (!cancelled) {
          setPhase('error');
          notify(e instanceof ApiError ? e.message : 'تعذّر التحقق من حالة الدفع', 'error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

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
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>إعادة المحاولة</h1>
        <Card className="p-6 mt-4"><HyperPayWidget session={retrySession} returnUrl={returnUrl} /></Card>
      </main>
    );
  }

  return (
    <main className="max-w-[640px] mx-auto px-6 py-16 text-center">
      <Card className="p-8">
        {phase === 'loading' && <p style={{ color: '#475569', fontSize: 16 }}>جارٍ التحقق من حالة الدفع…</p>}

        {phase === 'authorized' && (
          <Result tone="success" title="تم تأكيد الدفع" body="تم حجز المبلغ وسيُخصم بعد إتمام الخدمة.">
            <PrimaryButton onClick={() => navigate('/my-bookings')}>عرض حجوزاتي</PrimaryButton>
          </Result>
        )}

        {phase === 'pending' && (
          <Result tone="muted" title="الدفع قيد المعالجة" body="سنحدّث حالة الحجز فور تأكيد الدفع.">
            <PrimaryButton onClick={() => navigate('/my-bookings')}>عرض حجوزاتي</PrimaryButton>
          </Result>
        )}

        {phase === 'rejected' && (
          <Result tone="error" title="تعذّر إتمام الدفع" body="لم يتم تأكيد الدفع. يمكنك المحاولة مرة أخرى.">
            <PrimaryButton onClick={() => void retry()}>حاول مرة أخرى</PrimaryButton>
          </Result>
        )}

        {phase === 'error' && (
          <Result tone="error" title="حدث خطأ" body="تعذّر التحقق من حالة الدفع.">
            <PrimaryButton onClick={() => navigate('/my-bookings')}>عرض حجوزاتي</PrimaryButton>
          </Result>
        )}
      </Card>
    </main>
  );
}

function Result({ tone, title, body, children }: { tone: 'success' | 'error' | 'muted'; title: string; body: string; children: React.ReactNode }) {
  const color = tone === 'success' ? '#15803D' : tone === 'error' ? '#B91C1C' : '#0F172A';
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color }}>{title}</h1>
      <p style={{ color: '#475569', fontSize: 14, margin: '8px 0 20px' }}>{body}</p>
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-12 px-6 rounded-xl" style={{ background: '#1366D6', color: '#FFF', fontWeight: 700 }}>
      {children}
    </button>
  );
}
