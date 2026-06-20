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

/** Input to open a hosted-checkout session for a booking's pre-authorization. */
export interface PrepareCheckoutInput {
  /** Our booking id — forwarded as merchantTransactionId so webhooks/results correlate. */
  bookingId: string;
  amountJod: number | string;
  currency: string;
}

/**
 * A hosted-checkout session. The frontend uses `checkoutId` + `scriptUrl` to mount the
 * provider's payment widget (card fields render inside the PSP's iframe — PCI SAQ-A); the
 * customer authorizes there. `brands` is the allowed card-brand list for the widget.
 */
export interface PrepareCheckoutResult {
  checkoutId: string;
  scriptUrl: string;
  brands: string[];
}

/** Normalised outcome of a hosted-checkout session, queried after the customer pays. */
export interface CheckoutResult {
  /**
   * authorized = funds held (promote the booking);
   * pending    = still processing async (leave AWAITING_PAYMENT; a webhook will resolve it);
   * rejected   = declined/failed/expired (customer may retry with a new session).
   */
  state: 'authorized' | 'pending' | 'rejected';
  /** PSP transaction id for the authorization — becomes our `providerRef`. */
  providerRef?: string;
  amountJod?: number;
  currency?: string;
  /** Tokenised card metadata only — NEVER a PAN. */
  cardBrand?: string;
  cardLast4?: string;
  /** Raw PSP result code + description, for audit/logging. */
  resultCode: string;
  resultDescription: string;
}

/** Lowercased inbound webhook headers (Express normalises header names to lowercase). */
export type WebhookHeaders = Record<string, string | undefined>;

/** Normalised inbound PSP webhook event (after signature verification / decryption + parse). */
export interface PspWebhookEvent {
  /** Provider's unique event id — used to dedupe at-least-once delivery. */
  eventId: string;
  type:
    | 'payment.authorized'
    | 'payment.captured'
    | 'payment.refunded'
    | 'payment.dispute.opened'
    | 'payment.dispute.closed'
    | 'payment.auth.expired'
    | string;
  providerRef: string;
  /** Hosted-checkout session id, when the event correlates to a checkout (authorization). */
  checkoutId?: string;
  /**
   * Our booking id (the PSP's merchantTransactionId). Used to correlate an
   * authorization webhook to its Payment row, which does not yet have a providerRef.
   */
  bookingId?: string;
  amountJod?: number;
  currency?: string;
  reason?: string;
  cardBrand?: string;
  cardLast4?: string;
  /** For dispute.closed: true = merchant won, false = lost (chargeback). */
  disputeWon?: boolean;
}

/**
 * Payment service provider (PSP) port. `idempotencyKey` is forwarded to the PSP so a retried
 * call (outbox at-least-once, or a crash between the call and our DB commit) is de-duplicated —
 * never double-charged/refunded. Amounts are in JOD; partial capture/refund pass an explicit
 * amount ≤ the authorized/captured value.
 *
 * Two pre-authorization models, distinguished by `mode`:
 *   - `instant`: `preAuthorize()` holds funds synchronously (mock / dev). The booking flow
 *     authorizes on `booking.created`.
 *   - `hosted`: the customer authorizes on a PSP-hosted widget. Use `prepareCheckout()` +
 *     `getCheckoutResult()`; `preAuthorize()` is unsupported and throws.
 *
 * Capture / void / refund / getStatus / decodeWebhook are server-to-server for both modes.
 */
export interface IPaymentProvider {
  readonly mode: 'instant' | 'hosted';

  // ── instant pre-authorization (mock/dev) ────────────────────────────────────
  preAuthorize(bookingId: string, amountJod: number | string, idempotencyKey?: string): Promise<PreAuthResult>;

  // ── hosted checkout (real PSP) ───────────────────────────────────────────────
  /** Open a hosted-checkout session for a pre-authorization. */
  prepareCheckout(input: PrepareCheckoutInput): Promise<PrepareCheckoutResult>;
  /** Query a hosted-checkout session's authoritative outcome after the customer pays. */
  getCheckoutResult(checkoutId: string): Promise<CheckoutResult>;

  // ── back-office operations (both modes) ──────────────────────────────────────
  capture(providerRef: string, amountJod: number | string, idempotencyKey?: string): Promise<CaptureResult>;
  void(providerRef: string, idempotencyKey?: string): Promise<VoidResult>;
  refund(providerRef: string, amountJod: number | string, idempotencyKey?: string): Promise<RefundResult>;
  /** Authoritative state at the PSP (used for reconciliation). */
  getStatus(providerRef: string): Promise<PaymentStatusResult>;

  /**
   * Verify + parse an inbound webhook into a normalised event, or `null` if verification
   * fails. The mock uses an HMAC signature header; a real PSP may use encrypted payloads
   * (e.g. AES-GCM with IV + auth-tag headers), so the raw body bytes AND headers are passed.
   */
  decodeWebhook(rawBody: Buffer, headers: WebhookHeaders): PspWebhookEvent | null;
}
