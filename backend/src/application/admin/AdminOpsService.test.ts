import { AdminOpsService } from './AdminOpsService';
import { prisma } from '../../infrastructure/database/prisma';
import { ConflictError } from '../../shared/errors';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    adminUser: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  adminUser: { findUnique: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

describe('AdminOpsService admin-user management guards', () => {
  let service: AdminOpsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService();
  });

  it('rejects creating an admin with a password under 12 chars (before any DB call)', async () => {
    await expect(service.createAdmin('x@y.z', 'short', 'Name', 'OPS', 'actor')).rejects.toBeInstanceOf(ConflictError);
    expect(mockedPrisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects creating an admin whose email already exists', async () => {
    mockedPrisma.adminUser.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.createAdmin('x@y.z', 'a-strong-password-123', 'Name', 'OPS', 'actor')).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses to let an admin disable their own account (lockout guard)', async () => {
    await expect(service.setAdminActive('me', false, 'me')).rejects.toBeInstanceOf(ConflictError);
    // Guard fires before opening a transaction.
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});
