import type { IPaymentProvider, PspWebhookEvent, PrepareCheckoutResult } from '../../domain/providers/IPaymentProvider';
import { PaymentAuthorizationFlow } from './PaymentService.authorization';
import { PaymentCaptureRefundFlow } from './PaymentService.captureRefund';
import { PaymentWebhookFlow } from './PaymentService.webhook';

/**
 * Payment lifecycle for a booking, driven by outbox events + PSP webhooks.
 *
 * Outbox (at-least-once → every method idempotent):
 *   booking.created   → preAuthorizeForBooking  (place hold)
 *   booking.completed → captureForBooking       (capture + commission split + payout accrual)
 *   booking.cancelled → handleCancellation      (void hold OR refund capture, claw back payout)
 *
 * PSP webhooks (the PSP is the source of truth for async outcomes):
 *   dispute.opened/closed, auth.expired, refund.settled → handleWebhookEvent
 *
 * Safety model:
 *   - PSP idempotency keys de-dupe external calls across retries/crashes.
 *   - Transition-guarded writes (updateMany WHERE status=expected) make every
 *     DB mutation apply at most once, so replays/concurrent workers can't
 *     double-apply a state change or write a duplicate ledger row.
 *   - All money is Prisma.Decimal end-to-end (never float).
 *
 * The lifecycle is implemented across sibling files, composed here:
 *   PaymentService.ledger.ts        — shared ledger-posting + captured-amount helpers
 *   PaymentService.authorization.ts — pre-auth hold + hosted-checkout authorization
 *   PaymentService.captureRefund.ts — capture, cancellation release, admin refund
 *   PaymentService.webhook.ts       — PSP webhook reconciliation
 * This class is the public entry point; it delegates every method to the
 * relevant flow so its own signature and behavior are unchanged.
 */
export class PaymentService {
  private readonly authFlow: PaymentAuthorizationFlow;
  private readonly captureFlow: PaymentCaptureRefundFlow;
  private readonly webhookFlow: PaymentWebhookFlow;

  constructor(
    private readonly provider: IPaymentProvider,
    private readonly providerName = 'mock',
  ) {
    this.authFlow = new PaymentAuthorizationFlow(provider, providerName);
    this.captureFlow = new PaymentCaptureRefundFlow(provider, providerName);
    this.webhookFlow = new PaymentWebhookFlow(this.authFlow, this.captureFlow);
  }

  /** Place a hold for a new booking. Idempotent: no-op if an active Payment exists. */
  async preAuthorizeForBooking(bookingId: string): Promise<void> {
    return this.authFlow.preAuthorizeForBooking(bookingId);
  }

  /** Open (or refresh) a hosted-checkout session for a booking awaiting payment. */
  async prepareCheckout(bookingId: string): Promise<PrepareCheckoutResult> {
    return this.authFlow.prepareCheckout(bookingId);
  }

  /** Query the hosted-checkout outcome and reconcile it into our state. */
  async finalizeCheckout(bookingId: string): Promise<'authorized' | 'pending' | 'rejected'> {
    return this.authFlow.finalizeCheckout(bookingId);
  }

  /** Capture held funds on completion (optionally a partial amount). */
  async captureForBooking(bookingId: string, requestedAmountJod?: number | string): Promise<void> {
    return this.captureFlow.captureForBooking(bookingId, requestedAmountJod);
  }

  /** Release money tied to a cancelled booking (void hold or refund capture). */
  async handleCancellation(bookingId: string): Promise<void> {
    return this.captureFlow.handleCancellation(bookingId);
  }

  /** Admin-initiated partial or full refund of a captured payment (P-8). */
  async refundBooking(bookingId: string, amountJod: number | string) {
    return this.captureFlow.refundBooking(bookingId, amountJod);
  }

  /** Apply a verified, deduped PSP webhook (P-3 / P-11). */
  async handleWebhookEvent(event: PspWebhookEvent): Promise<void> {
    return this.webhookFlow.handleWebhookEvent(event);
  }
}
