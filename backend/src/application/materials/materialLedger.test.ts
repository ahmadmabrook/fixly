import { Prisma, PayoutStatus, LedgerType, LedgerDirection } from '@prisma/client';
import { postVarianceDeduction, DeductionAlreadyAppliedError } from './materialLedger';

function makeTx(overrides: { findFirst?: jest.Mock; updateMany?: jest.Mock; create?: jest.Mock } = {}) {
  return {
    payout: {
      findFirst: overrides.findFirst ?? jest.fn(),
      updateMany: overrides.updateMany ?? jest.fn(),
    },
    ledgerEntry: {
      create: overrides.create ?? jest.fn(),
    },
  } as unknown as Prisma.TransactionClient;
}

const baseParams = {
  verificationRequestId: 'mvr1',
  technicianId: 'tech1',
  bookingId: 'booking1',
  deltaFils: 5000,
  description: 'Material price variance settled after 24h deadline',
};

describe('postVarianceDeduction', () => {
  it('is a no-op when the delta is zero', async () => {
    const findFirst = jest.fn();
    const tx = makeTx({ findFirst });
    const result = await postVarianceDeduction(tx, { ...baseParams, deltaFils: 0 });
    expect(result).toEqual({ applied: true });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns insufficient_pending_payout when the technician has no covering PENDING payout', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const tx = makeTx({ findFirst });
    const result = await postVarianceDeduction(tx, baseParams);
    expect(result).toEqual({ applied: false, reason: 'insufficient_pending_payout' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { technicianId: 'tech1', status: PayoutStatus.PENDING, amountJod: { gte: new Prisma.Decimal('5') } },
      }),
    );
  });

  it('returns insufficient_pending_payout when the CAS decrement races and applies 0 rows', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'payout1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const create = jest.fn();
    const tx = makeTx({ findFirst, updateMany, create });
    const result = await postVarianceDeduction(tx, baseParams);
    expect(result).toEqual({ applied: false, reason: 'insufficient_pending_payout' });
    expect(create).not.toHaveBeenCalled();
  });

  it('decrements the oldest PENDING payout and posts a DEBIT ADJUSTMENT ledger entry keyed matverif:{id}', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'payout1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({});
    const tx = makeTx({ findFirst, updateMany, create });

    const result = await postVarianceDeduction(tx, baseParams);

    expect(result).toEqual({ applied: true });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payout1', status: PayoutStatus.PENDING, amountJod: { gte: new Prisma.Decimal('5') } },
        data: { amountJod: { decrement: new Prisma.Decimal('5') } },
      }),
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payoutId: 'payout1',
        type: LedgerType.ADJUSTMENT,
        direction: LedgerDirection.DEBIT,
        amountJod: new Prisma.Decimal('5'),
        refKey: 'matverif:mvr1',
      }),
    });
  });

  it('throws DeductionAlreadyAppliedError (rolling back the decrement) on a refKey unique violation', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'payout1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' });
    const create = jest.fn().mockRejectedValue(p2002);
    const tx = makeTx({ findFirst, updateMany, create });

    await expect(postVarianceDeduction(tx, baseParams)).rejects.toBeInstanceOf(DeductionAlreadyAppliedError);
  });

  it('propagates an unrelated error from the ledger insert', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'payout1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockRejectedValue(new Error('connection reset'));
    const tx = makeTx({ findFirst, updateMany, create });

    await expect(postVarianceDeduction(tx, baseParams)).rejects.toThrow('connection reset');
  });
});
