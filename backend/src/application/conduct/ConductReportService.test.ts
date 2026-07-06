import { ConductReportService } from './ConductReportService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ConflictError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    conductReport: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    technicianProfile: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mocked = prisma as unknown as {
  conductReport: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  technicianProfile: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

describe('ConductReportService.resolve', () => {
  const svc = new ConductReportService();
  beforeEach(() => jest.clearAllMocks());

  it('throws NotFoundError for a missing report', async () => {
    mocked.conductReport.findUnique.mockResolvedValue(null);
    await expect(svc.resolve('r1', 'UPHELD', 'admin1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to re-resolve a finalised report', async () => {
    mocked.conductReport.findUnique.mockResolvedValue({ id: 'r1', status: 'UPHELD', subjectTechId: 'tp1' });
    await expect(svc.resolve('r1', 'DISMISSED', 'admin1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('UPHELD increments the subject technician offPlatformFlags', async () => {
    mocked.conductReport.findUnique.mockResolvedValue({ id: 'r1', status: 'OPEN', subjectTechId: 'tp1' });
    const tx = {
      conductReport: { update: jest.fn().mockResolvedValue({ id: 'r1', status: 'UPHELD' }) },
      technicianProfile: { update: jest.fn().mockResolvedValue({}) },
    };
    mocked.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await svc.resolve('r1', 'UPHELD', 'admin1');

    expect(tx.technicianProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tp1' }, data: { offPlatformFlags: { increment: 1 } } }),
    );
  });

  it('DISMISSED does not touch the technician', async () => {
    mocked.conductReport.findUnique.mockResolvedValue({ id: 'r1', status: 'OPEN', subjectTechId: 'tp1' });
    const tx = {
      conductReport: { update: jest.fn().mockResolvedValue({ id: 'r1', status: 'DISMISSED' }) },
      technicianProfile: { update: jest.fn() },
    };
    mocked.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await svc.resolve('r1', 'DISMISSED', 'admin1');

    expect(tx.technicianProfile.update).not.toHaveBeenCalled();
  });
});
