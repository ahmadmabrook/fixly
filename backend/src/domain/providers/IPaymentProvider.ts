export interface PreAuthResult {
  providerRef: string;
  status: 'PRE_AUTHORIZED';
}

export interface CaptureResult {
  providerRef: string;
  status: 'CAPTURED';
}

export interface VoidResult {
  providerRef: string;
  status: 'VOIDED';
}

export interface RefundResult {
  providerRef: string;
  status: 'REFUNDED';
}

/**
 * Payment service provider (PSP) port. The `idempotencyKey` is passed to the
 * real PSP so a retried call (outbox at-least-once, or a crash between the
 * provider call and the DB commit) is de-duplicated by the PSP instead of
 * double-charging / double-refunding. Mocks ignore it; real adapters MUST
 * forward it (e.g. Stripe's `Idempotency-Key` header).
 */
export interface IPaymentProvider {
  /** Place a hold for a freshly created booking. */
  preAuthorize(bookingId: string, amountJod: number, idempotencyKey?: string): Promise<PreAuthResult>;
  /** Capture a previously placed hold (on completion). */
  capture(providerRef: string, idempotencyKey?: string): Promise<CaptureResult>;
  /** Release an uncaptured hold (booking cancelled before capture). */
  void(providerRef: string, idempotencyKey?: string): Promise<VoidResult>;
  /** Refund already-captured funds (booking cancelled/refunded after capture). */
  refund(providerRef: string, idempotencyKey?: string): Promise<RefundResult>;
}
