import { Prisma } from '@prisma/client';
import { PaymentService } from './PaymentService';
import { prisma } from '../../infrastructure/database/prisma';
import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    payment: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
    booking: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../shared/env', () => ({
  env: () => ({ CURRENCY: 'JOD', PLATFORM_COMMISSION_PCT: 15, AUTH_HOLD_EXPIRY_DAYS: 6 }),
}));

const mockedPrisma = prisma as unknown as {
  payment: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock; upsert: jest.Mock };
  booking: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

type Tx = {
  payment: { create: jest.Mock; updateMany: jest.Mock };
  ledgerEntry: { create: jest.Mock };
  payout: { create: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock };
  dispute: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  booking: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  outboxEvent: { create: jest.Mock };
};

function makeTx(over: Partial<Record<string, unknown>> = {}): Tx {
  return {
    payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    payout: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue(null) },
    dispute: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue({ id: 'd1', amountJod: new Prisma.Decimal(25) }), update: jest.fn().mockResolvedValue({}) },
    booking: { findUnique: jest.fn().mockResolvedValue({ technicianId: 'tp1' }), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  } as Tx;
}

function makeProvider(mode: 'instant' | 'hosted' = 'instant'): jest.Mocked<IPaymentProvider> {
  return {
    mode,
    preAuthorize: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'PRE_AUTHORIZED' }),
    prepareCheckout: jest.fn().mockResolvedValue({ checkoutId: 'co_1', scriptUrl: 'about:blank', brands: ['VISA'] }),
    getCheckoutResult: jest.fn().mockResolvedValue({ state: 'authorized', providerRef: 'ref_1', resultCode: '000.100.110', resultDescription: 'ok' }),
    capture: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'CAPTURED', capturedAmountJod: 25 }),
    void: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'VOIDED' }),
    refund: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'REFUNDED', refundedAmountJod: 25 }),
    getStatus: jest.fn().mockResolvedValue({ state: 'CAPTURED' }),
    decodeWebhook: jest.fn(),
  } as unknown as jest.Mocked<IPaymentProvider>;
}

