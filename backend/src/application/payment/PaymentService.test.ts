import { Prisma } from '@prisma/client';
import { PaymentService } from './PaymentService';
import { prisma } from '../../infrastructure/database/prisma';
import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    payment: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  payment: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

type TxMock = {
  payment: { create: jest.Mock; updateMany: jest.Mock };
  ledgerEntry: { create: jest.Mock };
};

function makeProvider(): jest.Mocked<IPaymentProvider> {
  return {
    preAuthorize: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'PRE_AUTHORIZED' }),
    capture: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'CAPTURED' }),
    void: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'VOIDED' }),
    refund: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'REFUNDED' }),
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' });
}

describe('PaymentService', () => {
  let provider: jest.Mocked<IPaymentProvider>;
  let service: PaymentService;
  let tx: TxMock;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = makeProvider();
    service = new PaymentService(provider);
    tx = {
      payment: {
        create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    };
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: TxMock) => unknown) => fn(tx));
  });

  // ── pre-authorize ─────────────────────────────────────────────────────────
  describe('preAuthorizeForBooking', () => {
    it('places a hold and writes Payment + CHARGE ledger for a fresh booking', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: 25 });

      await service.preAuthorizeForBooking('bk-1');

      expect(provider.preAuthorize).toHaveBeenCalledWith('bk-1', 25, 'preauth:bk-1');
      expect(tx.payment.create).toHaveBeenCalled();
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CHARGE', amountJod: 25 }) }),
      );
    });

    it('is idempotent: skips when a Payment already exists', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'PRE_AUTHORIZED' });
      await service.preAuthorizeForBooking('bk-1');
      expect(provider.preAuthorize).not.toHaveBeenCalled();
    });

    it('skips gracefully when the booking is missing', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      mockedPrisma.booking.findUnique.mockResolvedValue(null);
      await service.preAuthorizeForBooking('ghost');
      expect(provider.preAuthorize).not.toHaveBeenCalled();
    });

    it('treats a concurrent create (P2002) as an idempotent no-op', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: 25 });
      tx.payment.create.mockRejectedValue(p2002());
      await expect(service.preAuthorizeForBooking('bk-1')).resolves.toBeUndefined();
    });
  });

  // ── capture ───────────────────────────────────────────────────────────────
  describe('captureForBooking', () => {
    it('captures a PRE_AUTHORIZED payment with a transition guard + CAPTURE ledger', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'PRE_AUTHORIZED' });
      await service.captureForBooking('bk-1');
      expect(provider.capture).toHaveBeenCalledWith('ref_1', 'capture:bk-1');
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1', status: 'PRE_AUTHORIZED' } }),
      );
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CAPTURE' }) }),
      );
    });

    it('writes NO ledger when the transition guard loses the race (replay/concurrent)', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'PRE_AUTHORIZED' });
      tx.payment.updateMany.mockResolvedValue({ count: 0 });
      await service.captureForBooking('bk-1');
      expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('is idempotent: skips when already CAPTURED', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'CAPTURED' });
      await service.captureForBooking('bk-1');
      expect(provider.capture).not.toHaveBeenCalled();
    });

    it('skips when no payment exists', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      await service.captureForBooking('bk-1');
      expect(provider.capture).not.toHaveBeenCalled();
    });

    it('propagates a provider failure so the outbox retries (status unchanged)', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'PRE_AUTHORIZED' });
      provider.capture.mockRejectedValue(new Error('psp down'));
      await expect(service.captureForBooking('bk-1')).rejects.toThrow('psp down');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── cancellation (void / refund) ────────────────────────────────────────────
  describe('handleCancellation', () => {
    it('no-ops when no payment exists (cancelled before pre-auth)', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      await service.handleCancellation('bk-1');
      expect(provider.void).not.toHaveBeenCalled();
      expect(provider.refund).not.toHaveBeenCalled();
    });

    it('VOIDS the hold when PRE_AUTHORIZED → REFUNDED + REFUND ledger', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'PRE_AUTHORIZED' });
      await service.handleCancellation('bk-1');
      expect(provider.void).toHaveBeenCalledWith('ref_1', 'void:bk-1');
      expect(provider.refund).not.toHaveBeenCalled();
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1', status: 'PRE_AUTHORIZED' }, data: expect.objectContaining({ status: 'REFUNDED' }) }),
      );
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'REFUND' }) }),
      );
    });

    it('REFUNDS the capture when CAPTURED → REFUNDED + REFUND ledger', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'CAPTURED' });
      await service.handleCancellation('bk-1');
      expect(provider.refund).toHaveBeenCalledWith('ref_1', 'refund:bk-1');
      expect(provider.void).not.toHaveBeenCalled();
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1', status: 'CAPTURED' } }),
      );
    });

    it('is idempotent: skips when already REFUNDED', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'REFUNDED' });
      await service.handleCancellation('bk-1');
      expect(provider.void).not.toHaveBeenCalled();
      expect(provider.refund).not.toHaveBeenCalled();
    });

    it('writes NO ledger on a replayed void (transition guard loses)', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'PRE_AUTHORIZED' });
      tx.payment.updateMany.mockResolvedValue({ count: 0 });
      await service.handleCancellation('bk-1');
      expect(provider.void).toHaveBeenCalled();
      expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('propagates a provider failure so the outbox retries', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'PRE_AUTHORIZED' });
      provider.void.mockRejectedValue(new Error('psp down'));
      await expect(service.handleCancellation('bk-1')).rejects.toThrow('psp down');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
