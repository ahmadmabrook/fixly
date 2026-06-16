export interface PreAuthResult {
  providerRef: string;
  status: 'PRE_AUTHORIZED';
}

export interface CaptureResult {
  providerRef: string;
  status: 'CAPTURED';
  capturedAmountJod: number;
}

export interface VoidResult {
  providerRef: string;
  status: 'VOIDED';
}

export interface RefundResult {
  providerRef: string;
  status: 'REFUNDED';
  refundedAmountJod: number;
}

export type PaymentProviderState =
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'VOIDED'
  | 'DISPUTED'
  | 'EXPIRED'
  | 'UNKNOWN';

export interface PaymentStatusResult {
  state: PaymentProviderState;
  capturedAmountJod?: number;
  refundedAmountJod?: number;
}

/** Normalised inbound PSP webhook event (after signature verification + parse). */
export interface PspWebhookEvent {
  /** Provider's unique event id — used to dedupe at-least-once delivery. */
  eventId: string;
  type:
    | 'payment.captured'
    | 'payment.refunded'
    | 'payment.dispute.opened'
    | 'payment.dispute.closed'
    | 'payment.auth.expired'
    | string;
  providerRef: string;
  amountJod?: number;
  reason?: string;
  /** For dispute.closed: true = merchant won, false = lost (chargeback). */
  disputeWon?: boolean;
}

/**
 * Payment service provider (PSP) port. `idempotencyKey` is forwarded to the PSP
 * so a retried call (outbox at-least-once, or a crash between the call and our
 * DB commit) is de-duplicated — never double-charged/refunded. Amounts are in
 * JOD; partial capture/refund pass an explicit amount ≤ the authorized/captured value.
 */
export interface IPaymentProvider {
  preAuthorize(bookingId: string, amountJod: number, idempotencyKey?: string): Promise<PreAuthResult>;
  capture(providerRef: string, amountJod: number, idempotencyKey?: string): Promise<CaptureResult>;
  void(providerRef: string, idempotencyKey?: string): Promise<VoidResult>;
  refund(providerRef: string, amountJod: number, idempotencyKey?: string): Promise<RefundResult>;
  /** Authoritative state at the PSP (used for reconciliation). */
  getStatus(providerRef: string): Promise<PaymentStatusResult>;
  /** Verify a webhook signature against the raw body. */
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
  /** Parse a verified webhook body into a normalised event. */
  parseWebhook(rawBody: string): PspWebhookEvent;
}
