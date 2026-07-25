import { VerificationStatus } from '@prisma/client';
import { MaterialVerificationService } from './MaterialVerificationService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import { postVarianceDeduction, DeductionAlreadyAppliedError } from './materialLedger';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    technicianProfile: { findUnique: jest.fn() },
    materialVerificationRequest: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    notification: { create: jest.fn() },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]))),
  },
}));

jest.mock('./materialLedger', () => ({
  postVarianceDeduction: jest.fn(),
  DeductionAlreadyAppliedError: class DeductionAlreadyAppliedError extends Error {},
}));

const mocked = prisma as unknown as {
  technicianProfile: { findUnique: jest.Mock };
  materialVerificationRequest: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; findMany: jest.Mock; update: jest.Mock };
};
const mockedPost = postVarianceDeduction as jest.Mock;

const REQUEST_BASE = { id: 'mvr1', bookingId: 'b1', technicianId: 'tech1', deltaFils: 1500, technician: { userId: 'tech-user-1' } };

describe('MaterialVerificationService.uploadInvoice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a technician who does not own the request', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue({ ...REQUEST_BASE, status: VerificationStatus.OPEN });
    const svc = new MaterialVerificationService();
    await expect(svc.uploadInvoice('mvr1', 'someone-else', 'https://x/inv.jpg')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects uploading against a request that is not OPEN', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue({ ...REQUEST_BASE, status: VerificationStatus.DEDUCTED });
    const svc = new MaterialVerificationService();
    await expect(svc.uploadInvoice('mvr1', 'tech-user-1', 'https://x/inv.jpg')).rejects.toBeInstanceOf(ConflictError);
  });

  it('moves OPEN -> INVOICE_PROVIDED on a valid upload', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue({ ...REQUEST_BASE, status: VerificationStatus.OPEN });
    mocked.materialVerificationRequest.update.mockResolvedValue({ status: VerificationStatus.INVOICE_PROVIDED });
    const svc = new MaterialVerificationService();
    const result = await svc.uploadInvoice('mvr1', 'tech-user-1', 'https://x/inv.jpg');
    expect(result.status).toBe(VerificationStatus.INVOICE_PROVIDED);
  });
});

describe('MaterialVerificationService.adminResolve', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFoundError for a missing request', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue(null);
    const svc = new MaterialVerificationService();
    await expect(svc.adminResolve('missing', 'UPHELD', 'admin1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects resolving an already-resolved request', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue({ ...REQUEST_BASE, status: VerificationStatus.WITHDRAWN });
    const svc = new MaterialVerificationService();
    await expect(svc.adminResolve('mvr1', 'UPHELD', 'admin1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('UPHELD closes the request with no ledger call', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue({ ...REQUEST_BASE, status: VerificationStatus.INVOICE_PROVIDED });
    mocked.materialVerificationRequest.update.mockResolvedValue({ status: VerificationStatus.UPHELD });
    const svc = new MaterialVerificationService();
    const result = await svc.adminResolve('mvr1', 'UPHELD', 'admin1');
    expect(result.status).toBe(VerificationStatus.UPHELD);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('DEDUCTED posts the deduction and notifies the technician', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue({ ...REQUEST_BASE, status: VerificationStatus.OPEN });
    mockedPost.mockResolvedValue({ applied: true });
    mocked.materialVerificationRequest.update.mockResolvedValue({});
    mocked.materialVerificationRequest.findUniqueOrThrow.mockResolvedValue({ status: VerificationStatus.DEDUCTED });

    const svc = new MaterialVerificationService();
    const result = await svc.adminResolve('mvr1', 'DEDUCTED', 'admin1');

    expect(result.status).toBe(VerificationStatus.DEDUCTED);
    expect(mockedPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ verificationRequestId: 'mvr1', deltaFils: 1500 }));
    expect(mocked.materialVerificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: VerificationStatus.DEDUCTED, resolvedById: 'admin1' }) }),
    );
  });

  it('DEDUCTED throws a clear ConflictError when the technician has no pending payout', async () => {
    mocked.materialVerificationRequest.findUnique.mockResolvedValue({ ...REQUEST_BASE, status: VerificationStatus.OPEN });
    mockedPost.mockResolvedValue({ applied: false, reason: 'insufficient_pending_payout' });
    const svc = new MaterialVerificationService();
    await expect(svc.adminResolve('mvr1', 'DEDUCTED', 'admin1')).rejects.toThrow(/no PENDING payout/);
  });
});

describe('MaterialVerificationService.settleExpiredVerifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('settles what it can and leaves the rest OPEN for the next run', async () => {
    mocked.materialVerificationRequest.findMany.mockResolvedValue([
      { ...REQUEST_BASE, id: 'mvr-ok' },
      { ...REQUEST_BASE, id: 'mvr-broke', technician: { userId: 'tech-user-2' } },
    ]);
    mockedPost.mockImplementation((_tx, params) => Promise.resolve(params.verificationRequestId === 'mvr-ok' ? { applied: true } : { applied: false, reason: 'insufficient_pending_payout' }));
    mocked.materialVerificationRequest.update.mockResolvedValue({});

    const svc = new MaterialVerificationService();
    const result = await svc.settleExpiredVerifications();

    expect(result).toEqual({ settled: 1, skipped: 1 });
  });

  it('counts an already-applied (concurrent-race) deduction as settled, not an error', async () => {
    mocked.materialVerificationRequest.findMany.mockResolvedValue([{ ...REQUEST_BASE }]);
    mockedPost.mockRejectedValue(new DeductionAlreadyAppliedError());

    const svc = new MaterialVerificationService();
    const result = await svc.settleExpiredVerifications();

    expect(result).toEqual({ settled: 1, skipped: 0 });
  });

  it('propagates an unexpected error instead of silently skipping it', async () => {
    mocked.materialVerificationRequest.findMany.mockResolvedValue([{ ...REQUEST_BASE }]);
    mockedPost.mockRejectedValue(new Error('db down'));

    const svc = new MaterialVerificationService();
    await expect(svc.settleExpiredVerifications()).rejects.toThrow('db down');
  });
});
