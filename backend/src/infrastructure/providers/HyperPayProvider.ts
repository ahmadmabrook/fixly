import { createDecipheriv } from 'crypto';
import { Decimal } from '../../shared/money';
import type {
  IPaymentProvider,
  PreAuthResult,
  CaptureResult,
  VoidResult,
  RefundResult,
  PaymentStatusResult,
  PaymentProviderState,
  PrepareCheckoutInput,
  PrepareCheckoutResult,
  CheckoutResult,
  PspWebhookEvent,
  WebhookHeaders,
} from '../../domain/providers/IPaymentProvider';
import { logger } from '../../shared/logger';

export interface HyperPayConfig {
  entityId: string;
  accessToken: string;
  baseUrl: string;
  /** Hex AES-256-GCM key used to decrypt inbound webhook notifications. */
  webhookDecryptKey: string;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
}

/** OPPWA result-code classification (https://hyperpay.docs / OPPWA reference). */
const RE_SUCCESS = /^(000\.000\.|000\.100\.1|000\.[36]00\.[01][05]0)/;
const RE_SUCCESS_REVIEW = /^(000\.400\.0[^3]|000\.400\.[0-1]{2}0)/;
const RE_PENDING = /^(000\.200)/;
const RE_PENDING_ASYNC = /^(800\.400\.5|100\.400\.500)/;

export type ResultClass = 'success' | 'pending' | 'rejected';

