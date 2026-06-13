import { PaymentService } from './PaymentService';
import { prisma } from '../../infrastructure/database/prisma';
import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    payment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    booking: { findUnique: jest.fn() },
    ledgerEntry: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  payment: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  booking: { findUnique: jest.Mock };
  ledgerEntry: { create: jest.Mock };
  $transaction: jest.Mock;
};

function makeProvider(): jest.Mocked<IPaymentProvider> {
  return {
    preAuthorize: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'PRE_AUTHORIZED' }),
    capture: jest.fn().mockResolvedValue({ providerRef: 'ref_1', status: 'CAPTURED' }),
    refund: jest.fn().mockResolvedValue(undefined),
  };
}

describe('PaymentService', () => {
  let provider: jest.Mocked<IPaymentProvider>;
  let service: PaymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = makeProvider();
    service = new PaymentService(provider);
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }), update: jest.fn().mockResolvedValue({}) },
        ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
      }),
    );
  });

  describe('preAuthorizeForBooking', () => {
    it('pre-authorizes and writes Payment + ledger for a fresh booking', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      mockedPrisma.booking.findUnique.mockResolvedValue({ id: 'bk-1', totalJod: 25 });

      await service.preAuthorizeForBooking('bk-1');

      expect(provider.preAuthorize).toHaveBeenCalledWith('bk-1', 25);
      expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
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
  });

  describe('captureForBooking', () => {
    it('captures a PRE_AUTHORIZED payment', async () => {
      mockedPrisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', providerRef: 'ref_1', amountJod: 25, status: 'PRE_AUTHORIZED' });
      await service.captureForBooking('bk-1');
      expect(provider.capture).toHaveBeenCalledWith('ref_1');
      expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
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
  });
});