describe('PaymentService', () => {
  let provider: jest.Mocked<IPaymentProvider>;
  let service: PaymentService;
  let tx: Tx;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = makeProvider();
    service = new PaymentService(provider);
    tx = makeTx();
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: Tx) => unknown) => fn(tx));
  });

  describe('preAuthorizeForBooking', () => {
    it('places a hold + CHARGE ledger for a fresh booking', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: new Prisma.Decimal(25) });
      await service.preAuthorizeForBooking('bk-1');
      expect(provider.preAuthorize).toHaveBeenCalledWith('bk-1', '25', 'preauth:bk-1');
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CHARGE', direction: 'CREDIT' }) }),
      );
    });

    it('skips when an active payment already exists', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'p', status: 'PRE_AUTHORIZED' });
      await service.preAuthorizeForBooking('bk-1');
      expect(provider.preAuthorize).not.toHaveBeenCalled();
    });

    it('refuses a non-positive amount (P-12)', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: new Prisma.Decimal(0) });
      await service.preAuthorizeForBooking('bk-1');
      expect(provider.preAuthorize).not.toHaveBeenCalled();
    });

    it('treats a concurrent create (P2002) as idempotent', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: new Prisma.Decimal(25) });
      tx.payment.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));
      await expect(service.preAuthorizeForBooking('bk-1')).resolves.toBeUndefined();
    });
  });

  describe('captureForBooking', () => {
    const preAuthed = { id: 'pay-1', providerRef: 'ref_1', amountJod: new Prisma.Decimal(25), status: 'PRE_AUTHORIZED', preAuthorizedAt: new Date() };

    it('captures full, splits 15% commission, writes CAPTURE+FEE, accrues net payout', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(preAuthed);
      await service.captureForBooking('bk-1');
      expect(provider.capture).toHaveBeenCalledWith('ref_1', '25', 'capture:bk-1');
      const types = tx.ledgerEntry.create.mock.calls.map((c) => (c[0] as { data: { type: string } }).data.type);
      expect(types).toEqual(expect.arrayContaining(['CAPTURE', 'FEE']));
      // net = 25 - 3.75 = 21.25
      expect(tx.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ technicianId: 'tp1' }) }),
      );
      const payoutAmt = (tx.payout.create.mock.calls[0][0] as { data: { amountJod: Prisma.Decimal } }).data.amountJod;
      expect(payoutAmt.toString()).toBe('21.25');
    });

    it('supports partial capture (≤ authorized) and releases the residual hold (N-1)', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(preAuthed);
      provider.capture.mockResolvedValue({ providerRef: 'ref_1', status: 'CAPTURED', capturedAmountJod: 10 });
      await service.captureForBooking('bk-1', 10);
      expect(provider.capture).toHaveBeenCalledWith('ref_1', '10', 'capture:bk-1');
      // residual (25 − 10) hold is voided best-effort
      expect(provider.void).toHaveBeenCalledWith('ref_1', 'void-residual:bk-1');
    });

    it('does NOT void anything on a full capture', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(preAuthed);
      await service.captureForBooking('bk-1');
      expect(provider.void).not.toHaveBeenCalled();
    });

    it('rejects a capture amount above the authorized hold', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(preAuthed);
      await service.captureForBooking('bk-1', 999);
      expect(provider.capture).not.toHaveBeenCalled();
    });

    it('re-authorizes when the hold has expired (P-2)', async () => {
      const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days > 6
      mockedPrisma.payment.findUnique.mockResolvedValue({ ...preAuthed, preAuthorizedAt: old });
      mockedPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      provider.preAuthorize.mockResolvedValue({ providerRef: 'ref_2', status: 'PRE_AUTHORIZED' });
      await service.captureForBooking('bk-1');
      expect(provider.preAuthorize).toHaveBeenCalledWith('bk-1', '25', 'reauth:bk-1');
      expect(provider.capture).toHaveBeenCalledWith('ref_2', '25', 'capture:bk-1');
    });

    it('is idempotent: skips when not PRE_AUTHORIZED', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ ...preAuthed, status: 'CAPTURED' });
      await service.captureForBooking('bk-1');
      expect(provider.capture).not.toHaveBeenCalled();
    });

    it('propagates a provider failure (outbox retries)', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(preAuthed);
      provider.capture.mockRejectedValue(new Error('psp down'));
      await expect(service.captureForBooking('bk-1')).rejects.toThrow('psp down');
    });
  });

  describe('handleCancellation', () => {
    it('voids a PRE_AUTHORIZED hold', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'PRE_AUTHORIZED' });
      await service.handleCancellation('bk-1');
      expect(provider.void).toHaveBeenCalledWith('ref_1', 'void:bk-1');
      expect(provider.refund).not.toHaveBeenCalled();
    });

    it('refunds a CAPTURED payment and claws back the pending payout', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: new Prisma.Decimal(25), capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'CAPTURED' });
      await service.handleCancellation('bk-1');
      expect(provider.refund).toHaveBeenCalledWith('ref_1', '25', expect.stringContaining('refund:bk-1'));
      expect(tx.payout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { paymentId: 'pay-1', status: 'PENDING' }, data: { status: 'FAILED' } }),
      );
    });

    it('no-ops when there is no payment', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      await service.handleCancellation('bk-1');
      expect(provider.void).not.toHaveBeenCalled();
      expect(provider.refund).not.toHaveBeenCalled();
    });
  });

  describe('refundBooking (partial)', () => {
    it('partial refund → PARTIALLY_REFUNDED', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'CAPTURED', refundedAt: null });
      mockedPrisma.payment.findUniqueOrThrow.mockResolvedValue({ id: 'pay-1', status: 'PARTIALLY_REFUNDED' });
      await service.refundBooking('bk-1', 10);
      expect(provider.refund).toHaveBeenCalledWith('ref_1', '10', expect.any(String));
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PARTIALLY_REFUNDED' }) }),
      );
    });

    it('rejects a refund over the outstanding amount', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(20), status: 'PARTIALLY_REFUNDED', refundedAt: null });
      await expect(service.refundBooking('bk-1', 10)).rejects.toThrow(/exceeds outstanding/);
    });
  });

  describe('handleWebhookEvent', () => {
    it('opens a dispute (status DISPUTED + ledger + booking)', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'CAPTURED' });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      await service.handleWebhookEvent({ eventId: 'e1', type: 'payment.dispute.opened', providerRef: 'ref_1', amountJod: 25, reason: 'fraud' });
      expect(tx.dispute.create).toHaveBeenCalled();
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'DISPUTE', direction: 'DEBIT' }) }),
      );
    });

    it('lost dispute → CHARGEBACK + payout clawback', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'DISPUTED' });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      await service.handleWebhookEvent({ eventId: 'e2', type: 'payment.dispute.closed', providerRef: 'ref_1', disputeWon: false });
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CHARGEBACK' }) }),
      );
      expect(tx.payout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { paymentId: 'pay-1', status: 'PENDING' }, data: { status: 'FAILED' } }),
      );
    });

    it('lost dispute when the payout was already disbursed still records CHARGEBACK (N-2)', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'DISPUTED' });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.payout.updateMany.mockResolvedValue({ count: 0 }); // nothing PENDING to claw back
      tx.payout.findFirst.mockResolvedValue({ id: 'po-1', status: 'COMPLETED' }); // already disbursed
      await expect(service.handleWebhookEvent({ eventId: 'e7', type: 'payment.dispute.closed', providerRef: 'ref_1', disputeWon: false })).resolves.toBeUndefined();
      const ledgerTypes = tx.ledgerEntry.create.mock.calls.map((c) => (c[0] as { data: { type: string } }).data.type);
      expect(ledgerTypes).toContain('CHARGEBACK');
    });

    it('auth.expired on an uncaptured hold → FAILED', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'PRE_AUTHORIZED' });
      mockedPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      await service.handleWebhookEvent({ eventId: 'e3', type: 'payment.auth.expired', providerRef: 'ref_1' });
      expect(mockedPrisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1', status: 'PRE_AUTHORIZED' }, data: { status: 'FAILED' } }),
      );
    });

    it('ignores an event with no matching payment', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue(null);
      await expect(service.handleWebhookEvent({ eventId: 'e4', type: 'payment.refunded', providerRef: 'nope' })).resolves.toBeUndefined();
    });

    it('reconciles an out-of-band capture webhook (N-4) → CAPTURED', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'PRE_AUTHORIZED' });
      await service.handleWebhookEvent({ eventId: 'e5', type: 'payment.captured', providerRef: 'ref_1', amountJod: 25 });
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1', status: 'PRE_AUTHORIZED' }, data: expect.objectContaining({ status: 'CAPTURED' }) }),
      );
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CAPTURE' }) }),
      );
    });

    it('records a dispute even on a non-disputable (refunded) payment (N-3) but writes no DISPUTE ledger', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(25), status: 'REFUNDED' });
      tx.payment.updateMany.mockResolvedValue({ count: 0 }); // not disputable
      await service.handleWebhookEvent({ eventId: 'e6', type: 'payment.dispute.opened', providerRef: 'ref_1', amountJod: 25, reason: 'fraud' });
      expect(tx.dispute.create).toHaveBeenCalled();
      const ledgerTypes = tx.ledgerEntry.create.mock.calls.map((c) => (c[0] as { data: { type: string } }).data.type);
      expect(ledgerTypes).not.toContain('DISPUTE');
    });

    it('payment.refunded → forward-only, transition-guarded reconcile to the PSP figure (F1/F2)', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'CAPTURED' });
      await service.handleWebhookEvent({ eventId: 'e8', type: 'payment.refunded', providerRef: 'ref_1', amountJod: 25 });
      const call = mockedPrisma.payment.updateMany.mock.calls.at(-1)![0] as { where: { refundedAmountJod: { lt: unknown }; status: { in: string[] } }; data: { status: string } };
      // Optimistic guard: only advances when our stored total is below the settled figure.
      expect(call.where.refundedAmountJod).toEqual({ lt: expect.anything() });
      expect(call.where.status.in).toEqual(expect.arrayContaining(['CAPTURED', 'PARTIALLY_REFUNDED']));
      expect(call.data.status).toBe('REFUNDED'); // settled (25) >= captured (25)
    });

    it('payment.refunded with a partial settlement → PARTIALLY_REFUNDED', async () => {
      mockedPrisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', amountJod: new Prisma.Decimal(25), capturedAmountJod: new Prisma.Decimal(25), refundedAmountJod: new Prisma.Decimal(0), status: 'CAPTURED' });
      await service.handleWebhookEvent({ eventId: 'e9', type: 'payment.refunded', providerRef: 'ref_1', amountJod: 10 });
      const call = mockedPrisma.payment.updateMany.mock.calls.at(-1)![0] as { data: { status: string } };
      expect(call.data.status).toBe('PARTIALLY_REFUNDED');
    });
  });

  // ── hosted checkout (real-PSP flow) ─────────────────────────────────────────
  describe('hosted checkout', () => {
    let hosted: PaymentService;
    let hostedProvider: jest.Mocked<IPaymentProvider>;

    beforeEach(() => {
      hostedProvider = makeProvider('hosted');
      hosted = new PaymentService(hostedProvider, 'hyperpay');
    });

    describe('prepareCheckout', () => {
      it('opens a session + upserts a PENDING payment with the checkoutId', async () => {
        mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: new Prisma.Decimal(25), status: 'AWAITING_PAYMENT' });
        mockedPrisma.payment.upsert.mockResolvedValue({ id: 'pay-1' });
        const session = await hosted.prepareCheckout('bk-1');
        expect(session.checkoutId).toBe('co_1');
        expect(hostedProvider.prepareCheckout).toHaveBeenCalledWith({ bookingId: 'bk-1', amountJod: '25', currency: 'JOD' });
        expect(mockedPrisma.payment.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { bookingId: 'bk-1' }, update: expect.objectContaining({ status: 'PENDING', checkoutId: 'co_1' }) }),
        );
      });

      it('refuses to open a session unless the booking is AWAITING_PAYMENT', async () => {
        mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: new Prisma.Decimal(25), status: 'PENDING' });
        await expect(hosted.prepareCheckout('bk-1')).rejects.toThrow(/not awaiting payment/);
        expect(hostedProvider.prepareCheckout).not.toHaveBeenCalled();
      });
    });

    describe('finalizeCheckout', () => {
      const pending = { id: 'pay-1', bookingId: 'bk-1', status: 'PENDING', checkoutId: 'co_1' };

      it('authorized → promotes payment + booking and emits booking.created', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue(pending);
        mockedPrisma.booking.findUnique.mockResolvedValue({ totalJod: new Prisma.Decimal(25), customerId: 'cust-1' });
        hostedProvider.getCheckoutResult.mockResolvedValue({ state: 'authorized', providerRef: 'psp_1', amountJod: 25, currency: 'JOD', cardBrand: 'VISA', cardLast4: '0001', resultCode: '000.100.110', resultDescription: 'ok' });

        const state = await hosted.finalizeCheckout('bk-1');
        expect(state).toBe('authorized');
        expect(tx.payment.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'pay-1', status: 'PENDING' }, data: expect.objectContaining({ status: 'PRE_AUTHORIZED', providerRef: 'psp_1', cardLast4: '0001' }) }),
        );
        expect(tx.booking.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'bk-1', status: 'AWAITING_PAYMENT' }, data: { status: 'PENDING' } }),
        );
        expect(tx.outboxEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ eventType: 'booking.created' }) }),
        );
      });

      it('rejected → marks the payment FAILED (customer can retry)', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue(pending);
        hostedProvider.getCheckoutResult.mockResolvedValue({ state: 'rejected', resultCode: '800.100.150', resultDescription: 'declined' });
        const state = await hosted.finalizeCheckout('bk-1');
        expect(state).toBe('rejected');
        expect(mockedPrisma.payment.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'pay-1', status: 'PENDING' }, data: { status: 'FAILED' } }),
        );
      });

      it('pending → leaves the booking awaiting payment', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue(pending);
        hostedProvider.getCheckoutResult.mockResolvedValue({ state: 'pending', resultCode: '000.200.000', resultDescription: 'pending' });
        expect(await hosted.finalizeCheckout('bk-1')).toBe('pending');
        expect(tx.payment.updateMany).not.toHaveBeenCalled();
      });

      it('amount mismatch → voids the hold and fails (anti-tamper)', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue(pending);
        mockedPrisma.booking.findUnique.mockResolvedValue({ totalJod: new Prisma.Decimal(25), customerId: 'cust-1' });
        hostedProvider.getCheckoutResult.mockResolvedValue({ state: 'authorized', providerRef: 'psp_1', amountJod: 999, currency: 'JOD', resultCode: '000.100.110', resultDescription: 'ok' });
        const state = await hosted.finalizeCheckout('bk-1');
        expect(state).toBe('rejected');
        expect(hostedProvider.void).toHaveBeenCalledWith('psp_1', 'void-mismatch:bk-1');
        expect(mockedPrisma.payment.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: { status: 'FAILED' } }),
        );
      });

      it('already resolved → idempotent, no PSP call', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue({ ...pending, status: 'PRE_AUTHORIZED' });
        expect(await hosted.finalizeCheckout('bk-1')).toBe('authorized');
        expect(hostedProvider.getCheckoutResult).not.toHaveBeenCalled();
      });

      it('booking cancelled mid-authorization → voids the hold + fails (no funds for a dead booking)', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue(pending);
        mockedPrisma.booking.findUnique.mockResolvedValue({ totalJod: new Prisma.Decimal(25), customerId: 'cust-1' });
        hostedProvider.getCheckoutResult.mockResolvedValue({ state: 'authorized', providerRef: 'psp_1', amountJod: 25, currency: 'JOD', resultCode: '000.100.110', resultDescription: 'ok' });
        tx.payment.updateMany.mockResolvedValue({ count: 1 }); // payment claim succeeds
        tx.booking.updateMany.mockResolvedValue({ count: 0 }); // booking no longer AWAITING_PAYMENT (reconciler won)
        const state = await hosted.finalizeCheckout('bk-1');
        expect(state).toBe('rejected');
        expect(hostedProvider.void).toHaveBeenCalledWith('psp_1', 'void-stale-booking:bk-1');
        expect(mockedPrisma.payment.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: { status: 'FAILED' } }),
        );
        expect(tx.outboxEvent.create).not.toHaveBeenCalled(); // no booking.created for a dead booking
      });
    });

    describe('payment.authorized webhook', () => {
      it('promotes a PENDING payment (source of truth, even if the customer never returned)', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', bookingId: 'bk-1', status: 'PENDING' });
        mockedPrisma.booking.findUnique.mockResolvedValue({ totalJod: new Prisma.Decimal(25), customerId: 'cust-1' });
        await hosted.handleWebhookEvent({ eventId: 'pay-1:PA', type: 'payment.authorized', providerRef: 'psp_1', bookingId: 'bk-1', amountJod: 25, currency: 'JOD' });
        expect(tx.payment.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: 'PRE_AUTHORIZED', providerRef: 'psp_1' }) }),
        );
        expect(tx.outboxEvent.create).toHaveBeenCalled();
      });
    });

    describe('captureForBooking (hosted)', () => {
      const preAuthed = { id: 'pay-1', providerRef: 'psp_1', amountJod: new Prisma.Decimal(25), status: 'PRE_AUTHORIZED', preAuthorizedAt: new Date() };

      it('reconciles instead of double-capturing when already CAPTURED at the PSP', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue(preAuthed);
        hostedProvider.getStatus.mockResolvedValue({ state: 'CAPTURED', capturedAmountJod: 25 });
        await hosted.captureForBooking('bk-1');
        expect(hostedProvider.getStatus).toHaveBeenCalledWith('psp_1');
        expect(hostedProvider.capture).not.toHaveBeenCalled(); // no second charge
        expect(tx.payment.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: 'CAPTURED' }) }),
        );
      });

      it('captures normally when the PSP is still only AUTHORIZED', async () => {
        mockedPrisma.payment.findUnique.mockResolvedValue(preAuthed);
        hostedProvider.getStatus.mockResolvedValue({ state: 'AUTHORIZED' });
        await hosted.captureForBooking('bk-1');
        expect(hostedProvider.capture).toHaveBeenCalledWith('psp_1', '25', 'capture:bk-1');
      });

      it('refuses to capture an expired hold (no card-on-file to re-authorize)', async () => {
        const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // > 6 day expiry
        mockedPrisma.payment.findUnique.mockResolvedValue({ ...preAuthed, preAuthorizedAt: old });
        await expect(hosted.captureForBooking('bk-1')).rejects.toThrow(/hold expired/i);
        expect(hostedProvider.capture).not.toHaveBeenCalled();
      });
    });
  });
});