/** Map an OPPWA result code to a coarse outcome. Unknown/unlisted codes → rejected. */
export function classifyResultCode(code: string): ResultClass {
  if (RE_SUCCESS.test(code) || RE_SUCCESS_REVIEW.test(code)) return 'success';
  if (RE_PENDING.test(code) || RE_PENDING_ASYNC.test(code)) return 'pending';
  return 'rejected';
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_CONNECTION_RETRIES = 2;
const FILS_DP = 3; // JOD is a 3-decimal (fils) currency — OPPWA wants the amount at that scale.

interface OppwaResult {
  result?: { code?: string; description?: string };
  id?: string;
  paymentType?: string;
  amount?: string;
  currency?: string;
  paymentBrand?: string;
  merchantTransactionId?: string;
  card?: { last4Digits?: string; bin?: string };
}

/**
 * HyperPay (OPPWA) payment provider — hosted checkout (COPYandPAY).
 *
 * Pre-authorization is customer-driven: `prepareCheckout` opens a session, the customer
 * authorizes on HyperPay's widget, and `getCheckoutResult` (plus the webhook, the source of
 * truth) reports the outcome. Capture / void / refund / status are server-to-server.
 *
 * Money: JOD is a 3-decimal currency; amounts are sent at fils scale (`X.XXX`).
 * Idempotency: OPPWA back-office ops reference a specific transaction id, so retries are NOT
 * issued after a response is received (a re-sent capture could double-charge). Connection
 * errors retry only for idempotent reads / session creation.
 */
export class HyperPayProvider implements IPaymentProvider {
  readonly mode = 'hosted' as const;
  private readonly timeoutMs: number;

  constructor(private readonly config: HyperPayConfig) {
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ── instant pre-auth is not supported for hosted checkout ───────────────────
  async preAuthorize(): Promise<PreAuthResult> {
    throw new Error('HyperPay uses hosted checkout — call prepareCheckout()/getCheckoutResult(), not preAuthorize()');
  }

  // ── hosted checkout ─────────────────────────────────────────────────────────
  async prepareCheckout(input: PrepareCheckoutInput): Promise<PrepareCheckoutResult> {
    const body = new URLSearchParams({
      entityId: this.config.entityId,
      amount: this.formatAmount(input.amountJod),
      currency: input.currency,
      paymentType: 'PA', // pre-authorization (hold)
      merchantTransactionId: input.bookingId,
    });
    const res = await this.post('/v1/checkouts', body, /* retriable */ true);
    const code = res.result?.code ?? '';
    // A prepared checkout returns 000.200.100 ("successfully created checkout"),
    // which classifies as pending; treat success|pending as a usable session.
    if (classifyResultCode(code) === 'rejected' || !res.id) {
      throw new Error(`HyperPay prepareCheckout failed: ${code} ${res.result?.description ?? ''}`.trim());
    }
    return {
      checkoutId: res.id,
      scriptUrl: `${this.config.baseUrl}/v1/paymentWidgets.js`,
      brands: ['VISA', 'MASTER'],
    };
  }

  async getCheckoutResult(checkoutId: string): Promise<CheckoutResult> {
    const qs = new URLSearchParams({ entityId: this.config.entityId });
    const res = await this.get(`/v1/checkouts/${encodeURIComponent(checkoutId)}/payment?${qs}`, /* retriable */ true);
    const code = res.result?.code ?? '';
    const klass = classifyResultCode(code);
    return {
      state: klass === 'success' ? 'authorized' : klass === 'pending' ? 'pending' : 'rejected',
      providerRef: res.id,
      amountJod: res.amount !== undefined ? Number(res.amount) : undefined,
      currency: res.currency,
      cardBrand: res.paymentBrand,
      cardLast4: res.card?.last4Digits,
      resultCode: code,
      resultDescription: res.result?.description ?? '',
    };
  }

  // ── back-office operations ──────────────────────────────────────────────────
  async capture(providerRef: string, amountJod: number | string): Promise<CaptureResult> {
    const body = new URLSearchParams({
      entityId: this.config.entityId,
      amount: this.formatAmount(amountJod),
      currency: 'JOD',
      paymentType: 'CP', // capture a pre-authorization
    });
    // Mutating op: never retried after a response (a re-sent capture could double-charge).
    const res = await this.post(`/v1/payments/${encodeURIComponent(providerRef)}`, body, /* retriable */ false);
    const code = res.result?.code ?? '';
    if (classifyResultCode(code) !== 'success') {
      throw new Error(`HyperPay capture failed: ${code} ${res.result?.description ?? ''}`.trim());
    }
    // OPPWA mints a new transaction id for the capture; refunds must reference IT
    // (the capture), so surface it as the new providerRef.
    return { providerRef: res.id ?? providerRef, status: 'CAPTURED', capturedAmountJod: Number(res.amount ?? amountJod) };
  }

  async void(providerRef: string): Promise<VoidResult> {
    const body = new URLSearchParams({ entityId: this.config.entityId, paymentType: 'RV' }); // reversal
    const res = await this.post(`/v1/payments/${encodeURIComponent(providerRef)}`, body, false);
    const code = res.result?.code ?? '';
    if (classifyResultCode(code) !== 'success') {
      throw new Error(`HyperPay void failed: ${code} ${res.result?.description ?? ''}`.trim());
    }
    return { providerRef: res.id ?? providerRef, status: 'VOIDED' };
  }

  async refund(providerRef: string, amountJod: number | string): Promise<RefundResult> {
    const body = new URLSearchParams({
      entityId: this.config.entityId,
      amount: this.formatAmount(amountJod),
      currency: 'JOD',
      paymentType: 'RF', // refund
    });
    const res = await this.post(`/v1/payments/${encodeURIComponent(providerRef)}`, body, false);
    const code = res.result?.code ?? '';
    if (classifyResultCode(code) !== 'success') {
      throw new Error(`HyperPay refund failed: ${code} ${res.result?.description ?? ''}`.trim());
    }
    return { providerRef: res.id ?? providerRef, status: 'REFUNDED', refundedAmountJod: Number(res.amount ?? amountJod) };
  }

  async getStatus(providerRef: string): Promise<PaymentStatusResult> {
    const qs = new URLSearchParams({ entityId: this.config.entityId });
    const res = await this.get(`/v1/payments/${encodeURIComponent(providerRef)}?${qs}`, true);
    return { state: this.mapState(res) };
  }

  // ── webhooks (AES-256-GCM encrypted notifications) ──────────────────────────
  decodeWebhook(rawBody: Buffer, headers: WebhookHeaders): PspWebhookEvent | null {
    const ivHex = headers['x-initialization-vector'];
    const tagHex = headers['x-authentication-tag'];
    if (!ivHex || !tagHex || !this.config.webhookDecryptKey) return null;
    let json: OppwaNotification;
    try {
      const key = Buffer.from(this.config.webhookDecryptKey, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');
      const ciphertext = Buffer.from(rawBody.toString('utf8'), 'hex');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      json = JSON.parse(plain) as OppwaNotification;
    } catch (err) {
      logger.warn({ err: (err as Error).message, ivLen: ivHex?.length, tagLen: tagHex?.length, bodyLen: rawBody.length }, 'HyperPay webhook decryption failed');
      return null;
    }
    return this.mapNotification(json);
  }

  /** Translate a decrypted OPPWA notification into our normalised event (or null to ignore). */
  private mapNotification(n: OppwaNotification): PspWebhookEvent | null {
    const p = n.payload;
    if (!p?.id) return null;
    const code = p.result?.code ?? '';
    const ok = classifyResultCode(code) === 'success';
    const base = {
      // OPPWA has no separate event id; (transaction id + op) dedupes redelivery.
      eventId: `${p.id}:${p.paymentType ?? 'NA'}`,
      providerRef: p.id,
      bookingId: p.merchantTransactionId,
      amountJod: p.amount !== undefined ? Number(p.amount) : undefined,
      currency: p.currency,
      cardBrand: p.paymentBrand,
      cardLast4: p.card?.last4Digits,
    };
    switch (p.paymentType) {
      case 'PA':
        return ok ? { ...base, type: 'payment.authorized' } : { ...base, type: 'payment.auth.expired' };
      case 'CP':
        return ok ? { ...base, type: 'payment.captured' } : null;
      case 'RF':
        return ok ? { ...base, type: 'payment.refunded' } : null;
      case 'CD':
        return { ...base, type: 'payment.dispute.opened', reason: p.result?.description };
      default:
        // RV (reversal) and other ops are reconciled synchronously; ignore here.
        return { ...base, type: `payment.${(p.paymentType ?? 'unknown').toLowerCase()}` };
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  /**
   * Format a JOD amount at fils scale (exactly 3 decimals) for the OPPWA boundary.
   * Uses Decimal (not a JS float) so an exact base-10 amount is never corrupted on the
   * way to the PSP (F3); callers pass the Decimal's string form.
   */
  private formatAmount(amount: number | string): string {
    return new Decimal(amount).toFixed(FILS_DP);
  }

  private mapState(res: OppwaResult): PaymentProviderState {
    const code = res.result?.code ?? '';
    if (classifyResultCode(code) !== 'success') return 'UNKNOWN';
    switch (res.paymentType) {
      case 'PA': return 'AUTHORIZED';
      case 'CP': case 'DB': return 'CAPTURED';
      case 'RF': return 'REFUNDED';
      case 'RV': return 'VOIDED';
      default: return 'UNKNOWN';
    }
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.accessToken}` };
  }

  private async post(path: string, body: URLSearchParams, retriable: boolean): Promise<OppwaResult> {
    return this.send(path, { method: 'POST', headers: { ...this.headers(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }, retriable);
  }

  private async get(path: string, retriable: boolean): Promise<OppwaResult> {
    return this.send(path, { method: 'GET', headers: this.headers() }, retriable);
  }

  /**
   * Issue a request with a wall-clock timeout. Retries ONLY on connection errors
   * (no response received) and ONLY when `retriable` — a mutating op that may have
   * reached the PSP is never re-sent. A non-2xx HTTP response with a parseable OPPWA
   * body is returned (the caller inspects result.code); a non-2xx without a body throws.
   */
  private async send(path: string, init: RequestInit, retriable: boolean): Promise<OppwaResult> {
    const url = `${this.config.baseUrl}${path}`;
    let lastErr: unknown;
    const attempts = retriable ? MAX_CONNECTION_RETRIES + 1 : 1;
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const text = await res.text();
        let parsed: OppwaResult | null = null;
        try { parsed = JSON.parse(text) as OppwaResult; } catch { /* non-JSON body */ }
        if (parsed) return parsed; // OPPWA always returns JSON with result.code; let caller classify
        throw new Error(`HyperPay ${res.status} non-JSON response: ${text.slice(0, 200)}`);
      } catch (err) {
        lastErr = err;
        // Only connection-phase failures (abort/network) are retriable. A thrown
        // non-JSON-response error above is a real HTTP response → never retried.
        const isConnError = err instanceof Error && (err.name === 'AbortError' || err.name === 'TypeError' || /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(err.message));
        if (!retriable || !isConnError || i === attempts - 1) break;
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('HyperPay request failed');
  }
}

interface OppwaNotification {
  type?: string;
  payload?: OppwaResult;
}
